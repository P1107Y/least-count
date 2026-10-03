// Bot decisions. Input is botViewFor(): the seat's own hand plus public information
// only (FR-35). Output: { action: 'show' } or { action: 'play', discard: [ids] | null, draw }.
import { randomInt } from 'crypto';
import { buildDecks, cardValue, handCount } from './cards.js';

export const BOT_NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Esha', 'Felix', 'Gita', 'Hugo', 'Isla', 'Jai', 'Kiran', 'Leo', 'Maya', 'Nico', 'Omar', 'Priya', 'Ravi', 'Sana', 'Theo', 'Uma', 'Vik', 'Zara'];

const rand = () => randomInt(0, 1_000_000) / 1_000_000;

const rankGroups = (hand) => {
  const groups = new Map();
  hand.forEach((c) => {
    if (!groups.has(c.rank)) groups.set(c.rank, []);
    groups.get(c.rank).push(c);
  });
  return [...groups.values()];
};

const opponents = (view) => view.seats.filter((s) => s.id !== view.seatId && !s.eliminated);

// Discard options: every rank group, valued by how much it lowers the count.
const discardOptions = (hand, jokerRank) =>
  rankGroups(hand).map((cards) => ({ cards, removed: cards.reduce((sum, c) => sum + cardValue(c, jokerRank), 0) }));

const forcedJokerDiscard = (hand, jokerRank) =>
  // All jokers: give up the one that costs the least (smallest negative value).
  [hand.reduce((best, c) => (cardValue(c, jokerRank) > cardValue(best, jokerRank) ? c : best))];

const nextSeatId = (view) => {
  const order = view.seatOrder;
  const live = new Set(view.seats.filter((s) => !s.eliminated).map((s) => s.id));
  const i = order.indexOf(view.seatId);
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(i + step) % order.length];
    if (live.has(id)) return id;
  }
  return null;
};

// Rebuild public knowledge from the move log: which cards are in the pile, which
// cards each opponent is known to hold (taken face up from the pile).
const trackKnowledge = (view) => {
  const pile = new Set();
  const known = new Map();
  const pickedRanks = new Map();
  for (const ev of view.log) {
    if (ev.type === 'open') pile.add(ev.card.id);
    if (ev.type === 'discard') {
      ev.cards.forEach((c) => {
        pile.add(c.id);
        known.get(ev.seatId)?.delete(c.id);
      });
    }
    if (ev.type === 'take') {
      pile.delete(ev.card.id);
      if (!known.has(ev.seatId)) known.set(ev.seatId, new Map());
      known.get(ev.seatId).set(ev.card.id, ev.card);
      if (!pickedRanks.has(ev.seatId)) pickedRanks.set(ev.seatId, new Set());
      pickedRanks.get(ev.seatId).add(ev.card.rank);
    }
    if (ev.type === 'reshuffle') pile.clear();
  }
  return { pile, known, pickedRanks };
};

const estimateOpponents = (view) => {
  const { pile, known, pickedRanks } = trackKnowledge(view);
  const excluded = new Set([...view.hand.map((c) => c.id), view.jokerCard.id, ...pile]);
  known.forEach((cards) => cards.forEach((_, id) => excluded.add(id)));
  const unseen = buildDecks(view.deckCount).filter((c) => !excluded.has(c.id));
  const mean = unseen.length ? unseen.reduce((s, c) => s + cardValue(c, view.jokerRank), 0) / unseen.length : 5;

  const estimates = opponents(view).map((s) => {
    const knownCards = [...(known.get(s.id)?.values() || [])].slice(0, s.cardCount);
    const unknown = s.cardCount - knownCards.length;
    // Players shed high cards as they go, so their unknown cards trend low.
    const shrink = Math.max(0.5, 1 - 0.1 * s.turnsThisRound);
    return {
      id: s.id,
      estimate: handCount(knownCards, view.jokerRank) + unknown * mean * shrink,
      spread: 3.2 * Math.sqrt(Math.max(unknown, 0.25)),
    };
  });
  return { estimates, mean, pickedRanks };
};

const phi = (z) => 1 / (1 + Math.exp(-1.702 * z));

const chooseDraw = (view, remaining, takeable, takeThreshold, { pairs = true } = {}) => {
  if (!takeable) return 'deck';
  const v = cardValue(takeable, view.jokerRank);
  if (v < 0) return 'open';
  if (v <= takeThreshold) return 'open';
  if (pairs && remaining.some((c) => c.rank === takeable.rank) && v <= takeThreshold + 4) return 'open';
  return 'deck';
};

const takeableFor = (view) => view.openPile.find((c) => c.id === view.takeableId) || null;

