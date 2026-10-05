import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from './game.js';
import { buildDecks, handCount } from './cards.js';
import { decideBot } from './bots.js';
import { checkName } from './names.js';

let uid = 0;
const c = (rank, suit = 'S') => ({ id: `t${(uid += 1)}${rank}${suit}`, rank, suit });
// A hand that counts to n with no jokers (joker rank used in tests is never 'J').
const handOf = (n) => {
  const hand = [];
  let left = n;
  while (left > 10) {
    hand.push(c('J'));
    left -= 10;
  }
  if (left > 0) hand.push(c(left === 1 ? 'A' : String(left)));
  return hand;
};
const score = (hands, jokerRank = 'Q', penalty = 50) =>
  G.scoreShow(Object.entries(hands).map(([id, hand]) => ({ id, hand })), 'A', jokerRank, penalty);

test('card values and jokers (2.2)', () => {
  assert.equal(handCount([c('5')], '5'), -5);
  assert.equal(handCount([c('5'), c('5', 'H')], '5'), -10);
  assert.equal(handCount([c('5'), c('K'), c('2')], '5'), 7);
  assert.equal(handCount([c('K')], 'K'), -10);
  assert.equal(handCount([c('A')], 'A'), -1);
  assert.equal(handCount([c('J'), c('Q'), c('A')], '2'), 21);
});

test('acceptance 1: caller 10, other 20', () => {
  assert.deepEqual(score({ A: handOf(10), B: handOf(20) }).scores, { A: -10, B: 20 });
});

test('acceptance 2: caller 10, other 5', () => {
  const r = score({ A: handOf(10), B: handOf(5) });
  assert.equal(r.result, 'failed');
  assert.deepEqual(r.scores, { A: 50, B: -5 });
});

test('acceptance 3: all-joker caller is exempt from the penalty', () => {
  const r = score({ A: [c('5')], B: [c('5', 'H'), c('5', 'D')] }, '5');
  assert.equal(r.result, 'exempt');
  assert.deepEqual(r.scores, { A: -5, B: -10 });
});

test('acceptance 4: tie fails the show', () => {
  assert.deepEqual(score({ A: handOf(8), B: handOf(8), C: handOf(15) }).scores, { A: 50, B: -8, C: 15 });
});

test('worked example 4: successful show with several players', () => {
  assert.deepEqual(score({ A: handOf(4), B: handOf(12), C: handOf(9), D: handOf(30) }).scores, { A: -4, B: 12, C: 9, D: 30 });
});

test('acceptance 5: only the lowest scores negative on a failed show', () => {
  assert.deepEqual(score({ A: handOf(10), B: handOf(3), C: handOf(6), D: handOf(20) }).scores, { A: 50, B: -3, C: 6, D: 20 });
});

test('acceptance 6: tied lowest both score negative', () => {
  assert.deepEqual(score({ A: handOf(6), B: handOf(3), C: handOf(3), D: handOf(20) }).scores, { A: 50, B: -3, C: -3, D: 20 });
});

test('acceptance 7: a hand with a joker but not all jokers still takes the penalty', () => {
  const r = score({ A: [c('5'), c('K'), c('2')], B: handOf(4) }, '5');
  assert.deepEqual(r.scores, { A: 50, B: -4 });
});

test('negative caller is never penalised, even when someone is lower', () => {
  // Joker is 5: A holds 5 + 4 = -1, B holds 5, 5 = -10, C holds 6.
  const r = score({ A: [c('5'), c('4')], B: [c('5', 'H'), c('5', 'D')], C: [c('6')] }, '5');
  assert.equal(r.result, 'exempt');
  assert.deepEqual(r.scores, { A: -1, B: -10, C: 6 });
});

test('caller at exactly 0 who is beaten still takes the penalty', () => {
  const r = score({ A: [c('5'), c('5', 'H'), c('10')], B: [c('5', 'D')] }, '5');
  assert.deepEqual(r.scores, { A: 50, B: -5 });
});

