"use client";

import { cn } from "@/lib/cn";

/**
 * The question grid.
 *
 * Numbered 1..46 in the order the server served them. Those numbers are
 * positions in this attempt, NOT positions in the source book — the four
 * questions the ingestion could not recover are simply not in the array, and a
 * candidate should never see a gap or a blank tile where one used to be.
 */

export type SaveState = "unsaved" | "saving" | "saved" | "failed";

interface OirNavigatorProps {
  readonly total: number;
  readonly currentIndex: number;
  readonly answeredIndexes: ReadonlySet<number>;
  readonly failedIndexes: ReadonlySet<number>;
  readonly onJump: (index: number) => void;
}

export function OirNavigator({
  total,
  currentIndex,
  answeredIndexes,
  failedIndexes,
  onJump,
}: OirNavigatorProps) {
  return (
    <nav aria-label="Questions" className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mb-2 text-xs text-slate-400">
        {answeredIndexes.size} of {total} answered
      </p>
      <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: total }, (_, index) => {
          const answered = answeredIndexes.has(index);
          const failed = failedIndexes.has(index);
          const current = index === currentIndex;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onJump(index)}
                aria-current={current ? "true" : undefined}
                aria-label={
                  `Question ${index + 1}` +
                  (answered ? ", answered" : ", not answered") +
                  (failed ? ", not saved" : "")
                }
                className={cn(
                  "h-8 w-full rounded text-xs font-medium tabular-nums transition",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70",
                  current
                    ? "bg-emerald-400 text-slate-950"
                    : failed
                      ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
                      : answered
                        ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-400/30"
                        : "bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10",
                )}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
