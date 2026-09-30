# Poker Practice App — Build Plan

Sep 30, 2026 · @Jon Kiekbusch

## Overview

The build is 10 small phases. Each one ends with something you can open on your phone, a set of automated checks that must pass, a git commit, and a new Vercel link. A playable game against believable bots arrives at Phase 5. Phases 6–10 add the controls, human realism, HUD, hand history, and polish.

What changed from the spec:

- **Hosting:** Vercel (or Netlify) deploying from GitHub, instead of GitHub Pages. The app code is the same either way.
- **Smaller phases:** the spec's six phases are split into ten, so you get something to try more often and can redirect earlier.
- **Extra bot check:** besides matching stats, stronger archetypes must actually beat weaker ones in simulation. Matching stats alone doesn't prove a bot plays sensibly.

This tab replaces the spec's 'Phased build plan' section. Everything else in the spec still stands unless a decision point below changes it.

## 1. Tech stack

**Recommendation: a static web app built with Vite, TypeScript, and Preact, deployed to Vercel from GitHub.** No server, no database, no login. The whole app is a set of files your phone downloads once and then runs on its own.

| Piece | Choice | What it means in plain English |
| --- | --- | --- |
| Language | TypeScript | JavaScript with built-in spell-check for code. It catches mistakes like a bet amount passed as text instead of a number before they reach you. |
| Build tool | Vite | Turns the code into a small, fast website with one command. Vercel and Netlify both recognize it automatically. |
| Screen framework | Preact | A tiny (about 4 KB) version of React, the most common way to build app screens. It keeps the table in sync with the game. |
| Home-screen install | PWA plugin for Vite | Adds the app icon, full-screen mode, and offline play when you 'Add to Home Screen'. |
| Saving data | Browser storage on your phone | Bankroll and settings in simple storage, and hand history in the browser's built-in database. |
| Tests | Vitest + Playwright | Vitest checks the rules and bots in seconds. Playwright drives a real browser at phone size and taps through hands. |
| Hosting | Vercel (free tier) | Every push to GitHub builds and publishes automatically. Every commit gets its own preview link, which is how you'll try each phase. |

Why this is the simplest option that works: a poker practice app needs no server, because the bots run on your phone. A static site is the cheapest and most reliable thing to host, and it can't go down because a server went down.

Tradeoffs:

