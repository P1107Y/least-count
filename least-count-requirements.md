# Least Count — App Requirements

A multiplayer card game for 2–8 players where the goal is to hold the lowest hand count. Players can play against bots or create private rooms and invite friends. This version is for PC screens.

Reference for look and flow: https://leastcount.com/ — this app follows the same basic game, with the house rules below (negative scoring, rank-based negative jokers, 50-point penalty, elimination at 201).

---

## 1. Confirmed house rules

Confirmed on 3 Oct 2026.

| # | Topic | Rule |
|---|-------|------|
| R1 | Card values 2–10 | Face value (2 = 2 … 10 = 10) |
| R2 | Winner's score | Lowest player scores **minus their count** (count 10 → −10) |
| R3 | Joker value | Joker cards count as **minus their face value** (joker 5 → −5, joker K → −10, joker A → −1) |
| R4 | Tie on Show | If anyone ties the caller, the Show fails and the caller takes the penalty |
| R5 | Penalty exemption | The penalty is waived when the caller's count is **below zero** (which includes an all-joker hand). The caller then scores their own negative count even if someone else is lower |
| R6 | Discarding several cards | Cards must be the **same rank** (two 8s, three Kings). J + Q does not qualify even though both are worth 10 |
| R7 | Deck | One 52-card deck for up to 4 players, two decks for 5–8 players. No printed jokers |
| R8 | Deck runs out | The discarded cards are shuffled into a new closed deck, keeping the latest discard aside |
| R9 | Sequences | Not supported (only same-rank multi-discards) |
| R10 | Show on first turn | Not allowed. A player can call Show from their second turn of the round |
| R11 | Show limit | No minimum or maximum count is needed to call Show |
| R12 | Drawing | A player always draws one card after discarding, even if the discard matches the open card |
| R13 | Draw sources | Only the closed deck, or the **latest single card** discarded by the previous player |
| R14 | Failed Show | Only the lowest player scores negative. Others who also beat the caller add their own count |
| R15 | Round start | The starting player moves one seat clockwise each round |
| R16 | Joker | A new joker is turned every round |
| R17 | Re-entry | None. An eliminated player stays eliminated |
| R18 | Game length | No cap on rounds or turns |
| R19 | Player leaves | A bot takes over the seat and score. The host can also kick a player |
| R20 | Timeouts | Three timed-out turns in a row and the player is replaced by a bot |
| R21 | No humans left | When every human has left or been eliminated, the game ends; bots do not play on |
| R22 | Joining | Nobody can join a game in progress |
| R23 | Platform | PC screens only in this version (desktop browser) |

### 1.1 Interpreted points

These were not stated outright. The document uses the reading below; correct any that are wrong.

| # | Point | Reading used |
|---|-------|--------------|
| I1 | Exactly 4 players | One deck. Two decks only for 5 or 6 players |
| I2 | Deck count after eliminations | Decided by the number of active players at the start of each round (a 6-player game that drops to 4 switches to one deck) |
| I3 | "First turn" for Show | Each player's own first turn of the round, so no one can Show until they have played once |
| I4 | Failed Show, two players tied for lowest | Both tied players score negative |
| I5 | Kicked during a game | The seat is handed to a bot, the same as when a player leaves |
| I6 | Coming back | A player replaced by a bot after a disconnect or timeouts can take their seat back while the game is running. A kicked player cannot |

---

## 2. Game rules

### 2.1 Players and setup

- 2 to 6 players per game (humans and bots combined).
- **Deck:** one standard 52-card deck when 2–4 players are active in the round, two decks shuffled together when 5–6 are active. No printed jokers.
- Each round, every active player is dealt **5 cards**, hidden from the others.
- One card is turned face up as the **joker indicator**. Its rank is the joker rank for that round. The indicator stays on the table and is out of play. A new indicator is turned every round.
- One more card is turned face up to start the **open pile** (the "open card").
- The rest of the cards form the **closed deck**.
- The starting player of the first round is chosen at random. The start moves one seat clockwise each round, skipping eliminated players.

### 2.2 Card values

| Card | Value |
|------|-------|
| Ace | 1 |
| 2–10 | Face value |
| J, Q, K | 10 |
| Any card of the joker rank | Minus its normal value |

**Hand count** = sum of non-joker card values − sum of joker card values.

Example, joker rank is 5:

- Hand `5` → count −5
- Hand `5, 5` → count −10
- Hand `5, K, 2` → count −5 + 10 + 2 = 7

