// Pure Least Count game engine. It holds the deck, hands and scoring; the room
// layer decides who controls each seat and when moves happen.
import { randomInt } from 'crypto';
import { buildDecks, shuffle, handCount, isAllJokers, rankValue } from './cards.js';

export const HAND_SIZE = 5;

const fail = (reason) => ({ ok: false, reason });

const noNegZero = (n) => (n === 0 ? 0 : n);

export const createGame = ({ seats, settings }) => ({
  seats: seats.map((s) => ({
    id: s.id,
    name: s.name,
    total: 0,
    hand: [],
    eliminated: false,
    eliminatedRound: null,
    turnsThisRound: 0,
  })),
  settings: {
    eliminationScore: settings?.eliminationScore ?? 201,
    showPenalty: settings?.showPenalty ?? 50,
  },
  round: 0,
  startIndex: null,
  phase: 'idle', // idle | playing | summary | finished
  deckCount: 1,
  jokerCard: null,
  jokerRank: null,
  deck: [],
  openPile: [],
  turn: null,
  turnSeq: 0,
  history: [],
  log: [],
  lastShow: null,
  endReason: null,
  ranking: null,
});

export const getSeat = (game, seatId) => game.seats.find((s) => s.id === seatId);
export const activeSeats = (game) => game.seats.filter((s) => !s.eliminated);

const nextActiveIndex = (game, fromIndex) => {
  const n = game.seats.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIndex + step) % n;
    if (!game.seats[idx].eliminated) return idx;
  }
  return fromIndex;
};

const beginTurn = (game, seatId) => {
  game.turnSeq += 1;
  game.turn = { seatId, phase: 'discard', pending: [], seq: game.turnSeq };
};

export const startRound = (game, { deck: presetDeck } = {}) => {
  const active = activeSeats(game);
  if (active.length < 2) throw new Error('At least two active players are needed to deal a round.');

  // R15: random first starter, then one seat clockwise each round, skipping eliminated seats.
  if (game.startIndex === null) {
    const pick = active[randomInt(0, active.length)];
    game.startIndex = game.seats.indexOf(pick);
  } else {
    game.startIndex = nextActiveIndex(game, game.startIndex);
  }

  game.round += 1;
  // R7 / I1 / I2: deck count follows the active players at the start of each round.
  game.deckCount = active.length <= 4 ? 1 : 2;
  const deck = presetDeck ? [...presetDeck] : shuffle(buildDecks(game.deckCount));

  game.seats.forEach((s) => {
    s.hand = [];
    s.turnsThisRound = 0;
  });

  const order = [];
  for (let step = 0; step < game.seats.length; step += 1) {
    const seat = game.seats[(game.startIndex + step) % game.seats.length];
    if (!seat.eliminated) order.push(seat);
  }
  for (let i = 0; i < HAND_SIZE; i += 1) {
    order.forEach((seat) => seat.hand.push(deck.pop()));
  }

  game.jokerCard = deck.pop();
  game.jokerRank = game.jokerCard.rank;
  game.openPile = [deck.pop()];
  game.deck = deck;
  game.log = [{ type: 'open', card: game.openPile[0] }];
  game.lastShow = null;
  game.phase = 'playing';
  beginTurn(game, game.seats[game.startIndex].id);
};

export const takeableCard = (game) => (game.phase === 'playing' ? game.openPile[game.openPile.length - 1] || null : null);

const checkTurn = (game, seatId, phase) => {
  if (game.phase !== 'playing') return fail('The round is not in play.');
  if (!game.turn || game.turn.seatId !== seatId) return fail('It is not your turn.');
  if (phase && game.turn.phase !== phase) {
    return fail(phase === 'discard' ? 'You have already discarded this turn. Draw a card.' : 'Discard before you draw.');
  }
  return null;
};

