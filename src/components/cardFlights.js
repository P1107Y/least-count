import { useEffect, useRef } from 'react';
import { SUIT_GLYPH } from '../cards.js';

// Flies a ghost card between two on-screen spots so moves read as motion:
// deck → hand, hand → discard slot, open pile → hand. Purely visual.
const FLIGHT_MS = 430;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const seatEl = (seatId, myId) => (seatId === myId ? document.querySelector('.hand') : document.querySelector(`[data-seat="${seatId}"] .opp-cards`));

const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const makeCard = (card, jokerRank) => {
  const el = document.createElement('div');
  if (!card) {
    el.className = 'pcard pcard-md back flight';
    return el;
  }
  const red = card.suit === 'H' || card.suit === 'D';
  el.className = `pcard pcard-md ${red ? 'red' : 'black'} suit-${card.suit} ${card.rank === jokerRank ? 'joker' : ''} flight`;
  const glyph = SUIT_GLYPH[card.suit];
  el.innerHTML = `<span class="pcard-corner"><span class="pcard-rank">${card.rank}</span><span class="pcard-suit">${glyph}</span></span><span class="pcard-pip">${glyph}</span>`;
  return el;
};

const fly = (layer, fromEl, toEl, card, jokerRank, delay = 0) => {
  if (!layer || !fromEl || !toEl) return;
  const el = makeCard(card, jokerRank);
  layer.appendChild(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const a = centre(fromEl);
  const b = centre(toEl);
  const anim = el.animate(
    [
      { transform: `translate(${a.x - w / 2}px, ${a.y - h / 2}px) scale(0.75) rotate(-10deg)`, opacity: 0.2 },
      { opacity: 1, offset: 0.15 },
      { transform: `translate(${b.x - w / 2}px, ${b.y - h / 2}px) scale(1) rotate(0deg)`, opacity: 1 },
    ],
    { duration: FLIGHT_MS, delay, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
};

export function useCardFlights({ layerRef, events, myId, jokerRank, seatOrder }) {
  const lastSeen = useRef(events.length ? events[events.length - 1].id : 0);

  useEffect(() => {
    const fresh = events.filter((e) => e.id > lastSeen.current);
    if (!fresh.length) return;
    lastSeen.current = fresh[fresh.length - 1].id;
    if (reducedMotion()) return;
    const layer = layerRef.current;
    const deck = document.querySelector('.deck');
    const openPile = document.querySelector('.open-pile');
    const pending = document.querySelector('.pending');

    fresh.forEach((e) => {
      if (e.kind === 'deal') {
        // A few backs from the deck to each opponent; the local hand has its own deal-in.
        seatOrder
          .filter((id) => id !== myId)
          .forEach((id, i) => {
            for (let n = 0; n < 3; n += 1) fly(layer, deck, seatEl(id, myId), null, jokerRank, (n * seatOrder.length + i) * 55);
          });
      } else if (e.kind === 'discard') {
        (e.cards || []).forEach((card, i) => fly(layer, seatEl(e.seatId, myId), pending, card, jokerRank, i * 70));
      } else if (e.kind === 'draw') {
        fly(layer, deck, seatEl(e.seatId, myId), null, jokerRank);
      } else if (e.kind === 'take') {
        fly(layer, openPile, seatEl(e.seatId, myId), e.card, jokerRank);
      }
    });
  }, [events, layerRef, myId, jokerRank, seatOrder]);
}
