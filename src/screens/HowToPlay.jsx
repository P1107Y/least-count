const EXAMPLES = [
  ['A shows with 10, B has 20', 'A −10, B +20'],
  ['A shows with 10, B has 5', 'A +50 (penalty), B −5'],
  ['Joker is 5. A shows with a single 5 (−5), B holds 5, 5 (−10)', 'A −5 (all jokers, no penalty), B −10'],
  ['A shows with 4, B has 12, C has 9, D has 30', 'A −4, B +12, C +9, D +30'],
  ['A shows with 8, B has 8, C has 15', 'Tie: A +50, B −8, C +15'],
  ['A shows with 10, B has 3, C has 6, D has 20', 'A +50, B −3, C +6 (beat A but not lowest), D +20'],
  ['A shows with 6, B has 3, C has 3, D has 20', 'A +50, B −3, C −3 (tied lowest), D +20'],
  ['Joker is 7. A shows with 7, 7 (−14), B holds 7, 2 (−5), C holds K, 4 (14)', 'A −14, B −5, C +14'],
];

export default function HowToPlay({ onBack, backLabel = 'Back' }) {
  return (
    <article className="howto">
      <header className="howto-head">
        <h2>How to play Least Count</h2>
        <button type="button" className="btn ghost small" onClick={onBack}>
          {backLabel}
        </button>
      </header>

      <div className="howto-grid">
        <section>
          <h3>Goal</h3>
          <p>Hold the lowest hand count. Each round ends when someone calls <strong>Show</strong>. Round scores add up, and anyone reaching <strong>201</strong> is out. The last player standing wins.</p>

          <h3>Setup</h3>
          <ul>
            <li>2–6 players. One deck for up to 4 players, two decks for 5–6.</li>
            <li>Everyone gets 5 cards. One card is turned up as the <strong>joker indicator</strong>: every card of that rank is a joker this round.</li>
            <li>Another card starts the open pile. The rest is the closed deck.</li>
          </ul>

          <h3>Card values</h3>
          <table className="mini-table">
            <tbody>
              <tr>
                <th>Ace</th>
                <td>1</td>
              </tr>
              <tr>
                <th>2–10</th>
                <td>Face value</td>
              </tr>
              <tr>
                <th>J, Q, K</th>
                <td>10</td>
              </tr>
              <tr>
                <th>Joker rank</th>
                <td>Minus its value (joker 5 → −5, joker K → −10)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>Your turn</h3>
          <ol>
            <li>
              <strong>Discard</strong> one card, or several cards of the <em>same rank</em> (two 8s, three Kings). J + Q does not count as a match.
            </li>
            <li>
              <strong>Draw</strong> one card: from the closed deck, or the latest card the previous player discarded. If they threw several, only the top one can be taken.
            </li>
          </ol>
          <p>You always draw after discarding, even if your discard matched the open card.</p>

          <h3>Calling Show</h3>
          <ul>
            <li>At the start of your turn, before discarding, you may call Show — but not on your first turn of a round.</li>
            <li>
              <strong>You’re strictly lowest:</strong> you score minus your count. Everyone else adds their count.
            </li>
            <li>
              <strong>Anyone ties or beats you:</strong> you take +50. Only the lowest other player scores minus their count; the rest add their count.
            </li>
            <li>If your hand is all jokers, there’s no penalty — you score your (negative) count.</li>
          </ul>
        </section>
      </div>

      <section>
        <h3>Scoring examples</h3>
        <table className="examples">
          <thead>
            <tr>
              <th>Situation</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map(([situation, result]) => (
              <tr key={situation}>
                <td>{situation}</td>
                <td>{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Good to know</h3>
        <ul>
          <li>If the closed deck runs out, the open pile is reshuffled into a new deck. The latest discard stays available.</li>
          <li>If your turn timer runs out, your highest card is discarded and you draw from the deck. Three timeouts in a row and a bot takes your seat — you can take it back.</li>
          <li>If you leave or lose connection for 60 seconds, a bot keeps playing your seat.</li>
        </ul>
      </section>
    </article>
  );
}
