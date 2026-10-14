import type { Scheduler } from "../../src/game/controller.ts";

/** A fake clock: nothing runs until the test says so, and every requested delay is recorded. */
export class ManualScheduler implements Scheduler {
  delays: number[] = [];
  private queue: Array<{ id: number; at: number; fn: () => void }> = [];
  private nextId = 1;
  now = 0;

  set(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.delays.push(ms);
    this.queue.push({ id, at: this.now + ms, fn });
    return id;
  }

  clear(handle: unknown): void {
    this.queue = this.queue.filter((t) => t.id !== handle);
  }

  /** Runs the next timer. Returns false when there is none. */
  step(): boolean {
    if (this.queue.length === 0) return false;
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    const task = this.queue.shift()!;
    this.now = Math.max(this.now, task.at);
    task.fn();
    return true;
  }

  get pending(): number {
    return this.queue.length;
  }
}
