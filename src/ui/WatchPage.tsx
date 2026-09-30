import { useEffect, useRef, useState } from "preact/hooks";
import { formatHand } from "../engine/log.ts";
import { newWatchGame, playWatchHand, type WatchGame } from "../sim/watch.ts";

interface LoggedHand {
  number: number;
  seed: string;
  lines: string[];
  rebuys: string[];
}

const MAX_LOGGED = 40;

export function WatchPage() {
  const [seed, setSeed] = useState("demo");
  const [seedInput, setSeedInput] = useState("demo");
  const game = useRef<WatchGame>(newWatchGame("demo"));
  const [hands, setHands] = useState<LoggedHand[]>([]);
  const [auto, setAuto] = useState(false);
  const [, bump] = useState(0);

  const playHands = (count: number) => {
    const made: LoggedHand[] = [];
    for (let i = 0; i < count; i++) {
      const played = playWatchHand(game.current);
      if (!played) break;
      made.unshift({
        number: played.hand.config.handNumber,
        seed: played.hand.config.seed,
        lines: formatHand(played.hand, { showAllHoleCards: true }),
        rebuys: played.rebuys,
      });
    }
    setHands((prev) => [...made, ...prev].slice(0, MAX_LOGGED));
    bump((n) => n + 1);
  };

  const restart = (nextSeed: string) => {
    const clean = nextSeed.trim() || "demo";
    game.current = newWatchGame(clean);
    setSeed(clean);
    setSeedInput(clean);
    setHands([]);
    setAuto(false);
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => playHands(1), 1500);
    return () => clearInterval(id);
  }, [auto]);

  const seats = game.current.table.seats;

  return (
    <main class="watch">
      <header class="watch-header">
        <a class="back-link" href="#/">
          ← Table
        </a>
        <h1>Watch the bots play</h1>
      </header>

      <div class="watch-body">
        <section class="watch-controls-block">
          <p class="watch-note">
            Phase 2 check: simple placeholder bots play hands so you can spot-check the rules. Every player's cards are shown here; in the real game you only see your own.
          </p>

          <div class="watch-controls">
            <button type="button" class="btn primary" onClick={() => playHands(1)}>
              Play 1 hand
            </button>
            <button type="button" class="btn" onClick={() => playHands(10)}>
              Play 10 hands
            </button>
            <button type="button" class={`btn${auto ? " on" : ""}`} aria-pressed={auto} onClick={() => setAuto(!auto)}>
              {auto ? "Stop auto-play" : "Auto-play"}
            </button>
          </div>
        </section>

        <section class="watch-log" aria-label="Hand log" data-testid="hand-log">
          {hands.length === 0 && <p class="watch-note">Press “Play 1 hand” to deal the first hand.</p>}
          {hands.map((h) => (
            <article class="logged-hand" key={h.seed} data-testid="logged-hand">
              {h.rebuys.length > 0 && <p class="log-line rebuy">{h.rebuys.join(", ")} rebought for 200</p>}
              {h.lines.map((line, i) => (
                <p class={`log-line${line.startsWith("Hand #") ? " head" : line.startsWith("—") ? " street" : line.includes(" wins ") || line.includes(" split ") ? " win" : ""}`} key={i}>
                  {line}
                </p>
              ))}
            </article>
          ))}
        </section>

        <section class="watch-extras">
          <form
            class="seed-form"
            onSubmit={(e) => {
              e.preventDefault();
              restart(seedInput);
            }}
          >
            <label for="seed">Shuffle seed (same seed = same hands)</label>
            <div class="seed-row">
              <input id="seed" type="text" value={seedInput} onInput={(e) => setSeedInput((e.target as HTMLInputElement).value)} />
              <button type="submit" class="btn">
                Restart
              </button>
            </div>
            <span class="seed-current">Current seed: {seed}</span>
          </form>

          <table class="stacks" aria-label="Stacks">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Player</th>
                <th class="num">Chips</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{s?.name ?? "—"}</td>
                  <td class="num">{s?.stack ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="watch-note">Blinds 1/2. A player who goes broke rebuys 200 chips before the next hand.</p>
        </section>
      </div>
    </main>
  );
}
