"use client";

import { useEffect, useState } from "react";

/**
 * Seconds left until the server's deadline.
 *
 * Derived from `expiresAt` and the wall clock on every tick rather than counted
 * down from a starting number. That distinction is the whole point: a decrementing
 * counter drifts when the tab is throttled, stops when the machine sleeps, and
 * can be nudged by anything that touches its state — whereas subtracting from a
 * fixed deadline gives the same answer after a five-minute sleep as it would
 * have if the tab had stayed awake.
 *
 * It is display only. Reaching zero here tells the UI to stop offering controls
 * and re-ask the server; it does not decide that the attempt has expired, and
 * nothing in it can move the deadline.
 */
export function useRemainingSeconds(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;

    const tick = () => setNow(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 500);
    // A throttled background tab may not have ticked for minutes; re-read the
    // clock the instant it comes back rather than showing a stale number.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [expiresAt]);

  if (expiresAt === null) return 0;
  const deadline = Date.parse(expiresAt);
  if (Number.isNaN(deadline)) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
