import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard, CardBack } from '../components/Card.jsx';
import { Standings } from '../components/ScorePanel.jsx';
import { handCount, sortHand, signed, cardLabel, RANK_NAME } from '../cards.js';
import { play } from '../sound.js';
import { EmoteLayer, EmojiTray } from '../components/Emotes.jsx';
import { useCardFlights } from '../components/cardFlights.js';

const useNow = (active, interval = 200) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [active, interval]);
  return now;
};

const displayName = (seat) => (seat ? (seat.kind === 'human' && seat.controller === 'bot' ? `${seat.name} (bot)` : seat.name) : '?');

const RESULT_TEXT = {
  success: 'Show succeeded',
  failed: 'Show failed — penalty',
  exempt: 'Show failed — zero or negative hand, no penalty',
  'all-dropped': 'everyone else dropped',
};

const TAKEOVER_TEXT = {
  disconnect: 'lost connection — a bot is playing their seat',
  timeout: 'timed out three times — a bot is playing their seat',
  left: 'left — a bot is playing their seat',
  kicked: 'was removed by the host — a bot is playing their seat',
};

// Opponents sit around the upper arc in turn order, starting on the local player's left (UI-6).
const ANGLES = {
  1: [270],
  2: [215, 325],
  3: [190, 270, 350],
  4: [180, 240, 300, 360],
  5: [175, 220, 270, 320, 365],
  6: [165, 207, 249, 291, 333, 375],
  7: [160, 197, 233, 270, 307, 343, 380],
};
// Portrait screens have a tall, narrow table: seats wrap further down the sides.
const NARROW_ANGLES = {
  1: [270],
  2: [205, 335],
  3: [180, 270, 360],
  4: [165, 230, 310, 375],
  5: [160, 212, 270, 328, 380],
  6: [155, 200, 247, 293, 340, 385],
  7: [150, 190, 230, 270, 310, 350, 390],
};
const seatPosition = (i, k, narrow = false) => {
  const angle = (narrow ? NARROW_ANGLES : ANGLES)[k]?.[i] ?? 180 + (i * 180) / (k - 1);
  const rad = (angle * Math.PI) / 180;
  const [rx, ry, cy] = narrow ? [37, 41, 50] : [41, 40, 54];
  return { left: `${50 + rx * Math.cos(rad)}%`, top: `${cy + ry * Math.sin(rad)}%` };
};

const NARROW_QUERY = '(max-width: 900px)';
const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW_QUERY);
    if (!mq) return undefined;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
};

function TurnClock({ remaining, duration }) {
  if (!duration) return <span className="turn-clock">Your move</span>;
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  return (
    <span className={`turn-clock ${secs <= 5 ? 'urgent' : ''}`} aria-live="off">
      ⏱ {secs}s
    </span>
  );
}

function NamePlate({ seat, gameSeat, isTurn, glow, remaining, duration, isHostSeat, isMe, children }) {
  const classes = ['nameplate', isTurn && 'turn', gameSeat.eliminated && 'out', !seat.connected && seat.kind === 'human' && 'offline'].filter(Boolean).join(' ');
  return (
    <div className={classes} style={isTurn ? { '--glow': glow } : undefined}>
      <div className="nameplate-top">
        {isTurn && (
          <span className="turn-marker" aria-label="Current turn">
            ▶
          </span>
        )}
        <span className="nameplate-name" title={displayName(seat)}>
          {displayName(seat)}
          {isMe && <span className="muted"> (you)</span>}
        </span>
        <span className="nameplate-total" title="Running total">
          {gameSeat.total}
        </span>
      </div>
      <div className="nameplate-badges">
        {isHostSeat && <span className="badge host">Host</span>}
        {seat.kind === 'bot' && <span className="badge bot">Bot</span>}
        {seat.kind === 'human' && seat.controller === 'bot' && <span className="badge bot">Bot playing</span>}
        {seat.kind === 'human' && !seat.connected && seat.controller === 'human' && <span className="badge offline">Reconnecting</span>}
        {gameSeat.eliminated && <span className="badge out">Eliminated</span>}
        {gameSeat.dropped && !gameSeat.eliminated && <span className="badge dropped">Dropped</span>}
        {isTurn && <TurnClock remaining={remaining} duration={duration} />}
        {children}
      </div>
    </div>
  );
}

