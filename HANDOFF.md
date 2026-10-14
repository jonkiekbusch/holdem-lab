# Hold'em Lab: Handoff

Written October 14, 2026, when the project was paused after Phase 3. It is meant for you (a first-time builder) coming back cold, and for a new Claude session that has none of the earlier conversation.

**Read this first:**
- The project is **paused, not finished**. Phases 1, 2 and 3 are done and accepted. **Phase 4 has not been approved and no Phase 4 code exists.**
- All the work is on GitHub on the branch **`claude/happy-carson-emf5b5`**. The `main` branch is deliberately untouched (see decision 3).
- Nothing important lives only in a Claude session. If a session resets, nothing is lost as long as it is on GitHub.
- The files that matter: **`SPEC.md`** (what the app should do), **`Build Plan.md`** (how it is being built, and your decisions), **`HANDOFF.md`** (this file), **`README.md`** (how to run it).

---

## 1. Status at a glance

| Phase | What it is | Status |
| --- | --- | --- |
| 1 | Installable shell (app name, icon, home-screen install, offline, Vercel deploys) | **Done and accepted** |
| 2 | Rules engine (dealing, betting rules, side pots, split pots, hand ranking, replayable shuffles) and a "watch the bots" page | **Done and accepted** |
| 3 | Playable table (desktop and phone layouts, keyboard shortcuts, bankroll, rebuys, speed setting) | **Done and accepted** |
| Extra | Pot odds on the Call button, with a switch in Settings (default on) | **Done** (its own commit, `688a1fe`) |
| 4 | Bot brain, preflop (the eight bot types and their preflop play) | **NOT approved, NOT started.** The plan is in section 5. |
| 5 | Bot brain, after the flop | Not started |
| 6 | Table presets (first round) and later the sliders and per-seat overrides | Not started |
| 7-10 | Human realism (tilt, human think times), HUD and stats, hand history and replay, polish | Not started, after you have played the first version |
| 11 | Bots that adapt to you | Optional, not in v1, not built |
| 12 | Decision review (pot odds, equity, flagging mistakes) | Optional, not in v1, not built |

**First-round scope you set:** Phases 1-5, then the Phase 6 table presets only. Then stop and decide about Phases 7-10. After each phase Claude stops and waits for you to say **"approved"**.

**The last code commit** at the time of writing is `688a1fe` ("Add pot odds on the Call button…"). Commits added after it only change documentation (this file, `Build Plan.md`, `README.md`). Run `git log --oneline` to see the latest.

---

## 2. What is built, and what is not

