import { useEffect, useRef } from 'react';
import { signed } from '../cards.js';

// UI-1..UI-5: always-visible round-by-round score table with pinned totals.
export function ScoreTable({ columns, history, totals, eliminated = {}, penalty, highlightId, compact }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  const cellClass = (entry, id) => {
    const v = entry.scores[id];
    if (v === undefined) return 'na';
    const classes = [];
    if (entry.callerId === id && entry.result === 'failed' && v === penalty) classes.push('penalty');
    else if (v < 0) classes.push('neg');
    else if (v === 0) classes.push('zero');
    if (entry.callerId === id) classes.push('caller');
    return classes.join(' ');
  };

  return (
    <div className={`score-table-wrap ${compact ? 'compact' : ''}`} ref={scrollRef}>
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col" className="round-col">
              Rd
            </th>
            {columns.map((col) => (
              <th key={col.id} scope="col" className={`${eliminated[col.id] ? 'out' : ''} ${col.id === highlightId ? 'me' : ''}`} title={col.name}>
                <span className="col-name">{col.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="empty">
                Scores appear here after each Show.
              </td>
            </tr>
          )}
          {history.map((entry) => (
            <tr key={entry.round}>
              <th scope="row" className="round-col">
                {entry.round}
              </th>
              {columns.map((col) => {
                const v = entry.scores[col.id];
                const cls = cellClass(entry, col.id);
                return (
                  <td key={col.id} className={cls} title={entry.callerId === col.id ? `Called Show (${entry.result})` : undefined}>
                    {v === undefined ? '·' : signed(v)}
                    {entry.callerId === col.id && <span className="caller-mark" aria-label="called show">{entry.result === 'success' ? '✓' : entry.result === 'exempt' ? '★' : '✗'}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="round-col">
              Σ
            </th>
            {columns.map((col) => (
              <td key={col.id} className={`${eliminated[col.id] ? 'out' : ''} ${totals[col.id] < 0 ? 'neg' : ''}`}>
                {totals[col.id]}
                {eliminated[col.id] && <span className="out-tag">OUT</span>}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// In-game standings: one row per player with their running total (leader first).
export function Standings({ players, myId, turnId, eliminationScore }) {
  const ordered = [...players].sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.total - b.total);
  return (
    <ol className="standings">
      {ordered.map((p, i) => {
        const pct = Math.max(0, Math.min(100, (p.total / eliminationScore) * 100));
        const danger = pct >= 75;
        return (
          <li key={p.id} className={['standing', p.id === myId && 'me', p.eliminated && 'out', p.id === turnId && 'turn', i === 0 && !p.eliminated && 'leader'].filter(Boolean).join(' ')}>
            <span className="standing-pos" aria-hidden="true">
              {p.eliminated ? '✕' : i === 0 ? '♛' : i + 1}
            </span>
            <span className="standing-name" title={p.name}>
              {p.name}
              {p.id === myId && <span className="standing-you">you</span>}
            </span>
            <span className={`standing-total ${p.total < 0 ? 'neg' : ''}`}>{p.total}</span>
            <span className="standing-bar" aria-hidden="true">
              <span className={danger ? 'danger' : ''} style={{ width: `${pct}%` }} />
            </span>
            {p.eliminated && <span className="sr-only">eliminated</span>}
          </li>
        );
      })}
    </ol>
  );
}
