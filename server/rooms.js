// Rooms, seats, lobby rules, timers, takeovers and reconnects. The game engine in
// game.js stays pure; this layer decides who controls each seat and when moves run.
import { randomInt, randomUUID } from 'crypto';
import * as G from './game.js';
import { decideBot, BOT_NAMES } from './bots.js';
import { checkName } from './names.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LIMITS = { maxSeats: 8, maxBots: 4, minSeats: 2 };
export const TIMER_OPTIONS = [15, 30, 60, 0];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DEFAULT_SETTINGS = { eliminationScore: 201, showPenalty: 50, turnTimer: 30 };

const RECONNECT_GRACE_MS = 60_000;
const EMPTY_ROOM_CLOSE_MS = 60_000;
const SUMMARY_MS = 12_000;
const CONTINUE_GRACE_MS = 3_000;
const EMOTE_COOLDOWN_MS = 1_200;
export const EMOTES = ['😂', '🔥', '😎', '😭', '🤡', '👏', '😡', '🤯', '🎉', '💸', '🙏', '👀'];
const MAX_TIMEOUTS = 3;
const MAX_EVENTS = 12;

const send = (conn, payload) => {
  if (conn?.socket?.readyState === 1) conn.socket.send(JSON.stringify(payload));
};

class Room {
  constructor(manager, code, mode) {
    this.manager = manager;
    this.code = code;
    this.mode = mode; // 'friends' | 'bots'
    this.status = 'lobby'; // lobby | playing
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.seats = [];
    this.kicked = new Set();
    this.conns = new Map(); // seatId -> conn
    this.game = null;
    this.gameCount = 0;
    this.lastResults = null;
    this.events = [];
    this.eventSeq = 0;
    this.turnDeadline = null;
    this.summaryDeadline = null;
    this.continueVotes = new Set();
    this.lastScheduledSeq = null;
    this.timers = { turn: null, bot: null, summary: null, close: null, disconnect: new Map() };
  }

  // ---------- helpers ----------

  seat(seatId) {
    return this.seats.find((s) => s.id === seatId);
  }

  humans() {
    return this.seats.filter((s) => s.kind === 'human');
  }

  lobbyBots() {
    return this.seats.filter((s) => s.kind === 'bot');
  }

  gameSeat(seatId) {
    return this.game ? G.getSeat(this.game, seatId) : null;
  }

  event(kind, data = {}) {
    this.eventSeq += 1;
    this.events.push({ id: this.eventSeq, kind, at: Date.now(), ...data });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  nextBotName() {
    const used = new Set(this.seats.map((s) => s.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    return free.length ? free[randomInt(0, free.length)] : `Bot ${this.seats.length + 1}`;
  }

  isHost(seatId) {
    return this.hostId === seatId;
  }

  assignHost() {
    // FR-11: longest-seated remaining human who is still in control of their seat.
    const candidates = this.humans()
      .filter((s) => !s.takeover)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const prev = this.hostId;
    this.hostId = candidates[0]?.id || null;
    if (prev && this.hostId && prev !== this.hostId) this.event('host', { seatId: this.hostId });
  }

  clearTimer(name) {
    if (this.timers[name]) clearTimeout(this.timers[name]);
    this.timers[name] = null;
  }

  // ---------- views ----------

  viewFor(seatId) {
    const me = seatId ? this.seat(seatId) : null;
    const game = this.game
      ? {
          ...G.viewFor(this.game, me && this.gameSeat(seatId) ? seatId : null),
          turnDeadline: this.turnDeadline,
          turnDuration: this.settings.turnTimer * 1000,
          summaryDeadline: this.summaryDeadline,
          continueVotes: [...this.continueVotes],
        }
      : null;
    return {
      code: this.code,
      mode: this.mode,
      status: this.status,
      hostId: this.hostId,
      settings: this.settings,
      limits: LIMITS,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        connected: s.kind === 'bot' ? true : s.connected,
        difficulty: s.difficulty,
        controller: s.controller,
        takeover: s.takeover,
        reclaimPending: s.reclaimPending,
      })),
      game,
      lastResults: this.lastResults,
      events: this.events,
    };
  }

  broadcast() {
    const serverNow = Date.now();
    this.conns.forEach((conn, seatId) => {
      send(conn, { type: 'state', serverNow, you: { seatId }, room: this.viewFor(seatId) });
    });
  }

