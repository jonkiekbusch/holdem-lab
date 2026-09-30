> **Note added when this file was saved to the repo (Sep 30, 2026).** The text below is the original spec, unchanged. Where it disagrees with the decisions in `Build Plan.md`, the decisions win. The differences are:
>
> - **Hosting:** Vercel, deployed from GitHub. The hosting and "Open items" lines below are superseded.
> - **Archetype rename:** the spec's "Weak-Passive" is now **Passive Fish**. Its stat targets are unchanged. "Weak" now refers only to the low end of the skill slider.
> - **Skill slider:** "Beginner ↔ GTO" is now **Weak ↔ GTO**. "Beginner" stays as a bot type.
> - **Speed setting:** **Realistic / Fast / Instant** instead of 1x / 2x / 4x / instant. The default is short pauses of roughly 1-3 seconds. Realistic is the slower opt-in mode.
> - **Phases:** the spec's six phases are replaced by the ten phases in `Build Plan.md`.
> - **Bot validation volume:** the plan runs 3 x 10,000 hands per archetype instead of the spec's 5,000+.
> - **Opponent adaptation:** bots that notice your habits are not in v1. It is listed as a possible later phase.

# Poker Practice App — Spec & Build Plan

Sep 30, 2026 · @Jon Kiekbusch

## Summary

This is an installable, mobile-first web app for no-limit hold'em. It's a 6-max cash game with play money only: you against five computer opponents that play like distinct, imperfect humans. It's built in six phases. After each phase I run automated tests and a bot-stat simulation of several thousand hands, make a git commit, and send you a preview link.

| Decision | Choice |
| --- | --- |
| Hosting | GitHub Pages as an installable app (PWA). Until you connect GitHub, each phase gets a private preview link |
| Format | Cash game, 1/2 blinds, stack depth selectable (40 / 100 / 200bb), rebuys anytime |
| Opponent control | Table presets, plus per-seat overrides, plus global looseness and aggression sliders |
| Table feel | Subtle tells only: names and avatars. You read style and tilt from timing, sizing, and the HUD |
| GTO bot | Heuristic GTO-ish: solver-inspired ranges, mixed frequencies, balanced sizing. Not a real solver |
| Practice features | Stats HUD (bots and you), hand history with street-by-street replay |
| Pacing | Realistic think times with a 1x / 2x / 4x / instant speed toggle |

Out of scope for v1: real money, multiplayer, tournaments, decision feedback and the equity coach. The last two are easy to add later.

## Tech stack and architecture

The stack is TypeScript with Vite and Preact: a small, fast bundle that loads quickly on a phone. vite-plugin-pwa handles home-screen install and offline play, Vitest and Playwright handle testing, and a GitHub Actions workflow deploys to GitHub Pages. There's no server and no account. Everything runs and saves on your device.

&#91;embedded content: architecture · app, shared core, test harness\]

Keeping the engine and bots free of UI code is what makes the simulation results trustworthy: the bots in the stat reports are the same code you play against.

## Game engine and rules

The engine is a pure TypeScript state machine with no UI code. The same code runs the phone app and the Node simulator, so the bots tested in simulation are exactly the bots you play.

- **Game:** no-limit hold'em, 6 seats, 1/2 blinds, dealer button rotates, standard dead-button handling when a seat busts or sits out.
- **Betting rules:** min-bet is the big blind. A min-raise equals the previous raise size. An all-in short of a full raise does not reopen betting to players who already acted. The last aggressor on the river shows first, and uncalled bets are returned.
- **Pots:** multiple side pots, split pots, odd chip to the first seat left of the button.
- **Hand evaluator:** fast 7-card evaluator, checked against known hand-ranking sets.
- **Equity:** Monte Carlo against a range, used by bots and later by the HUD.
- **Randomness:** seedable RNG, so any hand can be replayed exactly and any failing test can be reproduced.
- **Fair play:** bots get a view object with only public information plus their own cards. A test guarantees they can never see your cards or the deck.
- **Money:** your play-money bankroll persists on the device. You can rebuy to your chosen depth anytime, and busted bots are replaced or rebuy, like a real game.