test('acceptance 8: caller with 0 scores 0', () => {
  const r = score({ A: [c('5'), c('5', 'H'), c('10')], B: handOf(3), C: handOf(12) }, '5');
  assert.deepEqual(r.scores, { A: 0, B: 3, C: 12 });
  assert.ok(!Object.is(r.scores.A, -0));
});

test('worked example 8: joker-heavy successful show', () => {
  const r = score({ A: [c('7'), c('7', 'H')], B: [c('7', 'D'), c('2')], C: [c('K'), c('4')] }, '7');
  assert.deepEqual(r.scores, { A: -14, B: -5, C: 14 });
});

test('custom penalty is applied', () => {
  assert.equal(score({ A: handOf(10), B: handOf(5) }, 'Q', 30).scores.A, 30);
});

// ---------- turn rules ----------

const newGame = (n = 2, settings = {}) => {
  const game = G.createGame({ seats: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), settings });
  G.startRound(game);
  return game;
};

const rig = (game, seatId, hand) => {
  G.getSeat(game, seatId).hand = hand;
};

const playTurn = (game, source = 'deck') => {
  const seatId = game.turn.seatId;
  const hand = G.getSeat(game, seatId).hand;
  assert.ok(G.discard(game, seatId, [hand[0].id]).ok);
  assert.ok(G.draw(game, seatId, source).ok);
};

test('deal: 5 cards each, joker indicator and open card, deck size (acceptance 19)', () => {
  for (const [n, decks] of [[2, 1], [4, 1], [5, 2], [6, 2], [8, 2]]) {
    const game = newGame(n);
    const total = game.seats.reduce((s, x) => s + x.hand.length, 0) + game.deck.length + game.openPile.length + 1;
    assert.equal(total, 52 * decks, `${n} players`);
    game.seats.forEach((s) => assert.equal(s.hand.length, 5));
    assert.equal(game.deckCount, decks);
  }
});

test('acceptance 9 & 10: same-rank multi discard only', () => {
  const game = newGame(2);
  const id = game.turn.seatId;
  rig(game, id, [c('8', 'S'), c('8', 'H'), c('9', 'S'), c('J'), c('Q', 'H')]);
  const [e8s, e8h, n9s, j, q] = G.getSeat(game, id).hand;
  assert.equal(G.discard(game, id, [e8s.id, n9s.id]).ok, false);
  assert.equal(G.discard(game, id, [j.id, q.id]).ok, false);
  assert.equal(G.discard(game, id, [e8s.id, e8h.id]).ok, true);
});

test('acceptance 11 & 12: draw needs a discard first; own discard cannot be taken', () => {
  const game = newGame(2);
  const id = game.turn.seatId;
  const opening = game.openPile[game.openPile.length - 1];
  assert.equal(G.draw(game, id, 'deck').ok, false);
  const mine = G.getSeat(game, id).hand[0];
  G.discard(game, id, [mine.id]);
  const r = G.draw(game, id, 'open');
  assert.ok(r.ok);
  assert.equal(r.card.id, opening.id);
  assert.ok(!G.getSeat(game, id).hand.some((x) => x.id === mine.id));
  assert.equal(game.openPile[game.openPile.length - 1].id, mine.id);
});

test('acceptance 13: discarding a pair leaves one fewer card after the draw', () => {
  const game = newGame(2);
  const id = game.turn.seatId;
  rig(game, id, [c('4'), c('4', 'H')]);
  G.discard(game, id, G.getSeat(game, id).hand.map((x) => x.id));
  G.draw(game, id, 'deck');
  assert.equal(G.getSeat(game, id).hand.length, 1);
});

