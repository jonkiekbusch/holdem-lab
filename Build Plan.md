# Poker Practice App — Build Plan

Sep 30, 2026 · @Jon Kiekbusch

## Overview

The build is 10 small phases. Each one ends with something you can open on your phone, a set of automated checks that must pass, a git commit, and a new Vercel link. A playable game against believable bots arrives at Phase 5. Phases 6–10 add the controls, human realism, HUD, hand history, and polish. An optional Phase 11 (bots that adapt to you) is listed but not planned for v1.

What changed from the spec:

- **Hosting:** Vercel, deploying from GitHub. Every commit gets its own preview link.
- **Smaller phases:** the spec's six phases are split into ten, so you get something to try more often and can redirect earlier.
- **Names:** the spec's Weak-Passive archetype is now Passive Fish, and the skill slider runs Weak ↔ GTO. "Beginner" stays as an archetype.
- **Speed setting:** Realistic / Fast / Instant, built in Phase 3 with short default pauses. The slower Realistic think times arrive in Phase 7.
- **More bot testing:** each archetype plays 3 runs of 10,000 hands, instead of the spec's 5,000+.
- **Desktop first:** you'll mostly play on a small laptop, so the table is designed for desktop windows first and phones second, and it must still work on phones, tablets and large monitors. Keyboard shortcuts are added as an optional extra; the mouse and touch do everything. The spec's "one-handed portrait phone" line is reversed.
- **Extra bot check:** besides matching stats, stronger archetypes must actually beat weaker ones in simulation. Matching stats alone doesn't prove a bot plays sensibly.

This plan replaces the spec's 'Phased build plan' section. The full spec lives in `SPEC.md` and is the source of truth for what the app does. Everything in it still stands unless a decision in section 5 changes it. Where the two files disagree, the decisions in section 5 win.

## 1. Tech stack

**Recommendation: a static web app built with Vite, TypeScript, and Preact, deployed to Vercel from GitHub.** No server, no database, no login. The whole app is a set of files your phone downloads once and then runs on its own.

| Piece | Choice | What it means in plain English |
| --- | --- | --- |
| Language | TypeScript | JavaScript with built-in spell-check for code. It catches mistakes like a bet amount passed as text instead of a number before they reach you. |
| Build tool | Vite | Turns the code into a small, fast website with one command. Vercel recognizes it automatically. |
| Screen framework | Preact | A tiny (about 4 KB) version of React, the most common way to build app screens. It keeps the table in sync with the game. |
| Home-screen install | PWA plugin for Vite | Adds the app icon, full-screen mode, and offline play when you 'Add to Home Screen'. |
| Saving data | Browser storage on your phone | Bankroll and settings in simple storage, and hand history in the browser's built-in database. |
| Tests | Vitest + Playwright | Vitest checks the rules and bots in seconds. Playwright drives a real browser at phone size and taps through hands. |
| Hosting | Vercel (free tier) | Every push to GitHub builds and publishes automatically. Every commit gets its own preview link, which is how you'll try each phase. |

Why this is the simplest option that works: a poker practice app needs no server, because the bots run on your phone. A static site is the cheapest and most reliable thing to host, and it can't go down because a server went down.

Tradeoffs:

- **One device only:** your bankroll and history live on the phone you play on and don't sync to your laptop. Syncing would need accounts and a server. The fix is an export/import button in Phase 10.
- **iPhone quirks:** Safari can clear saved data for sites you haven't used in weeks, though home-screen apps are mostly exempt. Sound needs a first tap before it can play. The export button covers the data risk.
- **Hosting:** Vercel's free tier gives every commit its own preview link in GitHub, which is how each phase gets tried. Nothing in the app depends on the host.
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
- **You check:** open the link, install it (on a phone: add it to your home screen; on a laptop: install it from Edge), and confirm it opens full screen with its own icon.
- **Update:** the empty table screen was first drawn as a narrow phone shape. It now resizes to fill the window, tall on a phone held upright and wide on a laptop.

### Phase 2 — Rules engine

