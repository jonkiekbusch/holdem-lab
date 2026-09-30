import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Card } from "../engine/cards.ts";
import type { DisplaySeat } from "../engine/project.ts";
import { checkCallLabel, clampRaiseTo, quickSizes, raiseLabel } from "../game/betting.ts";
import { HERO_SEAT, SEAT_NAMES, type GameController, type GameSnapshot } from "../game/controller.ts";
import { commandForKey, type Command } from "../game/keys.ts";
import { SPEED_LABELS, SPEEDS, STACK_DEPTHS, STARTING_BANKROLL, type Speed, type StackDepth } from "../game/settings.ts";
import { CardBack, CardFace, CardSlot } from "./Cards.tsx";
import { createController } from "./createController.ts";

const chips = (n: number): string => n.toLocaleString("en-US");
const signed = (n: number): string => (n > 0 ? `+${chips(n)}` : n < 0 ? `−${chips(-n)}` : "0");

/** Seat positions go clockwise from you at the bottom. Angles in degrees, y pointing down. */
const SEAT_ANGLES = [90, 150, 210, 270, 330, 30];
const seatVector = (i: number): { cos: number; sin: number } => {
  const a = (SEAT_ANGLES[i] * Math.PI) / 180;
  return { cos: Math.round(Math.cos(a) * 1000) / 1000, sin: Math.round(Math.sin(a) * 1000) / 1000 };
};

type Dialog = "settings" | "log" | null;

