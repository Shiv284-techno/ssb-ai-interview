import type { InputHTMLAttributes, ReactNode } from "react";

import { ShieldIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * Shared chrome for the login and signup screens. Each page owns its own state
 * and validation — only the layout, field, and button styling live here.
 */

interface AuthShellProps {
  badge: string;
  title: string;
  description: string;
  /** The form itself. */
  children: ReactNode;
  /** The link across to the other auth screen. */
  footer: ReactNode;
}

export function AuthShell({
  badge,
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center bg-slate-950 px-4 py-10 font-sans text-slate-100 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
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

        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            {badge}
          </span>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {description}
          </p>

          {children}
        </section>

        <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>
      </div>
    </main>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

export function AuthField({
  id,
  label,
  error,
  className,
  ...inputProps
}: AuthFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 w-full rounded-xl border bg-slate-950/60 px-4 py-3 text-sm text-slate-100 transition-colors placeholder:text-slate-600",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          error
            ? "border-rose-400/40 focus-visible:outline-rose-300"
            : "border-white/10 focus-visible:outline-sky-400",
          className,
        )}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthSubmit({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-1 flex w-full items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
    >
      {children}
    </button>
  );
}

/** Neutral status line — these screens do not submit anywhere yet. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-400">
      {children}
    </p>
  );
}
