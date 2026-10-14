// What a player is allowed to know. Bots only ever get this object, never the HandState,
// so they cannot see other players' cards or the deck. A test checks that.

import type { Card } from "./cards.ts";
import { contestedPot, legalActions, type HandEvent, type HandState, type LegalActions, type Street } from "./hand.ts";

export interface PublicPlayer {
  seat: number;
  name: string;
  startStack: number;
  stack: number;
  bet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
}

export interface PlayerView {
  seat: number;
  hole: readonly [Card, Card];
  board: readonly Card[];
  street: Street;
  /** The pot being played for (excludes any bet nobody can call). */
  pot: number;
  currentBet: number;
  lastRaiseSize: number;
  toAct: number;
  handNumber: number;
  buttonSeat: number;
  smallBlindSeat: number | null;
  bigBlindSeat: number;
  smallBlind: number;
  bigBlind: number;
  players: readonly (PublicPlayer | null)[];
  /** What this player may do now, or null when it is not their turn. */
  legal: LegalActions | null;
  /** Everything that has happened in public so far (shown hands appear only once shown). */
  events: readonly HandEvent[];
}

export function viewFor(state: HandState, seat: number): PlayerView {
  const me = state.players[seat];
  if (!me) throw new Error(`Seat ${seat} is not in this hand`);
  return {
    seat,
    hole: me.hole,
    board: state.board.slice(),
    street: state.street,
    pot: contestedPot(state),
    currentBet: state.currentBet,
    lastRaiseSize: state.lastRaiseSize,
    toAct: state.toAct,
    handNumber: state.config.handNumber,
    buttonSeat: state.config.buttonSeat,
    smallBlindSeat: state.config.smallBlindSeat,
    bigBlindSeat: state.config.bigBlindSeat,
    smallBlind: state.config.smallBlind,
    bigBlind: state.config.bigBlind,
    players: state.players.map((p) =>
      p
        ? {
            seat: p.seat,
            name: p.name,
            startStack: p.startStack,
            stack: p.stack,
            bet: p.bet,
            committed: p.committed,
            folded: p.folded,
            allIn: p.allIn,
          }
        : null,
    ),
    legal: state.toAct === seat ? legalActions(state) : null,
    events: state.events.slice(),
  };
}