## Bot system

Each bot is an archetype (its target style) plus a personality (small random variation, so two Nits never play identically) plus live state (tilt, stack, and how the session is going). All decisions go through one pipeline: read the situation, perceive hand strength with skill-based noise, choose an action from weighted probabilities, pick a human-looking size, then wait a human-looking time.

### Archetypes and target stats

The targets are measured over at least 5,000 simulated hands at a standard mixed table. VPIP = % of hands the bot voluntarily puts money in preflop. PFR = % of hands it raises preflop. 3-bet = % of the time it re-raises when facing an open. AF = postflop (bets + raises) / calls.

| Archetype | VPIP % | PFR % | 3-bet % | AF | How it plays |
| --- | --- | --- | --- | --- | --- |
| GTO-ish Reg | 22–27 | 18–23 | 7–11 | 2.5–3.5 | Solver-style ranges by position, mixed frequencies, consistent sizing, defends by pot odds |
| TAG | 18–23 | 15–20 | 5–9 | 2.5–4.0 | Solid and straightforward. Bets strong hands, gives up on weak ones |
| LAG | 28–36 | 22–30 | 9–14 | 3.0–5.0 | Steals, floats, and barrels a lot |
| Nit | 10–15 | 8–12 | 2–5 | 1.5–2.5 | Waits for premiums, folds to pressure |
| Weak-Passive | 16–22 | 5–10 | 1–3 | 0.8–1.5 | Limps and check-calls, rarely raises without the nuts |
| Calling Station | 40–55 | 5–12 | 1–4 | 0.5–1.2 | Calls with any pair or any draw, hates folding |
| Beginner | 35–50 | 8–15 | 2–5 | 0.8–1.6 | Limps often and overvalues top pair. Obvious sizing tells |
| Maniac | 50–70 | 35–50 | 15–25 | 4.0–8.0 | Raises constantly, overbets, spews when tilted |

### What makes them feel human

- **Believable mistakes:** controlled by a skill value. Low skill adds noise to hand-strength perception, ignores pot odds, chases bad draws, overvalues top pair and any ace, calls too much on the river, and occasionally makes an odd min-raise. The GTO bot has almost no noise.
- **Varied bet sizing:** regs use standard sizes (2.2–3x opens; 33%, 66%, and 125% bets) with small jitter. Recreational bots round to 'human' numbers and use odd sizes, and they have tells: big bets with strong hands, small bets with draws. The GTO bot's sizing doesn't depend on hand strength.
- **Tilt:** a 0–1 meter per bot. It rises after bad beats (losing an all-in as a 70%+ favorite), big losses, or being bluffed at showdown, and it decays over about 15–40 hands. Tilt widens ranges, raises aggression, speeds up actions, and makes calls worse. How easily each archetype tilts varies: Maniacs and Beginners tilt easily, GTO and Nits barely at all.
- **Session dynamics:** some bots tighten up after a big win to protect a stack. Short stacks play shove-or-fold.
- **Think time:** a lognormal delay scaled by how hard the decision is (how close the options are), the street, and the size of the bet faced. Easy preflop folds are near-instant. Big river decisions can tank for 8–15s. Tells follow each archetype (a beginner snap-calls with draws and tanks and then bets big with monsters), while the GTO bot's timing is balanced. The speed toggle scales all delays and keeps their relative lengths.

## Opponent controls

There are three layers of control. Each layer overrides the one above it.

1. **Table preset:** one tap sets all five seats.
   - *Soft Home Game:* Beginners, a Calling Station, and a Weak-Passive player
   - *Realistic Online 6-max* (default): a mix of regs and recreational players, roughly like a real 1/2 online pool
   - *Tough Regs:* GTO-ish, TAG, and LAG players
   - *Wild Game:* Maniacs, a LAG, and a Station
   - *Random:* a surprise mix, and styles are hidden until the HUD reveals them