export function GamePage({ params }: { params: URLSearchParams }) {
  const controllerRef = useRef<GameController | null>(null);
  if (!controllerRef.current) controllerRef.current = createController(params);
  const ctrl = controllerRef.current;
  const [snap, setSnap] = useState<GameSnapshot>(ctrl.getSnapshot());

  const [sizing, setSizing] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [raiseText, setRaiseText] = useState("");
  const [foldArmed, setFoldArmed] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const unsubscribe = ctrl.subscribe(() => setSnap(ctrl.getSnapshot()));
    setSnap(ctrl.getSnapshot());
    ctrl.start();
    return () => {
      unsubscribe();
      ctrl.dispose();
    };
  }, []);

  const legal = snap.legal;
  const decisionKey = legal ? `${snap.display?.handNumber}:${snap.street}:${legal.currentBet}:${legal.playerBet}` : "";
  useEffect(() => {
    if (legal) {
      setRaiseTo(legal.minRaiseTo);
      setRaiseText(String(legal.minRaiseTo));
    }
    setSizing(false);
    setFoldArmed(false);
  }, [decisionKey]);

  useEffect(() => {
    if (!foldArmed) return;
    const id = setTimeout(() => setFoldArmed(false), 3000);
    return () => clearTimeout(id);
  }, [foldArmed]);

  const shownRaiseTo = legal && legal.canRaise ? clampRaiseTo(legal, raiseTo) : 0;
  const sizes = useMemo(() => (legal && snap.street ? quickSizes(legal, snap.street) : []), [legal, snap.street]);

  const setAmount = (to: number): void => {
    if (!legal || !legal.canRaise) return;
    const c = clampRaiseTo(legal, to);
    setRaiseTo(c);
    setRaiseText(String(c));
    setSizing(true);
  };
  const doFold = (): void => {
    if (!legal) return;
    if (legal.canCheck && !foldArmed) {
      setFoldArmed(true);
      return;
    }
    ctrl.heroAct({ type: "fold" });
  };
  const doCheckCall = (): void => {
    if (!legal) return;
    ctrl.heroAct({ type: legal.canCheck ? "check" : "call" });
  };
  const doRaise = (): void => {
    if (!legal || !legal.canRaise) return;
    ctrl.heroAct({ type: "raise", to: shownRaiseTo });
  };
  const commitText = (): void => {
    const n = Number(raiseText.replace(/[^\d]/g, ""));
    setAmount(Number.isFinite(n) && raiseText.trim() !== "" ? n : shownRaiseTo);
  };

  // Keyboard shortcuts. The handler reads the latest values through a ref so it never goes stale.
  const latest = useRef({ snap, dialog, sizing, shownRaiseTo, sizes, legal });
  latest.current = { snap, dialog, sizing, shownRaiseTo, sizes, legal };
  const actions = useRef({ doFold, doCheckCall, doRaise, setAmount, setSizing, setDialog });
  actions.current = { doFold, doCheckCall, doRaise, setAmount, setSizing, setDialog };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const L = latest.current;
      const A = actions.current;
      if (L.dialog) {
        if (e.key === "Escape") A.setDialog(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      // Enter or Space on a focused button is that button's own click; do not also act on it here.
      if (tag === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
      const inTextInput = tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && (target as HTMLInputElement).type !== "range");
      const cmd: Command | null = commandForKey(e, {
        inTextInput,
        heroTurn: L.snap.heroCanAct,
        canRaise: !!L.legal?.canRaise,
        sizing: L.sizing,
        canDeal: L.snap.canDeal,
      });
      if (!cmd) return;
      e.preventDefault();
      switch (cmd.kind) {
        case "fold":
          A.doFold();
          break;
        case "checkcall":
          A.doCheckCall();
          break;
        case "raiseMode":
          A.setSizing(true);
          break;
        case "confirm":
          A.doRaise();
          break;
        case "adjust":
          A.setAmount(L.shownRaiseTo + cmd.bigBlinds * L.snap.bigBlind);
          break;
        case "quick":
          if (L.sizes[cmd.index]) A.setAmount(L.sizes[cmd.index].to);
          break;
        case "cancel":
          if (L.legal) A.setAmount(L.legal.minRaiseTo); // back to the smallest raise...
          A.setSizing(false); // ...and close the amount box
          break;
        case "nextHand":
          ctrl.deal();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const d = snap.display;
  const seatsToDraw = d?.seats ?? [];
  const status = statusText(snap, foldArmed);

  return (
    <main
      class="game"
      data-testid="game"
      data-hands-played={snap.handsPlayed}
      data-hand-number={d?.handNumber ?? 0}
      data-hero-turn={snap.heroCanAct ? "yes" : "no"}
      data-street={d?.street ?? ""}
    >
      <header class="game-header">
        <h1 class="app-name">{__APP_NAME__}</h1>
        <div class="bankroll" data-testid="bankroll" aria-label="Bankroll">
          <span>
            Stack <strong data-testid="hero-stack">{chips(snap.heroStack)}</strong>
          </span>
          <span>
            Wallet <strong data-testid="wallet">{chips(snap.wallet)}</strong>
          </span>
          <span class={snap.sessionNet > 0 ? "up" : snap.sessionNet < 0 ? "down" : ""}>
            Session <strong data-testid="session-net">{signed(snap.sessionNet)}</strong>
          </span>
        </div>
        <div class="header-buttons">
          <button type="button" class="btn small log-button" data-testid="log-button" onClick={() => setDialog("log")}>
            Log
          </button>
          <button type="button" class="btn small" data-testid="settings-button" onClick={() => setDialog("settings")}>
            Settings
          </button>
        </div>
      </header>

      <div class="game-main">
        <div class="stage-wrap">
          <div class="stage">
            <div class="felt" data-testid="table" />

            <div class="center">
              <div class="pot" data-testid="pot" aria-live="off">
                {d ? (
                  <>
                    Pot <strong>{chips(d.pot)}</strong>
                    {d.uncalled && <span class="uncalled"> · {chips(d.uncalled.amount)} uncalled, going back</span>}
                  </>
                ) : (
                  "Shuffling…"
                )}
              </div>
              <div class="board" data-testid="board">
                {[0, 1, 2, 3, 4].map((i) => (d?.board[i] !== undefined ? <CardFace key={i} card={d.board[i]} size="board" /> : <CardSlot key={i} size="board" />))}
              </div>
            </div>

            {seatsToDraw.map((s, i) =>
              s ? (
                <SeatView
                  key={i}
                  index={i}
                  seat={s}
                  hole={i === HERO_SEAT ? snap.heroHole : null}
                  thinking={snap.thinkingSeat === i}
                  isButton={d!.buttonSeat === i}
                  isSmallBlind={d!.smallBlindSeat === i}
                  isBigBlind={d!.bigBlindSeat === i}
                />
              ) : null,
            )}
            {seatsToDraw.map((s, i) => (s && s.bet > 0 ? <BetChip key={`b${i}`} index={i} amount={s.bet} /> : null))}
          </div>
        </div>

        <section class="panel" data-testid="action-bar" aria-label="Your actions">
          <p class="status" data-testid="status" role="status" aria-live="polite">
            {status}
          </p>
          {snap.result && (
            <div class="result-lines" data-testid="result">
              {snap.result.lines.slice(0, 3).map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          )}

          <div class="buttons">
            <button type="button" class={`btn action fold${foldArmed ? " armed" : ""}`} data-testid="btn-fold" disabled={!legal} onClick={doFold}>
              {foldArmed ? "Fold anyway?" : "Fold"}
              <kbd aria-hidden="true">F</kbd>
            </button>
            <button type="button" class="btn action call" data-testid="btn-checkcall" disabled={!legal} onClick={doCheckCall}>
              {legal ? checkCallLabel(legal) : "Check / Call"}
              <kbd aria-hidden="true">C</kbd>
            </button>
            <button type="button" class="btn action raise primary" data-testid="btn-raise" disabled={!legal || !legal.canRaise} onClick={doRaise}>
              {legal && legal.canRaise ? raiseLabel(legal, shownRaiseTo) : "Raise"}
              <kbd aria-hidden="true">R</kbd>
            </button>
          </div>

          <div class={`sizing${sizing ? " open" : ""}`} aria-label="Bet size">
            <div class="slider-row">
              <input
                type="range"
                class="slider"
                data-testid="raise-slider"
                aria-label="Bet size"
                min={legal?.minRaiseTo ?? 0}
                max={legal?.maxRaiseTo ?? 0}
                step={1}
                value={shownRaiseTo}
                disabled={!legal || !legal.canRaise || legal.minRaiseTo === legal.maxRaiseTo}
                onInput={(e) => setAmount(Number((e.target as HTMLInputElement).value))}
              />
              <input
                type="text"
                inputMode="numeric"
                class="amount"
                data-testid="raise-input"
                aria-label="Bet amount"
                value={legal && legal.canRaise ? raiseText : ""}
                disabled={!legal || !legal.canRaise}
                onInput={(e) => {
                  setRaiseText((e.target as HTMLInputElement).value);
                  setSizing(true);
                }}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const n = Number(raiseText.replace(/[^\d]/g, ""));
                    if (legal && legal.canRaise && raiseText.trim() !== "") ctrl.heroAct({ type: "raise", to: clampRaiseTo(legal, n) });
                  }
                }}
              />
            </div>
            <div class="quick" role="group" aria-label="Quick bet sizes">
              {[0, 1, 2, 3, 4].map((i) => {
                const q = sizes[i];
                return (
                  <button
                    key={i}
                    type="button"
                    class={`btn quick-btn${q && q.to === shownRaiseTo ? " on" : ""}`}
                    data-testid={`quick-${i}`}
                    disabled={!q}
                    onClick={() => q && setAmount(q.to)}
                    aria-label={q ? `${q.key === "all-in" ? "All-in" : q.key} to ${q.to}` : undefined}
                  >
                    <span class="q-name">{q ? (q.key === "all-in" ? "All-in" : q.key === "pot" ? "Pot" : q.key) : "–"}</span>
                    <span class="q-amount">{q ? q.to : ""}</span>
                    <kbd aria-hidden="true">{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
            {sizing && legal?.canRaise && (
              <p class="hint" aria-hidden="true">
                Enter to confirm · ↑ ↓ to change · Esc to cancel
              </p>
            )}
          </div>

          <div class="next">
            {snap.waitingForRebuy ? (
              snap.bankrollEmpty ? (
                <button type="button" class="btn primary wide" data-testid="btn-reset" onClick={() => ctrl.resetBankroll()}>
                  Out of chips. Reset bankroll to {chips(STARTING_BANKROLL)}
                </button>
              ) : (
                <button type="button" class="btn primary wide" data-testid="btn-rebuy" onClick={() => ctrl.rebuy()}>
                  Rebuy {chips(snap.rebuyAmount)}
                </button>
              )
            ) : (
              <>
                <button type="button" class="btn wide" data-testid="btn-next-hand" disabled={!snap.canDeal} onClick={() => ctrl.deal()}>
                  {snap.canSkip ? "Skip to next hand" : "Next hand"}
                  <kbd aria-hidden="true">N</kbd>
                </button>
                {snap.canRebuy && (
                  <button type="button" class="btn wide" data-testid="btn-rebuy" onClick={() => ctrl.rebuy()}>
                    Rebuy {chips(snap.rebuyAmount)}
                  </button>
                )}
              </>
            )}
          </div>

          <div class="panel-log" data-testid="panel-log" aria-label="Hand log">
            <LogLines lines={snap.log} />
          </div>
        </section>
      </div>

      {dialog === "settings" && (
        <SettingsDialog
          snap={snap}
          seed={ctrl.seed}
          confirmReset={confirmReset}
          onClose={() => {
            setDialog(null);
            setConfirmReset(false);
          }}
          onSpeed={(speed) => ctrl.setSettings({ speed })}
          onDepth={(stackDepth) => ctrl.setSettings({ stackDepth })}
          onReset={() => {
            if (!confirmReset) return setConfirmReset(true);
            setConfirmReset(false);
            ctrl.resetBankroll();
          }}
        />
      )}
      {dialog === "log" && (
        <Modal title="Hand log" onClose={() => setDialog(null)}>
          <div class="modal-log">
            <LogLines lines={snap.log} />
          </div>
        </Modal>
      )}
    </main>
  );
}

function statusText(s: GameSnapshot, foldArmed: boolean): string {
  if (s.waitingForRebuy) return s.bankrollEmpty ? "You are out of chips and your bankroll is empty." : "You are out of chips.";
  if (s.heroCanAct && s.legal) {
    if (foldArmed) return "Checking is free. Press Fold again to fold anyway.";
    return s.legal.canCheck ? "Your turn. You can check." : `Your turn. ${s.legal.callAmount} to call.`;
  }
  if (s.thinkingSeat !== null) return `${SEAT_NAMES[s.thinkingSeat]} is thinking…`;
  if (s.result) return s.result.heroNet > 0 ? `You won ${chips(s.result.heroNet)}. Next hand coming up.` : s.result.heroNet < 0 ? `You lost ${chips(-s.result.heroNet)}. Next hand coming up.` : "Next hand coming up.";
  if (s.canSkip) return "You are out of this hand.";
  if (!s.display) return "Shuffling…";
  return "…";
}

function LogLines({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div class="log-lines" ref={ref}>
      {lines.map((l, i) => (
        <p key={i} class={l.startsWith("Hand #") ? "log-line head" : l.startsWith("—") ? "log-line street" : / (wins?|split) /.test(l) ? "log-line win" : "log-line"}>
          {l}
        </p>
      ))}
    </div>
  );
}

function SeatView(props: {
  index: number;
  seat: DisplaySeat;
  hole: readonly [Card, Card] | null;
  thinking: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}) {
  const { index, seat, hole, thinking } = props;
  const v = seatVector(index);
  const isHero = index === HERO_SEAT;
  const lower = v.sin > 0.1;
  const side = v.cos > 0.3 ? " right" : v.cos < -0.3 ? " left" : "";
  const style = { "--cos": String(v.cos), "--sin": String(v.sin) } as Record<string, string>;
  const name = SEAT_NAMES[index];
  const showCards = !seat.folded;
  return (
    <div
      class={`seat${isHero ? " hero" : ""}${lower ? " lower" : " upper"}${side}${seat.folded ? " folded" : ""}${seat.won > 0 ? " winner" : ""}`}
      style={style}
      data-testid={`seat-${index}`}
      aria-label={`${name}, ${seat.stack} chips${seat.folded ? ", folded" : ""}`}
    >
      {isHero && hole && (
        <div class={`hero-cards${seat.folded ? " dim" : ""}`} data-testid="hole-cards">
          <CardFace card={hole[0]} size="hole" />
          <CardFace card={hole[1]} size="hole" />
        </div>
      )}
      <div class={`plate${thinking ? " thinking" : ""}`}>
        <div class="who">
          <span class="name">{name}</span>
          <span class="stack">{chips(seat.stack)}</span>
        </div>
        {!isHero && showCards && (
          <div class="mini-cards">
            {seat.revealed ? (
              <>
                <CardFace card={seat.revealed[0]} size="mini" />
                <CardFace card={seat.revealed[1]} size="mini" />
              </>
            ) : (
              <>
                <CardBack size="mini" />
                <CardBack size="mini" />
              </>
            )}
          </div>
        )}
        <div class="badges">
          {props.isButton && (
            <span class="badge dealer" title="Dealer button">
              D
            </span>
          )}
          {props.isSmallBlind && <span class="badge">SB</span>}
          {props.isBigBlind && <span class="badge">BB</span>}
        </div>
      </div>
      {seat.won > 0 ? (
        <span class="tag win-tag">
          <strong>+{chips(seat.won)}</strong>
          {seat.winningHand && <span class="win-hand">{seat.winningHand}</span>}
        </span>
      ) : (
        seat.lastAction && <span class={`tag${seat.folded ? " fold-tag" : ""}`}>{seat.lastAction}</span>
      )}
    </div>
  );
}

function BetChip({ index, amount }: { index: number; amount: number }) {
  const v = seatVector(index);
  const style = { "--cos": String(v.cos), "--sin": String(v.sin) } as Record<string, string>;
  return (
    <div class={`bet${index === HERO_SEAT ? " hero-bet" : ""}`} style={style} data-testid={`bet-${index}`}>
      <span class="chip-icon" aria-hidden="true" />
      {chips(amount)}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={`dialog-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <div class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="btn small" onClick={onClose} data-testid="dialog-close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsDialog(props: {
  snap: GameSnapshot;
  seed: string;
  confirmReset: boolean;
  onClose: () => void;
  onSpeed: (s: Speed) => void;
  onDepth: (d: StackDepth) => void;
  onReset: () => void;
}) {
  const { snap } = props;
  const canReset = !snap.handInProgress || snap.canSkip;
  return (
    <Modal title="Settings" onClose={props.onClose}>
      <fieldset class="setting">
        <legend>Stack depth</legend>
        <div class="segments" role="radiogroup" aria-label="Stack depth">
          {STACK_DEPTHS.map((depth) => (
            <button
              key={depth}
              type="button"
              role="radio"
              aria-checked={snap.settings.stackDepth === depth}
              class={`btn segment${snap.settings.stackDepth === depth ? " on" : ""}`}
              data-testid={`depth-${depth}`}
              onClick={() => props.onDepth(depth)}
            >
              {depth} bb
            </button>
          ))}
        </div>
        <p class="note">Blinds are 1/2. A new depth starts from the next hand, with fresh stacks for everyone.{snap.depthChangePending ? " It will apply at the next hand." : ""}</p>
      </fieldset>

      <fieldset class="setting">
        <legend>Bot speed</legend>
        <div class="segments" role="radiogroup" aria-label="Bot speed">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={snap.settings.speed === speed}
              class={`btn segment${snap.settings.speed === speed ? " on" : ""}`}
              data-testid={`speed-${speed}`}
              onClick={() => props.onSpeed(speed)}
            >
              {SPEED_LABELS[speed]}
            </button>
          ))}
        </div>
        <p class="note">Fast (the default) gives short pauses. Realistic is slower. Instant has no pauses.</p>
      </fieldset>

      <fieldset class="setting">
        <legend>Bankroll</legend>
        <p class="note">
          You own {chips(snap.wallet + snap.heroStack)} chips: {chips(snap.heroStack)} at the table and {chips(snap.wallet)} in your wallet. Rebuys come out of the wallet.
        </p>
        <button type="button" class="btn" data-testid="reset-bankroll" disabled={!canReset} onClick={props.onReset}>
          {props.confirmReset ? `Really reset to ${chips(STARTING_BANKROLL)}?` : "Reset bankroll"}
        </button>
      </fieldset>

      <p class="note">
        Keys: F fold · C check/call · R raise (then Enter, ↑ ↓, 1-5, Esc) · N next hand. Session seed {props.seed}.{" "}
        <a href="#/watch" onClick={props.onClose}>
          Watch the bots play
        </a>
      </p>
    </Modal>
  );
}
