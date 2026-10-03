import { SUIT_GLYPH, cardLabel } from '../cards.js';

const isRed = (suit) => suit === 'H' || suit === 'D';

export function PlayingCard({ card, jokerRank, size = 'md', selected, takeable, dim, onClick, disabled, className = '', title, style }) {
  const joker = card.rank === jokerRank;
  const classes = ['pcard', `pcard-${size}`, isRed(card.suit) ? 'red' : 'black', joker && 'joker', selected && 'selected', takeable && 'takeable', dim && 'dim', onClick && 'clickable', className]
    .filter(Boolean)
    .join(' ');
  const face = (
    <>
      <span className="pcard-corner">
        <span className="pcard-rank">{card.rank}</span>
        <span className="pcard-suit">{SUIT_GLYPH[card.suit]}</span>
      </span>
      <span className="pcard-pip" aria-hidden="true">
        {SUIT_GLYPH[card.suit]}
      </span>
      {joker && <span className="pcard-joker">★ Joker</span>}
    </>
  );
  const label = title || cardLabel(card, jokerRank);
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} onClick={onClick} disabled={disabled} aria-pressed={!!selected} aria-label={label} title={label}>
        {face}
      </button>
    );
  }
  return (
    <div className={classes} style={style} role="img" aria-label={label} title={label}>
      {face}
    </div>
  );
}

export function CardBack({ size = 'sm', className = '' }) {
  return <div className={`pcard pcard-${size} back ${className}`} aria-hidden="true" />;
}
