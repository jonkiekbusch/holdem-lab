import { expect, test, type Page, type TestInfo } from "@playwright/test";

// These run at every screen size in playwright.config.ts.
// The address options give repeatable hands (seed) and no waiting (speed=instant, gap=0).
const FAST = "/#/?seed=e2e&speed=instant&gap=0";
const HOLD = "/#/?seed=e2e&speed=instant&gap=999999"; // the result stays on screen

const isTouch = (info: TestInfo): boolean => /^(phone|tablet)/.test(info.project.name);

async function waitForTurn(page: Page): Promise<"turn" | "broke"> {
  const handle = await page.waitForFunction(
    () => {
      const g = document.querySelector('[data-testid="game"]');
      if (g?.getAttribute("data-hero-turn") === "yes") return "turn";
      const status = document.querySelector('[data-testid="status"]')?.textContent ?? "";
      if (status.includes("out of chips")) return "broke";
      return false;
    },
    null,
    { timeout: 20_000 },
  );
  return (await handle.jsonValue()) as "turn" | "broke";
}

const handsPlayed = async (page: Page): Promise<number> => Number(await page.getByTestId("game").getAttribute("data-hands-played"));

/** Rebuy (or reset) with the keyboard: focus the button and press Enter. */
async function recover(page: Page, withKeyboard: boolean): Promise<void> {
  const button = (await page.getByTestId("btn-reset").count()) > 0 ? page.getByTestId("btn-reset") : page.getByTestId("btn-rebuy");
  if (withKeyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else {
    await button.click();
  }
}

/** Chips the hero has in front of them on this street (0 if none). */
async function heroBet(page: Page): Promise<number> {
  const chip = page.getByTestId("bet-0");
  if ((await chip.count()) === 0) return 0;
  return Number(((await chip.textContent()) ?? "0").replace(/[^\d]/g, "") || 0);
}

async function rectOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  return box!;
}
const inside = (b: { x: number; y: number; width: number; height: number }, vp: { width: number; height: number }) =>
  b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("the table fits every screen", () => {
  test("nothing scrolls, nothing is cut off, nothing overlaps, and the controls are all on screen", async ({ page }, info) => {
    await page.goto(HOLD);
    expect(await waitForTurn(page)).toBe("turn");
    const vp = page.viewportSize()!;

    // The page itself never scrolls during a hand.
    const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
    expect(scroll.x).toBeLessThanOrEqual(0);
    expect(scroll.y).toBeLessThanOrEqual(1);

    // Every seat and your cards are fully on screen, and no two of them overlap.
    const plates = [];
    for (let i = 0; i < 6; i++) {
      const b = await rectOf(page, `[data-testid="seat-${i}"] .plate`);
      expect(inside(b, vp), `seat ${i}`).toBe(true);
      plates.push(b);
    }
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) expect(overlaps(plates[i], plates[j]), `seats ${i} and ${j}`).toBe(false);
    const hole = await rectOf(page, '[data-testid="hole-cards"]');
    const board = await rectOf(page, '[data-testid="board"]');
    const felt = await rectOf(page, '[data-testid="table"]');
    expect(inside(hole, vp)).toBe(true);
    expect(inside(board, vp)).toBe(true);
    expect(inside(felt, vp)).toBe(true);
    for (let i = 1; i < 6; i++) {
      expect(overlaps(hole, plates[i]), `your cards and seat ${i}`).toBe(false);
      expect(overlaps(board, plates[i]), `board and seat ${i}`).toBe(false);
    }
    expect(overlaps(hole, board)).toBe(false);

    // Every control is on screen without scrolling, and big enough to press.
    for (const id of ["btn-fold", "btn-checkcall", "btn-raise", "raise-slider", "raise-input", "quick-0", "quick-4", "btn-next-hand", "settings-button"]) {
      const b = await rectOf(page, `[data-testid="${id}"]`);
      expect(inside(b, vp), id).toBe(true);
    }
    for (const id of ["btn-fold", "btn-checkcall", "btn-raise"]) {
      const b = await rectOf(page, `[data-testid="${id}"]`);
      expect(b.height).toBeGreaterThanOrEqual(isTouch(info) ? 38 : 36);
      expect(b.width).toBeGreaterThanOrEqual(60);
    }
  });

  test("uses the space it has: a wide window gets a wide table and a side panel, a tall one a tall table", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const vp = page.viewportSize()!;
    const felt = await rectOf(page, '[data-testid="table"]');
    const panel = await rectOf(page, '[data-testid="action-bar"]');
    const wideLayout = vp.width >= 900 && vp.width / vp.height >= 1.1;
    if (wideLayout) {
      expect(felt.width).toBeGreaterThan(felt.height * 1.4); // a wide oval
      expect(panel.x).toBeGreaterThan(vp.width * 0.55); // controls sit beside the table, not under it
      expect(panel.width).toBeLessThanOrEqual(360);
      expect(felt.width).toBeGreaterThan((vp.width - panel.width) * 0.8); // and the table fills the rest
    } else {
      expect(felt.height).toBeGreaterThan(felt.width); // a tall oval
      expect(panel.y).toBeGreaterThan(vp.height * 0.45); // controls sit under the table, in thumb reach
      expect(panel.width).toBeGreaterThan(vp.width * 0.95);
    }
  });

  test("shows the keyboard hints on the buttons only where there is a keyboard", async ({ page }, info) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const visible = await page.locator('[data-testid="btn-fold"] kbd').isVisible();
    expect(visible).toBe(!isTouch(info));
  });

  test("the four suits are four different colors", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const colors = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const suit of ["spades", "hearts", "diamonds", "clubs"]) {
        const el = document.createElement("span");
        el.className = `card face board ${suit}`;
        document.body.appendChild(el);
        out[suit] = getComputedStyle(el).color;
        el.remove();
      }
      return out;
    });
    expect(new Set(Object.values(colors)).size).toBe(4);
  });
});