### 2.3 Turn

On their turn a player does one of two things.

**Option 1 — Play (discard, then draw)**

1. **Discard first.** Either one card, or two or more cards of the same rank. A player may discard their whole hand if every card is the same rank.
2. **Then draw exactly one card**, from either:
   - the top of the closed deck, or
   - the latest single card discarded by the previous player. If the previous player discarded several cards, only the top one can be taken.
3. The draw is compulsory, including when the discard matches the rank of the open card.
4. A player can never take back a card they discarded in the same turn.
5. Older cards in the open pile cannot be taken.
6. On the first turn of a round, the "previous discard" is the starting open card.
7. The turn passes clockwise.

Hand size can shrink below 5 through multi-card discards; it never grows, and it is never 0 (a draw always follows a discard).

**Option 2 — Show**

- At the start of their turn, before discarding, a player may call **Show** if they believe they hold the lowest count.
- Show is **not allowed on a player's first turn of the round**. It is available from their second turn onward.
- There is no minimum or maximum count for calling Show.
- All hands are revealed and the round is scored. No further cards are played.

**Deck runs out**

If the closed deck is empty when a player needs to draw, the open pile is shuffled to form a new closed deck. The latest discard is kept aside and remains available to the next player.

### 2.4 Round scoring

Lower is better. Scores can be negative.

Let the caller be the player who called Show.

**Successful Show** — the caller's count is strictly lower than every other player's:

- Caller scores **−|count|** (count 10 → −10; count −5 → −5; count 0 → 0).
- Every other player scores their own count (positive hands add points; joker-heavy negative hands subtract).

**Failed Show** — at least one other player has a count lower than or equal to the caller's:

- Caller scores **+50** (flat penalty, replaces their count).
- **Exception:** if the caller's hand is all jokers, there is no penalty and the caller scores their (negative) count.
- Only the other player with the **lowest** count scores **−|count|**. If two or more players tie for lowest, each of them does.
- Everyone else scores their own count, including players who beat the caller but were not the lowest.

### 2.5 Worked examples

| # | Situation | Result |
|---|-----------|--------|
| 1 | A shows with 10, B has 20 | A −10, B +20 |
| 2 | A shows with 10, B has 5 | A +50 (penalty), B −5 |
| 3 | Joker is 5. A shows with a single `5` (−5), B holds `5, 5` (−10) | A −5 (all jokers, no penalty), B −10 |
| 4 | A shows with 4, B has 12, C has 9, D has 30 | A −4, B +12, C +9, D +30 |
| 5 | A shows with 8, B has 8, C has 15 | Tie: A +50, B −8, C +15 |
| 6 | A shows with 10, B has 3, C has 6, D has 20 | A +50, B −3, C +6 (beat A but not lowest), D +20 |
| 7 | A shows with 6, B has 3, C has 3, D has 20 | A +50, B −3, C −3 (tied lowest), D +20 |
| 8 | Joker is 7. A shows with `7, 7` (−14), B holds `7, 2` (−5), C holds `K, 4` (14) | A −14, B −5, C +14 |

### 2.6 Elimination and winning

- Each player's round score is added to their running total. Totals can go below zero.
- A player whose total reaches **201 or more** is eliminated at the end of that round. There is no re-entry.
- The remaining players keep playing new rounds. Example: A, B, C, D are playing and B reaches 201 → B is out, and A, C, D continue.
- The game ends when **one player remains**; that player wins. There is no cap on the number of rounds.
- The game also ends as soon as no human is left in play (see 3.4).
- Final ranking is the reverse order of elimination. Players eliminated in the same round are ranked by lower total.
- Because the lowest player in a round never gains points, at least one player always survives each round.

---

## 3. Game modes

### 3.1 Play with bots

- One human against 1 to 4 bots, started straight from the home screen with no room code.
- Player picks the number of bots and the difficulty.

### 3.2 Private room with friends

- A player creates a room and becomes the **host**.
- The room has a short **room code** (6 characters) and a **shareable invite link**. Opening the link lands the friend directly in the room lobby.
- Friends join by link or by typing the code, only while the room is in the lobby. Nobody can join a game in progress, as a player or as a spectator.
- The host may add bots to fill empty seats.

### 3.3 Seat limits (both modes)

