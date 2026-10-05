import { useState } from 'react';
import { getSavedName } from '../net.js';
import CardThemePicker from '../components/CardThemePicker.jsx';

export const DIFFICULTY_INFO = {
  easy: 'Dumps its highest card and shows only with a very low hand.',
  medium: 'Pairs up discards, keeps jokers, and reads how many cards you hold.',
  hard: 'Tracks every open card, estimates your hand, and weighs the penalty before showing.',
};

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={value === opt.value ? 'on' : ''}
          onClick={() => onChange(opt.value)}
          disabled={opt.disabled}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function BotSetup({ send, onBack }) {
  const [bots, setBots] = useState(3);
  const [difficulty, setDifficulty] = useState('medium');
  const [turnTimer, setTurnTimer] = useState(30);

  const start = () => {
    send({ type: 'create', mode: 'bots', name: getSavedName(), bots, difficulty, settings: { turnTimer } });
  };

  return (
    <div className="setup">
      <div className="panel setup-panel">
        <h2>Play with bots</h2>
        <div className="field">
          <span className="field-label">Number of bots</span>
          <Segmented label="Number of bots" value={bots} onChange={setBots} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          <span className="field-hint">
            {bots + 1} players · {bots + 1 <= 4 ? 'one deck' : 'two decks'}
          </span>
        </div>
        <div className="field">
          <span className="field-label">Difficulty</span>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
          />
          <span className="field-hint">{DIFFICULTY_INFO[difficulty]}</span>
        </div>
        <div className="field">
          <span className="field-label">Turn timer</span>
          <Segmented
            label="Turn timer"
            value={turnTimer}
            onChange={setTurnTimer}
            options={[
              { value: 15, label: '15s' },
              { value: 30, label: '30s' },
              { value: 60, label: '60s' },
              { value: 0, label: 'Off' },
            ]}
          />
        </div>
        <div className="field">
          <span className="field-label">Card style</span>
          <CardThemePicker />
        </div>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn primary" onClick={start}>
            Deal me in
          </button>
        </div>
      </div>
    </div>
  );
}
