import { useEffect } from 'react';
import { ScoreTable } from '../components/ScorePanel.jsx';
import { play } from '../sound.js';

const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;

export default function Results({ results, you, penalty, onPlayAgain, onHome }) {
  const winner = results.ranking[0];
  const iWon = winner?.id === you?.seatId;
  useEffect(() => {
    play(iWon ? 'win' : 'show');
  }, [iWon]);

  const totals = Object.fromEntries(results.ranking.map((r) => [r.id, r.total]));
  const eliminated = Object.fromEntries(results.ranking.map((r) => [r.id, r.eliminated]));

  return (
    <div className="results">
      <section className="panel results-hero">
        <span className="eyebrow">{results.reason === 'no-humans' ? 'Game over — no humans left in play' : 'Game over'}</span>
        <div className="trophy" aria-hidden="true">
          🏆
        </div>
        <h2>{iWon ? 'You win!' : `${winner?.name} wins`}</h2>
        <p className="muted">Final total {winner?.total}</p>
        <ol className="ranking">
          {results.ranking.map((r) => (
            <li key={r.id} className={`${r.id === you?.seatId ? 'me' : ''} place-${r.place}`}>
              <span className="place">{ordinal(r.place)}</span>
              <span className="rank-name">{r.name}</span>
              <span className="rank-total">{r.total}</span>
              <span className="rank-note">{r.eliminated ? `Out in round ${r.eliminatedRound}` : 'Still in'}</span>
            </li>
          ))}
        </ol>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={onHome}>
            Back to home
          </button>
          <button type="button" className="btn primary" onClick={onPlayAgain}>
            Play again
          </button>
        </div>
      </section>
      <section className="panel results-table">
        <h3>Round by round</h3>
        <ScoreTable columns={results.columns} history={results.history} totals={totals} eliminated={eliminated} penalty={penalty} highlightId={you?.seatId} />
      </section>
    </div>
  );
}
