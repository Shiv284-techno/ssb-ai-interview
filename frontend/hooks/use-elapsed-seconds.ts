"use client";

import { useEffect, useState } from "react";

/**
 * Seconds elapsed since `startedAt`, or 0 when the session is not running.
 * Derived from the wall clock on every tick so the timer stays accurate even if
 * the tab is throttled in the background.
 */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;

    const intervalId = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