  // ---------- seats & connections ----------

  addHuman(conn, name) {
    const seat = {
      id: `s_${randomUUID().slice(0, 8)}`,
      name,
      kind: 'human',
      deviceId: conn.deviceId,
      connected: true,
      difficulty: null,
      controller: 'human',
      takeover: null,
      reclaimPending: false,
      timeouts: 0,
      joinedAt: Date.now() + this.seats.length / 1000,
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
    this.attach(conn, seat);
    this.event('join', { seatId: seat.id });
    return seat;
  }

  addBotSeat(difficulty) {
    const seat = {
      id: `b_${randomUUID().slice(0, 8)}`,
      name: this.nextBotName(),
      kind: 'bot',
      deviceId: null,
      connected: true,
      difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'medium',
      controller: 'bot',
      takeover: null,
      reclaimPending: false,
      timeouts: 0,
      joinedAt: Date.now(),
    };
    this.seats.push(seat);
    return seat;
  }

  attach(conn, seat) {
    const previous = this.conns.get(seat.id);
    if (previous && previous !== conn) {
      send(previous, { type: 'replaced', message: 'This seat was opened in another tab.' });
      previous.roomCode = null;
      previous.seatId = null;
    }
    this.conns.set(seat.id, conn);
    conn.roomCode = this.code;
    conn.seatId = seat.id;
    seat.connected = true;
    const t = this.timers.disconnect.get(seat.id);
    if (t) clearTimeout(t);
    this.timers.disconnect.delete(seat.id);
    this.clearTimer('close');
    this.manager.deviceRooms.set(seat.deviceId, this.code);
  }

  detach(conn) {
    const seat = this.seat(conn.seatId);
    if (!seat || this.conns.get(seat.id) !== conn) return;
    this.conns.delete(seat.id);
    seat.connected = false;

    // FR-29 / NFR-5: hold the seat for a while so a refresh or blip does not lose it.
    const timer = setTimeout(() => {
      this.timers.disconnect.delete(seat.id);
      if (seat.connected) return;
      if (this.status === 'lobby') {
        this.removeSeat(seat);
      } else if (seat.controller === 'human') {
        this.takeover(seat, 'disconnect');
      }
      this.afterChange();
    }, RECONNECT_GRACE_MS);
    this.timers.disconnect.set(seat.id, timer);
    this.scheduleCloseIfEmpty();
    this.broadcast();
  }

  release(seat) {
    const conn = this.conns.get(seat.id);
    if (conn) {
      conn.roomCode = null;
      conn.seatId = null;
    }
    this.conns.delete(seat.id);
    if (seat.deviceId && this.manager.deviceRooms.get(seat.deviceId) === this.code) {
      this.manager.deviceRooms.delete(seat.deviceId);
    }
    const t = this.timers.disconnect.get(seat.id);
    if (t) clearTimeout(t);
    this.timers.disconnect.delete(seat.id);
    return conn;
  }

  removeSeat(seat) {
    this.release(seat);
    this.seats = this.seats.filter((s) => s !== seat);
    if (this.hostId === seat.id) this.assignHost();
  }

  scheduleCloseIfEmpty() {
    // FR-13: a room with no connected humans is closed (after a grace period for refreshes).
    if (this.humans().some((s) => s.connected)) return;
    if (this.timers.close) return;
    this.timers.close = setTimeout(() => this.manager.closeRoom(this), EMPTY_ROOM_CLOSE_MS);
  }

  // ---------- lobby actions ----------

  requireHost(seatId) {
    if (!this.isHost(seatId)) return 'Only the host can do that.';
    return null;
  }

  requireLobby() {
    return this.status === 'lobby' ? null : 'That can only be changed in the lobby.';
  }

  addBot(bySeatId, difficulty) {
    const err = this.requireHost(bySeatId) || this.requireLobby();
    if (err) return err;
    if (this.seats.length >= LIMITS.maxSeats) return `All ${LIMITS.maxSeats} seats are taken.`;
    if (this.lobbyBots().length >= LIMITS.maxBots) return 'A game can have at most 4 bots.';
    const bot = this.addBotSeat(difficulty);
    this.event('join', { seatId: bot.id });
    return null;
  }

  removeBot(bySeatId, seatId) {
    const err = this.requireHost(bySeatId) || this.requireLobby();
    if (err) return err;
    const seat = this.seat(seatId);
    if (!seat || seat.kind !== 'bot') return 'That seat is not a bot.';
    this.removeSeat(seat);
    return null;
  }

  setBotDifficulty(bySeatId, seatId, difficulty) {
    const err = this.requireHost(bySeatId) || this.requireLobby();
    if (err) return err;
    const seat = this.seat(seatId);
    if (!seat || seat.kind !== 'bot') return 'That seat is not a bot.';
    if (!DIFFICULTIES.includes(difficulty)) return 'Unknown difficulty.';
    seat.difficulty = difficulty;
    return null;
  }

  updateSettings(bySeatId, patch = {}) {
    const err = this.requireHost(bySeatId) || this.requireLobby();
    if (err) return err;
    const next = { ...this.settings };
    if (patch.eliminationScore !== undefined) {
      const v = Number(patch.eliminationScore);
      if (!Number.isInteger(v) || v < 50 || v > 1000) return 'Elimination score must be a whole number from 50 to 1000.';
      next.eliminationScore = v;
    }
    if (patch.showPenalty !== undefined) {
      const v = Number(patch.showPenalty);
      if (!Number.isInteger(v) || v < 0 || v > 200) return 'Show penalty must be a whole number from 0 to 200.';
      next.showPenalty = v;
    }
    if (patch.turnTimer !== undefined) {
      const v = Number(patch.turnTimer);
      if (!TIMER_OPTIONS.includes(v)) return 'Turn timer must be 15, 30, 60 seconds or off.';
      next.turnTimer = v;
    }
    this.settings = next;
    return null;
  }

  kick(bySeatId, seatId) {
    const err = this.requireHost(bySeatId);
    if (err) return err;
    const seat = this.seat(seatId);
    if (!seat || seat.kind !== 'human') return 'Only human players can be kicked.';
    if (seat.id === bySeatId) return 'You cannot kick yourself.';
    if (seat.takeover === 'kicked' || seat.takeover === 'left') return 'That player has already left.';
    this.kicked.add(seat.deviceId);
    const conn = this.release(seat);
    send(conn, { type: 'kicked', message: 'The host removed you from the room.' });
    if (this.status === 'lobby') {
      this.seats = this.seats.filter((s) => s !== seat);
    } else {
      // FR-31 / I5: a bot takes over the seat.
      seat.connected = false;
      this.takeover(seat, 'kicked');
    }
    this.event('kicked', { seatId: seat.id, name: seat.name });
    return null;
  }

  leave(seatId) {
    const seat = this.seat(seatId);
    if (!seat) return null;
    if (this.status === 'lobby') {
      this.removeSeat(seat);
    } else {
      // FR-30: replaced by a bot at once; leaving is final for this game.
      this.release(seat);
      seat.connected = false;
      this.takeover(seat, 'left');
      if (this.hostId === seat.id) this.assignHost();
    }
    this.event('leave', { seatId: seat.id, name: seat.name });
    if (!this.humans().some((s) => s.connected)) {
      if (!this.humans().length || this.status === 'lobby') this.manager.closeRoom(this);
      else this.scheduleCloseIfEmpty();
    }
    return null;
  }

  // ---------- game lifecycle ----------

  start(bySeatId) {
    const err = this.requireHost(bySeatId) || this.requireLobby();
    if (err) return err;
    if (this.seats.length < LIMITS.minSeats) return 'At least 2 players are needed to start.';
    if (this.seats.length > LIMITS.maxSeats) return `A game can have at most ${LIMITS.maxSeats} players.`;
    if (!this.humans().length) return 'At least one human player is needed.';
    if (this.lobbyBots().length > LIMITS.maxBots) return 'A game can have at most 4 bots.';

    this.gameCount += 1;
    this.lastResults = null;
    this.seats.forEach((s) => {
      s.timeouts = 0;
      s.reclaimPending = false;
    });
    this.game = G.createGame({ seats: this.seats, settings: this.settings });
    this.status = 'playing';
    this.events = [];
    this.startRound();
    return null;
  }

  startRound() {
    this.clearTimer('summary');
    this.summaryDeadline = null;
    this.continueVotes = new Set();
    G.startRound(this.game);
    this.event('deal', { round: this.game.round });
    this.scheduleTurn();
  }

  turnSeat() {
    return this.game?.turn ? this.seat(this.game.turn.seatId) : null;
  }

  scheduleTurn() {
    this.clearTimer('turn');
    this.clearTimer('bot');
    this.turnDeadline = null;
    if (!this.game || this.game.phase !== 'playing') return;

    const seat = this.turnSeat();
    if (seat.reclaimPending) {
      seat.reclaimPending = false;
      seat.controller = 'human';
      seat.takeover = null;
      seat.timeouts = 0;
      this.event('reclaim', { seatId: seat.id });
    }

    this.lastScheduledSeq = this.game.turn.seq;
    const timerMs = this.settings.turnTimer * 1000;
    if (timerMs > 0) this.turnDeadline = Date.now() + timerMs;
    const seq = this.game.turn.seq;

    if (seat.controller === 'bot') {
      // FR-36 / FR-38: 1–3 s, always well inside the turn timer.
      let delay = 1000 + randomInt(0, 2000);
      if (timerMs > 0) delay = Math.min(delay, Math.max(300, timerMs - 2500));
      this.timers.bot = setTimeout(() => this.botMove(seq), delay);
    } else if (timerMs > 0) {
      this.timers.turn = setTimeout(() => this.onTimeout(seq), timerMs);
    }
  }

  botMove(seq) {
    this.timers.bot = null;
    const game = this.game;
    if (!game || game.phase !== 'playing' || game.turn?.seq !== seq) return;
    const seat = this.turnSeat();
    const decision = decideBot(G.botViewFor(game, seat.id), seat.difficulty || 'medium', { penalty: this.settings.showPenalty });

    if (decision.action === 'show') {
      const r = G.show(game, seat.id);
      if (r.ok) {
        this.afterShow(seat);
        return;
      }
    }

    if (decision.action === 'drop') {
      const r = G.drop(game, seat.id);
      if (r.ok) {
        this.afterDrop(seat, r);
        return;
      }
    }

    if (game.turn.phase === 'discard') {
      const r = decision.discard && G.discard(game, seat.id, decision.discard);
      if (!r?.ok) {
        this.recordResult(seat, G.timeoutMove(game, seat.id));
        this.afterChange();
        return;
      }
      this.event('discard', { seatId: seat.id, cards: r.cards });
      this.broadcast();
      // Short pause so the discard and the draw read as two moves.
      this.timers.bot = setTimeout(() => {
        this.timers.bot = null;
        if (this.game !== game || game.turn?.seq !== seq) return;
        this.finishDraw(seat, decision.draw);
      }, 600 + randomInt(0, 400));
      return;
    }

    this.finishDraw(seat, decision.draw);
  }

  finishDraw(seat, source) {
    let r = G.draw(this.game, seat.id, source);
    if (!r.ok) r = G.draw(this.game, seat.id, 'deck');
    this.recordResult(seat, r);
    this.afterChange();
  }

  recordResult(seat, r) {
    if (!r?.ok) return;
    if (r.reshuffled) this.event('reshuffle');
    this.event(r.source === 'open' ? 'take' : 'draw', { seatId: seat.id, card: r.source === 'open' ? r.card : null });
  }

  onTimeout(seq) {
    this.timers.turn = null;
    const game = this.game;
    if (!game || game.phase !== 'playing' || game.turn?.seq !== seq) return;
    const seat = this.turnSeat();
    const phase = game.turn.phase;
    const r = G.timeoutMove(game, seat.id);
    if (phase === 'discard') {
      const last = game.log.filter((e) => e.type === 'discard' && e.seatId === seat.id).pop();
      this.event('discard', { seatId: seat.id, cards: last.cards });
    }
    this.recordResult(seat, r);
    this.event('timeout', { seatId: seat.id });
    seat.timeouts += 1;
    // FR-28: three timed-out turns in a row hands the seat to a bot.
    if (seat.timeouts >= MAX_TIMEOUTS && seat.controller === 'human') this.takeover(seat, 'timeout');
    this.afterChange();
  }

  takeover(seat, reason) {
    if (seat.kind !== 'human') return;
    seat.controller = 'bot';
    seat.takeover = reason;
    seat.difficulty = 'medium';
    seat.reclaimPending = false;
    this.event('takeover', { seatId: seat.id, reason });
    if (this.hostId === seat.id && reason !== 'disconnect' && reason !== 'timeout') this.assignHost();
    if (this.game?.turn?.seatId === seat.id) this.scheduleTurn();
    this.checkNoHumans();
  }

  humansInPlay() {
    return this.humans().filter((s) => s.controller === 'human' && !this.gameSeat(s.id)?.eliminated);
  }

  checkNoHumans() {
    // R21 / FR-33: bots never play on alone.
    if (this.status !== 'playing' || !this.game || this.game.phase === 'finished') return;
    if (this.humansInPlay().length === 0) {
      G.finishGame(this.game, 'no-humans');
      this.endGame();
    }
  }

  afterDrop(seat, r) {
    this.event('drop', { seatId: seat.id, points: G.dropPoints(this.game) });
    if (r.roundOver) {
      this.event('show', { seatId: null, result: 'all-dropped' });
      this.game.lastShow.eliminated.forEach((id) => this.event('eliminated', { seatId: id }));
    }
    this.afterChange();
  }

  afterShow(seat) {
    this.event('show', { seatId: seat.id, result: this.game.lastShow.result });
    this.game.lastShow.eliminated.forEach((id) => this.event('eliminated', { seatId: id }));
    this.afterChange();
  }

  afterChange() {
    const game = this.game;
    if (this.status === 'playing' && game) {
      if (game.phase === 'playing') {
        if (this.turnSeat() && this.lastScheduledSeq !== game.turn.seq) this.scheduleTurn();
      } else if (game.phase === 'summary') {
        this.clearTimer('turn');
        this.clearTimer('bot');
        this.turnDeadline = null;
        this.checkNoHumans();
        if (this.game && this.game.phase === 'summary' && !this.timers.summary) {
          this.summaryDeadline = Date.now() + SUMMARY_MS;
          this.timers.summary = setTimeout(() => {
            this.timers.summary = null;
            this.nextRound();
          }, SUMMARY_MS);
        }
      } else if (game.phase === 'finished') {
        this.endGame();
      }
    }
    this.broadcast();
  }

  nextRound() {
    if (!this.game || this.game.phase !== 'summary') return;
    this.startRound();
    this.broadcast();
  }

  continueVote(seatId) {
    if (!this.game || this.game.phase !== 'summary') return 'There is no round summary to continue from.';
    this.continueVotes.add(seatId);
    // FR-24: continue early once every connected human in control has clicked.
    const waiting = this.humans().filter((s) => s.connected && s.controller === 'human' && !this.continueVotes.has(s.id));
    if (!waiting.length) {
      this.nextRound();
      return null;
    }
    // Someone is ready: shorten everyone else's wait instead of holding the full countdown.
    const soon = Date.now() + CONTINUE_GRACE_MS;
    if (this.summaryDeadline > soon) {
      this.clearTimer('summary');
      this.summaryDeadline = soon;
      this.timers.summary = setTimeout(() => {
        this.timers.summary = null;
        this.nextRound();
      }, CONTINUE_GRACE_MS);
    }
    return null;
  }

  endGame() {
    if (this.status !== 'playing' || !this.game) return;
    const game = this.game;
    if (game.phase !== 'finished') G.finishGame(game, 'no-humans');
    ['turn', 'bot', 'summary'].forEach((t) => this.clearTimer(t));
    this.turnDeadline = null;
    this.summaryDeadline = null;

    const names = Object.fromEntries(this.seats.map((s) => [s.id, s.controller === 'bot' && s.kind === 'human' ? `${s.name} (bot)` : s.name]));
    this.lastResults = {
      gameNumber: this.gameCount,
      reason: game.endReason,
      winnerId: game.ranking[0],
      ranking: game.ranking.map((id, i) => {
        const gs = G.getSeat(game, id);
        return { id, place: i + 1, name: names[id], total: gs.total, eliminated: gs.eliminated, eliminatedRound: gs.eliminatedRound };
      }),
      columns: game.seats.map((s) => ({ id: s.id, name: names[s.id] })),
      history: game.history,
      lastShow: game.lastShow,
    };
    this.event('finished', { winnerId: game.ranking[0] });

    // FR-12: back to the lobby; takeover bots are removed and their seats freed.
    this.status = 'lobby';
    this.game = null;
    this.lastScheduledSeq = null;
    for (const seat of [...this.seats]) {
      if (seat.kind !== 'human' || !seat.takeover) continue;
      if ((seat.takeover === 'disconnect' || seat.takeover === 'timeout') && seat.connected) {
        seat.controller = 'human';
        seat.takeover = null;
      } else {
        this.removeSeat(seat);
      }
    }
    this.seats.forEach((s) => {
      s.reclaimPending = false;
      s.timeouts = 0;
    });
    if (!this.seat(this.hostId)) this.assignHost();
    if (!this.humans().length) this.manager.closeRoom(this);
    else this.scheduleCloseIfEmpty();
  }

  // ---------- player moves ----------

  requirePlayable(seatId) {
    if (this.status !== 'playing' || !this.game) return 'The game is not running.';
    const seat = this.seat(seatId);
    if (!seat) return 'You are not seated in this room.';
    if (seat.controller !== 'human') return 'A bot is playing your seat. Take your seat back first.';
    return null;
  }

  discard(seatId, cardIds) {
    const err = this.requirePlayable(seatId);
    if (err) return err;
    const r = G.discard(this.game, seatId, cardIds);
    if (!r.ok) return r.reason;
    this.event('discard', { seatId, cards: r.cards });
    return null;
  }

  draw(seatId, source) {
    const err = this.requirePlayable(seatId);
    if (err) return err;
    const r = G.draw(this.game, seatId, source === 'open' ? 'open' : 'deck');
    if (!r.ok) return r.reason;
    this.seat(seatId).timeouts = 0;
    this.recordResult(this.seat(seatId), r);
    return null;
  }

  show(seatId) {
    const err = this.requirePlayable(seatId);
    if (err) return err;
    const r = G.show(this.game, seatId);
    if (!r.ok) return r.reason;
    this.seat(seatId).timeouts = 0;
    this.afterShow(this.seat(seatId));
    return null;
  }

  // Emoji chat: sent straight to everyone, not stored in room state.
  emote(seatId, emoji) {
    const seat = this.seat(seatId);
    if (!seat) return 'You are not seated in this room.';
    if (!EMOTES.includes(emoji)) return 'Unknown emoji.';
    const now = Date.now();
    if (seat.lastEmoteAt && now - seat.lastEmoteAt < EMOTE_COOLDOWN_MS) return null;
    seat.lastEmoteAt = now;
    this.eventSeq += 1;
    const payload = { type: 'emote', id: this.eventSeq, seatId, emoji };
    this.conns.forEach((conn) => send(conn, payload));
    return null;
  }

  drop(seatId) {
    const err = this.requirePlayable(seatId);
    if (err) return err;
    const r = G.drop(this.game, seatId);
    if (!r.ok) return r.reason;
    this.seat(seatId).timeouts = 0;
    this.afterDrop(this.seat(seatId), r);
    return null;
  }

  reclaim(seatId) {
    if (this.status !== 'playing') return 'The game is not running.';
    const seat = this.seat(seatId);
    if (!seat || seat.kind !== 'human') return 'You are not seated in this room.';
    if (seat.takeover !== 'disconnect' && seat.takeover !== 'timeout') return 'This seat cannot be taken back.';
    if (this.game.turn?.seatId === seat.id && this.game.phase === 'playing') {
      // FR-32: the bot finishes the current turn; the player resumes from their next one.
      seat.reclaimPending = true;
    } else {
      seat.controller = 'human';
      seat.takeover = null;
      seat.timeouts = 0;
      this.event('reclaim', { seatId: seat.id });
      if (!this.seat(this.hostId) || this.seat(this.hostId).takeover) this.assignHost();
    }
    return null;
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.deviceRooms = new Map(); // deviceId -> room code
  }

  newCode() {
    for (;;) {
      const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(0, CODE_CHARS.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  closeRoom(room) {
    if (!this.rooms.has(room.code)) return;
    ['turn', 'bot', 'summary', 'close'].forEach((t) => room.clearTimer(t));
    room.timers.disconnect.forEach((t) => clearTimeout(t));
    room.seats.forEach((s) => {
      if (s.deviceId && this.deviceRooms.get(s.deviceId) === room.code) this.deviceRooms.delete(s.deviceId);
    });
    room.conns.forEach((conn) => {
      conn.roomCode = null;
      conn.seatId = null;
      send(conn, { type: 'state', serverNow: Date.now(), you: null, room: null });
    });
    this.rooms.delete(room.code);
  }

  roomOf(conn) {
    return conn.roomCode ? this.rooms.get(conn.roomCode) : null;
  }

  sendHome(conn, extra = {}) {
    send(conn, { type: 'state', serverNow: Date.now(), you: null, room: null, ...extra });
  }

  hello(conn, deviceId) {
    if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 64) {
      send(conn, { type: 'error', message: 'Invalid device id.' });
      return;
    }
    conn.deviceId = deviceId;
    // NFR-5 / FR-2: put a returning device straight back in its seat.
    const room = this.rooms.get(this.deviceRooms.get(deviceId));
    const seat = room?.seats.find((s) => s.deviceId === deviceId && s.kind === 'human' && s.takeover !== 'left' && s.takeover !== 'kicked');
    if (room && seat) {
      room.attach(conn, seat);
      room.broadcast();
      return;
    }
    this.sendHome(conn);
  }

  leaveCurrent(conn) {
    const room = this.roomOf(conn);
    if (!room) return;
    const seatId = conn.seatId;
    room.leave(seatId);
    conn.roomCode = null;
    conn.seatId = null;
    if (this.rooms.has(room.code)) room.broadcast();
  }

  create(conn, { name, mode, bots, difficulty, settings }) {
    const nameErr = checkName(name);
    if (nameErr) return nameErr;
    this.leaveCurrent(conn);
    const room = new Room(this, this.newCode(), mode === 'bots' ? 'bots' : 'friends');
    this.rooms.set(room.code, room);
    const seat = room.addHuman(conn, name.trim());
    if (settings && typeof settings === 'object') {
      const err = room.updateSettings(seat.id, settings);
      if (err) {
        this.closeRoom(room);
        return err;
      }
    }
    if (room.mode === 'bots') {
      const count = Math.min(Math.max(Number(bots) || 1, 1), LIMITS.maxBots);
      for (let i = 0; i < count; i += 1) room.addBotSeat(difficulty);
      const err = room.start(seat.id);
      if (err) return err;
      room.afterChange();
      return null;
    }
    room.broadcast();
    return null;
  }

  join(conn, { name, code }) {
    const nameErr = checkName(name);
    if (nameErr) return nameErr;
    const room = this.rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return 'No room found with that code.';
    const existing = room.seats.find((s) => s.deviceId === conn.deviceId && s.kind === 'human');
    if (existing && !existing.takeover) {
      room.attach(conn, existing);
      room.broadcast();
      return null;
    }
    if (room.kicked.has(conn.deviceId)) return 'You were removed from this room by the host.';
    if (room.status !== 'lobby') return 'This game has already started. You can join once it is back in the lobby.';
    if (room.seats.length >= LIMITS.maxSeats) return 'This room is full.';
    this.leaveCurrent(conn);
    room.addHuman(conn, name.trim());
    room.broadcast();
    return null;
  }

  disconnect(conn) {
    const room = this.roomOf(conn);
    if (room) room.detach(conn);
  }

  handle(conn, msg) {
    if (msg.type === 'hello') return this.hello(conn, msg.deviceId);
    if (!conn.deviceId) return 'Say hello first.';
    if (msg.type === 'create') return this.create(conn, msg);
    if (msg.type === 'join') return this.join(conn, msg);
    if (msg.type === 'leave') {
      this.leaveCurrent(conn);
      this.sendHome(conn);
      return null;
    }

    const room = this.roomOf(conn);
    if (!room) return 'You are not in a room.';
    const seatId = conn.seatId;
    const actions = {
      addBot: () => room.addBot(seatId, msg.difficulty),
      removeBot: () => room.removeBot(seatId, msg.seatId),
      setBotDifficulty: () => room.setBotDifficulty(seatId, msg.seatId, msg.difficulty),
      kick: () => room.kick(seatId, msg.seatId),
      settings: () => room.updateSettings(seatId, msg.settings),
      start: () => room.start(seatId),
      discard: () => room.discard(seatId, msg.cardIds),
      draw: () => room.draw(seatId, msg.source),
      show: () => room.show(seatId),
      drop: () => room.drop(seatId),
      continue: () => room.continueVote(seatId),
      reclaim: () => room.reclaim(seatId),
      emote: () => room.emote(seatId, msg.emoji),
    };
    const action = actions[msg.type];
    if (!action) return 'Unknown action.';
    const err = action();
    if (err) return err;
    if (msg.type !== 'emote' && this.rooms.has(room.code)) room.afterChange();
    return null;
  }
}
