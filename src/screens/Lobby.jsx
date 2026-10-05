import { useState } from 'react';
import { Segmented, DIFFICULTY_INFO } from './BotSetup.jsx';

const inviteLink = (code) => `${window.location.origin}/?room=${code}`;

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button type="button" className="btn small" onClick={copy}>
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

function SettingsPanel({ room, isHost, send }) {
  const s = room.settings;
  const [draft, setDraft] = useState({ eliminationScore: s.eliminationScore, showPenalty: s.showPenalty });
  const update = (patch) => send({ type: 'settings', settings: patch });
  const commit = (key) => {
    const v = Number(draft[key]);
    if (v !== s[key]) update({ [key]: v });
  };

  if (!isHost) {
    return (
      <dl className="settings-readonly">
        <div>
          <dt>Elimination score</dt>
          <dd>{s.eliminationScore}</dd>
        </div>
        <div>
          <dt>Show penalty</dt>
          <dd>{s.showPenalty}</dd>
        </div>
        <div>
          <dt>Turn timer</dt>
          <dd>{s.turnTimer ? `${s.turnTimer}s` : 'Off'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="settings-form">
      <label className="field inline">
        <span className="field-label">Elimination score</span>
        <input
          type="number"
          min={50}
          max={1000}
          value={draft.eliminationScore}
          onChange={(e) => setDraft({ ...draft, eliminationScore: e.target.value })}
          onBlur={() => commit('eliminationScore')}
          onKeyDown={(e) => e.key === 'Enter' && commit('eliminationScore')}
        />
      </label>
      <label className="field inline">
        <span className="field-label">Show penalty</span>
        <input
          type="number"
          min={0}
          max={200}
          value={draft.showPenalty}
          onChange={(e) => setDraft({ ...draft, showPenalty: e.target.value })}
          onBlur={() => commit('showPenalty')}
          onKeyDown={(e) => e.key === 'Enter' && commit('showPenalty')}
        />
      </label>
      <div className="field inline">
        <span className="field-label">Turn timer</span>
        <Segmented
          label="Turn timer"
          value={s.turnTimer}
          onChange={(v) => update({ turnTimer: v })}
          options={[
            { value: 15, label: '15s' },
            { value: 30, label: '30s' },
            { value: 60, label: '60s' },
            { value: 0, label: 'Off' },
          ]}
        />
      </div>
    </div>
  );
}

export default function Lobby({ room, you, send, onLeave }) {
  const myId = you?.seatId;
  const isHost = room.hostId === myId;
  const bots = room.seats.filter((s) => s.kind === 'bot');
  const humans = room.seats.filter((s) => s.kind === 'human');
  const full = room.seats.length >= room.limits.maxSeats;
  const botCap = bots.length >= room.limits.maxBots;
  const [botDifficulty, setBotDifficulty] = useState('medium');

  let startProblem = null;
  if (room.seats.length < room.limits.minSeats) startProblem = 'Add a bot or invite a friend — at least 2 players are needed.';
  else if (!humans.length) startProblem = 'At least one human must be seated.';

  const empty = Math.max(0, room.limits.maxSeats - room.seats.length);

  return (
    <div className="lobby">
      <section className="panel lobby-main">
        <div className="lobby-head">
          <div>
            <span className="eyebrow">Room code</span>
            <div className="room-code mono" aria-label={`Room code ${room.code.split('').join(' ')}`}>
              {room.code}
            </div>
          </div>
          <div className="lobby-share">
            <CopyButton text={room.code} label="Copy code" />
            <CopyButton text={inviteLink(room.code)} label="Copy invite link" />
          </div>
        </div>

        <h2 className="section-title">
          Players <span className="muted">
            {room.seats.length} / {room.limits.maxSeats}
          </span>
        </h2>
        <ul className="seat-list">
          {room.seats.map((seat) => (
            <li key={seat.id} className={`seat-row ${seat.id === myId ? 'me' : ''}`}>
              <span className={`avatar ${seat.kind}`} aria-hidden="true">
                {seat.kind === 'bot' ? '🤖' : seat.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="seat-name">
                {seat.name}
                {seat.id === myId && <span className="muted"> (you)</span>}
              </span>
              <span className="badges">
                {room.hostId === seat.id && <span className="badge host">Host</span>}
                {seat.kind === 'bot' && <span className="badge bot">Bot · {seat.difficulty}</span>}
                {seat.kind === 'human' && (
                  <span className={`badge ${seat.connected ? 'online' : 'offline'}`}>
                    <span className="dot" aria-hidden="true" />
                    {seat.connected ? 'Connected' : 'Reconnecting'}
                  </span>
                )}
              </span>
              {isHost && seat.kind === 'bot' && (
                <span className="seat-actions">
                  <label className="sr-only" htmlFor={`diff-${seat.id}`}>
                    Difficulty for {seat.name}
                  </label>
                  <select id={`diff-${seat.id}`} value={seat.difficulty} onChange={(e) => send({ type: 'setBotDifficulty', seatId: seat.id, difficulty: e.target.value })}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button type="button" className="btn small ghost" onClick={() => send({ type: 'removeBot', seatId: seat.id })}>
                    Remove
                  </button>
                </span>
              )}
              {isHost && seat.kind === 'human' && seat.id !== myId && (
                <span className="seat-actions">
                  <button type="button" className="btn small danger-ghost" onClick={() => send({ type: 'kick', seatId: seat.id })}>
                    Kick
                  </button>
                </span>
              )}
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="seat-row empty">
              <span className="avatar empty" aria-hidden="true" />
              <span className="seat-name muted">Open seat</span>
            </li>
          ))}
        </ul>

        {isHost && (
          <div className="add-bot">
            <Segmented
              label="New bot difficulty"
              value={botDifficulty}
              onChange={setBotDifficulty}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
            <button type="button" className="btn" disabled={full || botCap} onClick={() => send({ type: 'addBot', difficulty: botDifficulty })}>
              + Add bot
            </button>
            <span className="field-hint">{full ? `All ${room.limits.maxSeats} seats are taken.` : botCap ? 'A game can have at most 4 bots.' : DIFFICULTY_INFO[botDifficulty]}</span>
          </div>
        )}
      </section>

      <aside className="panel lobby-side">
        <h2 className="section-title">Room settings</h2>
        <SettingsPanel key={`${room.settings.eliminationScore}-${room.settings.showPenalty}`} room={room} isHost={isHost} send={send} />
        <div className="lobby-start">
          {isHost ? (
            <>
              <button type="button" className="btn primary block" disabled={!!startProblem} onClick={() => send({ type: 'start' })}>
                Start game
              </button>
              {startProblem && <p className="field-hint">{startProblem}</p>}
            </>
          ) : (
            <p className="waiting">
              <span className="spinner small" aria-hidden="true" /> Waiting for {room.seats.find((s) => s.id === room.hostId)?.name || 'the host'} to start…
            </p>
          )}
          <button type="button" className="btn ghost block" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </aside>
    </div>
  );
}
