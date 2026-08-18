"use client";

import { useEffect, useRef } from "react";

/**
 * The submission confirmation.
 *
 * A native `<dialog>` rather than a hand-rolled overlay: it gives the focus
 * trap, the Escape key and the accessible modal semantics for free, and getting
 * those wrong in an exam is worse than the markup being slightly less familiar.
 */

interface OirSubmitDialogProps {
  readonly open: boolean;
  readonly submitting: boolean;
  /** Non-empty when answers are queued, in flight, or failed to save. */
  readonly unconfirmedCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function OirSubmitDialog({
  open,
  submitting,
  unconfirmedCount,
  onCancel,
  onConfirm,
}: OirSubmitDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="oir-submit-title"
      onCancel={(event) => {
        // Escape must not close a dialog mid-submission.
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      className="max-w-md rounded-xl border border-white/10 bg-slate-900 p-0 text-slate-100 backdrop:bg-slate-950/70"
    >
      <div className="space-y-4 p-5">
        <h2 id="oir-submit-title" className="text-lg font-semibold">
          Submit your test?
        </h2>
        <p className="text-sm text-slate-300">
          Are you sure you want to submit? You won&apos;t be able to change your answers after
          submission.
        </p>

        {unconfirmedCount > 0 && (
          <p
            role="alert"
            className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100"
          >
            {unconfirmedCount === 1
              ? "1 answer has not been confirmed saved yet."
              : `${unconfirmedCount} answers have not been confirmed saved yet.`}{" "}
            If you submit now, they may not be counted. You can cancel and retry them first.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit test"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
