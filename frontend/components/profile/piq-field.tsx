"use client";

import { cn } from "@/lib/cn";
import type { ReviewField } from "@/lib/interview/profile/review/review-model";

/**
 * One reviewable field.
 *
 * A printed-choice field with no value renders as an unanswered radio group —
 * nothing is pre-selected, because the form printed "Male / Female" and the
 * candidate ringed one on paper. The mark is not text, so the only honest thing
 * the page can do is ask. Choosing a default here would put words in the
 * candidate's mouth and then present them as extracted fact.
 */

interface StatusChipProps {
  status: ReviewField["status"];
}

/**
 * Status is carried by wording and shape as well as colour, so it survives for
 * a reader who cannot distinguish the palette.
 */
function StatusChip({ status }: StatusChipProps) {
  if (status === "needs-confirmation") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200">
        <span aria-hidden="true">●</span>
        Needs your answer
      </span>
    );
  }

  if (status === "extracted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-200">
        <span aria-hidden="true">✓</span>
        From your PDF
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
      <span aria-hidden="true">–</span>
      Not filled in
    </span>
  );
}

interface PiqFieldProps {
  field: ReviewField;
  onChange: (fieldId: string, value: string) => void;
}

export function PiqField({ field, onChange }: PiqFieldProps) {
  const inputId = `piq-${field.id.replace(/\./g, "-")}`;
  const hintId = `${inputId}-hint`;
  const needsAnswer = field.status === "needs-confirmation";

  if (field.options.length > 0) {
    return (
      <fieldset
        className={cn(
          "rounded-xl border p-4",
          needsAnswer
            ? "border-amber-400/40 bg-amber-400/[0.04]"
            : "border-white/10 bg-white/[0.02]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-slate-100">
            {field.label}
          </legend>
          <StatusChip status={field.status} />
        </div>

        {needsAnswer && (
          <p id={hintId} className="mt-2 text-xs leading-relaxed text-amber-200/80">
            The form prints these options and you ringed one by hand, so it could
            not be read from the PDF. Please choose it here.
          </p>
        )}

        <div
          className="mt-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby={undefined}
          aria-describedby={needsAnswer ? hintId : undefined}
        >
          {field.options.map((option) => {
            const optionId = `${inputId}-${option.replace(/[^a-zA-Z0-9]+/g, "-")}`;
            const selected = field.value === option;

            return (
              <label
                key={option}
                htmlFor={optionId}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors",
                  "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-400",
                  selected
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10",
                )}
              >
                <input
                  type="radio"
                  id={optionId}
                  name={inputId}
                  value={option}
                  // Nothing is checked while the value is null: the page must
                  // not answer on the candidate's behalf.
                  checked={selected}
                  onChange={() => onChange(field.id, option)}
                  className="sr-only"
                />
                <span aria-hidden="true">{selected ? "● " : "○ "}</span>
                {option}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-100">
          {field.label}
        </label>
        <StatusChip status={field.status} />
      </div>

      <input
        id={inputId}
        type="text"
        value={field.value ?? ""}
        placeholder="Not filled in"
        onChange={(event) => onChange(field.id, event.target.value)}
        className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 transition-colors placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      />
    </div>
  );
}