- **Goal:** a hand of no-limit hold'em is dealt and settled correctly every time.
- **Built:** cards and deck, a 7-card hand evaluator, betting rules (min-raise, all-in reopening rules), side pots, split pots with the odd chip, blinds and a moving button with dead-button handling, and replayable shuffles. A "fair play" view, so bots only ever see their own cards. Simple placeholder bots (not the real ones) for testing.
- **Verified by:** more than 200 automated rule checks, including tricky side-pot cases, an exact check of all 2,598,960 five-card hands against the known counts, and a cross-check of the evaluator against a second, independently written one. A 10,000-hand run with random play, random stack sizes and players coming and going checks that chips are never created or lost and no illegal action is ever allowed, and that every pot goes to the right winner. Browser checks run the watch page at all eight screen sizes.
- **You check:** a 'watch' page that auto-plays hands between simple bots with a readable text log. Spot-check a few pots and winners.

### Phase 3 — Playable table

- **Goal:** you can play real hands on your laptop or your phone.
- **Built:** the table layout with a wide desktop layout and a tall phone layout (the game fits the window with no scrolling during a hand, down to 1280×630), your cards, Fold / Check / Call / Bet / Raise buttons, the optional keyboard shortcuts (F, C, R and the keys in decision 11), the bet slider with 1/3, 1/2, 2/3, pot, and all-in buttons, stack-depth setting, bankroll, and rebuy. The speed setting (Realistic / Fast / Instant) is built here, with short default pauses of roughly 1-3 seconds, longer for big decisions. Opponents are still placeholder bots that mostly call.
- **Verified by:** automated browsers at phone, tablet and laptop sizes play 20 hands, once by clicking and tapping and once using only the keyboard, and tests confirm every button offers only legal amounts and the speed setting changes the pauses.
- **You check:** play 20+ hands on your laptop, with the mouse and then with the keyboard, then a few on your phone. Are the buttons easy to reach? Do the shortcuts feel right? Are the amounts right? Does rebuy work?

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
- **Built:** table presets (Soft Home Game, Realistic Online, Tough Regs, Wild Game, Random), the Tighter↔Looser, Passive↔Aggressive, and Weak↔GTO skill sliders, per-seat overrides, and bot names and avatars. **First round:** only the table presets (with bot names and avatars) are built. The sliders and per-seat overrides wait until you decide whether to continue.
- **Verified by:** tests confirm each slider moves the right stat in the right direction for every archetype, and that a 'looser' Nit is still tighter than a LAG.
- **You check:** switch presets and sliders mid-session and notice the table change within a few orbits.

### Phase 7 — Human realism

- **Goal:** bots feel like people, not programs.
- **Built:** mistakes based on skill level, human bet sizes and sizing tells, the slower **Realistic** think times (long tanks on big decisions, wired into the speed setting from Phase 3), tilt, and after-win tightening.
- **Verified by:** stat bands still pass. Tilted bots show measurably looser, more aggressive stats. Harder decisions take longer on average. The GTO bot's sizing and timing reveal nothing about its hand.
- **You check:** play on Realistic for a while. Does the timing feel natural? Do you catch any tells? Is Realistic too slow?

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

### Phase 11 — Opponent adaptation (optional, not in v1)

- **Goal:** bots that notice your habits, such as folding to every 3-bet, and adjust.
- **Status:** not planned and not built. It's listed so it isn't forgotten. It would be a large extra system on top of the bot engine, so it would need its own design discussion before any work starts.

## 4. Bot validation