test.describe("playing hands", () => {
  test("plays 20 hands by clicking and tapping", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(FAST);
    let decisions = 0;
    let raised = 0;
    let folded = 0;
    while ((await handsPlayed(page)) < 20) {
      if ((await waitForTurn(page)) === "broke") {
        await recover(page, false);
        continue;
      }
      decisions++;
      const canRaise = await page.getByTestId("btn-raise").isEnabled();
      if (decisions % 6 === 0 && canRaise) {
        await page.getByTestId(`quick-${decisions % 3}`).click(); // 1/3, 1/2, 2/3 (or 2.5x, 3x, 4x)
        await page.getByTestId("btn-raise").click();
        raised++;
      } else if (decisions % 7 === 0) {
        const label = (await page.getByTestId("btn-fold").textContent()) ?? "";
        await page.getByTestId("btn-fold").click();
        if (await page.getByTestId("btn-fold").getByText("Fold anyway?").count()) await page.getByTestId("btn-fold").click(); // check was free
        folded++;
        expect(label).toContain("Fold");
      } else {
        await page.getByTestId("btn-checkcall").click();
      }
    }
    expect(await handsPlayed(page)).toBeGreaterThanOrEqual(20);
    expect(raised).toBeGreaterThan(0);
    expect(folded).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    // The hand log recorded what happened.
    await expect(page.getByTestId("game")).toHaveAttribute("data-hand-number", /\d+/);
  });

  test("plays 20 hands using only the keyboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(FAST);
    let decisions = 0;
    let raises = 0;
    while ((await handsPlayed(page)) < 20) {
      if ((await waitForTurn(page)) === "broke") {
        await recover(page, true);
        continue;
      }
      decisions++;
      const canRaise = await page.getByTestId("btn-raise").isEnabled();
      if (decisions % 5 === 0 && canRaise) {
        await page.keyboard.press("r"); // opens the amount
        await page.keyboard.press(String((decisions % 3) + 1)); // a quick size
        await page.keyboard.press("ArrowUp"); // one big blind more
        await page.keyboard.press("Enter"); // confirm
        raises++;
      } else if (decisions % 8 === 0 && canRaise) {
        await page.keyboard.press("r");
        await page.keyboard.press("Escape"); // change of mind
        await page.keyboard.press("c");
      } else if (decisions % 7 === 0) {
        await page.keyboard.press("f");
        if ((await page.getByTestId("btn-fold").textContent())?.includes("Fold anyway?")) await page.keyboard.press("f");
      } else {
        await page.keyboard.press("c");
      }
    }
    expect(await handsPlayed(page)).toBeGreaterThanOrEqual(20);
    expect(raises).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("F when checking is free asks first; a second F folds", async ({ page }) => {
    await page.goto(FAST);
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      if ((await waitForTurn(page)) === "broke") {
        await recover(page, false);
        continue;
      }
      if ((await page.getByTestId("btn-checkcall").textContent())?.startsWith("Check")) {
        found = true;
        const hand = await page.getByTestId("game").getAttribute("data-hand-number");
        await page.keyboard.press("f");
        await expect(page.getByTestId("btn-fold")).toContainText("Fold anyway?");
        await expect(page.getByTestId("status")).toContainText("Checking is free");
        expect(await page.getByTestId("game").getAttribute("data-hero-turn")).toBe("yes"); // nothing happened yet
        await page.keyboard.press("f");
        await expect(page.getByTestId("game")).not.toHaveAttribute("data-hero-turn", "yes");
        expect(hand).not.toBeNull();
      } else {
        await page.keyboard.press("c");
      }
    }
    expect(found).toBe(true);
  });

  test("the raise keys: R opens the amount, 1-5 pick a size, arrows nudge it, Esc cancels, Enter confirms", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const amount = page.getByTestId("raise-input");
    const start = Number(await amount.inputValue());
    const roomForHint = page.viewportSize()!.height > 520; // very short windows hide the hint line to save space
    await page.keyboard.press("r");
    await expect(page.locator(".sizing.open")).toHaveCount(1);
    if (roomForHint) await expect(page.getByText("Enter to confirm")).toBeVisible();
    await page.keyboard.press("3");
    const third = Number(await amount.inputValue());
    expect(third).toBeGreaterThan(start);
    await expect(page.getByTestId("btn-raise")).toContainText(`${third}`);
    await page.keyboard.press("ArrowUp");
    expect(Number(await amount.inputValue())).toBe(third + 2);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect(Number(await amount.inputValue())).toBe(third - 2);
    await page.keyboard.press("Escape");
    expect(Number(await amount.inputValue())).toBe(start);
    await expect(page.locator(".sizing.open")).toHaveCount(0);
    await page.keyboard.press("4");
    const fourth = Number(await amount.inputValue());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-testid="game"]')?.getAttribute("data-hero-turn") !== "yes");
    // Your raise went in for exactly the amount shown (an all-in if it left a sliver behind).
    const bet = await heroBet(page);
    if (bet > 0) expect(bet).toBe(fourth);
  });

  test("typing an amount works, and the near-all-in rule turns a sliver-leaving raise into all-in", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const input = page.getByTestId("raise-input");
    await input.fill("197"); // leaves 3 chips behind (stack 200, blinds 1/2): less than 2 big blinds
    await input.blur();
    await expect(page.getByTestId("btn-raise")).toContainText(/All-in/);
    await input.fill("12");
    await input.blur();
    await expect(page.getByTestId("btn-raise")).toContainText("Raise to 12");
    await input.fill("99999");
    await input.blur();
    await expect(page.getByTestId("btn-raise")).toContainText(/All-in/);
  });

  test("the quick-size buttons set the amount, and the last one is all-in", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const amount = page.getByTestId("raise-input");
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.getByTestId(`quick-${i}`).click();
      values.push(Number(await amount.inputValue()));
    }
    for (const v of values) expect(v).toBeGreaterThan(0);
    const max = Number(await page.getByTestId("raise-slider").getAttribute("max"));
    expect(values[4]).toBe(max);
    await expect(page.getByTestId("btn-raise")).toContainText("All-in");
  });

  test("N (or the button) skips ahead after you fold", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const before = Number(await page.getByTestId("game").getAttribute("data-hand-number"));
    await page.keyboard.press("f");
    if ((await page.getByTestId("btn-fold").textContent())?.includes("Fold anyway?")) await page.keyboard.press("f");
    await expect(page.getByTestId("btn-next-hand")).toBeEnabled({ timeout: 10_000 });
    await page.keyboard.press("n");
    await expect(page.getByTestId("game")).toHaveAttribute("data-hand-number", String(before + 1));
  });

  test("shows the result and what each seat won", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    await page.getByTestId("btn-checkcall").click();
    // keep calling until the hand ends
    for (let i = 0; i < 40 && (await page.getByTestId("result").count()) === 0; i++) {
      const turn = await page.getByTestId("game").getAttribute("data-hero-turn");
      if (turn === "yes") await page.getByTestId("btn-checkcall").click();
      else await page.waitForTimeout(50);
    }
    await expect(page.getByTestId("result")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText(/You (won|lost)|Next hand/);
    expect(await page.locator(".seat.winner").count()).toBeGreaterThan(0);
  });
});

