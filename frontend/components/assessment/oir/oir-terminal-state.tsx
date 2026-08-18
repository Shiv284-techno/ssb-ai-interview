import Link from "next/link";

import { ShieldIcon, TimerIcon } from "@/components/icons";
import type { OirAttemptResult, OirAttemptStatus } from "@/lib/oir/client/attempt-client";

/**
 * What the candidate sees once the attempt is over.
 *
 * Two endings, told apart plainly: a paper handed in, and a clock that ran out.
 * Neither offers a way back in, because there is not one — the server refuses
 * both further answers and a second submission, and an interface that implied
 * otherwise would only produce a rejected request and a confused candidate.
 *
 * The marks are counts: how many questions were served, answered, right and
 * wrong. Deliberately nothing else — no correct answers, no explanations, no
 * per-question breakdown, and above all no reading of what any of it says about
 * the candidate. A board reaches that judgement over five days with trained
 * assessors; a tally of reasoning questions is not a shortcut to it, and a
 * screen that implied otherwise would be the lie.
 *
 * The result may be absent: it is fetched separately and the screen has to be
 * useful before it arrives, so the counts appear when they do and the outcome
 * is stated either way.
 */

interface OirTerminalStateProps {
  readonly status: Exclude<OirAttemptStatus, "in-progress">;
  readonly answeredCount: number;
  readonly questionCount: number;
  readonly submittedAt: string | null;
  /** Null until it has been fetched, or if it could not be. */
  readonly result: OirAttemptResult | null;
}

export function OirTerminalState({
  status,
  answeredCount,
  questionCount,
  submittedAt,
  result,
}: OirTerminalStateProps) {
  const submitted = status === "submitted";
  const figures: readonly { readonly label: string; readonly value: string }[] =
    result === null
      ? [
          { label: "Answered", value: `${answeredCount} / ${questionCount}` },
          {
            label: submitted ? "Submitted" : "Closed",
            value:
              submittedAt === null
                ? "—"
                : new Date(submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]
      : [
          { label: "Questions", value: String(result.questionCount) },
          { label: "Answered", value: String(result.answeredCount) },
          { label: "Correct", value: String(result.correctCount) },
          { label: "Incorrect", value: String(result.incorrectCount) },
          { label: "Unanswered", value: String(result.unansweredCount) },
          { label: "Score", value: `${result.score} / ${result.maxScore}` },
          { label: "Accuracy", value: `${result.accuracyPercent}%` },
        ];

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

      <dl className="grid w-full max-w-md grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <dt className="text-xs text-slate-400">{figure.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="max-w-md text-xs text-slate-500">
        {result === null
          ? "Your marks are being worked out."
          : "This counts reasoning questions answered correctly. It is not a measure of your suitability, and it is only one part of the selection procedure."}
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
