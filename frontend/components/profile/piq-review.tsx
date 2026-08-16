"use client";

import { PiqField } from "@/components/profile/piq-field";
import {
  AppointmentsList,
  ExtracurricularTable,
  FamilyTable,
  HobbiesTable,
  PreviousSsbTable,
  SportsTable,
} from "@/components/profile/piq-tables";
import { cn } from "@/lib/cn";
import type { CandidateProfile } from "@/lib/interview/profile/profile";
import {
  REVIEW_SECTIONS,
  type ReviewField,
  type ReviewSectionId,
  type ReviewSummary,
} from "@/lib/interview/profile/review/review-model";

/**
 * The review screen.
 *
 * The form is long, so it is broken into collapsible sections that follow the
 * questionnaire's own order and wording. Anything the extractor could not
 * establish is surfaced twice — once in a short list at the top so it cannot be
 * missed, and again in place within its section so it can be answered in
 * context.
 */

interface PiqReviewProps {
  profile: CandidateProfile;
  fields: readonly ReviewField[];
  summary: ReviewSummary;
  onFieldChange: (fieldId: string, value: string) => void;
  onConfirm: () => void;
  onStartOver: () => void;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "attention";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "attention"
          ? "border-amber-400/40 bg-amber-400/[0.06]"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <p className="font-mono text-2xl tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function sectionExtras(
  sectionId: ReviewSectionId,
  profile: CandidateProfile,
): React.ReactNode {
  switch (sectionId) {
    case "family":
      return <FamilyTable profile={profile} />;
    case "sports":
      return <SportsTable profile={profile} />;
    case "hobbies":
      return <HobbiesTable profile={profile} />;
    case "extracurricular":
      return <ExtracurricularTable profile={profile} />;
    case "ncc":
      return <AppointmentsList profile={profile} />;
    case "previousSsb":
      return <PreviousSsbTable profile={profile} />;
    default:
      return null;
  }
}

export function PiqReview({
  profile,
  fields,
  summary,
  onFieldChange,
  onConfirm,
  onStartOver,
}: PiqReviewProps) {
  const outstanding = fields.filter((f) => f.status === "needs-confirmation");

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="piq-summary-heading"
        className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"
      >
        <h2
          id="piq-summary-heading"
          className="text-lg font-semibold tracking-tight text-white"
        >
          What we read from your PIQ
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Check each section below. You can correct anything that was read
          incorrectly, and you must answer the items we could not read at all.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Read from PDF" value={summary.extracted} tone="neutral" />
          <SummaryTile
            label="Need your answer"
            value={summary.needsConfirmation}
            tone={summary.needsConfirmation > 0 ? "attention" : "neutral"}
          />
          <SummaryTile label="Not filled in" value={summary.blank} tone="neutral" />
          <SummaryTile label="Lines to review" value={summary.unparsedLines} tone="neutral" />
        </div>
      </section>

      {outstanding.length > 0 && (
        <section
          aria-labelledby="piq-outstanding-heading"
          className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-5 sm:p-6"
        >
          <h2
            id="piq-outstanding-heading"
            className="text-base font-semibold tracking-tight text-amber-100"
          >
            {outstanding.length} item{outstanding.length === 1 ? "" : "s"} need your
            answer
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
            Your PIQ prints these as options to ring by hand. A hand-drawn ring is
            not text, so it cannot be read from the file — we have not guessed.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {outstanding.map((field) => (
              <li
                key={field.id}
                className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100"
              >
                {field.group ? `${field.group} · ` : ""}
                {field.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {REVIEW_SECTIONS.map((section) => {
        const sectionFields = fields.filter((f) => f.section === section.id);
        const extras = sectionExtras(section.id, profile);
        if (sectionFields.length === 0 && extras === null) return null;

        const outstandingHere = sectionFields.filter(
          (f) => f.status === "needs-confirmation",
        ).length;

        // Groups keep each qualification's fields together under its own heading.
        const groups = Array.from(
          new Set(sectionFields.map((f) => f.group)),
        ) as (string | null)[];

        return (
          <details
            key={section.id}
            open={outstandingHere > 0}
            className="group rounded-2xl border border-white/10 bg-slate-900/60"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:px-6">
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="text-slate-500 transition-transform group-open:rotate-90"
                >
                  ▶
                </span>
                <span>
                  <span className="block text-base font-semibold text-white">
                    {section.title}
                  </span>
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {section.questions}
                  </span>
                </span>
              </span>

              {outstandingHere > 0 && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                  {outstandingHere} to answer
                </span>
              )}
            </summary>

            <div className="space-y-4 border-t border-white/10 px-5 py-5 sm:px-6">
              {groups.map((group) => {
                const groupFields = sectionFields.filter((f) => f.group === group);
                if (groupFields.length === 0) return null;

                return (
                  <div key={group ?? "ungrouped"} className="space-y-3">
                    {group && (
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {group}
                      </h3>
                    )}
                    <div className="grid gap-3 lg:grid-cols-2">
                      {groupFields.map((field) => (
                        <PiqField
                          key={field.id}
                          field={field}
                          onChange={onFieldChange}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {extras}
            </div>
          </details>
        );
      })}

      {/* Unparsed content: collapsed by default so it is available without
          dominating the page, and never dumped as a wall of text. */}
      <details className="rounded-2xl border border-white/10 bg-slate-900/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:px-6">
          <span>
            <span className="block text-base font-semibold text-white">
              Lines we could not place
            </span>
            <span className="block text-[11px] uppercase tracking-[0.14em] text-slate-500">
              {profile.unparsed.length} line
              {profile.unparsed.length === 1 ? "" : "s"}
            </span>
          </span>
          <span className="text-slate-500" aria-hidden="true">
            ▾
          </span>
        </summary>

        <div className="border-t border-white/10 px-5 py-5 sm:px-6">
          {profile.unparsed.length === 0 ? (
            <p className="text-sm text-slate-400">
              Every line of your PIQ was matched to a field.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-400">
                These lines were read from your PIQ but did not match a known
                field. Nothing has been discarded — check whether anything
                important is here, and add it to the right field above.
              </p>
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {profile.unparsed.map((line) => (
                  <li
                    key={`${line.sourceLine}-${line.text}`}
                    className="flex gap-3 rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-slate-600">
                      L{line.sourceLine}
                    </span>
                    <span className="text-sm text-slate-300">{line.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              {summary.readyToConfirm
                ? "Everything we could not read has been answered."
                : `${summary.needsConfirmation} item${summary.needsConfirmation === 1 ? "" : "s"} still need your answer.`}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Your PIQ is not stored. It stays on this page only.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onStartOver}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              Upload a different PIQ
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!summary.readyToConfirm}
              className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm my profile
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
