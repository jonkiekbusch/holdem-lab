# Hold'em Lab

Play-money, no-limit hold'em (6-max) against computer opponents that play like distinct, imperfect humans. A phone-first web app you can add to your home screen.

- `SPEC.md` is the source of truth for what the app does.
- `Build Plan.md` is the phased build plan and the list of decisions that override the spec.

The rules engine and bots live in `src/engine`, `src/bots` and `src/sim`, and the session logic (pacing, bankroll, bet sizing, keyboard mapping) in `src/game`. None of those contain screen code. Screens live in `src/ui`. The home screen is the game; `#/watch` (linked from Settings) shows placeholder bots playing.

Keys: **F** fold, **C** check/call, **R** raise (then **Enter** to confirm, **↑ ↓** to change the amount, **1-5** for quick sizes, **Esc** to cancel), **N** next hand. Every action also has a button.

For testing, the address accepts options, e.g. `#/?seed=abc&speed=instant&gap=0&stack=40&hero=6` (fixed shuffles, no pauses, no wait between hands, 40bb stacks, start with 6 chips).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything (once) |
| `npm run dev` | Runs the app locally with live reload |
| `npm run build` | Type-checks and builds the site into `dist/` |
| `npm test` | Runs the fast unit tests (Vitest) |
| `npm run test:e2e` | Builds the site and drives it in a real browser at phone, tablet, laptop and monitor sizes (Playwright). First time on your own computer: `npx playwright install chromium` |
| `npm run icons` | Regenerates the PNG icons from `public/favicon.svg` |

## Renaming the app

Edit `app.config.ts` (`APP_NAME`, `APP_SHORT_NAME`). The page title, install name and manifest follow. To change the icon, edit `public/favicon.svg` and run `npm run icons`.

## Hosting

Vercel deploys every push from GitHub (it detects Vite automatically). Each commit gets its own preview link under **Deployments** in Vercel.

Each phase is developed on the branch `claude/happy-carson-emf5b5`. `main` stays untouched until the first version is approved.
