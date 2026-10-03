import { randomInt } from 'crypto';

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Normal value of a rank: A = 1, 2–10 face value, J/Q/K = 10.
export const rankValue = (rank) => {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
};

// Cards of the joker rank count as minus their normal value (R3).
export const cardValue = (card, jokerRank) => (card.rank === jokerRank ? -rankValue(card.rank) : rankValue(card.rank));

export const handCount = (hand, jokerRank) => hand.reduce((sum, card) => sum + cardValue(card, jokerRank), 0);

export const isAllJokers = (hand, jokerRank) => hand.length > 0 && hand.every((card) => card.rank === jokerRank);

export const buildDecks = (deckCount) => {
  const cards = [];
  for (let d = 0; d < deckCount; d += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${d}${rank}${suit}`, rank, suit });
      }
    }
  }
  return cards;
};

// Fisher–Yates with a cryptographically secure source (NFR-3).
export const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
