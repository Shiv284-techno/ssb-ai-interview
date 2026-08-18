import Link from "next/link";

import { ShieldIcon, TimerIcon } from "@/components/icons";
import type { OirAttemptStatus } from "@/lib/oir/client/attempt-client";

/**
 * What the candidate sees once the attempt is over.
 *
 * Two endings, told apart plainly: a paper handed in, and a clock that ran out.
 * Neither offers a way back in, because there is not one — the server refuses
 * both further answers and a second submission, and an interface that implied
 * otherwise would only produce a rejected request and a confused candidate.
 *
 * Deliberately no score, no correct answers and no explanations. Marking is
 * Step 5C, and until it exists this screen says what happened and nothing more.
 */

interface OirTerminalStateProps {
  readonly status: Exclude<OirAttemptStatus, "in-progress">;
  readonly answeredCount: number;
  readonly questionCount: number;
  readonly submittedAt: string | null;
}

export function OirTerminalState({
  status,
  answeredCount,
  questionCount,
  submittedAt,
}: OirTerminalStateProps) {
  const submitted = status === "submitted";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <span
        className={
          submitted
            ? "grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
            : "grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
        }
      >
        {submitted ? <ShieldIcon className="h-7 w-7" /> : <TimerIcon className="h-7 w-7" />}
      </span>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">
          {submitted ? "Test submitted" : "Time's up"}
        </h1>
        <p className="text-sm text-slate-300">
          {submitted
            ? "Your answers have been recorded. They can no longer be changed."
            : "The 25 minutes have run out. Everything you answered before the deadline was kept, and your answers can no longer be changed."}
        </p>
      </div>

      <dl className="grid w-full max-w-sm grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <dt className="text-xs text-slate-400">Answered</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
            {answeredCount} / {questionCount}
          </dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <dt className="text-xs text-slate-400">{submitted ? "Submitted" : "Closed"}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
            {submittedAt === null
              ? "—"
              : new Date(submittedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-slate-500">
        Results are not available yet.
      </p>

      <Link
        href="/"
        className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        Back to start
      </Link>
    </main>
  );
}
