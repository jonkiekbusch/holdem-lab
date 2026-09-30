import { GameController } from "../game/controller.ts";
import { isSpeed, isStackDepth, type Settings } from "../game/settings.ts";
import { browserStore } from "../game/storage.ts";

function randomSeed(): string {
  try {
    const bytes = crypto.getRandomValues(new Uint32Array(2));
    return `s-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
  } catch {
    return `s-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Builds the game for the table screen. The address can carry a few options, which is how the
 * automated browser tests get repeatable hands and instant play:
 *   #/?seed=abc  fixed shuffles      #/?speed=instant  no pauses      #/?stack=40  stack depth in big blinds
 *   #/?hero=6    start with 6 chips  #/?gap=0          no wait between hands
 */
export function createController(params: URLSearchParams): GameController {
  const settings: Partial<Settings> = {};
  const speed = params.get("speed");
  if (isSpeed(speed)) settings.speed = speed;
  const stack = Number(params.get("stack"));
  if (isStackDepth(stack)) settings.stackDepth = stack;
  const hero = params.get("hero");
  const gap = params.get("gap");
  return new GameController({
    seed: params.get("seed") ?? randomSeed(),
    settings,
    store: browserStore(),
    heroStack: hero !== null && /^\d+$/.test(hero) ? Number(hero) : undefined,
    handGapMs: gap !== null && /^\d+$/.test(gap) ? Number(gap) : undefined,
  });
}
