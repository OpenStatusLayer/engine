import { runChecksOnce } from './runner.js';
import { config } from '../config.js';

/**
 * Starts a periodic check loop. Non-overlapping: waits for the previous pass to
 * finish before scheduling the next. Returns a stop() handle.
 */
export function startScheduler(log: (msg: string) => void = console.log): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      const summary = await runChecksOnce();
      log(`check pass: ${summary.checked} checked, ${summary.skipped} skipped`);
    } catch (err) {
      log(`check pass failed: ${(err as Error).message}`);
    }
    if (!stopped) timer = setTimeout(tick, config.checkIntervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