### Built and working
- **An installable web app** (works in a browser, and can be added to a phone or laptop home screen, and loads offline). The name "Hold'em Lab" is set in one file, `app.config.ts`.
- **A complete no-limit hold'em rules engine** with no screen code in it: blinds, button movement (with the "dead button" rule), min-raises, short all-ins that don't reopen the betting, side pots, split pots (odd chip to the first seat left of the button), uncalled bets returned, showdown order, a 7-card hand evaluator, and seedable shuffles so any hand can be replayed exactly.
- **A "near-all-in" rule:** a bet or raise that would leave fewer than 2 big blinds behind counts as all-in.
- **A fair-play view:** bots only ever receive their own cards and public information (a test proves they can't see your cards or the deck).
- **The game screen:** a wide desktop layout (table on the left, controls and a live hand log on the right) and a tall phone layout (table on top, controls underneath). Four-color cards. The pot shown is the *contested* pot (bets nobody can call are shown separately as "uncalled" and go back to their owner).
- **Your actions:** Fold, Check/Call, Bet/Raise, a bet slider with a typed amount, and five quick sizes (after the flop: 1/3, 1/2, 2/3 pot, pot, all-in; before the flop: 2.5x, 3x, 4x, pot, all-in).
- **Keyboard shortcuts** (every action also has a button): **F** fold, **C** check/call, **R** raise (then **Enter** confirm, **↑ ↓** change amount, **1-5** quick sizes, **Esc** cancel), **N** next hand. Folding when checking is free asks you to press Fold again.
- **Pot odds** on the Call button ("needs 33%"), switchable in Settings.
- **Money:** a play-money bankroll (10,000 chips to start), buy-ins and rebuys out of it, a session profit/loss figure, a reset. Stack depth 40 / 100 / 200 big blinds (default 100). Saved on the device.
- **Speed setting:** Realistic / Fast / Instant. Fast is the default (bots pause roughly 1-3 seconds, longer for big decisions).
- **Opponents:** *placeholder* bots only. They mostly call. They do **not** have the personalities described in the spec yet.
- **A "watch the bots" page** (`#/watch`, linked from Settings) where simple bots play hands with a readable text log, used to check the rules.
- **A complete record of every finished hand** is kept in memory (up to 500), with enough detail to review decisions later. It is not saved to the device yet (that is Phase 9).
- **Tests:** unit tests (Vitest) and real-browser tests (Playwright) at eight screen sizes, from a phone to a large monitor. Latest results are in section 3.

### Not built yet
- The eight real bot personalities (Nit, TAG, LAG, Maniac, Beginner, Calling Station, Passive Fish, GTO-ish) and their stat validation (Phases 4 and 5).
- Table presets, the looser/tighter and passive/aggressive and Weak/GTO sliders, per-seat overrides, bot avatars (Phase 6).
- Human-like think times (the "Realistic" setting is currently only a slowed-down version of Fast), tilt, bet-size tells (Phase 7).
- The stats display (VPIP/PFR/3-bet/AF under each bot) and your own stats screen (Phase 8).
- Saved hand history and step-by-step replay (Phase 9).
- Sound, backup export/import, performance pass on older phones (Phase 10).
- The spec's optional pre-action checkboxes (check/fold in advance).
- Decision feedback and the equity coach (Phase 12, optional).

---

## 3. Latest check results

At the last code commit (`688a1fe`):
- **Type check:** passes.
- **Unit tests:** 375 passing in 14 files.
- **Browser tests:** 262 passing across eight screen sizes.
- A final re-run was done when this handoff was written (see the commit message of the handoff commit, or just run the commands in section 8).

---

## 4. Decisions you have made

These override anything older in the files. They are also in `Build Plan.md` (section 5).

1. **Stack:** Vite + TypeScript + Preact. A static website with no server. Bankroll and history stay on one device and don't sync.
2. **Hosting:** Vercel, deploying from GitHub. Every commit gets its own preview link. (GitHub Pages and Netlify are not used.)
3. **GitHub and branches:** push to the repo after every phase. All first-round work stays on the branch `claude/happy-carson-emf5b5`. **`main` stays untouched until you approve the whole first version, and then it is merged to `main`.** No pull request has been created.
4. **App name:** "Hold'em Lab", set in one place (`app.config.ts`) so it is easy to rename.
5. **Stat targets:** exactly as in the archetype table in `SPEC.md` (copied in section 5 below). If a bot cannot hit its range, Claude tells you and asks before changing anything.
6. **Opponent adaptation** (bots noticing your habits): not in v1. Listed as optional Phase 11.
7. **Naming:** "Beginner" stays as a bot type. The low end of the skill slider is **Weak** (slider is Weak ↔ GTO). The spec's "Weak-Passive" archetype is renamed **Passive Fish**, with the same stat targets.
8. **Think times:** the speed setting is Realistic / Fast / Instant, built in Phase 3. **Fast is the default** (about 1-3 second pauses, longer for big decisions). Realistic is a slower opt-in, and its real human-like timing is built in Phase 7.
9. **First-round scope:** Phases 1-5, then the Phase 6 presets only. Phases 7-10 come after you have played it. Stop after each phase and wait for "approved". After Phase 5, stop for a longer review of how the bots feel. After the Phase 6 presets, stop again.
10. **Desktop first, phone second, every device supported.** Your main device is a small Dell XPS 13 9315 laptop. The table uses wide screens properly (not a stretched phone layout), fits without scrolling down to a 1280×630 window, and also works on phones, tablets and large monitors.
11. **Keyboard shortcuts** are optional extras: F, C, R (then Enter, ↑ ↓, 1-5, Esc) and N. The mouse and touch do everything.
12. **Card style:** four-color deck (spades black, hearts red, diamonds blue, clubs green).
13. **Blinds and stacks:** 1/2 blinds. Stack depths 40 / 100 / 200 big blinds, default 100. Changing depth takes effect from the next hand, with fresh stacks for everyone.
14. **Near-all-in rule:** a bet or raise that leaves fewer than 2 big blinds behind counts as all-in (you confirmed keeping 2).
15. **Bankroll:** you start with 10,000 chips. Buy-ins and rebuys come out of it, up to your chosen stack depth. If you go broke and your bankroll is empty, you can reset it to 10,000. Changing stack depth cashes you out and sits you down again. A hand you leave unfinished is not counted. (You confirmed keeping these defaults.)
16. **Pot odds on the Call button:** a Settings switch, default on, kept small. (Built.)
17. **Decision feedback** (pot odds study, equity, flagging mistakes in a review): fine as an optional later phase (Phase 12), not built. Phase 3 already records every hand in a way that makes it easy to add.
18. **Working style:** explain in plain English, flag anything that needs your input instead of choosing silently, give very clear step-by-step instructions for anything you must do yourself, write tests for each phase, keep the rules engine and bot engine free of screen code, commit and push after each phase, never quietly change a bot's target stat range, and don't create a pull request unless you ask.

---

## 5. The Phase 4 plan (proposed, NOT approved, NOT started)

This is the plan Claude described to you. Phase 4 starts only when you say **"approved"**.

### The bot types and the spec's stat targets
Measured over simulated hands. VPIP = % of hands a bot voluntarily puts money in before the flop. PFR = % of hands it raises before the flop. 3-bet = % of the time it re-raises when facing an open. AF = (bets + raises) ÷ calls after the flop.

| Archetype | VPIP % | PFR % | 3-bet % | AF | How it plays |
| --- | --- | --- | --- | --- | --- |
| GTO-ish Reg | 22–27 | 18–23 | 7–11 | 2.5–3.5 | Solver-style ranges by position, mixed frequencies, consistent sizing, defends by pot odds |
| TAG | 18–23 | 15–20 | 5–9 | 2.5–4.0 | Solid and straightforward. Bets strong hands, gives up on weak ones |
| LAG | 28–36 | 22–30 | 9–14 | 3.0–5.0 | Steals, floats, and barrels a lot |
| Nit | 10–15 | 8–12 | 2–5 | 1.5–2.5 | Waits for premiums, folds to pressure |
| Passive Fish (spec: "Weak-Passive") | 16–22 | 5–10 | 1–3 | 0.8–1.5 | Limps and check-calls, rarely raises without the nuts |
| Calling Station | 40–55 | 5–12 | 1–4 | 0.5–1.2 | Calls with any pair or any draw, hates folding |
| Beginner | 35–50 | 8–15 | 2–5 | 0.8–1.6 | Limps often and overvalues top pair. Obvious sizing tells |
| Maniac | 50–70 | 35–50 | 15–25 | 4.0–8.0 | Raises constantly, overbets, spews when tilted |

### 5.1 Which stats get tested in Phase 4
- **In Phase 4:** VPIP, PFR and 3-bet % for all eight archetypes, against the bands above, on **three runs of 10,000 hands** each (different shuffles), each archetype in one seat against a fixed mixed field (TAG, LAG, Nit, Beginner, Calling Station). All three runs must be inside the band.
- **Also in Phase 4:** the "20 varied bots" check for those three stats (at least 18 of 20 randomly varied bots of an archetype inside the band, none more than 3 points outside), and the VPIP ordering: Nit < Passive Fish and TAG < GTO-ish < LAG < Beginner and Calling Station < Maniac.
- **Waits for Phase 5:** AF, WTSD (how often it goes to showdown), c-bet, the aggression ordering, and the rule that stronger archetypes must beat weaker ones over 50,000 hands. Tilt and the sliders are later still.
- **No target exists for 4-bets** in the spec. Claude will give each bot sensible 4-bet behavior, but it is not pass/fail.
- **Stack depth:** the bands are measured at 100bb. The other depths (40, 200) use the same ranges. Short-stack shove-or-fold play is a Phase 7 item in the spec.

### 5.2 Where the ranges come from, and how reliable they are
- **The spec gives only the stat targets, not hand ranges.**
- **The method:** Claude builds the ranges from its own poker knowledge. It ranks all 169 starting hands by how well they play, gives each position a cutoff, and tunes the cutoffs until the simulated stats land in the spec's bands. Published charts are **not** copied (they can't be verified from the working environment).
- **Reasonably confident about:** which hands are strong or weak, and open frequencies by position at 100bb. For the GTO-ish bot the aim is roughly: UTG 15%, hijack 19%, cutoff 27%, button 43%, small blind about 40%.
- **Less sure about (please check these grids when you see them):**
  - how wide the big blind defends against steals;
  - which suited aces and other hands to use as 3-bet bluffs;
  - 4-bet and 5-bet frequencies;
  - calling 3-bets;
  - squeezes and multiway pots;
  - the Beginner's and Passive Fish's limping habits.
