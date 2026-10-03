import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard, CardBack } from '../components/Card.jsx';
import { Standings } from '../components/ScorePanel.jsx';
import { handCount, sortHand, signed, cardLabel, RANK_NAME } from '../cards.js';
import { play } from '../sound.js';

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
  exempt: 'Show failed — all jokers, no penalty',
};

const TAKEOVER_TEXT = {
  disconnect: 'lost connection — a bot is playing their seat',
  timeout: 'timed out three times — a bot is playing their seat',
  left: 'left — a bot is playing their seat',
  kicked: 'was removed by the host — a bot is playing their seat',
};

// Opponents sit around the upper arc in turn order, starting on the local player's left (UI-6).
const ANGLES = { 1: [270], 2: [215, 325], 3: [190, 270, 350] };
const seatPosition = (i, k) => {
  const angle = ANGLES[k]?.[i] ?? 180 + (i * 180) / (k - 1);
  const rad = (angle * Math.PI) / 180;
  return { left: `${50 + 41 * Math.cos(rad)}%`, top: `${54 + 40 * Math.sin(rad)}%` };
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
        {isTurn && <TurnClock remaining={remaining} duration={duration} />}
        {children}
      </div>
    </div>
  );
}

function Opponent({ seat, gameSeat, style, ...plate }) {
  const n = gameSeat.eliminated ? 0 : gameSeat.cardCount;
  return (
    <div className={`opponent ${gameSeat.eliminated ? 'out' : ''}`} style={style}>
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
  const entries = [...show.entries].sort((a, b) => (a.id === show.callerId ? -1 : b.id === show.callerId ? 1 : a.count - b.count));
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Round ${show.round} summary`}>
      <div className={`summary result-${show.result}`}>
        <header className="summary-head">
          <span className="eyebrow">Round {show.round} · Joker {RANK_NAME[show.jokerRank] || show.jokerRank}</span>
          <h2>
            {displayName(caller)} called Show — <span className="result-word">{RESULT_TEXT[show.result]}</span>
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
                    <div className="reveal-hand">
                      {sortHand(e.hand, show.jokerRank).map((card, i) => (
                        <PlayingCard key={card.id} card={card} jokerRank={show.jokerRank} size="sm" className="flip-in" style={{ animationDelay: `${row * 120 + i * 60}ms` }} />
                      ))}
                    </div>
                  </td>
                  <td className="num">{e.count}</td>
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
          <span className="muted">{left !== null ? `Next round in ${left}s` : ''}</span>
          {canVote && (
            <button type="button" className="btn primary" onClick={() => send({ type: 'continue' })} disabled={voted} autoFocus>
              {voted ? 'Waiting for others…' : 'Continue'}
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

export default function Game({ room, you, send, clockOffset, onLeave, onHelp }) {
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
          <button type="button" className="btn ghost small" onClick={onHelp}>
            Rules
          </button>
          <button type="button" className="btn ghost small" onClick={() => setConfirmLeave(true)}>
            Leave game
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
              <Opponent key={id} style={seatPosition(i, opponents.length)} {...plate(id)}>
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
                  return isTop && canTake ? (
                    <PlayingCard key={card.id} card={card} jokerRank={jokerRank} size="md" takeable className="pile-card fly-in" onClick={() => doDraw('open')} title={`Take the ${cardLabel(card, jokerRank)}`} />
                  ) : (
                    <PlayingCard key={card.id} card={card} jokerRank={jokerRank} size="md" takeable={isTop && g.phase === 'playing'} dim={!isTop} className={`pile-card fly-in depth-${Math.min(depth, 3)}`} />
                  );
                })}
              </div>
              <span className="slot-sub">{takeable ? takeableNote : ''}</span>
            </div>

            <div className={`pile-slot pending-slot ${pending.length ? 'has' : ''}`}>
              <span className="slot-label">{pending.length ? (turnSeatId === myId ? 'Your discard' : `${displayName(pendingOwner)}’s discard`) : 'Discard'}</span>
              <div className="pending">
                {pending.map((card) => (
                  <PlayingCard key={card.id} card={card} jokerRank={jokerRank} size="md" className="fly-in" />
                ))}
                {!pending.length && <div className="pile-empty ghost">—</div>}
              </div>
              <span className="slot-sub">{pending.length ? 'Not takeable this turn' : ''}</span>
            </div>
          </div>

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
                  onClick={myTurn && phase === 'discard' ? () => toggle(card.id) : undefined}
                  className="deal-in"
                  style={{ animationDelay: `${i * 70}ms` }}
                />
              ))}
              {!hand.length && myGame?.eliminated && <div className="hand-empty">Eliminated</div>}
            </div>
            <p className="hint" aria-live="polite">
              {myTurn && phase === 'discard' && selectedCards.length > 0 && discardProblem ? <span className="hint-error">{discardProblem}</span> : hint}
            </p>
          </div>

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
                <button
                  type="button"
                  className="btn show-btn"
                  onClick={() => send({ type: 'show' })}
                  disabled={!myTurn || !g.canShow.ok}
                  title={myTurn && !g.canShow.ok ? g.canShow.reason : 'Call Show if you think your count is the lowest'}
                >
                  Show
                </button>
              </>
            )}
            {myTurn && phase === 'discard' && !g.canShow.ok && <span className="action-note">{g.canShow.reason}</span>}
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
