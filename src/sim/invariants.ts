// Checks that must hold after every single action of every hand.
// Used by the random-hands test now and by the bot simulator later.

import { legalActions, totalPot, type HandState } from "../engine/hand.ts";

export function checkInvariants(state: HandState, totalChips: number): void {
  const fail = (msg: string): never => {
    throw new Error(`Invariant broken (hand ${state.config.handNumber}, seed ${state.config.seed}): ${msg}`);
  };

  let chips = 0;
  let committed = 0;
  for (const p of state.players) {
    if (!p) continue;
    if (!Number.isInteger(p.stack) || p.stack < 0) fail(`seat ${p.seat} stack is ${p.stack}`);
    if (p.bet < 0 || p.bet > p.committed) fail(`seat ${p.seat} bet ${p.bet} vs committed ${p.committed}`);
    if (p.committed > p.startStack) fail(`seat ${p.seat} committed more than they started with`);
    if (p.stack === 0 && !p.allIn && state.street !== "complete" && p.committed > 0 && !p.folded) fail(`seat ${p.seat} has no chips but is not all-in`);
    // After the hand, pots have been paid into stacks, so only stacks count.
    chips += state.street === "complete" ? p.stack : p.stack + p.committed;
    committed += p.committed;
  }
  if (chips !== totalChips) fail(`chips are ${chips}, should be ${totalChips}`);
  if (totalPot(state) !== committed) fail("pot does not match what players put in");

  const seen = new Set<number>();
  const note = (card: number): void => {
    if (card < 0 || card > 51 || seen.has(card)) fail(`bad or duplicate card ${card}`);
    seen.add(card);
  };
  for (const p of state.players) if (p) p.hole.forEach(note);
  state.board.forEach(note);
  if (state.board.length !== [0, 3, 4, 5, 5][["preflop", "flop", "turn", "river", "complete"].indexOf(state.street)] && state.street !== "complete") {
    fail(`board has ${state.board.length} cards on the ${state.street}`);
  }

  if (state.street === "complete") {
    if (state.toAct !== -1 || !state.result) fail("complete hand has no result");
    const r = state.result!;
    let paid = 0;
    for (const pot of r.pots) {
      let sum = 0;
      for (const a of pot.awards) {
        if (a.amount < 0) fail("negative award");
        const p = state.players[a.seat];
        if (!p || p.folded) fail(`chips awarded to folded or absent seat ${a.seat}`);
        if (!pot.eligible.includes(a.seat)) fail("award to an ineligible seat");
        sum += a.amount;
      }
      if (sum !== pot.amount) fail(`pot of ${pot.amount} paid out ${sum}`);
      paid += pot.amount;
    }
    if (paid !== committed) fail(`pots total ${paid} but ${committed} was committed`);
    const net = r.net.reduce<number>((a, b) => a + (b ?? 0), 0);
    if (net !== 0) fail(`net results sum to ${net}`);
  } else {
    const legal = legalActions(state);
    if (!legal) fail("hand is live but nobody can act");
    else {
      const p = state.players[legal.seat]!;
      if (p.folded || p.allIn) fail("a folded or all-in player is to act");
      if (legal.callAmount > legal.stack) fail("call amount bigger than stack");
      if (legal.canRaise && (legal.minRaiseTo > legal.maxRaiseTo || legal.minRaiseTo <= legal.currentBet)) fail("bad raise range");
    }
  }
}
