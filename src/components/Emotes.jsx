import { useEffect, useRef, useState } from 'react';
import { play } from '../sound.js';

// Must match EMOTES in server/rooms.js. Each emoji has its own animation.
export const EMOJIS = [
  { emoji: '😂', fx: 'wobble', label: 'Laughing' },
  { emoji: '🔥', fx: 'flame', label: 'On fire' },
  { emoji: '😎', fx: 'cool', label: 'Cool' },
  { emoji: '😭', fx: 'cry', label: 'Crying' },
  { emoji: '🤡', fx: 'spin', label: 'Clown' },
  { emoji: '👏', fx: 'clap', label: 'Applause' },
  { emoji: '😡', fx: 'shake', label: 'Angry' },
  { emoji: '🤯', fx: 'boom', label: 'Mind blown' },
  { emoji: '🎉', fx: 'confetti', label: 'Party' },
  { emoji: '💸', fx: 'rain', label: 'Money' },
  { emoji: '🙏', fx: 'bob', label: 'Please' },
  { emoji: '👀', fx: 'look', label: 'Watching' },
];
const FX = Object.fromEntries(EMOJIS.map((e) => [e.emoji, e.fx]));
const LIFETIME_MS = 2800;
const CONFETTI_COLORS = ['#f0cf7a', '#e0294a', '#5ee0a8', '#8b6cff', '#ffffff', '#ff9d3c'];

const useTick = (active) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, [active]);
};

function Confetti({ seed }) {
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * 360 + ((seed * 37) % 20);
        const dist = 60 + ((seed + i * 13) % 50);
        return (
          <i
            key={i}
            style={{
              '--dx': `${Math.cos((angle * Math.PI) / 180) * dist}px`,
              '--dy': `${Math.sin((angle * Math.PI) / 180) * dist - 30}px`,
              '--rot': `${(i * 47) % 360}deg`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 4) * 30}ms`,
            }}
          />
        );
      })}
    </span>
  );
}

function MoneyRain({ seed }) {
  return (
    <div className="money-rain" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 7.3 + (seed % 7) * 3) % 100}%`, animationDelay: `${(i * 97) % 900}ms`, fontSize: `${18 + ((i * 5) % 14)}px` }}>
          💸
        </span>
      ))}
    </div>
  );
}

// Floating emoji bubbles over each sender's seat.
export function EmoteLayer({ emotes, positionOf, nameOf }) {
  const seen = useRef(new Set());
  const now = Date.now();
  const live = emotes.filter((e) => now - e.at < LIFETIME_MS);
  useTick(live.length > 0);

  useEffect(() => {
    live.forEach((e) => {
      if (seen.current.has(e.id)) return;
      seen.current.add(e.id);
      play('pop');
    });
  }, [live]);

  return (
    <div className="emote-layer" aria-live="polite">
      {live.map((e) => {
        const pos = positionOf(e.seatId);
        if (!pos) return null;
        const fx = FX[e.emoji] || 'bob';
        return (
          <div key={e.id}>
            {fx === 'rain' && <MoneyRain seed={e.id} />}
            <div className={`emote fx-${fx}`} style={pos} role="img" aria-label={`${nameOf(e.seatId)}: ${e.emoji}`}>
              {fx === 'confetti' && <Confetti seed={e.id} />}
              <span className="emote-glyph">{e.emoji}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The emoji picker in the player's own area.
export function EmojiTray({ onSend }) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (ev) => {
      if (ref.current && !ref.current.contains(ev.target)) setOpen(false);
    };
    const esc = (ev) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (emoji) => {
    if (cooling) return;
    onSend(emoji);
    setCooling(true);
    setTimeout(() => setCooling(false), 1200);
    setOpen(false);
  };

  return (
    <div className="emoji-tray" ref={ref}>
      <button type="button" className={`emoji-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Send an emoji" title="Send an emoji">
        😀
      </button>
      {open && (
        <div className="emoji-pop" role="menu" aria-label="Emoji">
          {EMOJIS.map((e) => (
            <button key={e.emoji} type="button" role="menuitem" className="emoji-btn" onClick={() => pick(e.emoji)} disabled={cooling} aria-label={e.label} title={e.label}>
              {e.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
