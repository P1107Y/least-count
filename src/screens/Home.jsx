import { useEffect, useRef, useState } from 'react';
import { saveName } from '../net.js';

export const nameProblem = (name) => {
  const n = name.trim();
  if (n.length < 2 || n.length > 15) return 'Display name must be 2 to 15 characters.';
  return null;
};

export function NameField({ name, setName, touched }) {
  const problem = nameProblem(name);
  return (
    <label className="field">
      <span className="field-label">Display name</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={15}
        placeholder="2–15 characters"
        autoComplete="nickname"
        aria-invalid={touched && !!problem}
        autoFocus
      />
      {touched && problem && <span className="field-error">{problem}</span>}
    </label>
  );
}

export default function Home({ send, inviteCode, onBots, onHowTo, defaultName, connected }) {
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState(inviteCode || '');
  const [touched, setTouched] = useState(false);
  const autoJoined = useRef(false);

  const withName = (fn) => () => {
    setTouched(true);
    if (nameProblem(name)) return;
    saveName(name.trim());
    fn(name.trim());
  };

  // An invite link lands a returning player straight in the lobby (acceptance 33).
  useEffect(() => {
    if (inviteCode && connected && !autoJoined.current && !nameProblem(defaultName)) {
      autoJoined.current = true;
      send({ type: 'join', code: inviteCode, name: defaultName.trim() });
    }
  }, [inviteCode, connected, defaultName, send]);

  const join = withName((n) => send({ type: 'join', code: code.trim().toUpperCase(), name: n }));

  return (
    <div className="home">
      <section className="home-hero">
        <h1>
          Hold the <em>least</em>.<br />
          Call the Show.
        </h1>
        <p className="lede">A fast card game for 2–8 players. Shed your high cards, hoard the jokers, and call Show when you think your hand counts lowest. Get it wrong and you eat 50 points.</p>
        <div className="hero-cards" aria-hidden="true">
          <div className="pcard pcard-lg black tilt-1">
            <span className="pcard-corner">
              <span className="pcard-rank">A</span>
              <span className="pcard-suit">♠</span>
            </span>
            <span className="pcard-pip">♠</span>
          </div>
          <div className="pcard pcard-lg red joker tilt-2">
            <span className="pcard-corner">
              <span className="pcard-rank">5</span>
              <span className="pcard-suit">♥</span>
            </span>
            <span className="pcard-pip">♥</span>
            <span className="pcard-joker">★ Joker</span>
          </div>
          <div className="pcard pcard-lg black tilt-3">
            <span className="pcard-corner">
              <span className="pcard-rank">2</span>
              <span className="pcard-suit">♣</span>
            </span>
            <span className="pcard-pip">♣</span>
          </div>
        </div>
      </section>

      <section className="panel home-panel" aria-label="Start playing">
        {inviteCode && (
          <div className="invite-banner">
            You’ve been invited to room <strong className="mono">{inviteCode}</strong>. Enter your name and join.
          </div>
        )}
        <NameField name={name} setName={setName} touched={touched} />

        {inviteCode ? (
          <button type="button" className="btn primary block" onClick={join}>
            Join room {inviteCode}
          </button>
        ) : (
          <>
            <button type="button" className="btn primary block" onClick={withName(() => onBots())}>
              Play with bots
            </button>
            <button type="button" className="btn block" onClick={withName((n) => send({ type: 'create', name: n, mode: 'friends' }))}>
              Create a private room
            </button>
            <div className="divider">
              <span>or join friends</span>
            </div>
            <form
              className="join-row"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <label className="sr-only" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                className="mono code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={6}
                placeholder="ROOM CODE"
                autoComplete="off"
              />
              <button type="submit" className="btn" disabled={code.length !== 6}>
                Join
              </button>
            </form>
          </>
        )}
        <button type="button" className="btn link block" onClick={onHowTo}>
          How to play
        </button>
      </section>
    </div>
  );
}