test.describe("settings, bankroll and rebuys", () => {
  test("stack depth: 40bb means 80-chip stacks from the next hand", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    await page.getByTestId("settings-button").click();
    await page.getByTestId("depth-40").click();
    await expect(page.getByTestId("depth-40")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("f");
    if ((await page.getByTestId("btn-fold").textContent())?.includes("Fold anyway?")) await page.keyboard.press("f");
    await expect(page.getByTestId("btn-next-hand")).toBeEnabled({ timeout: 10_000 });
    const worth = async () => Number(await page.getByTestId("wallet").textContent().then((t) => t!.replace(/,/g, ""))) + Number((await page.getByTestId("hero-stack").textContent())!.replace(/,/g, ""));
    await page.keyboard.press("n");
    await waitForTurn(page);
    // your stack (plus any blind already posted) is exactly 80 chips
    const stack = Number((await page.locator('[data-testid="seat-0"] .stack').textContent())!.replace(/,/g, ""));
    expect(stack + (await heroBet(page))).toBe(80);
    expect(await worth()).toBeGreaterThan(9_000); // the rest of your chips are in the wallet
  });

  test("the speed choice is remembered after a reload", async ({ page }) => {
    await page.goto("/#/?seed=remember&gap=999999");
    await page.getByTestId("settings-button").click();
    await page.getByTestId("speed-realistic").click();
    await expect(page.getByTestId("speed-realistic")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("dialog-close").click();
    await page.reload();
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("speed-realistic")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("speed-fast")).toHaveAttribute("aria-checked", "false");
  });

  test("the default speed is Fast", async ({ page }) => {
    await page.goto("/#/?seed=default&gap=999999");
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("speed-fast")).toHaveAttribute("aria-checked", "true");
  });

  test("keyboard shortcuts are switched off while a dialog is open", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    await page.getByTestId("settings-button").click();
    await page.keyboard.press("c");
    await page.keyboard.press("f");
    await expect(page.getByTestId("game")).toHaveAttribute("data-hero-turn", "yes");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("c");
    await expect(page.getByTestId("game")).not.toHaveAttribute("data-hero-turn", "yes", { timeout: 10_000 });
  });

  test("going broke offers a rebuy, and the rebuy comes out of the wallet", async ({ page }) => {
    await page.goto("/#/?seed=broke&speed=instant&gap=0&hero=6");
    const walletBefore = Number((await page.getByTestId("wallet").textContent())!.replace(/,/g, ""));
    expect(walletBefore).toBe(9_994);
    let broke = false;
    for (let i = 0; i < 80 && !broke; i++) {
      if ((await waitForTurn(page)) === "broke") {
        broke = true;
        break;
      }
      if (await page.getByTestId("btn-raise").isEnabled()) {
        await page.getByTestId("quick-4").click(); // all-in
        await page.getByTestId("btn-raise").click();
      } else {
        await page.getByTestId("btn-checkcall").click();
      }
    }
    expect(broke).toBe(true);
    await expect(page.getByTestId("btn-rebuy")).toBeVisible();
    await expect(page.getByTestId("btn-rebuy")).toContainText("Rebuy 200");
    const wallet = Number((await page.getByTestId("wallet").textContent())!.replace(/,/g, ""));
    await page.getByTestId("btn-rebuy").click();
    await waitForTurn(page);
    const after = Number((await page.getByTestId("wallet").textContent())!.replace(/,/g, ""));
    expect(after).toBe(wallet - 200);
    const stack = Number((await page.locator('[data-testid="seat-0"] .stack').textContent())!.replace(/,/g, ""));
    expect(stack + (await heroBet(page))).toBe(200);
  });

  test("Reset bankroll waits until you are out of the hand, then asks twice", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("reset-bankroll")).toBeDisabled(); // you still have a decision to make
    await page.keyboard.press("Escape");
    await page.keyboard.press("f");
    if ((await page.getByTestId("btn-fold").textContent())?.includes("Fold anyway?")) await page.keyboard.press("f");
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("reset-bankroll")).toBeEnabled();
    await page.getByTestId("reset-bankroll").click();
    await expect(page.getByTestId("reset-bankroll")).toContainText("Really reset");
    await page.getByTestId("reset-bankroll").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("session-net")).toHaveText("0");
    await page.keyboard.press("n");
    await waitForTurn(page);
  });
});