- **The GTO-ish bot is "solver-inspired", as the spec says, not a real solver.** A strong player could find leaks, mostly in 3-bet bluff selection and defending against 3-bets. Treat it as a tough, balanced regular. (A real solver would be a much larger, separate project.)
- **A note on the stats:** a bot's stats depend on who it plays against, which is why they are measured at a fixed reference table. 3-bet % counts re-raises as a share of the chances to re-raise.

### 5.3 How the bots avoid being "chart robots" before the flop
- **Mixed frequencies near the edge:** no range has a hard cutoff. A hand just inside the range opens nearly always, a hand just outside opens sometimes. The GTO-ish bot mixes on purpose (for example opening a borderline hand about half the time). A Nit has sharp edges. The weaker bots have fuzzy ones.
- **Personality:** each bot gets small random shifts to its cutoffs, so two Nits never play identically. The 20-bots check makes sure they still read as their type.
- **Skill noise:** bots misjudge their hand a little, by more at lower skill. For example the Beginner overvalues any ace and suited junk and ignores position. The errors are fresh each hand: an odd min-raise, calling a raise with a dominated hand.
- **Varied sizes:** regs open 2.2-3x, 3-bet about 3x in position and 4x out of position, and add a big blind per limper when isolating. Their sizes do not depend on their hand. The Beginner and Calling Station use round or odd numbers and have a tell (bigger raises with premiums).

