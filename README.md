# Blackjack Trainer

A mobile-first card counting trainer for `blackjack.axeldurham.com`: basic strategy, Hi-Lo index plays, true count conversion, bet ramp, and counting a full table. It follows the sibling `poker` site's setup: plain HTML/CSS/JavaScript modules, no build step, GitHub Pages.

## Modes

- **Basic**: random hands against a dealer upcard. Tap Hit / Stand / Double / Split / Surrender. A miss shows the chart row with the cell outlined. Hands you miss come back more often. Filter by hard / soft / pairs / surrender.
- **Index**: every hand is a deviation spot. The count is shown as a true count, as a running count plus decks left, or as a running count plus a discard tray you read yourself. Includes insurance. When you read the tray, any answer that is right within ±½ deck is accepted.
- **Count**: *Full table* deals a real shoe to 1–7 players who play basic strategy, then asks for the running count (and optionally the true count) every round, at random, or at the end of the shoe. *Deck countdown* flashes a deck with 1–3 cards secretly removed, at 1–6 cards per second.
- **TC & Bet**: convert a running count and a discard tray into a true count, then size the bet from your ramp.
- **Casino**: a full session at a table. Bet by the count, play your hand with deviations, answer surprise count checks. Every decision is graded, and the session summary lists your mistakes and a bankroll curve.
- **Fill**: blank chart templates (hard, soft, pairs, surrender, and an index chart whose deviation cells are blank). Pick a play from the palette, then tap cells or swipe along a row. Check grades every cell. Misses feed the Basic and Index drills.
- **Charts**: basic strategy for the current rules, index overlays, a heatmap of your misses, the index list, your ramp, and stats.

⚙︎ Settings: decks (2 / 4 / 6 / 8), H17 or S17, DAS, late surrender, penetration, expanded index plays, bet ramp and unit, wong-out, auto-advance.

Progress and settings live in `localStorage` on the device. Nothing is sent anywhere. The app installs to the iPhone home screen (Share → Add to Home Screen) and works offline through `sw.js`.

## Where the numbers come from

| Game | Basic strategy | Index plays |
| --- | --- | --- |
| 4–8 decks | Blackjack Apprenticeship chart (H17), BJA S17 differences | BJA's published H17 / S17 deviation charts (Illustrious 18, Fab 4, plus A,8 / A,6 / 8 v 6 / T,T v 4 / 16 v 8 surrender) |
| Double deck | Wizard of Odds 2-deck charts | Computed (BJA doesn't publish a DD chart) |
| Expanded (optional) | — | Computed plays for every other cell that flips between TC −3 and +6 |

Computed indices come from `scripts/ev.js`, an EV model of a finite shoe. It skews the shoe by true count, removes the player's cards and the dealer's upcard, and compares stand / hit / double / split / surrender. It reproduces BJA's published 6-deck indices within ±1 and agrees with 309 of 310 basic strategy cells (see `VALIDATION.md`). Near-zero indices are written BJA-style as running-count plays (0+ / 0−). The true count is always floored (BJA convention).

## Run and verify

Needs Node 18+ and Python 3. Nothing to install.

```sh
npm test          # engine tests
npm run check     # EV cross-check report
npm start         # http://127.0.0.1:4174 (no-cache dev server)
```

`node scripts/ev-check.js --write` regenerates `engine/computed.js`. If you add or rename a module, also add it to the `ASSETS` list in `sw.js`, and bump `VERSION` there when you ship changes.

## Files

- `engine/`: pure logic. `cards` (shoe, Hi-Lo tags), `hand`, `tables` (charts), `deviations` (BJA data), `computed` (generated), `active` (which set is in force), `strategy` (`decide()`), `count`, `betting`, `scenarios` (drill generators), `table` (round engine for multi-seat play).
- `views/`: one module per tab, plus `chartview`, `tableview` and `common`.
- `app.js` (router and settings), `ui.js` (DOM helpers, keypad, tray), `store.js` (localStorage).
- `scripts/`: `ev.js` / `ev-check.js` (EV model and cross-check), `serve.py` (dev server).

## Publishing

Same as `poker`: GitHub Pages from `main` `/(root)`, custom domain `blackjack.axeldurham.com` (`CNAME` file), and a DNS record `CNAME blackjack → axel-durham.github.io`. `.nojekyll` enables direct static serving, and hash routing needs no server rewrites.
