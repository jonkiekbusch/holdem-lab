import { describe, expect, it } from "vitest";
import { createController } from "../../src/ui/createController.ts";
import { parseRoute } from "../../src/ui/route.ts";

describe("reading the address", () => {
  it.each([
    ["", "/", ""],
    ["#", "/", ""],
    ["#/", "/", ""],
    ["#/watch", "/watch", ""],
    ["#/?seed=abc", "/", "seed=abc"],
    ["#/watch?x=1", "/watch", "x=1"],
    ["#?seed=abc", "/", "seed=abc"],
  ])("%j", (hash, path, query) => {
    const r = parseRoute(hash);
    expect(r.path).toBe(path);
    expect(r.params.toString()).toBe(query);
  });
});

describe("table options in the address", () => {
  const make = (q: string) => createController(new URLSearchParams(q));

  it("uses the seed given, so the same address deals the same cards", () => {
    expect(make("seed=abc").seed).toBe("abc");
    expect(make("seed=abc").getSnapshot().settings).toEqual({ stackDepth: 100, speed: "fast", potOdds: true });
  });

  it("makes a different random seed each time when none is given", () => {
    expect(make("").seed).not.toBe(make("").seed);
  });

  it("reads speed and stack depth, and ignores nonsense", () => {
    expect(make("speed=instant").getSnapshot().settings.speed).toBe("instant");
    expect(make("speed=warp").getSnapshot().settings.speed).toBe("fast");
    expect(make("stack=40").getSnapshot().settings.stackDepth).toBe(40);
    expect(make("stack=55").getSnapshot().settings.stackDepth).toBe(100);
  });

  it("starts with a chosen number of chips", () => {
    expect(make("hero=6").getSnapshot().heroStack).toBe(6);
    expect(make("hero=6").getSnapshot().wallet).toBe(9994);
    expect(make("hero=abc").getSnapshot().heroStack).toBe(200);
    expect(make("hero=-5").getSnapshot().heroStack).toBe(200);
  });
});
