# Hold'em Lab

Play-money, no-limit hold'em (6-max) against computer opponents that play like distinct, imperfect humans. A web app that works on a desktop browser and on a phone, and can be added to your home screen.

**Status:** paused after Phase 3 (playable table). The bots are still simple placeholders. See **`HANDOFF.md`** for exactly where things stand, every decision made, the plan for the next phase, and how to pick the project back up.

- `SPEC.md`: what the app should do (the source of truth).
- `Build Plan.md`: the phased build plan, current status, and the decisions that override the spec.
- `HANDOFF.md`: start here when returning to the project.

## Run it on your own computer

You need two free programs first: **Node.js** (version 22 or newer; download the "LTS" version from nodejs.org) and **Git** (git-scm.com).

Open a terminal (on Windows: PowerShell or Git Bash) and run these one at a time:

```bash
git clone https://github.com/jonkiekbusch/holdem-lab.git
cd holdem-lab
git checkout claude/happy-carson-emf5b5
npm install
npm run dev
```

`npm run dev` prints an address, usually `http://localhost:5173`. Open it in your browser. Press `Ctrl+C` in the terminal to stop it.

To try the production version of the site (what Vercel serves): `npm run build`, then `npm run preview`, and open the address it prints.

## Run the tests

| Command | What it does | How long |
| --- | --- | --- |
| `npm run typecheck` | Checks the code for type mistakes | a few seconds |
| `npm test` | Unit tests (Vitest): rules engine, betting, bet sizing, keyboard mapping, pacing, bankroll, saving | about 10 seconds |
| `npm run test:e2e` | Real-browser tests (Playwright): builds the site, then plays hands in a browser at eight screen sizes from phone to large monitor | about 3-4 minutes |

The first time you run `npm run test:e2e` on your own computer, run `npx playwright install chromium` once first (it downloads the test browser). The tests check Chrome/Edge's engine only; Safari and Firefox are not tested automatically.

A healthy project shows: type check passes, **375 unit tests pass**, **262 browser tests pass** (as of the last code commit).

## Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run icons` | Regenerates the PNG icons from `public/favicon.svg` |

## Using the app

- The home screen is the game: you at the bottom, five bots around the table. Use the buttons, or the keyboard: **F** fold, **C** check/call, **R** raise (then **Enter** to confirm, **↑ ↓** to change the amount, **1-5** for quick sizes, **Esc** to cancel), **N** next hand. Every action also has a button.
- **Settings** has stack depth (40 / 100 / 200 big blinds), bot speed (Realistic / Fast / Instant), the pot-odds switch, and bankroll reset. You start with 10,000 play-money chips.
- `#/watch` (linked in Settings) shows simple bots playing hands, with a text log, for checking the rules.
- For testing, the address accepts options, e.g. `#/?seed=abc&speed=instant&gap=0&stack=40&hero=6` (fixed shuffles, no pauses, no wait between hands, 40bb stacks, start with 6 chips).

## How the code is organized

- `src/engine/`: the rules engine, with no screen code (cards, shuffling, hand ranking, betting, pots, table and button movement, hand records).
- `src/bots/`: the stand-in bots (replaced by the real personalities in Phases 4-5).
- `src/sim/`: simulator pieces used by tests and the watch page.
- `src/game/`: session logic with no screen code (settings, saving, pacing, bet sizing, keyboard mapping, the game controller).
- `src/ui/`: the screens.
- `tests/`: unit tests. `e2e/`: real-browser tests.

## Renaming the app

Edit `app.config.ts` (`APP_NAME`, `APP_SHORT_NAME`). The page title, install name and manifest follow. To change the icon, edit `public/favicon.svg` and run `npm run icons`.

## Hosting

Vercel deploys every push from GitHub (it detects Vite automatically; `vercel.json` pins the settings). Each commit gets its own preview link under **Deployments** in Vercel.

Work is on the branch `claude/happy-carson-emf5b5`. `main` stays untouched until the first version is approved.
