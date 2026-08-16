import { ShieldIcon, TimerIcon } from "@/components/icons";
import { formatDuration } from "@/lib/interview/format";
import type { InterviewPhase } from "@/lib/interview/types";

interface SessionHeaderProps {
  phase: InterviewPhase;
  elapsedSeconds: number;
  /** Display name only — never an id, email, or anything else identifying. */
  candidateName: string;
}

export function SessionHeader({
  phase,
  elapsedSeconds,
  candidateName,
}: SessionHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-slate-700 to-slate-900 text-emerald-300 ring-1 ring-white/15">
          <ShieldIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-white">
            SSB AI Interviewer
          </p>
          <p className="truncate text-xs text-slate-400">
            Personal Interview · Mock Board
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden max-w-[12rem] items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 sm:flex">
          <span className="truncate">{candidateName}</span>
        </span>

        {phase === "live" && (
          <span className="flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-200">
            <span className="h-2 w-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
            <span className="hidden sm:inline">Session live</span>
            <span className="sm:hidden">Live</span>
          </span>
        )}
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-100">
          <TimerIcon className="h-4 w-4 text-slate-400" />
          {formatDuration(elapsedSeconds)}
        </span>
      </div>
    </header>
  );
}