- Maximum **8 players** in a game, humans and bots combined.
- Maximum **4 bots** added at the start of a game.
- Minimum 2 players to start; at least 1 must be human.
- Valid mixes include 1 human + 4 bots, 2 humans + 4 bots, 6 humans + 0 bots. A mix such as 1 human + 5 bots cannot be started.
- Bots that take over a seat mid-game (3.4) do not count toward the 4-bot limit.

### 3.4 Players leaving mid-game

- When a human leaves, is kicked by the host, fails to reconnect, or times out three turns in a row, a **bot takes over** their seat, hand, and running total. The game continues with no change to turn order.
- The takeover bot plays at Medium difficulty and is shown as "Name (bot)".
- A player replaced after a disconnect or timeouts can take their seat back while the game is still running. A kicked player cannot.
- When **no human is left in play** — every human has left or been eliminated — the game ends at once. Bots do not play on. Seats still in play are ranked by lowest total, above the eliminated seats.

---

## 4. Functional requirements

### 4.1 Identity

- **FR-1** A player plays as a guest by entering a display name (2–15 characters). There is no login and no saved statistics in this version.
- **FR-2** The display name and a device identifier are remembered so the player can return to their seat after a refresh.

### 4.2 Rooms and lobby

- **FR-3** A player can create a room; the app generates a unique room code and invite link.
- **FR-4** A player can join a room by code or link while it is in the lobby and has a free seat.
- **FR-5** Joining is refused, with a clear message, when the room is full, already in a game, or does not exist.
- **FR-6** The lobby shows all seats: player name, host badge, bot badge, and connected state.
- **FR-7** The host can add a bot, remove a bot, set each bot's difficulty, and kick a human player.
- **FR-8** The app enforces the seat limits in 3.3 and disables the "Add bot" control when 4 bots or 6 total seats are reached.
- **FR-9** The host can change room settings before starting:
  - Elimination score (default 201)
  - Show penalty (default 50)
  - Turn timer (default 30 seconds; options 15 / 30 / 60 / off)
- **FR-10** Only the host can start the game, and only with at least 2 players seated.
- **FR-11** If the host leaves, host rights pass to the longest-seated remaining human.
- **FR-12** After a game ends, players return to the lobby and the host can start a rematch with the same seats. Takeover bots are removed and their seats freed.
- **FR-13** A room with no connected humans is closed.

### 4.3 Gameplay

- **FR-14** At the start of each round the server picks one or two decks from the number of active players (2.1), shuffles, deals 5 cards to each active player, reveals a new joker indicator and the starting open card, and sets the starting player.
- **FR-15** Each player sees only their own cards. For every other player they see the name, the **number of cards held** (never the values), the running total, and whose turn it is.
- **FR-16** The joker rank is always visible on the table, and joker cards in the player's own hand are visibly marked.
- **FR-17** The player's current hand count is shown and updates live as cards change.
- **FR-18** On their turn, a player can select one card, or several cards of the same rank, and discard them. An invalid selection cannot be submitted, and the reason is shown.
- **FR-19** After discarding, the player must draw one card from the closed deck or take the previous player's latest discard. Only that single card is selectable from the open pile; the player's own discard and older cards are not.
- **FR-20** The Show button is enabled only at the start of the player's own turn, before discarding, and never on their first turn of the round. On the first turn it is shown disabled with the reason.
- **FR-21** On Show, all hands are revealed with each player's count, the round result (success, failed with penalty, or failed with joker exemption), each player's round score, and updated totals.
- **FR-22** Scoring follows 2.4 exactly and is computed on the server.
- **FR-23** Players at or above the elimination score are marked out, shown as eliminated on the table, and watch the rest of the game.
- **FR-24** A new round starts automatically after the round summary (short countdown, or when all remaining humans click "Continue").
- **FR-25** When one player remains, or no human is left in play, a final results screen shows the winner, the full ranking, and the round-by-round score table.
- **FR-26** When the closed deck is empty, the server reshuffles the open pile per 2.3, keeping the latest discard aside, and shows a brief notice.

### 4.4 Timers, disconnects, leaving

- **FR-27** If the turn timer expires, the server plays the turn automatically: it discards the highest-value non-joker card (highest joker if the hand is all jokers) and draws from the closed deck. It never calls Show on a timeout.
- **FR-28** After **three timed-out turns in a row**, the player is replaced by a bot. A turn the player completes themselves resets the count.
- **FR-29** A disconnected player has 60 seconds to reconnect and returns to the same seat with the game state intact. If they do not return in time, a bot takes over the seat.
- **FR-30** A player who clicks "Leave game" is replaced by a bot immediately.
- **FR-31** The host can kick a human player during a game; a bot takes over the seat.
- **FR-32** A player replaced under FR-28 or FR-29 sees a "Take my seat back" option and resumes control from their next turn. A kicked player cannot rejoin that game.
- **FR-33** When no human is left in play, the game ends immediately and the final results are shown per 3.4.