// All jokers: a failed Show carries no penalty, so showing can only help.
const allJokers = (view) => view.hand.every((c) => c.rank === view.jokerRank);
// Long rounds make waiting riskier (someone else will show), so bots grow bolder.
const turnsTaken = (view) => view.seats.find((s) => s.id === view.seatId)?.turnsThisRound || 0;

const decideEasy = (view) => {
  const count = handCount(view.hand, view.jokerRank);
  if (view.canShow.ok && (allJokers(view) || count <= 5 + Math.floor(turnsTaken(view) / 5))) return { action: 'show' };
  const nonJokers = view.hand.filter((c) => c.rank !== view.jokerRank);
  // Its highest card, along with any other copies of that rank.
  const top = nonJokers.length ? nonJokers.reduce((best, c) => (cardValue(c, view.jokerRank) > cardValue(best, view.jokerRank) ? c : best)) : null;
  const pick = top ? nonJokers.filter((c) => c.rank === top.rank) : forcedJokerDiscard(view.hand, view.jokerRank);
  const takeable = takeableFor(view);
  const wantsOpen = takeable && (cardValue(takeable, view.jokerRank) < 0 || cardValue(takeable, view.jokerRank) <= 2) && rand() < 0.6;
  return { action: 'play', discard: pick.map((c) => c.id), draw: wantsOpen ? 'open' : 'deck' };
};

const pickDiscard = (view, avoidRanks = new Set()) => {
  const options = discardOptions(view.hand, view.jokerRank).filter((o) => o.removed > 0);
  if (!options.length) return forcedJokerDiscard(view.hand, view.jokerRank);
  const takeable = takeableFor(view);
  // Keep a card that pairs with the open card so it can be collected and dumped later.
  const score = (o) => {
    let s = o.removed + (o.cards.length - 1) * 1.5;
    if (takeable && o.cards[0].rank === takeable.rank && o.removed >= 8) s -= 2;
    if (avoidRanks.has(o.cards[0].rank)) s -= 2.5;
    if (o.removed <= 3) s -= 1;
    return s;
  };
  return options.reduce((best, o) => (score(o) > score(best) ? o : best)).cards;
};

const decideMedium = (view) => {
  const count = handCount(view.hand, view.jokerRank);
  if (view.canShow.ok) {
    if (allJokers(view)) return { action: 'show' };
    const minOppCards = Math.min(...opponents(view).map((s) => s.cardCount));
    const base = minOppCards >= 4 ? 7 : minOppCards === 3 ? 5 : minOppCards === 2 ? 3 : 1;
    if (count <= base + Math.floor(turnsTaken(view) / 6)) return { action: 'show' };
  }
  const cards = pickDiscard(view);
  const remaining = view.hand.filter((c) => !cards.includes(c));
  return { action: 'play', discard: cards.map((c) => c.id), draw: chooseDraw(view, remaining, takeableFor(view), 3) };
};

const decideHard = (view, penalty) => {
  const count = handCount(view.hand, view.jokerRank);
  const { estimates, mean, pickedRanks } = estimateOpponents(view);

  if (view.canShow.ok) {
    if (allJokers(view)) return { action: 'show' };
    // Chance that every opponent is strictly above our count.
    const p = estimates.reduce((acc, e) => acc * phi((e.estimate - count - 0.5) / e.spread), 1);
    // Win probability needed so the reward (dropping |count| plus avoiding adding it later)
    // outweighs the penalty; lowered as the round drags on.
    const reward = Math.abs(count) + Math.max(count, 0) + 6;
    const need = penalty / (penalty + reward) - Math.max(0, turnsTaken(view) - 6) * 0.03;
    if (p >= Math.max(0.35, need)) return { action: 'show' };
  }

  // Avoid feeding the next player ranks they have been collecting.
  const avoid = pickedRanks.get(nextSeatId(view)) || new Set();
  const cards = pickDiscard(view, avoid);
  const remaining = view.hand.filter((c) => !cards.includes(c));
  return { action: 'play', discard: cards.map((c) => c.id), draw: chooseDraw(view, remaining, takeableFor(view), Math.max(2, mean - 1.5)) };
};

export const decideBot = (view, difficulty = 'medium', { penalty = 50 } = {}) => {
  // A takeover can land mid-turn after the human already discarded.
  if (view.turn?.phase === 'draw') {
    return { action: 'play', discard: null, draw: chooseDraw(view, view.hand, takeableFor(view), 3) };
  }
  if (difficulty === 'easy') return decideEasy(view);
  if (difficulty === 'hard') return decideHard(view, penalty);
  return decideMedium(view);
};
