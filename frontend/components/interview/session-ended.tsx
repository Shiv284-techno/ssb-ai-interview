import { formatDuration } from "@/lib/interview/format";

interface SessionEndedProps {
  durationSeconds: number;
  questionsCovered: number;
  totalQuestions: number;
}

export function SessionEnded({
  durationSeconds,
  questionsCovered,
  totalQuestions,
}: SessionEndedProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Interview ended
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          That concludes the mock board. Take a moment to note what you would say
          differently before running it again.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Duration
            </dt>
            <dd className="mt-2 font-mono text-2xl tabular-nums text-white">
              {formatDuration(durationSeconds)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Questions
            </dt>
            <dd className="mt-2 font-mono text-2xl tabular-nums text-white">
              {questionsCovered}
              <span className="text-slate-500">/{totalQuestions}</span>
            </dd>
          </div>
        </dl>

        <p className="mt-8 border-t border-white/5 pt-5 text-xs leading-relaxed text-slate-500">
          Scoring and feedback are not part of this preview build.
        </p>
      </div>
    </main>
  );
}