An archetype passes only if its stats land inside its target band (the ranges in the spec's archetype table) across repeated runs, with enough hands that luck can't explain the result.

**How the simulation runs**

1. **Reference table:** the archetype under test sits in one seat against a fixed mixed field (TAG, LAG, Nit, Beginner, Calling Station). A bot's stats depend on its opponents, so a fixed field makes results comparable from phase to phase.
2. **Volume:** 10,000 hands per run, three runs with different shuffles, for every archetype. The simulator skips think-time delays, so all eight archetypes take a few minutes in total.
3. **Stat definitions** match standard poker trackers. VPIP excludes checking your option in the big blind. PFR counts any preflop raise. 3-bet % is re-raises as a share of chances to re-raise. AF = postflop (bets + raises) ÷ calls.
4. **Report:** a table of every stat per archetype, marked pass or fail, saved in the project and included in the phase note.

**Screen sizes and browsers**

Every screen-layout check runs in a real browser at eight sizes: phone portrait (412×915), phone landscape (915×412), tablet portrait (820×1180), tablet landscape (1180×820), small laptop (1280×630, your laptop at 150% zoom), mid laptop (1366×650), your laptop at 100% zoom (1920×950) and a large monitor (2560×1440). A check fails if anything scrolls sideways, is cut off, or overlaps. From Phase 3 on, the game screen must fit without scrolling during a hand, and there are extra tests that play hands using only the keyboard. These automated checks run in Chromium (Chrome and Edge's engine). Safari and Firefox are not run automatically here, so for iPhone and iPad I'll give you a short list of things to look at by hand.

**What counts as passing**

| Check | Passes when |
| --- | --- |
| Core stats (VPIP, PFR, 3-bet, AF) | Inside the band on all three runs. At 10,000 hands, luck moves VPIP or PFR by less than 1 point, so a miss means the bot is wrong, not unlucky. |
| Sample size | At least 3,000 postflop actions behind every AF figure. If a tight bot has fewer, its runs are extended automatically. |
| Personality variety | 20 randomly varied bots of the archetype: at least 18 inside the band, none more than 3 points (AF: 0.5) outside. Bots can differ, but they still read as their type. |
| Ordering | Average VPIP runs Nit < Passive Fish and TAG < GTO-ish < LAG < Beginner / Station < Maniac. Aggression orders the same way within each tightness level. |
| Sliders (Phase 6+) | Maximum 'Looser' raises every archetype's VPIP by at least 5 points. Aggressive/Passive moves AF the same way. Bands are enforced only at neutral slider settings. |
| Tilt (Phase 7+) | A fully tilted bot plays 5–15 points looser with higher AF than when calm, then returns to its band as tilt fades. |
| Skill sanity (Phase 5+) | Over 50,000 hands, GTO-ish and TAG win chips from Beginner and Calling Station. If a weak archetype comes out ahead, that's a failure even if every stat is in band. |

If a check fails, I tune the bot and re-run it. I never widen a band to make a test pass without asking you.

## 5. Decision points

### Decided

These were settled before Phase 1. They override anything earlier in this file or in `SPEC.md`.

| # | Decision |
| --- | --- |
| 1 | **Plan and stack approved:** Vite, TypeScript, Preact, deployed on Vercel. |
| 2 | **Hosting:** Vercel. |
| 3 | **GitHub:** every phase is pushed to the connected repo. All first-round work stays on the branch `claude/happy-carson-emf5b5`, and `main` stays untouched until the whole first version is approved. Then it's merged to `main`. |
| 4 | **App name:** "Hold'em Lab". It lives in one place in the code so it's easy to rename. |
| 5 | **Stat targets:** exactly as in the archetype table in `SPEC.md`. If a bot can't hit its range, I report it and ask before changing anything. |
| 6 | **Opponent adaptation:** not in v1. Listed as a possible later phase (Phase 11 below), not built. |
| 7 | **Naming:** "Beginner" stays as a bot type. The low end of the skill slider is **Weak** (so the slider is Weak ↔ GTO). The spec's "Weak-Passive" archetype is renamed **Passive Fish**, with the same stat targets. |
| 8 | **Think times:** the speed setting (Realistic / Fast / Instant) is built from Phase 3. The default is short pauses of roughly 1-3 seconds, longer for big decisions. Realistic is the slower opt-in mode, wired in during Phase 7. |
| 9 | **Scope of the first round:** Phases 1-5, then the Phase 6 table presets only. Phases 7-10 come after you've played it. |
| 10 | **Desktop first, every device supported.** The main device is a small laptop (Dell XPS 13 9315, about 1920×1200). The layout is designed for desktop windows first, from 1280×630 (that laptop at 150% zoom) up to large monitors, and must also work well on phones (portrait and landscape) and tablets. One layout that scales, not separate apps. Nothing needs hover, and buttons stay big enough to tap. |
| 11 | **Keyboard shortcuts (optional, Phase 3):** **F** fold, **C** check/call, **R** raise. After R: **Enter** confirms, **↑/↓** adjust the amount, **1-5** pick the quick sizes (1/3, 1/2, 2/3, pot, all-in), **Esc** cancels. They work only on your turn, the keys are shown on the buttons on desktop, and every action can still be done with the mouse or touch. |

### Still open

I'll ask again when we reach the phase that needs each one.

| Decision | My recommendation | Needed by |
| --- | --- | --- |
| Blinds and stack depths | 1/2 blinds with 40 / 100 / 200bb stacks, default 100bb (the spec says the same) | Before Phase 3 |
| Card style | Four-color deck (suits in different colors, easier to read on a small screen) | Before Phase 3 |
| Default table preset | 'Realistic Online': a mix of regs and recreational players | Before Phase 6 |
| Longest tank in Realistic mode | Capped near 15 seconds | Before Phase 7 |
| Busted bots: rebuy or replaced by a new player? | Mostly rebuy, occasionally replaced by a new face, like a real table | Before Phase 7 |

## 6. Risks and open questions

| Issue | Why it matters | Suggested handling |
| --- | --- | --- |
| **Matching stats ≠ playing well** | A bot can hit 25% VPIP by playing the wrong 25% of hands | The skill-sanity win-rate check, 'never fold the nuts' checks, and your own play-testing |
| **'GTO-style' expectations** | Real GTO needs a solver, which is too slow and too large for a phone. A strong player could find leaks in the GTO bot | Treat it as 'a tough, balanced reg.' Solver-grade play would be a separate, much larger project |
| **Stats shift with the table** | The same bot plays looser at a table of Nits because it's steal-happy | Bands are measured at the fixed reference table, and other tables are reported for information only |
| **Sliders vs. archetype bands** | A max-'Looser' Nit will leave the Nit band by design | Bands apply at neutral sliders, and sliders are tested for direction and ordering (section 4) |
| **'Beginner' could mean two things** | The spec used it for an archetype *and* one end of the skill slider | Resolved: the archetype keeps the name Beginner (a loose style with low skill by default). The slider's low end is now 'Weak', and the spec's Weak-Passive archetype is now 'Passive Fish'. The slider changes mistake rate for any archetype |
| **Realistic timing may be slow** | Five bots tanking up to 15 seconds could make a hand last 1–2 minutes | Most actions are quick and only hard spots tank. The default pauses are short (roughly 1-3 seconds), Realistic is opt-in, and you judge it in Phase 7 |
| **Subtle tilt may be invisible** | With no tilt meter, you might never notice the feature works | The simulation proves the effect, and an optional 'reveal tilt' toggle in hand history could help if you want it |
| **Opponent modeling** is mentioned in your scope examples but not in the spec | Bots that adapt to your tendencies are a large extra system | Decided: left out of v1. Bots react to the table and their own tilt, not your style. Listed as optional Phase 11 |
| **Phone performance** | Hand-strength math on every decision could lag older phones | Precomputed preflop tables and capped postflop calculation, checked in Phase 10 |
| **Rules not covered** | Straddles, run-it-twice, and time banks aren't in the spec | Leave them out unless you want them |
| **Code durability** | My workspace can reset after inactivity | The code lives on GitHub and is pushed after every phase |

## 7. Scope check

The fastest route to a working version is **Phases 1–5 plus the presets from Phase 6**. That gives you a real game against distinct, stat-validated bots in about 55–60% of the full build. Everything below can be added afterward without reworking what's built.

| Can be deferred | What you'd lose meanwhile | Size of saving |
| --- | --- | --- |
| Hand history and replay (Phase 9) | Reviewing past hands | One full phase |
| HUD and your stats (Phase 8) | On-screen reads, so you'd track opponents in your head | One full phase |
| Tilt | Bots stay emotionally steady | About a third of Phase 7 |
| Realistic think times and tells | Fixed short delays instead, so the table feels more robotic | About a third of Phase 7 |
| Sliders and per-seat overrides | Presets only | Most of Phase 6 |
| Maniac and Passive Fish archetypes | Six archetypes instead of eight | Some tuning time in Phases 4–5 |
| 40bb and 200bb stacks | 100bb only | Small |
| Sound, avatars, export/import | A plainer app | Part of Phase 10 |
| Opponent modeling (Phase 11) | Not in the spec, and not in v1 | Already excluded |

My suggestion: keep the full plan, since the human-like bots are the point of the app. Phases are ordered so you can stop after any one and still have something working.
