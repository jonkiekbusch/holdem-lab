// Keyboard shortcuts, as a pure function so they can be tested without a browser.
//   F fold · C check/call · R raise (opens the amount) · Enter confirm · Up/Down change the amount
//   1-5 quick sizes · Esc cancel · N next hand
// Every one of these also exists as a button.

export type Command =
  | { kind: "fold" }
  | { kind: "checkcall" }
  | { kind: "raiseMode" }
  | { kind: "confirm" }
  | { kind: "adjust"; bigBlinds: number }
  | { kind: "quick"; index: number }
  | { kind: "cancel" }
  | { kind: "nextHand" };

export interface KeyInfo {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

export interface KeyContext {
  /** The key was pressed while typing in a text box. */
  inTextInput: boolean;
  /** It is your turn and you can act. */
  heroTurn: boolean;
  canRaise: boolean;
  /** The amount box has been opened (R, 1-5, Up/Down or a tap on the slider). */
  sizing: boolean;
  /** "Next hand" is available (between hands, or you are out of the hand). */
  canDeal: boolean;
}

export function commandForKey(ev: KeyInfo, ctx: KeyContext): Command | null {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;

  if (ctx.inTextInput) {
    if (key === "Enter" && ctx.heroTurn && ctx.sizing && !ev.repeat) return { kind: "confirm" };
    if (key === "Escape" && ctx.sizing) return { kind: "cancel" };
    return null;
  }

  if (ctx.heroTurn) {
    if (key === "ArrowUp" && ctx.canRaise) return { kind: "adjust", bigBlinds: 1 };
    if (key === "ArrowDown" && ctx.canRaise) return { kind: "adjust", bigBlinds: -1 };
    if (ev.repeat) return null;
    if (key === "f") return { kind: "fold" };
    if (key === "c") return { kind: "checkcall" };
    if (key === "r" && ctx.canRaise) return { kind: "raiseMode" };
    if (key === "Enter" && ctx.sizing) return { kind: "confirm" };
    if (key === "Escape" && ctx.sizing) return { kind: "cancel" };
    if (ctx.canRaise && key >= "1" && key <= "5") return { kind: "quick", index: Number(key) - 1 };
  }
  if (!ev.repeat && ctx.canDeal && (key === "n" || (key === "Enter" && !ctx.heroTurn))) return { kind: "nextHand" };
  return null;
}