export const validateDiscard = (hand, cardIds) => {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return fail('Select at least one card to discard.');
  if (new Set(cardIds).size !== cardIds.length) return fail('A card was selected twice.');
  const cards = cardIds.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return fail('You do not hold one of the selected cards.');
  if (!cards.every((c) => c.rank === cards[0].rank)) {
    return fail('Cards discarded together must be the same rank.');
  }
  return { ok: true, cards };
};

export const discard = (game, seatId, cardIds) => {
  const err = checkTurn(game, seatId, 'discard');
  if (err) return err;
  const seat = getSeat(game, seatId);
  const v = validateDiscard(seat.hand, cardIds);
  if (!v.ok) return v;

  seat.hand = seat.hand.filter((c) => !cardIds.includes(c.id));
  // Kept apart from the open pile until the draw (UI-11); the last selected card ends on top.
  game.turn.pending = v.cards;
  game.turn.phase = 'draw';
  game.log.push({ type: 'discard', seatId, cards: v.cards });
  return { ok: true, cards: v.cards };
};

export const draw = (game, seatId, source) => {
  const err = checkTurn(game, seatId, 'draw');
  if (err) return err;
  const seat = getSeat(game, seatId);
  let card;
  let reshuffled = false;

  if (source === 'open') {
    card = game.openPile.pop();
    if (!card) return fail('There is no open card to take.');
    game.log.push({ type: 'take', seatId, card });
  } else {
    if (game.deck.length === 0) {
      // R8: the open pile becomes the new closed deck; the discard being made now stays
      // aside and becomes the next player's takeable card.
      game.deck = shuffle(game.openPile);
      game.openPile = [];
      reshuffled = true;
      game.log.push({ type: 'reshuffle' });
    }
    card = game.deck.pop();
    if (!card) return fail('There are no cards left to draw.');
    game.log.push({ type: 'draw', seatId });
  }

  seat.hand.push(card);
  game.openPile.push(...game.turn.pending);
  seat.turnsThisRound += 1;

  const next = nextActiveIndex(game, game.seats.indexOf(seat));
  beginTurn(game, game.seats[next].id);
  return { ok: true, card, source: source === 'open' ? 'open' : 'deck', reshuffled };
};

export const canShow = (game, seatId) => {
  const err = checkTurn(game, seatId, 'discard');
  if (err) return err;
  if (getSeat(game, seatId).turnsThisRound < 1) return fail('Show is not allowed on your first turn of the round.');
  return { ok: true };
};

// Section 2.4 scoring. entries: [{ id, hand }]; returns per-seat counts and scores.
export const scoreShow = (entries, callerId, jokerRank, penalty) => {
  const counts = Object.fromEntries(entries.map((e) => [e.id, handCount(e.hand, jokerRank)]));
  const caller = entries.find((e) => e.id === callerId);
  const callerCount = counts[callerId];
  const others = entries.filter((e) => e.id !== callerId);
  const success = others.every((e) => counts[e.id] > callerCount);
  const scores = {};

  if (success) {
    scores[callerId] = noNegZero(-Math.abs(callerCount));
    others.forEach((e) => {
      scores[e.id] = counts[e.id];
    });
    return { result: 'success', counts, scores };
  }

  const exempt = isAllJokers(caller.hand, jokerRank);
  scores[callerId] = exempt ? callerCount : penalty;
  const lowest = Math.min(...others.map((e) => counts[e.id]));
  others.forEach((e) => {
    scores[e.id] = counts[e.id] === lowest ? noNegZero(-Math.abs(counts[e.id])) : counts[e.id];
  });
  return { result: exempt ? 'exempt' : 'failed', counts, scores };
};

export const computeRanking = (game) => {
  const inPlay = activeSeats(game).sort((a, b) => a.total - b.total);
  const out = game.seats
    .filter((s) => s.eliminated)
    .sort((a, b) => b.eliminatedRound - a.eliminatedRound || a.total - b.total);
  return [...inPlay, ...out].map((s) => s.id);
};

export const finishGame = (game, reason) => {
  game.phase = 'finished';
  game.turn = null;
  game.endReason = reason;
  game.ranking = computeRanking(game);
};

