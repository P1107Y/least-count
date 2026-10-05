import { CARD_THEMES, setCardTheme, useCardTheme } from '../cardTheme.js';
import { PlayingCard, CardBack } from './Card.jsx';

const SAMPLE = [
  { id: 'demo-k', rank: 'K', suit: 'H' },
  { id: 'demo-a', rank: 'A', suit: 'S' },
];

// Lets each player pick how cards look on their own screen.
export default function CardThemePicker() {
  const theme = useCardTheme();
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Card theme">
      {CARD_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          className={`theme-option ${theme === t.id ? 'on' : ''}`}
          data-card-theme={t.id}
          onClick={() => setCardTheme(t.id)}
          title={t.blurb}
        >
          <span className="theme-cards" aria-hidden="true">
            <CardBack size="sm" className="theme-back" />
            {SAMPLE.map((card) => (
              <PlayingCard key={card.id} card={card} jokerRank={null} size="sm" />
            ))}
          </span>
          <span className="theme-name">{t.name}</span>
        </button>
      ))}
    </div>
  );
}
