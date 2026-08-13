import type { RefObject } from "react";

import {
  AlertIcon,
  CameraIcon,
  CameraOffIcon,
  MicOffIcon,
} from "@/components/icons";
import type { CameraError, CameraStatus } from "@/hooks/use-camera";
import { cn } from "@/lib/cn";

interface CameraPanelProps {
  cameraStatus: CameraStatus;
  cameraError: CameraError | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  micOn: boolean;
  onToggleCamera: () => void;
  onRetryCamera: () => void;
  candidateName?: string;
}

const STATUS_INDICATOR: Record<
  CameraStatus,
  { label: string; dot: string }
> = {
  active: {
    label: "Camera on",
    dot: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]",
  },
  requesting: { label: "Starting camera…", dot: "bg-amber-400" },
  error: { label: "Camera error", dot: "bg-rose-500" },
  idle: { label: "Camera off", dot: "bg-rose-500" },
};

export function CameraPanel({
  cameraStatus,
  cameraError,
  videoRef,
  micOn,
  onToggleCamera,
  onRetryCamera,
  candidateName = "You",
}: CameraPanelProps) {
  const isActive = cameraStatus === "active";
  const indicator = STATUS_INDICATOR[cameraStatus];

  return (
    <section
      aria-label="Candidate camera preview"
      className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 lg:aspect-auto lg:h-full lg:min-h-0 lg:shrink"
    >
      {/* Room backdrop: a soft key light falling from above, as a webcam feed would show. */}
      <div className="absolute inset-0 bg-[radial-gradient(115%_85%_at_50%_-15%,#243449_0%,#111c2e_45%,#05080f_100%)]" />

      {/* The video element stays mounted so the stream can attach the moment it arrives. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-300",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.55)_100%)]" />

      {cameraStatus === "requesting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/60 px-6 text-center">
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-white/80"
          />
          <p className="text-sm font-medium text-slate-200">
            Starting camera…
          </p>
          <p className="max-w-xs text-xs text-slate-400">
            Allow camera access in your browser to appear before the board.
          </p>
        </div>
      )}

      {cameraStatus === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 px-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300">
            <CameraOffIcon className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-slate-200">Camera is off</p>
          <p className="max-w-xs text-xs text-slate-400">
            The board can still hear you. Turn the camera back on to be seen.
          </p>
        </div>
      )}

      {cameraStatus === "error" && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-6 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-300">
            <AlertIcon className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-slate-100">
            Camera unavailable
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-400">
            {cameraError?.message ??
              "The camera failed to start. Please try again."}
          </p>
          <button
            type="button"
            onClick={onRetryCamera}
            className="mt-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Try again
          </button>
        </div>
      )}

      {/* Viewfinder framing marks */}
      <div className="pointer-events-none absolute inset-4 sm:inset-5">
        <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-md border-l-2 border-t-2 border-white/20" />
        <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-md border-r-2 border-t-2 border-white/20" />
        <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-md border-b-2 border-l-2 border-white/20" />
        <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-md border-b-2 border-r-2 border-white/20" />
      </div>

      {/* Status + inline camera control */}
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur"
            role="status"
          >
            <span className={cn("h-2 w-2 rounded-full", indicator.dot)} />
            {indicator.label}
          </span>

          {!micOn && (
            <span className="flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 backdrop-blur">
              <MicOffIcon className="h-3.5 w-3.5" />
              Muted
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCamera}
          aria-pressed={isActive}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400",
            isActive
              ? "border-white/15 bg-black/55 text-slate-100 hover:bg-black/75"
              : "border-rose-400/30 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
          )}
        >
          {isActive ? (
            <CameraIcon className="h-4 w-4" />
          ) : (
            <CameraOffIcon className="h-4 w-4" />
          )}
          Camera
        </button>
      </div>

      {/* Candidate name plate */}
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-4 sm:bottom-4">
        <span className="rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-medium text-slate-100 backdrop-blur">
          {candidateName}
          <span className="ml-2 text-xs font-normal text-slate-400">
            Candidate
          </span>
        </span>
      </div>
    </section>
  );
}