### 4.5 Bots

- **FR-34** Bots run on the server and take a seat like any player, with a generated name and a visible bot badge.
- **FR-35** Bots follow all game rules, including no Show on the first turn, and use only the information a human in that seat would have: their own hand, the joker rank, the open pile, other players' card counts, and what was discarded and picked up openly. They never read other hands or the deck order.
- **FR-36** Bots act after a short, varied delay (about 1–3 seconds) so the pace feels natural.
- **FR-37** Three difficulty levels:
  - **Easy** — discards its highest card, mostly draws from the closed deck, calls Show at a low fixed count.
  - **Medium** — prefers multi-card discards, takes the open card when it lowers its count or completes a pair, keeps jokers, calls Show based on its count and how many cards opponents hold.
  - **Hard** — tracks seen cards, estimates opponents' counts from their pickups and hand sizes, avoids feeding low cards or jokers to the next player, weighs the 50-point penalty against the reward before calling Show.
- **FR-38** A bot never exceeds the turn timer.

### 4.6 Help and feedback

- **FR-39** A "How to play" screen explains the rules in section 2, including the scoring examples.
- **FR-40** Card deal, discard, draw, Show, and elimination have clear animations; sound effects can be muted.

---

## 5. Screens and layout

Designed for PC screens in landscape. Phone and tablet layouts are not part of this version.

### 5.1 Screens

1. **Home** — enter name, "Play with bots", "Create room", "Join room", "How to play".
2. **Bot setup** — number of bots (1–4), difficulty, start.
3. **Room lobby** — room code, copy link, seat list, bot controls and settings (host only), start (host only).
4. **Game table** — layout in 5.2.
5. **Round summary** — shown over the table: revealed hands, counts, round scores, totals, eliminations.
6. **Final results** — winner, ranking, score history, "Play again", "Back to home".

### 5.2 Game table layout

**Left 20% — score panel**

- **UI-1** Always visible; it is not a toggle.
- **UI-2** A table with one column per player and one row per completed round, showing each player's score for that round.
- **UI-3** A totals row stays pinned and shows each player's running total.
- **UI-4** Negative scores, the 50 penalty, and eliminated players are visually distinct.
- **UI-5** The panel scrolls on its own when there are many rounds; the newest round stays in view.

**Right 80% — table area**

- **UI-6** All players are shown at once, arranged around the table. The local player sits at the bottom with their cards face up; opponents are placed around the remaining sides in turn order.
- **UI-7** Each opponent shows their name, running total, and their cards face down. The **number of cards** they hold is shown as a number as well as by the card backs. Card values are never shown.
- **UI-8** The centre of the table holds the joker indicator, the closed deck, and the open pile with the takeable card clearly marked.
- **UI-9** The player whose turn it is has a **green glow around their name**. The glow fades as their turn time runs down, from full at the start of the turn to gone when time is up. With the timer off, the glow stays steady.
- **UI-10** The local player's area shows their hand count, the Show button, and the discard control.
- **UI-11** After the local player discards, their discard is kept visually apart from the previous player's card until they draw, so it is clear which card can be taken.
- **UI-12** Eliminated players and bot-controlled seats are labelled on the table.

---

## 6. Non-functional requirements

- **NFR-1 Server authority.** The server holds the deck, all hands, and all scoring. Clients receive only what that player is allowed to see. Every move is validated on the server.
- **NFR-2 Real time.** Moves reach all players in the room within about 300 ms under normal network conditions.
- **NFR-3 Fair shuffle.** Shuffling uses a cryptographically secure random source.
- **NFR-4 Devices.** Runs in current Chrome, Edge, Firefox, and Safari on a PC or laptop. The layout works from 1280×720 upward and keeps the 20/80 split at all supported sizes.
- **NFR-5 Resilience.** A page refresh or brief network drop does not lose the player's seat or the game state.
- **NFR-6 Scale.** Supports at least 500 concurrent rooms at launch, with room state isolated so one room's failure does not affect others.
- **NFR-7 Abuse controls.** Rate limits on room creation and join attempts; room codes are not guessable in sequence; display names are filtered for profanity.
- **NFR-8 Accessibility.** Cards are distinguishable without relying on colour alone; the turn indicator has a non-colour cue as well as the green glow; text meets contrast guidelines; all controls are reachable by keyboard.
- **NFR-9 Privacy.** Guest play collects only a display name and a device identifier. No personal data is required.