### 5.4 What each archetype does differently before the flop
- **GTO-ish Reg:** balanced. Opens by position with mixed borderline hands, calls in position with suited broadways and pairs, 3-bets both strong hands and a few bluff hands, uses consistent sizes that don't depend on the hand.
- **TAG:** tighter and value-heavy. 3-bets mostly strong hands with few bluffs, standard sizes, folds marginal hands.
- **LAG:** steals a lot from the late seats, 3-bets often against steals, defends the big blind wide, sometimes 4-bets as a bluff.
- **Nit:** premiums only, almost no stealing, folds to a 3-bet except the very top of its range, never limps, defends the big blind tightly.
- **Passive Fish:** limps and calls many middling hands, raises only with strong ones, often folds to a 3-bet.
- **Calling Station:** calls with any pair, ace, suited or connected hand, rarely folds a hand with any value, raises only with big hands.
- **Beginner:** limps a lot, overvalues offsuit aces and kings, ignores position, uses odd sizes with tells.
- **Maniac:** raises most hands and 3-bets lightly, uses big sizes, 4-bets light.

### 5.5 What you will be shown at the end of Phase 4
- **A Ranges page** in the app (`#/ranges`) with a 13×13 grid for each archetype and position (the five opening positions, big-blind defense, and 3-bet ranges). Shading shows how often a hand is played, so mixed hands are visible. A plain text list sits beside each grid. These grids show each bot's *intended* base range; in play, personality and skill noise blur them.
- **A stats table:** each archetype's simulated VPIP, PFR and 3-bet on all three runs, next to the spec's band, marked pass or fail. It is also saved in the repo as a report.
- **If a bot misses its band:** Claude reports it and asks you before changing the band.

