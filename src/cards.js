export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
export const RANK_NAME = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

export const rankValue = (rank) => {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
};

export const cardValue = (card, jokerRank) => (card.rank === jokerRank ? -rankValue(card.rank) : rankValue(card.rank));
export const handCount = (hand, jokerRank) => hand.reduce((sum, card) => sum + cardValue(card, jokerRank), 0);

export const cardLabel = (card, jokerRank) =>
  `${RANK_NAME[card.rank] || card.rank} of ${SUIT_NAME[card.suit]}${card.rank === jokerRank ? ', joker' : ''}`;

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// Sort for display: jokers first (they are the best cards), then by value, then suit.
const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
export const sortHand = (hand, jokerRank) =>
  [...hand].sort(
    (a, b) =>
      cardValue(a, jokerRank) - cardValue(b, jokerRank) ||
      a.rank.localeCompare(b.rank) ||
      SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit],
  );
