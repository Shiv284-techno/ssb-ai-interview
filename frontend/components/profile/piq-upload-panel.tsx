"use client";

import { useRef, useState, type DragEvent } from "react";

import { AlertIcon, CheckIcon, ShieldIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { formatFileSize } from "@/lib/interview/profile/review/upload-check";

/**
 * Choosing the file and sending it.
 *
 * Drag and drop is an enhancement layered over a real `<input type="file">`,
 * which stays the accessible control: it is focusable, it opens with the
 * keyboard, and its label describes it. A drop target alone would be unusable
 * without a pointer.
 */

export type UploadPhase =
  | "empty"
  | "selected"
  | "uploading"
  | "processing"
  | "error";

interface PiqUploadPanelProps {
  phase: UploadPhase;
  fileName: string | null;
  fileSize: number | null;
  /** Set when the browser's own pre-check rejected the file. */
  clientError: string | null;
  /** Set when the server rejected or could not read the upload. */
  serverError: string | null;
  onSelect: (file: File | null) => void;
  onUpload: () => void;
  onClear: () => void;
}

export function PiqUploadPanel({
  phase,
  fileName,
  fileSize,
  clientError,
  serverError,
  onSelect,
  onUpload,
  onClear,
}: PiqUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const busy = phase === "uploading" || phase === "processing";
  const error = clientError ?? serverError;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    onSelect(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <section
      aria-labelledby="piq-upload-heading"
      className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
        <ShieldIcon className="h-3.5 w-3.5" />
        Step 1 of 2
      </span>

      <h1
        id="piq-upload-heading"
        className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
      >
        Upload your PIQ
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        Upload your Personal Information Questionnaire as a PDF. We read it to
        prepare your interview, then show you everything we found so you can
        check it. Your file is not stored.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "mt-7 rounded-2xl border-2 border-dashed p-6 transition-colors sm:p-8",
          isDragging
            ? "border-emerald-400/60 bg-emerald-400/[0.06]"
            : "border-white/15 bg-white/[0.02]",
        )}
      >
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-slate-300">
            Drag your PDF here, or choose it from your device.
          </p>

          <label
            htmlFor="piq-file"
            className={cn(
              "mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10",
              "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-400",
              busy && "cursor-not-allowed opacity-50",
            )}
          >
            Choose PDF
            <input
              ref={inputRef}
              id="piq-file"
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>

          <p className="mt-3 text-xs text-slate-500">PDF only, up to 8 MB.</p>
        </div>

        {fileName && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <CheckIcon className="h-4 w-4 shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-100">{fileName}</p>
                {fileSize !== null && (
                  <p className="text-xs text-slate-500">
                    {formatFileSize(fileSize)}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                onClear();
              }}
              disabled={busy}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Status is announced, and always carries words rather than colour alone. */}
      <p aria-live="polite" className="mt-5 min-h-[1.25rem] text-sm text-slate-400">
        {phase === "uploading" && "Sending your PIQ…"}
        {phase === "processing" && "Reading your PIQ…"}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-1 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onUpload}
          disabled={busy || fileName === null || clientError !== null}
          className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Working…" : phase === "error" ? "Try again" : "Read my PIQ"}
        </button>
      </div>
    </section>
  );
}