test.describe("the speed setting", () => {
  /** Clicks Check/Call and measures, inside the page, how long until the table moves on (our turn again, a new street, or a new hand). */
  async function timeToNextStep(page: Page, speed: string): Promise<number> {
    await page.goto(`/#/?seed=pace&speed=${speed}&gap=999999`);
    await waitForTurn(page);
    return page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const g = document.querySelector('[data-testid="game"]')!;
          const hand = g.getAttribute("data-hand-number");
          const street = g.getAttribute("data-street");
          const t0 = performance.now();
          let sawNo = false;
          const check = (): void => {
            const turn = g.getAttribute("data-hero-turn");
            if (turn === "no") sawNo = true;
            if (g.getAttribute("data-hand-number") !== hand || g.getAttribute("data-street") !== street || (sawNo && turn === "yes")) {
              observer.disconnect();
              resolve(performance.now() - t0);
            }
          };
          const observer = new MutationObserver(check);
          observer.observe(g, { attributes: true });
          (document.querySelector('[data-testid="btn-checkcall"]') as HTMLElement).click();
        }),
    );
  }

  test("Fast pauses for the bots, Instant does not", async ({ browser }) => {
    const fast = await browser.newPage({ viewport: { width: 1280, height: 700 } });
    const instant = await browser.newPage({ viewport: { width: 1280, height: 700 } });
    const tFast = await timeToNextStep(fast, "fast");
    const tInstant = await timeToNextStep(instant, "instant");
    await fast.close();
    await instant.close();
    expect(tInstant).toBeLessThan(700);
    expect(tFast).toBeGreaterThan(tInstant + 500);
    expect(tFast).toBeLessThan(12_000); // and it never drags
  });

  test("a bot is shown thinking in Fast mode", async ({ page }) => {
    await page.goto("/#/?seed=pace&speed=fast&gap=999999");
    await waitForTurn(page);
    await page.getByTestId("btn-checkcall").click();
    await expect(page.locator(".plate.thinking").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("pot odds on the Call button", () => {
  /** Plays on until the Call button has a price (not "Check"). */
  async function untilFacingBet(page: Page): Promise<void> {
    for (let i = 0; i < 40; i++) {
      await waitForTurn(page);
      if (!((await page.getByTestId("btn-checkcall").textContent()) ?? "").startsWith("Check")) return;
      await page.getByTestId("btn-checkcall").click();
    }
    throw new Error("Never faced a bet");
  }

  test("is on by default, small, and shows the share of the pot you need", async ({ page }) => {
    await page.goto(HOLD);
    await untilFacingBet(page);
    const odds = page.getByTestId("pot-odds");
    await expect(odds).toBeVisible();
    await expect(odds).toHaveText(/^needs \d{1,3}%$/);
    // It is small and sits inside the button without making it grow.
    const call = (await page.getByTestId("btn-checkcall").boundingBox())!;
    const o = (await odds.boundingBox())!;
    expect(o.y).toBeGreaterThanOrEqual(call.y);
    expect(o.y + o.height).toBeLessThanOrEqual(call.y + call.height);
    expect(call.height).toBeLessThan(80);
    // The number matches the call and the pot shown in the status line and pot label.
    const status = (await page.getByTestId("status").textContent()) ?? "";
    const toCall = Number(/(\d+) to call/.exec(status)?.[1]);
    const pot = Number(((await page.getByTestId("pot").textContent()) ?? "").replace(/[^\d]/g, ""));
    expect(toCall).toBeGreaterThan(0);
    const shown = Number(/(\d+)%/.exec((await odds.textContent())!)![1]);
    expect(Math.abs(shown - (100 * toCall) / (pot + toCall))).toBeLessThanOrEqual(1);
  });

  test("is not shown when checking is free", async ({ page }) => {
    await page.goto(HOLD);
    for (let i = 0; i < 40; i++) {
      await waitForTurn(page);
      if (((await page.getByTestId("btn-checkcall").textContent()) ?? "").startsWith("Check")) break;
      await page.getByTestId("btn-checkcall").click();
    }
    await expect(page.getByTestId("btn-checkcall")).toContainText("Check");
    await expect(page.getByTestId("pot-odds")).toHaveCount(0);
  });

  test("can be switched off in Settings, and stays off after a reload", async ({ page }) => {
    await page.goto("/#/?seed=e2e&speed=instant&gap=999999");
    await untilFacingBet(page);
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("pot-odds-toggle")).toBeChecked();
    await page.getByTestId("pot-odds-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pot-odds")).toHaveCount(0);
    await page.reload();
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("pot-odds-toggle")).not.toBeChecked();
    await page.keyboard.press("Escape");
    await untilFacingBet(page);
    await expect(page.getByTestId("pot-odds")).toHaveCount(0);
    // and back on again
    await page.getByTestId("settings-button").click();
    await page.getByTestId("pot-odds-toggle").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pot-odds")).toBeVisible();
  });
});

test.describe("the hand log", () => {
  test("is in the side panel on wide windows and behind the Log button on narrow ones", async ({ page }) => {
    await page.goto(HOLD);
    await waitForTurn(page);
    const vp = page.viewportSize()!;
    const wideLayout = vp.width >= 900 && vp.width / vp.height >= 1.1;
    const tall = vp.height > 520;
    if (wideLayout) {
      await expect(page.getByTestId("log-button")).toBeHidden();
      if (tall) await expect(page.getByTestId("panel-log")).toContainText("Hand #");
    } else {
      await page.getByRole("button", { name: "Log" }).click();
      await expect(page.getByRole("dialog")).toContainText("Hand #");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
});