### 5.6 How you choose the bots at your table in Phase 4
- A new **Settings → Opponents** panel with "Fill the table with…" buttons (all Nits, all Maniacs and so on) and a dropdown for each of the five seats. Changes apply from the next hand.
- Each opponent's archetype label shows under their name for now, so you know who is who.
- **This pulls a simple version of Phase 6's per-seat override forward** so you can playtest one archetype at a time. Phase 6 still adds the presets, sliders and avatars, and the option to hide the labels. This small scope change needs your OK as part of approving Phase 4.

### 5.7 What to expect when you playtest Phase 4
- **Before the flop** the bots will be convincing: you will see the limping, raising, 3-betting and sizing differences between archetypes.
- **After the flop** every archetype uses the same simple placeholder rule, so a Nit and a Maniac look alike after the flop. The placeholder looks at its hand: it bets and calls with a pair or better and gives up with nothing. There are no clever bluffs, draw play or varied sizing.
- **Do not judge** your postflop results against these bots, or anything about aggression. That arrives in Phase 5.

---

## 6. Open items

1. **Phase 4 is NOT approved and NOT started.** To start it, reply **"approved"** (this also approves the small Opponents-panel scope pull-forward in 5.6).
2. **The Realistic speed is a placeholder.** It is Fast stretched 2.2 times (capped at 9 seconds). You said it still felt pretty fast. The real human-like timing is Phase 7. If you want it slower sooner, tell Claude roughly how long a typical decision should take (for example 4-5 seconds) and it can make a small change.
3. **iPhone / Safari spot-check.** The automated browser tests only run in Chromium (Chrome and Edge's engine). Nobody has tested the app in Safari or Firefox. If you use an iPhone or iPad, open the preview link in Safari and check: the table fits, buttons are tappable, playing by touch works, Add to Home Screen works, and offline loading works.
4. **Phone install checklist.** Earlier you confirmed on a phone that the home-screen icon was correct and the app loaded offline (Phase 1). That has not been re-checked on the latest build. To re-check: open the latest preview link, add it to your home screen (turn on "Open as Web App" on iPhone), confirm the icon (dark green with a white spade) and name, open it from the home screen, then try airplane mode.
5. **Latest preview not confirmed by you.** You tested Phase 3 and it worked. The pot-odds commit's preview link (the newest deployment in Vercel) was not confirmed by you separately.
6. **Vercel Deployment Protection.** If Vercel asks you to sign in to see a preview, or a phone cannot install or go offline, turn off "Vercel Authentication" for previews (Vercel → project → Settings → Deployment Protection). It was never confirmed whether that setting is on.
7. **Your school/campus Wi-Fi blocked `*.vercel.app` addresses** earlier (the browser said `DNS_PROBE_FINISHED_NXDOMAIN`). It worked on mobile data and on another network. If a preview link "can't be reached", try a different network.
8. **Small open decisions for later phases:** default table preset (suggestion: "Realistic Online", before Phase 6); longest think time in Realistic mode (suggestion: about 15 seconds, before Phase 7); whether busted bots rebuy or get replaced by a new player (suggestion: mostly rebuy, occasionally a new face, before Phase 7).
9. **Nothing is merged into `main` yet.** That happens only when you approve the whole first version (end of the first round).
10. **Very new tool versions.** The project uses brand-new major versions of its tools (Preact 11, TypeScript 7, Vite 8, Vitest 5). Everything works today and the exact versions are locked in `package-lock.json`. If an install ever breaks after a long gap, ask Claude to pin older versions.

---

## 7. How the files are organized

| Path | What is in it |
| --- | --- |
| `SPEC.md` | Your original spec (source of truth for what the app does), with a note at the top listing what changed |
| `Build Plan.md` | The phased plan, status, your decisions, risks |
| `HANDOFF.md` | This file |
| `README.md` | How to run the app and tests |
| `app.config.ts` | The app name and colors in one place |
| `src/engine/` | The rules engine: cards, random numbers, hand evaluator, hand state machine, table and button movement, bot "view", hand log text, hand projection for the screen, hand records. **No screen code.** |
| `src/bots/placeholder.ts` | The simple stand-in bots (replaced in Phases 4-5) |
| `src/sim/` | The simulator pieces: random-play checks, invariants, the watch-page game |
| `src/game/` | Session logic with no screen code: settings, saving, pacing (think times), bet sizing, keyboard mapping, the game controller |
| `src/ui/` | The screens: game table, watch page, cards, address handling |
| `src/styles.css` | All the styling |
| `tests/` | Unit tests (Vitest) |
| `e2e/` | Real-browser tests (Playwright) |
| `public/`, `scripts/make-icons.mjs` | App icons and the script that regenerates them |
| `vite.config.ts`, `vercel.json`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json` | Tool settings |
| `package.json`, `package-lock.json` | The list of tools (locked versions) and the commands |

---

## 8. How to resume, step by step

### A. Start a new Claude session that can see your code
1. Go to **claude.ai/code** and start a **new session**.
2. When it asks which repository to use, choose **`jonkiekbusch/holdem-lab`**, and make sure the branch is **`claude/happy-carson-emf5b5`**.
3. **If the repository is not in the list, or Claude says it cannot read the code:** GitHub is not connected.
   - Go to **https://claude.ai/connect-github** and connect (or reconnect) your GitHub account.
   - If the page says the Claude GitHub App is not installed on the repository, install it from the same page, or from **https://github.com/apps/claude/installations/select_target**. Choose your account and give it access to `holdem-lab` (choosing "Only select repositories" and picking `holdem-lab` is enough).
   - Then start the new session again and pick the repository and branch.
4. Paste the prompt from section 9 and send it.
5. Wait for Claude to summarize. **It should not write any Phase 4 code until you say "approved".**

### B. Make sure Vercel is connected (so each commit gets a preview link)
1. Go to **vercel.com** and sign in with **Continue with GitHub**.
2. Open the project (it may be called `holdem`; preview addresses look like `holdem-xxxx-kick13.vercel.app`). If it is not there: click **Add New… → Project**, find `holdem-lab`, click **Import**. If it is not listed, click **Adjust GitHub App Permissions** and give Vercel access to `holdem-lab`, then come back.
3. Check the settings: **Settings → General**: Framework Preset **Vite**, Build Command `npm run build`, Output Directory `dist` (the `vercel.json` file in the repo already sets these). **Settings → Git**: Production Branch **`main`**.
4. Vercel builds a preview whenever a commit is pushed to the branch. If you need to trigger one, ask Claude to push a small commit.
5. To open a preview: **Deployments** → the newest entry on `claude/happy-carson-emf5b5` → wait for **Ready** → **Visit**.
6. If the preview asks you to log in, or you can't install it on a phone: **Settings → Deployment Protection** → turn off **Vercel Authentication** for previews.
7. If the address says "can't reach this page" (`DNS_PROBE_FINISHED_NXDOMAIN`), your network is blocking it. Try mobile data or another Wi-Fi.

### C. Run the app yourself on your own computer (optional)
1. Install **Node.js 22 or newer** (the "LTS" download from nodejs.org) and **Git**.
2. Open a terminal (on Windows: PowerShell or "Git Bash") and run these one at a time:
   - `git clone https://github.com/jonkiekbusch/holdem-lab.git`
   - `cd holdem-lab`
   - `git checkout claude/happy-carson-emf5b5`
   - `npm install`
   - `npm run dev` and open the address it prints (usually `http://localhost:5173`).
3. To run the checks: `npm test` (about 10 seconds). For the browser tests, run `npx playwright install chromium` once, then `npm run test:e2e` (about 3-4 minutes).

### D. Check that everything is still healthy
Ask Claude to run `npm install`, `npm run typecheck`, `npm test` and `npm run test:e2e` and report. You should see the type check pass, about 375 unit tests pass, and about 262 browser tests pass.

### E. When the whole first version is approved
Ask Claude to merge `claude/happy-carson-emf5b5` into `main` (decision 3). Vercel's production site then updates from `main`.

---

## 9. Ready-to-paste prompt for a new session

Copy everything inside the box and paste it as your first message in the new session.

```text
I'm resuming a project from a previous session that didn't carry over. This message plus the repo is your full context.

PROJECT: "Hold'em Lab", a play-money no-limit hold'em practice app (6-max, me versus computer bots that play like distinct, imperfect humans). I'm a first-time builder: explain decisions in plain English, flag anything that needs my input instead of choosing silently, and give me very clear step-by-step instructions for anything I have to do myself (accounts, settings, buttons to click).

REPO: jonkiekbusch/holdem-lab. All work is on the branch claude/happy-carson-emf5b5. Do NOT touch main until I approve the whole first version. Do NOT create a pull request unless I ask.

FIRST, read these three files in full, in this order:
1. HANDOFF.md (current status, every decision I've made, the Phase 4 plan, open items, how to resume)
2. Build Plan.md (the phased plan; if it conflicts with HANDOFF.md's decisions, the decisions win, but tell me)
3. SPEC.md (the source of truth for what the app should do, including the archetype stat targets)
If any of these files is missing or looks incomplete, tell me and I'll paste the content instead of reconstructing it.

THEN:
1. Confirm you can see the repo and the branch, and run npm install, npm run typecheck and npm test. Tell me the results (HANDOFF.md says about 375 unit tests should pass).
2. Give me a short summary of where we are (phases done, what's built, what's not) so I can check it against HANDOFF.md.
3. List anything I need to do before we continue (for example reconnecting GitHub or Vercel), with exact steps.
4. WAIT. Phase 4 is NOT approved and not started. Do not write any Phase 4 code until I reply "approved".

WORKING RULES (unchanged from before): stop after each phase and give me the preview link plus a short checklist of what to test; don't begin the next phase until I say "approved"; write and run tests for each phase; keep the rules engine and bot engine free of screen code; commit and push to the branch after each phase; if a bot's stats miss their target, report it to me instead of changing the target; I mostly use a desktop browser (a small Dell XPS 13 laptop) with phone secondary.
```

---

## 10. Things learned along the way (so they are not rediscovered)

- **The cloud workspace resets when idle.** Everything must be pushed to GitHub. Uncommitted work is lost.
- **Test options in the address:** the game accepts options for repeatable testing, e.g. `#/?seed=abc&speed=instant&gap=0&stack=40&hero=6` (fixed shuffles, no pauses, no wait between hands, 40bb stacks, start with 6 chips). They are mainly for the automated tests.
- **Saved data:** the bankroll and settings are stored in the browser under the key `holdem-lab:game`. Clearing site data resets them.
- **Hand records:** kept in memory only until Phase 9. A page reload forgets them.
- **The cloud testing browser** is pre-installed. On your own computer you need `npx playwright install chromium` once.
- **Rules details worth remembering:** a short all-in raise does not reopen the betting for players who already acted; the odd chip in a split pot goes to the first winner left of the button; uncalled bets are returned and excluded from the displayed pot; the big blind moves to the next live player each hand (dead small blind and dead button handled).
- **`dist/`, `node_modules/` and `test-results/`** are build or test output. They are not in GitHub and can be recreated.