export const show = (game, seatId) => {
  const check = canShow(game, seatId);
  if (!check.ok) return check;

  const active = activeSeats(game);
  const { result, counts, scores } = scoreShow(active, seatId, game.jokerRank, game.settings.showPenalty);

  active.forEach((s) => {
    s.total += scores[s.id];
  });

  const eliminated = [];
  active.forEach((s) => {
    if (s.total >= game.settings.eliminationScore) {
      s.eliminated = true;
      s.eliminatedRound = game.round;
      eliminated.push(s.id);
    }
  });

  game.history.push({ round: game.round, callerId: seatId, result, scores });
  game.lastShow = {
    round: game.round,
    callerId: seatId,
    result,
    jokerRank: game.jokerRank,
    eliminated,
    entries: active.map((s) => ({ id: s.id, hand: s.hand, count: counts[s.id], score: scores[s.id], total: s.total })),
  };
  game.turn = null;
  game.log.push({ type: 'show', seatId });

  if (activeSeats(game).length <= 1) finishGame(game, 'last-standing');
  else game.phase = 'summary';

  return { ok: true, result, scores, eliminated };
};

// FR-27: discard the highest-value non-joker (highest joker if all jokers), draw from the deck.
export const timeoutMove = (game, seatId) => {
  if (!game.turn || game.turn.seatId !== seatId) return fail('It is not that seat’s turn.');
  if (game.turn.phase === 'discard') {
    const hand = getSeat(game, seatId).hand;
    const nonJokers = hand.filter((c) => c.rank !== game.jokerRank);
    const pool = nonJokers.length ? nonJokers : hand;
    const pick = pool.reduce((best, c) => (rankValue(c.rank) > rankValue(best.rank) ? c : best));
    const d = discard(game, seatId, [pick.id]);
    if (!d.ok) return d;
  }
  return draw(game, seatId, 'deck');
};

// Who discarded the takeable card; null for the round's starting open card.
const takeableFrom = (game) => {
  const top = takeableCard(game);
  if (!top) return null;
  for (let i = game.log.length - 1; i >= 0; i -= 1) {
    const ev = game.log[i];
    if (ev.type === 'discard' && ev.cards.some((c) => c.id === top.id)) return ev.seatId;
    if (ev.type === 'open' && ev.card.id === top.id) return null;
  }
  return null;
};

// What one seat is allowed to see (NFR-1, FR-15). viewerId may be null for a spectator.
export const viewFor = (game, viewerId) => {
  const viewer = viewerId ? getSeat(game, viewerId) : null;
  const showable = game.phase === 'summary' || game.phase === 'finished';
  return {
    phase: game.phase,
    round: game.round,
    deckCount: game.deckCount,
    deckRemaining: game.deck.length,
    jokerCard: game.jokerCard,
    jokerRank: game.jokerRank,
    openPile: game.openPile.slice(-4),
    openPileSize: game.openPile.length,
    takeableId: takeableCard(game)?.id || null,
    takeableFrom: takeableFrom(game),
    turn: game.turn ? { seatId: game.turn.seatId, phase: game.turn.phase, pending: game.turn.pending, seq: game.turn.seq } : null,
    seats: game.seats.map((s) => ({
      id: s.id,
      total: s.total,
      cardCount: s.hand.length,
      eliminated: s.eliminated,
      eliminatedRound: s.eliminatedRound,
      turnsThisRound: s.turnsThisRound,
    })),
    hand: viewer ? viewer.hand : [],
    canShow: viewer ? canShow(game, viewer.id) : fail('Spectating.'),
    history: game.history,
    lastShow: showable ? game.lastShow : null,
    endReason: game.endReason,
    ranking: game.ranking,
  };
};

// Bots get the same view as a human in that seat, plus the public move log.
export const botViewFor = (game, seatId) => ({ ...viewFor(game, seatId), seatId, log: game.log, seatOrder: game.seats.map((s) => s.id) });