test('acceptance 14: only the top card of a multi-discard can be taken', () => {
  const game = newGame(2);
  const a = game.turn.seatId;
  rig(game, a, [c('9', 'S'), c('9', 'H'), c('3')]);
  const [s9, h9] = G.getSeat(game, a).hand;
  G.discard(game, a, [s9.id, h9.id]);
  G.draw(game, a, 'deck');
  const b = game.turn.seatId;
  G.discard(game, b, [G.getSeat(game, b).hand[0].id]);
  const r = G.draw(game, b, 'open');
  assert.equal(r.card.id, h9.id);
  assert.ok(!G.getSeat(game, b).hand.some((x) => x.id === s9.id));
  assert.equal(game.openPile.some((x) => x.id === s9.id), true);
});

test('acceptance 15: draw is still required after matching the open card', () => {
  const game = newGame(2);
  const id = game.turn.seatId;
  const open = game.openPile[0];
  rig(game, id, [{ ...c(open.rank), id: 'match' }, c('2')]);
  G.discard(game, id, ['match']);
  assert.equal(game.turn.seatId, id);
  assert.equal(game.turn.phase, 'draw');
});

test('acceptance 16 & 17: show timing', () => {
  const game = newGame(2);
  const first = game.turn.seatId;
  assert.equal(G.canShow(game, first).ok, false);
  playTurn(game);
  const second = game.turn.seatId;
  assert.equal(G.canShow(game, first).ok, false, 'not on another player’s turn');
  assert.equal(G.canShow(game, second).ok, false, 'second player’s first turn');
  playTurn(game);
  assert.equal(G.canShow(game, first).ok, true);
  G.discard(game, first, [G.getSeat(game, first).hand[0].id]);
  assert.equal(G.canShow(game, first).ok, false, 'not after discarding');
});

test('acceptance 18: show with a high count is allowed', () => {
  const game = newGame(2);
  playTurn(game);
  playTurn(game);
  const id = game.turn.seatId;
  rig(game, id, [c('K'), c('K', 'H'), c('K', 'D'), c('K', 'C'), c('5')]);
  game.jokerRank = 'A';
  assert.equal(G.show(game, id).ok, true);
});

test('acceptance 20: deck count follows active players', () => {
  const game = newGame(6);
  assert.equal(game.deckCount, 2);
  game.seats[1].eliminated = true;
  game.seats[2].eliminated = true;
  game.phase = 'summary';
  G.startRound(game);
  assert.equal(game.deckCount, 1);
  assert.equal(game.seats[1].hand.length, 0);
});

test('acceptance 21: empty deck reshuffles and the latest discard stays takeable', () => {
  const game = newGame(2);
  const a = game.turn.seatId;
  game.openPile.push(c('3'), c('6'));
  game.deck = [];
  const mine = G.getSeat(game, a).hand[0];
  G.discard(game, a, [mine.id]);
  const r = G.draw(game, a, 'deck');
  assert.ok(r.ok && r.reshuffled);
  assert.equal(G.takeableCard(game).id, mine.id);
  assert.equal(game.openPile.length, 1);
});

test('acceptance 22: each round turns a new joker and the start moves clockwise', () => {
  const game = newGame(3);
  const firstJoker = game.jokerCard;
  const firstStart = game.startIndex;
  game.phase = 'summary';
  G.startRound(game);
  assert.notEqual(game.jokerCard, firstJoker);
  assert.equal(game.startIndex, (firstStart + 1) % 3);
});

const forceShow = (game, callerHand, others, jokerRank = 'Q') => {
  game.jokerRank = jokerRank;
  playTurn(game);
  playTurn(game);
  if (game.seats.length > 2) for (let i = 2; i < game.seats.length; i += 1) playTurn(game);
  const id = game.turn.seatId;
  rig(game, id, callerHand);
  game.seats.filter((s) => s.id !== id && !s.eliminated).forEach((s, i) => rig(game, s.id, others[i]));
  return { id, r: G.show(game, id) };
};