function Opponent({ seat, gameSeat, style, compact, ...plate }) {
  const n = gameSeat.eliminated ? 0 : gameSeat.cardCount;
  return (
    <div className={`opponent ${gameSeat.eliminated ? 'out' : ''} ${compact ? 'compact' : ''}`} style={style} data-seat={seat.id}>
      <div className="opp-cards" aria-label={`${n} cards`}>
        {Array.from({ length: n }, (_, i) => (
          <CardBack key={i} size="xs" className="fan" />
        ))}
        {!gameSeat.eliminated && (
          <span className="card-count" key={n} title="Cards held">
            {n}
          </span>
        )}
      </div>
      <NamePlate seat={seat} gameSeat={gameSeat} {...plate} />
    </div>
  );
}

function RoundSummary({ g, seatsById, myId, me, send, now, clockOffset }) {
  const show = g.lastShow;
  const caller = seatsById[show.callerId];
  const left = g.summaryDeadline ? Math.max(0, Math.ceil((g.summaryDeadline - (now + clockOffset)) / 1000)) : null;
  const voted = g.continueVotes.includes(myId);
  const canVote = me && me.kind === 'human' && me.controller === 'human';
  const waitingFor = Object.values(seatsById)
    .filter((s) => s.kind === 'human' && s.connected && s.controller === 'human' && !g.continueVotes.includes(s.id))
    .map((s) => s.name);
  const entries = [...show.entries].sort(
    (a, b) => (a.id === show.callerId ? -1 : b.id === show.callerId ? 1 : Number(a.dropped) - Number(b.dropped) || a.count - b.count),
  );
  const roundWinner = show.result === 'all-dropped' ? show.entries.find((e) => !e.dropped) : null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Round ${show.round} summary`}>
      <div className={`summary result-${show.result}`}>
        <header className="summary-head">
          <span className="eyebrow">Round {show.round} · Joker {RANK_NAME[show.jokerRank] || show.jokerRank}</span>
          <h2>
            {roundWinner ? (
              <>
                {displayName(seatsById[roundWinner.id])} takes the round — <span className="result-word">{RESULT_TEXT[show.result]}</span>
              </>
            ) : (
              <>
                {displayName(caller)} called Show — <span className="result-word">{RESULT_TEXT[show.result]}</span>
              </>
            )}
          </h2>
        </header>
        <table className="summary-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Hand</th>
              <th scope="col">Count</th>
              <th scope="col">Round</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, row) => {
              const out = show.eliminated.includes(e.id);
              return (
                <tr key={e.id} className={`${e.id === myId ? 'me' : ''} ${out ? 'out' : ''}`}>
                  <th scope="row">
                    {displayName(seatsById[e.id])}
                    {e.id === show.callerId && <span className="badge caller">Caller</span>}
                  </th>
                  <td>
                    {e.dropped && <span className="badge dropped">Dropped · +{show.dropPoints}</span>}
                    <div className="reveal-hand">
                      {sortHand(e.hand, show.jokerRank).map((card, i) => (
                        <PlayingCard key={card.id} card={card} jokerRank={show.jokerRank} size="sm" className="flip-in" style={{ animationDelay: `${row * 120 + i * 60}ms` }} />
                      ))}
                    </div>
                  </td>
                  <td className="num">{e.dropped ? '—' : e.count}</td>
                  <td className={`num score ${e.score < 0 ? 'neg' : ''} ${e.id === show.callerId && show.result === 'failed' ? 'penalty' : ''}`}>{signed(e.score)}</td>
                  <td className="num">
                    {e.total}
                    {out && <span className="badge out pop">Eliminated</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <footer className="summary-foot">
          <span className="muted">
            {left !== null ? `Next round in ${left}s` : ''}
            {waitingFor.length > 0 && g.continueVotes.length > 0 ? ` · waiting for ${waitingFor.join(', ')}` : ''}
          </span>
          {canVote && (
            <button type="button" className="btn primary" onClick={() => send({ type: 'continue' })} disabled={voted} autoFocus>
              {voted ? `Starting in ${left ?? 0}s…` : 'Continue'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ConfirmLeave({ onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Leave game" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Leave this game?</h3>
        <p>A bot will take over your seat, cards and score. You won’t be able to come back to this game.</p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={onCancel} autoFocus>
            Stay
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            Leave game
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Game({ room, you, send, clockOffset, emotes = [], onLeave, onHelp }) {
  const g = room.game;
  const myId = you?.seatId;
  const seatsById = useMemo(() => Object.fromEntries(room.seats.map((s) => [s.id, s])), [room.seats]);
  const gSeatsById = useMemo(() => Object.fromEntries(g.seats.map((s) => [s.id, s])), [g.seats]);
  const me = seatsById[myId];
  const myGame = gSeatsById[myId];
  const isHost = room.hostId === myId;
  const jokerRank = g.jokerRank;

  const [selected, setSelected] = useState([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickTarget, setKickTarget] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [dealKey, setDealKey] = useState(g.round);

  const turnSeatId = g.turn?.seatId;
  const iControl = me?.controller === 'human';
  const myTurn = g.phase === 'playing' && turnSeatId === myId && iControl;
  const phase = g.turn?.phase;

  const now = useNow(g.phase === 'playing' || g.phase === 'summary');
  const remaining = g.turnDeadline ? g.turnDeadline - (now + clockOffset) : 0;
  const glow = g.turnDuration && g.turnDeadline ? Math.max(0, Math.min(1, remaining / g.turnDuration)) : 1;

  // Clear selection whenever the hand or turn changes.
  const narrow = useNarrow();
  const flightLayer = useRef(null);
  const seatOrder = useMemo(() => g.seats.filter((s) => !s.eliminated).map((s) => s.id), [g.seats]);
  useCardFlights({ layerRef: flightLayer, events: room.events, myId, jokerRank: g.jokerRank, seatOrder });

  // Each hand card gets its entry delay once: staggered when dealt, or held back
  // until the flying card lands when it was drawn mid-round.
  const entryDelay = useRef({ round: g.round, delays: {} });
  if (entryDelay.current.round !== g.round) entryDelay.current = { round: g.round, delays: {}, dealt: false };
  {
    const { delays } = entryDelay.current;
    const firstSight = !entryDelay.current.dealt;
    g.hand.forEach((c, i) => {
      if (delays[c.id] === undefined) delays[c.id] = firstSight ? { cls: 'deal-in', ms: i * 70 } : { cls: 'land-in', ms: 400 };
    });
    if (g.hand.length) entryDelay.current.dealt = true;
  }

  const handKey = g.hand.map((c) => c.id).join(',');
  useEffect(() => setSelected([]), [handKey, g.turn?.seq, phase]);

  // Sounds and table notices from server events (FR-26, FR-40).
  const lastEvent = useRef(room.events.length ? room.events[room.events.length - 1].id : 0);
  useEffect(() => {
    const fresh = room.events.filter((e) => e.id > lastEvent.current);
    if (!fresh.length) return;
    lastEvent.current = fresh[fresh.length - 1].id;
    const notes = [];
    fresh.forEach((e) => {
      const who = displayName(seatsById[e.seatId]);
      if (e.kind === 'deal') {
        play('deal');
        setDealKey(e.round);
      } else if (e.kind === 'discard') play('discard');
      else if (e.kind === 'draw' || e.kind === 'take') play('draw');
      else if (e.kind === 'show') play(e.result === 'success' ? 'show' : 'fail');
      else if (e.kind === 'eliminated') {
        play('eliminated');
        notes.push(`${e.seatId === myId ? 'You are' : `${seatsById[e.seatId]?.name} is`} eliminated.`);
      } else if (e.kind === 'reshuffle') notes.push('The closed deck ran out — the open pile was reshuffled into a new deck.');
      else if (e.kind === 'takeover') notes.push(`${seatsById[e.seatId]?.name} ${TAKEOVER_TEXT[e.reason] || 'was replaced by a bot'}.`);
      else if (e.kind === 'timeout' && e.seatId === myId) notes.push('Time ran out — your highest card was discarded and you drew from the deck.');
      else if (e.kind === 'reclaim') notes.push(`${seatsById[e.seatId]?.name} took their seat back.`);
      else if (e.kind === 'drop') {
        play('discard');
        notes.push(`${e.seatId === myId ? 'You' : who} dropped this round (+${e.points}).`);
      }
      else if (e.kind === 'host') notes.push(`${who} is now the host.`);
    });
    if (notes.length) {
      const stamped = notes.map((text, i) => ({ id: `${lastEvent.current}-${i}`, text }));
      setToasts((t) => [...t, ...stamped].slice(-4));
      setTimeout(() => setToasts((t) => t.filter((x) => !stamped.includes(x))), 5000);
    }
  }, [room.events, seatsById, myId]);

  const prevTurn = useRef(null);
  useEffect(() => {
    if (myTurn && phase === 'discard' && prevTurn.current !== g.turn.seq) play('turn');
    prevTurn.current = g.turn?.seq ?? null;
  }, [myTurn, phase, g.turn?.seq]);

  // Opponents in turn order starting after the local player.
  const order = g.seats.map((s) => s.id);
  const myIndex = Math.max(0, order.indexOf(myId));
  const opponents = [];
  for (let step = 1; step < order.length; step += 1) opponents.push(order[(myIndex + step) % order.length]);
  if (!gSeatsById[myId]) opponents.unshift(order[myIndex]);

  const hand = sortHand(g.hand, jokerRank);
  const myCount = handCount(g.hand, jokerRank);
  const selectedCards = hand.filter((c) => selected.includes(c.id));
  const sameRank = selectedCards.every((c) => c.rank === selectedCards[0]?.rank);

  let discardProblem = null;
  if (!selectedCards.length) discardProblem = 'Select a card to discard.';
  else if (!sameRank) discardProblem = 'Cards discarded together must be the same rank (J + Q is not a match).';

  const toggle = (id) => {
    if (!myTurn || phase !== 'discard') return;
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const doDiscard = () => {
    if (discardProblem) return;
    send({ type: 'discard', cardIds: selected });
  };
  const doDraw = (source) => myTurn && phase === 'draw' && send({ type: 'draw', source });

  const pile = g.openPile;
  const takeable = pile.find((c) => c.id === g.takeableId) || null;
  const pending = g.turn?.pending || [];
  const pendingOwner = seatsById[turnSeatId];
  const canTake = myTurn && phase === 'draw' && !!takeable;

  const takeableNote = g.takeableFrom ? `Takeable · from ${g.takeableFrom === myId ? 'you' : displayName(seatsById[g.takeableFrom])}` : 'Takeable · starting card';

  let hint;
  if (!myGame) hint = 'You are watching this game.';
  else if (myGame.eliminated) hint = 'You are out of this game — watching the rest.';
  else if (!iControl) hint = 'A bot is playing your seat.';
  else if (g.phase !== 'playing') hint = '';
  else if (!myTurn) hint = `Waiting for ${displayName(seatsById[turnSeatId])}…`;
  else if (phase === 'discard' && g.canDrop.ok) hint = `Your first turn — discard to play on, or Drop this round for +${g.dropPoints}.`;
  else if (phase === 'discard') hint = 'Your turn — select one card, or several of the same rank, then Discard. Or call Show.';
  else hint = takeable ? `Now draw one card: the closed deck, or take the ${cardLabel(takeable, jokerRank)}.` : 'Now draw one card from the closed deck.';

  const canReclaim = me && (me.takeover === 'disconnect' || me.takeover === 'timeout');

  const plate = (id) => ({
    seat: seatsById[id],
    gameSeat: gSeatsById[id],
    isTurn: g.phase === 'playing' && turnSeatId === id,
    glow,
    remaining,
    duration: g.turnDuration,
    isHostSeat: room.hostId === id,
    isMe: id === myId,
  });

  return (
    <div className="game">
      <div className="flight-layer" ref={flightLayer} aria-hidden="true" />
      <aside className="score-panel" aria-label="Scores">
        <div className="score-head">
          <h2>Standings</h2>
          <span className="muted small">Out at {room.settings.eliminationScore}</span>
        </div>
        <Standings
          players={g.seats.map((s) => ({ id: s.id, name: displayName(seatsById[s.id]), total: s.total, eliminated: s.eliminated }))}
          myId={myId}
          turnId={g.phase === 'playing' ? turnSeatId : null}
          eliminationScore={room.settings.eliminationScore}
        />
        <div className="score-round small">After {g.history.length} {g.history.length === 1 ? 'round' : 'rounds'}</div>
        <div className="score-actions">
          <span className="muted small mono">Room {room.code}</span>
          <button type="button" className="btn ghost small" onClick={onHelp} aria-label="Rules">
            <span className="lbl-long">Rules</span>
            <span className="lbl-short" aria-hidden="true">?</span>
          </button>
          <button type="button" className="btn ghost small" onClick={() => setConfirmLeave(true)} aria-label="Leave game">
            <span className="lbl-long">Leave game</span>
            <span className="lbl-short" aria-hidden="true">🚪</span>
          </button>
        </div>
      </aside>

      <section className="table-area">
        {canReclaim && (
          <div className="reclaim-banner" role="status">
            <span>{me.reclaimPending ? 'You will take over from your next turn.' : 'A bot is playing your seat.'}</span>
            {!me.reclaimPending && (
              <button type="button" className="btn primary small" onClick={() => send({ type: 'reclaim' })}>
                Take my seat back
              </button>
            )}
          </div>
        )}

        <div className="felt">
          <div className="round-chip">
            Round {g.round} · {g.deckCount === 2 ? 'two decks' : 'one deck'}
          </div>

          {opponents.map((id, i) => {
            const seat = seatsById[id];
            const kickable = isHost && seat.kind === 'human' && seat.takeover !== 'kicked' && seat.takeover !== 'left';
            return (
              <Opponent key={id} style={seatPosition(i, opponents.length, narrow)} compact={opponents.length >= 5} {...plate(id)}>
                {kickable && (
                  <button type="button" className="kick-btn" onClick={() => setKickTarget(id)} aria-label={`Kick ${seat.name}`} title={`Kick ${seat.name}`}>
                    Kick
                  </button>
                )}
              </Opponent>
            );
          })}

          <div className="center">
            <div className="pile-slot">
              <span className="slot-label">Joker</span>
              {g.jokerCard && <PlayingCard card={g.jokerCard} jokerRank={null} size="md" className="joker-indicator" title={`Joker indicator: ${cardLabel(g.jokerCard)}. Every ${RANK_NAME[jokerRank] || jokerRank} is a joker this round.`} />}
              <span className="slot-sub">All {RANK_NAME[jokerRank] || jokerRank}s count minus</span>
            </div>

            <div className="pile-slot">
              <span className="slot-label">Closed deck</span>
              <button
                type="button"
                className={`deck ${myTurn && phase === 'draw' ? 'drawable' : ''}`}
                onClick={() => doDraw('deck')}
                disabled={!(myTurn && phase === 'draw')}
                aria-label={`Draw from the closed deck, ${g.deckRemaining} cards`}
              >
                <CardBack size="md" className="stack-3" />
                <CardBack size="md" className="stack-2" />
                <CardBack size="md" className="stack-1" />
              </button>
              <span className="slot-sub">{g.deckRemaining} cards</span>
            </div>

            <div className="pile-slot">
              <span className="slot-label">Open pile</span>
              <div className="open-pile">
                {pile.length === 0 && <div className="pile-empty">Empty</div>}
                {pile.map((card, i) => {
                  const isTop = card.id === g.takeableId;
                  const depth = pile.length - 1 - i;
                  return (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      jokerRank={jokerRank}
                      size="md"
                      takeable={isTop && g.phase === 'playing'}
                      dim={!isTop}
                      className={`pile-card fly-in depth-${Math.min(depth, 3)}`}
                      onClick={() => doDraw('open')}
                      disabled={!(isTop && canTake)}
                      title={isTop && canTake ? `Take the ${cardLabel(card, jokerRank)}` : undefined}
                    />
                  );
                })}
              </div>
              <span className="slot-sub">{takeable ? takeableNote : ''}</span>
            </div>

            <div className={`pile-slot pending-slot ${pending.length ? 'has' : ''}`}>
              <span className="slot-label">{pending.length ? (turnSeatId === myId ? 'Your discard' : `${displayName(pendingOwner)}’s discard`) : 'Discard'}</span>
              <div className="pending">
                {pending.map((card) => (
                  <PlayingCard key={card.id} card={card} jokerRank={jokerRank} size="md" className="land-in" />
                ))}
                {!pending.length && <div className="pile-empty ghost">—</div>}
              </div>
              <span className="slot-sub">{pending.length ? 'Not takeable this turn' : ''}</span>
            </div>
          </div>

          <EmoteLayer
            emotes={emotes}
            positionOf={(seatId) => {
              if (seatId === myId) return { left: '50%', top: '92%' };
              const i = opponents.indexOf(seatId);
              return i >= 0 ? seatPosition(i, opponents.length, narrow) : null;
            }}
            nameOf={(seatId) => displayName(seatsById[seatId])}
          />

          <div className="table-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className="table-toast">
                {t.text}
              </div>
            ))}
          </div>
        </div>

        <div className={`my-area ${myTurn ? 'my-turn' : ''}`}>
          <div className="my-left">
            {myGame && <NamePlate {...plate(myId)} />}
            <div className="hand-count" aria-live="polite">
              <span className="eyebrow">Hand count</span>
              <strong className={myCount < 0 ? 'neg' : ''}>{myCount}</strong>
            </div>
          </div>

          <div className="my-center">
            <div className="hand" role="group" aria-label="Your hand">
              {hand.map((card, i) => (
                <PlayingCard
                  key={`${card.id}-${dealKey}`}
                  card={card}
                  jokerRank={jokerRank}
                  size="lg"
                  selected={selected.includes(card.id)}
                  onClick={() => toggle(card.id)}
                  disabled={!(myTurn && phase === 'discard')}
                  className={entryDelay.current.delays[card.id]?.cls || 'deal-in'}
                  style={{ animationDelay: `${entryDelay.current.delays[card.id]?.ms ?? i * 70}ms` }}
                />
              ))}
              {!hand.length && myGame?.eliminated && <div className="hand-empty">Eliminated</div>}
              {!hand.length && myGame?.dropped && !myGame?.eliminated && <div className="hand-empty">You dropped this round — back in next round</div>}
            </div>
            <p className="hint" aria-live="polite">
              {myTurn && phase === 'discard' && selectedCards.length > 0 && discardProblem ? <span className="hint-error">{discardProblem}</span> : hint}
            </p>
          </div>

          <EmojiTray onSend={(emoji) => send({ type: 'emote', emoji })} />

          <div className="my-actions">
            {myTurn && phase === 'draw' ? (
              <>
                <button type="button" className="btn primary" onClick={() => doDraw('deck')}>
                  Draw from deck
                </button>
                <button type="button" className="btn" onClick={() => doDraw('open')} disabled={!takeable}>
                  {takeable ? `Take ${takeable.rank}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[takeable.suit]}` : 'Nothing to take'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={doDiscard} disabled={!myTurn || phase !== 'discard' || !!discardProblem} title={myTurn ? discardProblem || '' : ''}>
                  Discard{selectedCards.length > 1 ? ` ${selectedCards.length}` : ''}
                </button>
                {myTurn && g.canDrop.ok ? (
                  // First turn of the round: Show isn't allowed yet, so Drop takes its place.
                  <button type="button" className="btn drop-btn" onClick={() => setConfirmDrop(true)} title={`Sit out this round for +${g.dropPoints}`}>
                    Drop · +{g.dropPoints}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn show-btn"
                    onClick={() => send({ type: 'show' })}
                    disabled={!myTurn || !g.canShow.ok}
                    title={myTurn && !g.canShow.ok ? g.canShow.reason : 'Call Show if you think your count is the lowest'}
                  >
                    Show
                  </button>
                )}
              </>
            )}
            {myTurn && phase === 'discard' && g.canDrop.ok && <span className="action-note">Show opens from your next turn.</span>}
            {myTurn && phase === 'discard' && !g.canDrop.ok && !g.canShow.ok && <span className="action-note">{g.canShow.reason}</span>}
          </div>
        </div>
      </section>

      {g.phase === 'summary' && g.lastShow && <RoundSummary g={g} seatsById={seatsById} myId={myId} me={me} send={send} now={now} clockOffset={clockOffset} />}

      {confirmLeave && (
        <ConfirmLeave
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            onLeave();
          }}
        />
      )}

      {confirmDrop && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Drop this round" onClick={() => setConfirmDrop(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Drop this round?</h3>
            <p>
              You fold your hand, score <strong>+{g.dropPoints}</strong> (half the {room.settings.showPenalty} penalty), and sit out until the next round.
            </p>
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmDrop(false)} autoFocus>
                Keep playing
              </button>
              <button
                type="button"
                className="btn drop-btn"
                onClick={() => {
                  send({ type: 'drop' });
                  setConfirmDrop(false);
                }}
              >
                Drop · +{g.dropPoints}
              </button>
            </div>
          </div>
        </div>
      )}

      {kickTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Kick player" onClick={() => setKickTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Kick {seatsById[kickTarget]?.name}?</h3>
            <p>A bot takes over their seat for the rest of this game, and they can’t rejoin it.</p>
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setKickTarget(null)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  send({ type: 'kick', seatId: kickTarget });
                  setKickTarget(null);
                }}
              >
                Kick
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
