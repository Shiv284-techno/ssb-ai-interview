import { cn } from "@/lib/cn";
import { AI_STATUS_META, type AiStatus } from "@/lib/interview/types";

interface AiStatusPillProps {
  status: AiStatus;
  className?: string;
}

export function AiStatusPill({ status, className }: AiStatusPillProps) {
  const meta = AI_STATUS_META[status];
  const isActive = status !== "ready";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
        meta.chip,
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {isActive && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-full opacity-70 animate-[ssb-ring_1.8s_ease-out_infinite]",
              meta.dot,
            )}
          />
        )}
        <span className={cn("relative h-2 w-2 rounded-full", meta.dot)} />
      </span>
      {meta.label}
    </span>
  );
}