- **One device only:** your bankroll and history live on the phone you play on and don't sync to your laptop. Syncing would need accounts and a server. The fix is an export/import button in Phase 10.
- **iPhone quirks:** Safari can clear saved data for sites you haven't used in weeks, though home-screen apps are mostly exempt. Sound needs a first tap before it can play. The export button covers the data risk.
- **Vercel vs. Netlify:** for a static app they're equivalent. I lean Vercel for its per-commit preview links in GitHub. Netlify works identically if you already use it.
- **Not chosen:** Next.js (built for server features we don't need), a native iOS/Android app (App Store overhead), and plain JavaScript with no framework (simpler at first, but harder to test and change as the UI grows).

## 2. Architecture

The app has four parts, and the two that matter most (rules and bots) contain no screen code at all. That's what lets the simulator play thousands of hands in minutes with exactly the same bots you face on your phone.

&#91;embedded content: architecture · settings, core logic, UI, simulator\]

- **Rules engine:** the dealer and rulebook. It is given the current table and an action, and it returns the new table. It has no notion of screens or time.
- **Bot decision engine:** given what a player at the table could see, plus its personality parameters, it returns an action, a bet size, and how long to 'think'. It cannot see your cards.
- **Settings and toggles:** your preset, sliders, and per-seat picks are combined into one set of personality parameters per seat. Sliders nudge the parameters and archetypes set the starting values.
- **Phone UI:** draws the table, sends your taps to the rules engine, and waits out each bot's think time before showing its action. The speed toggle only changes that wait.

## 3. Phases

Every phase ends the same way: all checks pass, I commit to git, Vercel publishes a preview link, and you get a short note with what's new, the test results, and what to try. I don't start the next phase until you say go.

### Phase 1 — Installable shell

- **Goal:** prove the whole pipeline end to end before any poker exists.
- **Built:** project setup, an empty green table screen, app name and icon, home-screen install, and automatic deploy from GitHub to Vercel.
- **Verified by:** the build succeeds, a first automated test runs, and an install check confirms the app qualifies for 'Add to Home Screen'.
- **You check:** open the link on your phone, add it to your home screen, and confirm it opens full screen with its own icon.

### Phase 2 — Rules engine

- **Goal:** a hand of no-limit hold'em is dealt and settled correctly every time.
- **Built:** cards and deck, hand ranking, betting rules (min-raise, all-in reopening rules), side pots, split pots, blinds and button movement, and replayable shuffles.
- **Verified by:** hundreds of rule tests, including tricky side-pot cases. A 10,000-hand run with random bots checks that chips are never created or lost and no illegal action is ever allowed.
- **You check:** a 'watch' page that auto-plays hands between simple bots with a readable text log. Spot-check a few pots and winners.

### Phase 3 — Playable table

- **Goal:** you can play real hands on your phone.
- **Built:** the table layout, your cards, Fold / Check / Call / Bet / Raise buttons, the bet slider with 1/3, 1/2, 2/3, pot, and all-in buttons, stack-depth setting, bankroll, and rebuy. Opponents are still placeholder bots that mostly call.
- **Verified by:** a phone-sized automated browser plays 20 hands by tapping, and tests confirm every button offers only legal amounts.
- **You check:** play 20+ hands one-handed. Are the buttons easy to reach? Are the amounts right? Does rebuy work?

### Phase 4 — Bot brain, preflop

- **Goal:** each archetype plays its own preflop style.
- **Built:** personality settings, starting-hand ranges by position, and open / limp / call / 3-bet / fold decisions for all 8 archetypes, plus the bot simulator. After the flop, bots play a simple placeholder strategy.
- **Verified by:** simulating 10,000+ hands per archetype. VPIP, PFR, and 3-bet must land in each archetype's band (see section 4).
- **You check:** set a table of Nits, then a table of Maniacs, and feel the difference before the flop.

### Phase 5 — Bot brain, after the flop

- **Goal:** bots play full hands believably. **This is the first 'real game' milestone.**
- **Built:** hand-strength and draw reading, board texture, pot odds, continuation bets, barrels, bluffs, check-raises, and each archetype's bet sizes.
- **Verified by:** all stat bands pass, including aggression and showdown frequency. Sanity checks confirm bots never fold the best possible hand to a check and never call off with nothing. Stronger archetypes must out-win weaker ones over 50,000 hands.
- **You check:** play 50 hands at the default mixed table. Do the bots feel like different people?

### Phase 6 — Opponent controls

- **Goal:** you choose who you play against.
- **Built:** table presets (Soft Home Game, Realistic Online, Tough Regs, Wild Game, Random), the Tighter↔Looser, Passive↔Aggressive, and Beginner↔GTO sliders, per-seat overrides, and bot names and avatars.
- **Verified by:** tests confirm each slider moves the right stat in the right direction for every archetype, and that a 'looser' Nit is still tighter than a LAG.
- **You check:** switch presets and sliders mid-session and notice the table change within a few orbits.

### Phase 7 — Human realism

- **Goal:** bots feel like people, not programs.
- **Built:** mistakes based on skill level, human bet sizes and sizing tells, think times with the 1x / 2x / 4x / instant speed toggle, tilt, and after-win tightening.
- **Verified by:** stat bands still pass. Tilted bots show measurably looser, more aggressive stats. Harder decisions take longer on average. The GTO bot's sizing and timing reveal nothing about its hand.
- **You check:** play at 1x for a while. Does the timing feel natural? Do you catch any tells? Is 1x too slow?

### Phase 8 — HUD and your stats

- **Goal:** track opponents like a real player would.
- **Built:** VPIP / PFR / 3-bet / AF / hands under each bot, a detailed pop-up when you tap one, a HUD on/off switch, and your own stats screen.
- **Verified by:** the HUD's numbers must exactly match the simulator's numbers on the same hands.
- **You check:** after 100 hands, do the HUD reads match your sense of who's who?

### Phase 9 — Hand history and replay

- **Goal:** review hands after you play them.
- **Built:** the last 500 hands saved on your phone, filters (won, lost, all-ins), and step-by-step replay.
- **Verified by:** every replayed hand must match the original action for action, including across an app restart.
- **You check:** replay a big pot you lost and step through it.

### Phase 10 — Polish and launch

- **Goal:** a finished app you'd use daily.
- **Built:** offline play, a speed pass on older phones, sound, an export/import backup button, and bug fixes from your testing.
- **Verified by:** the full test suite, a final 10,000-hands-per-archetype report, and the app installing and playing in airplane mode.
- **You check:** use it for a few days as a normal app and send me anything that feels off.

## 4. Bot validation

An archetype passes only if its stats land inside its target band (the ranges in the spec's archetype table) across repeated runs, with enough hands that luck can't explain the result.

**How the simulation runs**

1. **Reference table:** the archetype under test sits in one seat against a fixed mixed field (TAG, LAG, Nit, Beginner, Calling Station). A bot's stats depend on its opponents, so a fixed field makes results comparable from phase to phase.
2. **Volume:** 10,000 hands per run, three runs with different shuffles, for every archetype. The simulator skips think-time delays, so all eight archetypes take a few minutes in total.
3. **Stat definitions** match standard poker trackers. VPIP excludes checking your option in the big blind. PFR counts any preflop raise. 3-bet % is re-raises as a share of chances to re-raise. AF = postflop (bets + raises) ÷ calls.
4. **Report:** a table of every stat per archetype, marked pass or fail, saved in the project and included in the phase note.

**What counts as passing**

| Check | Passes when |
| --- | --- |
| Core stats (VPIP, PFR, 3-bet, AF) | Inside the band on all three runs. At 10,000 hands, luck moves VPIP or PFR by less than 1 point, so a miss means the bot is wrong, not unlucky. |
| Sample size | At least 3,000 postflop actions behind every AF figure. If a tight bot has fewer, its runs are extended automatically. |
| Personality variety | 20 randomly varied bots of the archetype: at least 18 inside the band, none more than 3 points (AF: 0.5) outside. Bots can differ, but they still read as their type. |
| Ordering | Average VPIP runs Nit < Weak-Passive and TAG < GTO-ish < LAG < Beginner / Station < Maniac. Aggression orders the same way within each tightness level. |
| Sliders (Phase 6+) | Maximum 'Looser' raises every archetype's VPIP by at least 5 points. Aggressive/Passive moves AF the same way. Bands are enforced only at neutral slider settings. |
| Tilt (Phase 7+) | A fully tilted bot plays 5–15 points looser with higher AF than when calm, then returns to its band as tilt fades. |
| Skill sanity (Phase 5+) | Over 50,000 hands, GTO-ish and TAG win chips from Beginner and Calling Station. If a weak archetype comes out ahead, that's a failure even if every stat is in band. |

If a check fails, I tune the bot and re-run it. I never widen a band to make a test pass without asking you.

## 5. Decision points

Four decisions must be settled before Phase 1. The rest can wait until the phase that needs them, and I'll ask again at that point.

| Decision | My recommendation | Needed by |
| --- | --- | --- |
| **Approve this plan** (10 phases, this stack) | — | Before Phase 1 |
| **Vercel or Netlify** | Vercel. You create a free account and connect it to the GitHub repo (about 5 minutes; I'll give steps). | Before Phase 1 |
| **How I get to GitHub** | You create an empty repo and connect GitHub to this session, so I can push each phase. My workspace resets when idle, so the repo needs to live on GitHub from day one. | Before Phase 1 |
| **App name for the home-screen icon** | A placeholder like 'Hold'em Lab' is fine. It's easy to rename later. | Before Phase 1 (placeholder OK) |
| Blinds and stack depths | 1/2 blinds with 40 / 100 / 200bb stacks, default 100bb | Before Phase 3 |
| Card style | Four-color deck (suits in different colors, easier to read on a small screen) | Before Phase 3 |
| Archetype stat bands | Keep the spec's bands as written | Before Phase 4 |
| Default table preset | 'Realistic Online': 2 regs + 3 recreational players | Before Phase 6 |
| Should bots adapt to *you*? | Not in v1 (see risks) | Before Phase 6 |
| Default speed and longest tank | Default 1x, with the longest think capped near 15 seconds | Before Phase 7 |
| Busted bots: rebuy or replaced by a new player? | Mostly rebuy, occasionally replaced by a new face, like a real table | Before Phase 7 |

## 6. Risks and open questions

| Issue | Why it matters | Suggested handling |
| --- | --- | --- |
| **Hosting contradiction:** the spec says GitHub Pages, and this plan uses Vercel or Netlify | Only the deploy step differs | Use Vercel/Netlify, and I'll update the spec's summary once you approve |
| **Matching stats ≠ playing well** | A bot can hit 25% VPIP by playing the wrong 25% of hands | The skill-sanity win-rate check, 'never fold the nuts' checks, and your own play-testing |
| **'GTO-style' expectations** | Real GTO needs a solver, which is too slow and too large for a phone. A strong player could find leaks in the GTO bot | Treat it as 'a tough, balanced reg.' Solver-grade play would be a separate, much larger project |
| **Stats shift with the table** | The same bot plays looser at a table of Nits because it's steal-happy | Bands are measured at the fixed reference table, and other tables are reported for information only |
| **Sliders vs. archetype bands** | A max-'Looser' Nit will leave the Nit band by design | Bands apply at neutral sliders, and sliders are tested for direction and ordering (section 4) |
| **'Beginner' means two things** | The spec uses it for an archetype *and* one end of the skill slider | Beginner archetype = a loose-passive style with low skill by default. The skill slider changes mistake rate for any archetype |
| **Realistic timing may be slow** | Five bots tanking up to 15 seconds could make a hand last 1–2 minutes | Most actions are quick and only hard spots tank. The speed toggle is there, and you judge 1x in Phase 7 |
| **Subtle tilt may be invisible** | With no tilt meter, you might never notice the feature works | The simulation proves the effect, and an optional 'reveal tilt' toggle in hand history could help if you want it |
| **Opponent modeling** is mentioned in your scope examples but not in the spec | Bots that adapt to your tendencies are a large extra system | Leave it out of v1. Bots react to the table and their own tilt, not your style. Add it later if wanted |
| **Phone performance** | Hand-strength math on every decision could lag older phones | Precomputed preflop tables and capped postflop calculation, checked in Phase 10 |
| **Rules not covered** | Straddles, run-it-twice, and time banks aren't in the spec | Leave them out unless you want them |
| **Code durability before GitHub** | My workspace can reset after inactivity | Phase 1 starts only once the GitHub repo exists |

## 7. Scope check

The fastest route to a working version is **Phases 1–5 plus the presets from Phase 6**. That gives you a real game against distinct, stat-validated bots in about 55–60% of the full build. Everything below can be added afterward without reworking what's built.

| Can be deferred | What you'd lose meanwhile | Size of saving |
| --- | --- | --- |
| Hand history and replay (Phase 9) | Reviewing past hands | One full phase |
| HUD and your stats (Phase 8) | On-screen reads, so you'd track opponents in your head | One full phase |
| Tilt | Bots stay emotionally steady | About a third of Phase 7 |
| Realistic think times and tells | Fixed short delays instead, so the table feels more robotic | About a third of Phase 7 |
| Sliders and per-seat overrides | Presets only | Most of Phase 6 |
| Maniac and Weak-Passive archetypes | Six archetypes instead of eight | Some tuning time in Phases 4–5 |
| 40bb and 200bb stacks | 100bb only | Small |
| Sound, avatars, export/import | A plainer app | Part of Phase 10 |
| Opponent modeling | Not in the spec, and not in the plan unless you add it | Already excluded |

My suggestion: keep the full plan, since the human-like bots are the point of the app. Phases are ordered so you can stop after any one and still have something working.