2. **Global sliders:** Tighter ↔ Looser, Passive ↔ Aggressive, and Beginner ↔ GTO skill. Each shifts every bot from its baseline, so 'Looser' makes the Nit less nitty but still the tightest player at the table.
3. **Per-seat override:** tap an empty or occupied seat to pick an archetype, or set it to 'match preset'.

Changes apply from the next hand. Bot identities (name and avatar) persist, so you build reads over a session.

## Mobile UI, HUD, and hand history

The app is designed for one-handed portrait use on a phone, and it still works on a laptop.

- **Table:** an oval table with you at the bottom, five seats around it, and the pot and board in the center. Bots show a 'thinking' ring while they deliberate.
- **Your actions:** Fold / Check-Call / Bet-Raise buttons in thumb reach. The bet slider has quick buttons for 1/3, 1/2, 2/3, pot, and all-in (2.5x / 3x / 4x preflop). Optional pre-action checkboxes include check/fold.
- **HUD:** tap a bot to see VPIP / PFR / 3-bet / AF / hands played. Small numbers show under each name, and the HUD can be toggled off. Your own stats are on a stats screen.
- **Hand history:** the last 500 hands are saved on the device, with filters (won, lost, all-ins). Replay steps through a hand action by action, showing hole cards revealed at showdown.
- **Settings:** stack depth, preset, sliders, speed (1x / 2x / 4x / instant), sound on or off, and reset bankroll.
- **Install:** 'Add to Home Screen' opens it full screen, and it works offline after the first load.

## Testing and bot validation

A phase is done only when every check below passes. The results go in each phase's report to you.

- **Unit tests (Vitest):** hand evaluator, betting legality, side pots, showdowns, and the stats calculations.
- **Invariant tests:** thousands of random hands checking that chips are always conserved, no illegal action is ever accepted, and no bot ever sees hidden cards.
- **Bot stat simulation:** 5,000+ hands per archetype, with each archetype measured in a seat against a fixed reference table. The simulation reports VPIP, PFR, 3-bet, AF, WTSD, and c-bet. It fails if any headline stat falls outside its band in the archetype table.
- **Modifier checks:** 'Looser', 'Tighter', 'Aggressive', and 'Passive' must each move the matching stat the right way for every archetype, and archetypes must stay in their tight-to-loose order.
- **Realism checks:** tilted bots show measurably higher VPIP and AF than when calm. Think-time distributions get longer as decisions get harder. The GTO bot's sizing and timing stay independent of hand strength.
- **UI smoke tests (Playwright, phone-sized screen):** load the app, play 20 hands by tapping, rebuy, open the HUD, and replay a hand.

## Phased build plan

The bots get their own two phases (3 and 4) because they're the point of the app. I wait for your go-ahead after the spec, and after each phase you can redirect before the next one starts.

&#91;embedded content: build plan · 6 phases, one gate each\]

If a gate fails, I fix the problem and re-run it before committing. I won't lower a target band without asking you first.

## How you'll try it, and open items

After each phase you'll get a short message with what's new, the test and simulation results, and a link. Open the link on your phone to play. Once GitHub is connected, the link becomes your permanent GitHub Pages URL. There, 'Share → Add to Home Screen' on iPhone or 'Install app' on Android puts it on your home screen.

Open items to approve:

- [ ] **Where the code lives between phases.** My workspace resets after a period of inactivity, so the git repo needs a durable home. Connecting GitHub before Phase 1 is safest. The alternative is connecting a folder on your laptop, where I'd keep a copy of the repo after every commit.
- [ ] **Archetype targets.** Confirm the stat bands in the archetype table, or tell me which bots should play looser or tighter.
- [ ] **Blinds.** 1/2 with 40 / 100 / 200bb stacks unless you want other options.
- [ ] **Approve the plan** to start Phase 1.