---

## 7. Out of scope for this version

- Phone and tablet layouts
- Login, player profiles, and saved statistics
- Chat and emoji reactions
- Joining or spectating a game in progress
- Re-entry after elimination
- Round or turn caps
- Public matchmaking with strangers
- Real-money play, coins, or purchases
- Tournaments and leaderboards
- Sequence (run) discards

---

## 8. Acceptance test cases

**Scoring**

1. Caller 10, other 20 → caller −10, other +20.
2. Caller 10, other 5 → caller +50, other −5.
3. Joker 5; caller holds one 5, other holds two 5s → caller −5, other −10, no penalty.
4. Caller 8, another player 8 → caller +50, tied player −8.
5. Caller 10, B 3, C 6, D 20 → caller +50, B −3, C +6, D +20.
6. Caller 6, B 3, C 3, D 20 → caller +50, B −3, C −3, D +20.
7. Joker 5; caller holds `5, K, 2` (count 7), other has 4 → caller +50 (hand is not all jokers), other −4.
8. Caller 0, others positive → caller 0, others add their counts.

**Turn rules**

9. Discarding `8♠, 8♥` together is accepted; discarding `8♠, 9♠` together is rejected.
10. Discarding `J, Q` together is rejected.
11. A player cannot draw before discarding.
12. A player cannot pick up the card they just discarded.
13. A player holding `4, 4` discards both, draws one, and ends the turn with 1 card.
14. The previous player discards `9♠, 9♥`; the next player can take only the top 9, not both and not the one underneath.
15. A player discards a 7 onto a previous 7 and must still draw.
16. Show is rejected on a player's first turn of the round and accepted on their second.
17. Show is unavailable after the player has discarded, and on other players' turns.
18. A player with a count of 45 can call Show (no limit).

**Deck**

19. A round with 4 active players uses 52 cards; a round with 5 or 6 uses 104.
20. A 6-player game with two players eliminated deals the next round from one deck.
21. When the closed deck runs out, the open pile is reshuffled and the latest discard is still available to the next player.
22. Two consecutive rounds each turn a fresh joker indicator.

**Elimination and end of game**

23. With A, B, C, D playing, B reaches 201 → B is eliminated and the next round deals to A, C, D only.
24. A player at exactly 200 is still in; at 201 they are out.
25. An eliminated player has no way to re-enter.
26. Two players pass 201 in the same round with one player left → that player wins; the two are ranked by lower total.
27. One human plays 3 bots and is eliminated → the game ends at once; the bots are ranked by lowest total.
28. In a room of 2 humans and 2 bots, both humans leave → the game ends at once.

**Rooms, bots, leaving**

29. A seventh player cannot join a room.
30. A fifth bot cannot be added in the lobby.
31. With 3 humans seated, at most 3 bots can be added.
32. A game cannot start with bots only.
33. A friend opening the invite link lands in the correct lobby.
34. Opening the invite link while a game is running is refused.
35. A player who refreshes mid-game returns to the same seat with the same hand.
36. A player who clicks "Leave game" is replaced by a bot that keeps their hand and total; turn order is unchanged.
37. A player who times out three turns in a row is replaced by a bot; two timeouts followed by a played turn resets the count.
38. A disconnected player who does not return within 60 seconds is replaced by a bot, and can take the seat back later.
39. The host kicks a player mid-game → a bot takes over, and the kicked player cannot rejoin.
40. In a game of 2 humans and 4 bots, one human leaves → the game continues with 5 bot-controlled seats.
41. When the host leaves, another human becomes host.
42. A bot's decisions are identical whether or not other hands are changed behind the scenes (bots do not peek).

**Screen**

43. At 1280×720 and 1920×1080 the score panel takes the left 20% and the table the right 80%.
44. After each round a new row appears in the score panel with every player's round score, and the totals row updates.
45. The active player's name has a green glow that fades over the turn time and moves to the next player when the turn ends.
46. Each opponent's card count matches their actual hand size after a multi-card discard, and no opponent card values appear anywhere in the data sent to the browser.
