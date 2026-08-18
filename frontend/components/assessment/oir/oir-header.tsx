import { ShieldIcon, TimerIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/interview/format";

/** Under this many seconds the countdown starts warning. */
const WARNING_SECONDS = 120;
const CRITICAL_SECONDS = 30;

interface OirHeaderProps {
  readonly questionNumber: number;
  readonly questionCount: number;
  readonly answeredCount: number;
  readonly remainingSeconds: number;
  /** Hidden once the attempt has settled — there is nothing left to count. */
  readonly showCountdown: boolean;
}

export function OirHeader({
  questionNumber,
  questionCount,
  answeredCount,
  remainingSeconds,
  showCountdown,
}: OirHeaderProps) {
  const warning = remainingSeconds <= WARNING_SECONDS;
  const critical = remainingSeconds <= CRITICAL_SECONDS;
  const progress = questionCount === 0 ? 0 : Math.round((answeredCount / questionCount) * 100);

  return (
    <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-slate-700 to-slate-900 text-emerald-300 ring-1 ring-white/15">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-white">
              Officer Intelligence Rating
            </p>
            <p className="truncate text-xs text-slate-400">
              Question {questionNumber} / {questionCount} · {answeredCount} answered
            </p>
          </div>
        </div>

        {showCountdown && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-sm tabular-nums",
              critical
                ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                : warning
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                  : "border-white/10 bg-white/5 text-slate-100",
            )}
          >
            <TimerIcon className="h-4 w-4 opacity-70" />
            {/* Announced politely so a screen reader is not interrupted every
                second, and assertively only in the final seconds. */}
            <span
              aria-live={critical ? "assertive" : "polite"}
              aria-atomic="true"
              aria-label={`Time remaining ${formatDuration(remainingSeconds)}`}
            >
              {formatDuration(remainingSeconds)}
            </span>
          </div>
        )}
      </div>

      <div className="h-1 w-full bg-white/5" role="presentation">
        <div
          className="h-full bg-emerald-400/70 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
  );
}
