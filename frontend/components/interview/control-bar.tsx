"use client";

import { useState } from "react";

import {
  CameraIcon,
  CameraOffIcon,
  EndCallIcon,
  MicIcon,
  MicOffIcon,
  PlayIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import type { InterviewPhase } from "@/lib/interview/types";

interface ControlBarProps {
  phase: InterviewPhase;
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onStart: () => void;
  onEnd: () => void;
}

export function ControlBar({
  phase,
  cameraOn,
  micOn,
  onToggleCamera,
  onToggleMic,
  onStart,
  onEnd,
}: ControlBarProps) {
  const isLive = phase === "live";
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      // No body, no identity — the server clears the cookie it already has.
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setIsLoggingOut(false);
        setLogoutError("Could not log out. Please try again.");
        return;
      }

      // A full document load, so the camera stream, microphone, and interview
      // state are torn down rather than left running behind a client-side
      // navigation. Stays disabled while the browser navigates away.
      window.location.replace("/login");
    } catch {
      setIsLoggingOut(false);
      setLogoutError("Unable to connect. Please try again.");
    }
  };

  return (
    <footer className="sticky bottom-0 z-20 border-t border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 sm:gap-5">
        <ToggleControl
          label="Microphone"
          active={micOn}
          onClick={onToggleMic}
          activeIcon={<MicIcon className="h-5 w-5" />}
          inactiveIcon={<MicOffIcon className="h-5 w-5" />}
        />
        <ToggleControl
          label="Camera"
          active={cameraOn}
          onClick={onToggleCamera}
          activeIcon={<CameraIcon className="h-5 w-5" />}
          inactiveIcon={<CameraOffIcon className="h-5 w-5" />}
        />

        <span
          aria-hidden="true"
          className="mx-1 hidden h-10 w-px bg-white/10 sm:block"
        />

        {isLive ? (
          <button
            type="button"
            onClick={onEnd}
            className="flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/40 transition-colors hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
          >
            <EndCallIcon className="h-5 w-5" />
            End interview
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            <PlayIcon className="h-5 w-5" />
            {phase === "ended" ? "Start new session" : "Start interview"}
          </button>
        )}

        <span
          aria-hidden="true"
          className="mx-1 hidden h-10 w-px bg-white/10 sm:block"
        />

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? "Logging out..." : "Log out"}
        </button>
      </div>

      {logoutError && (
        <p
          role="alert"
          className="mx-auto mt-3 max-w-5xl text-center text-xs text-rose-300"
        >
          {logoutError}
        </p>
      )}
    </footer>
  );
}

interface ToggleControlProps {
  label: string;
  active: boolean;
  onClick: () => void;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
}

function ToggleControl({
  label,
  active,
  onClick,
  activeIcon,
  inactiveIcon,
}: ToggleControlProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${label}: ${active ? "on" : "off"}`}
      className="group flex w-20 flex-col items-center gap-1.5 focus-visible:outline-none"
    >
      <span
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full border transition-colors",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-sky-400",
          active
            ? "border-white/15 bg-white/10 text-slate-100 group-hover:bg-white/20"
            : "border-rose-400/30 bg-rose-500/20 text-rose-200 group-hover:bg-rose-500/30",
        )}
      >
        {active ? activeIcon : inactiveIcon}
      </span>
      <span className="text-[11px] font-medium text-slate-400">
        {active ? label : `${label} off`}
      </span>
    </button>
  );
}