test('acceptance 23 & 24: elimination at 201, not 200', () => {
  const game = newGame(4);
  game.seats.forEach((s) => {
    s.total = 190;
  });
  const { id } = forceShow(game, handOf(2), [handOf(10), handOf(11), handOf(30)]);
  const others = game.seats.filter((s) => s.id !== id);
  assert.equal(others[0].total, 200);
  assert.equal(others[0].eliminated, false);
  assert.equal(others[1].total, 201);
  assert.equal(others[1].eliminated, true);
  G.startRound(game);
  assert.equal(others[1].hand.length, 0);
});

test('acceptance 26: last player standing wins; same-round eliminations ranked by total', () => {
  const game = newGame(3);
  game.seats.forEach((s) => {
    s.total = 180;
  });
  const { id } = forceShow(game, handOf(2), [handOf(40), handOf(30)]);
  assert.equal(game.phase, 'finished');
  const others = game.seats.filter((s) => s.id !== id);
  const lower = others.reduce((a, b) => (a.total < b.total ? a : b));
  assert.deepEqual(game.ranking.slice(0, 2), [id, lower.id]);
});

test('timeout move discards the highest non-joker and draws from the deck', () => {
  const game = newGame(2);
  const id = game.turn.seatId;
  game.jokerRank = 'K';
  const [k, nine, three] = [c('K'), c('9'), c('3')];
  rig(game, id, [k, nine, three]);
  const r = G.timeoutMove(game, id);
  assert.ok(r.ok);
  const hand = G.getSeat(game, id).hand;
  assert.ok(hand.includes(k) && hand.includes(three));
  assert.ok(!hand.includes(nine));
  assert.equal(hand.length, 3);
});

test('acceptance 46: views never include other players’ cards', () => {
  const game = newGame(4);
  const viewer = game.seats[0];
  const json = JSON.stringify(G.viewFor(game, viewer.id));
  game.seats.slice(1).forEach((s) => s.hand.forEach((card) => {
    if (!game.openPile.some((o) => o.id === card.id)) assert.ok(!json.includes(`"${card.id}"`));
  }));
});

test('acceptance 42: bots decide the same regardless of hidden hands', () => {
  const game = newGame(3);
  playTurn(game);
  playTurn(game);
  playTurn(game);
  const id = game.turn.seatId;
  for (const diff of ['easy', 'medium', 'hard']) {
    const before = decideBot(G.botViewFor(game, id), diff);
    const saved = game.seats.map((s) => s.hand);
    game.seats.filter((s) => s.id !== id).forEach((s) => {
      s.hand = buildDecks(1).slice(0, s.hand.length);
    });
    const after = decideBot(G.botViewFor(game, id), diff);
    game.seats.forEach((s, i) => {
      s.hand = saved[i];
    });
    if (diff !== 'easy') assert.deepEqual(after, before, diff);
    else assert.equal(after.action, before.action);
  }
});

test('bots only make legal moves over many rounds', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    const game = newGame(5, { eliminationScore: 120 });
    let guard = 0;
    while (game.phase !== 'finished' && guard < 50000) {
      guard += 1;
      if (game.phase === 'summary') {
        G.startRound(game);
        continue;
      }
      const id = game.turn.seatId;
      const d = decideBot(G.botViewFor(game, id), diff);
      if (d.action === 'show') {
        assert.ok(G.show(game, id).ok, 'show should be legal');
        continue;
      }
      assert.ok(G.discard(game, id, d.discard).ok, 'discard should be legal');
      assert.ok(G.draw(game, id, d.draw).ok, 'draw should be legal');
      game.seats.forEach((s) => assert.ok(s.eliminated || s.hand.length > 0));
    }
    assert.equal(game.phase, 'finished', `${diff} bots should finish a game`);
  }
});

test('display names', () => {
  assert.equal(checkName('Jo'), null);
  assert.ok(checkName('J'));
  assert.ok(checkName('x'.repeat(16)));
  assert.ok(checkName('Sh1thead'));
});
