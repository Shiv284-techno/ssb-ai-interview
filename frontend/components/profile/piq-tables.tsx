"use client";

import type { CandidateProfile } from "@/lib/interview/profile/profile";

/**
 * The form's tables, shown as they were read.
 *
 * These are presented for checking, not editing: row-level correction is a
 * larger piece of work than this step covers, and an incomplete editor would be
 * worse than an honest read-only view. Every row the extractor found is shown,
 * including rows where only the printed label came through, so a candidate can
 * see exactly how much of each table was recovered.
 */

interface TableProps {
  caption: string;
  headings: readonly string[];
  rows: readonly (readonly (string | null)[])[];
  /** Shown when the table came back empty. */
  emptyMessage: string;
}

function ReadOnlyTable({ caption, headings, rows, emptyMessage }: TableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm font-medium text-slate-100">{caption}</p>
        <p className="mt-2 text-xs text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-medium text-slate-100">{caption}</p>
      {/* Wide tables scroll inside their own box rather than the page. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headings.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="border-b border-white/10 pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b border-white/5 py-2 pr-4 text-slate-200"
                  >
                    {cell === null || cell.length === 0 ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FamilyTable({ profile }: { profile: CandidateProfile }) {
  return (
    <ReadOnlyTable
      caption="Parents, guardian, brothers and sisters"
      headings={["Relation", "Name", "Age", "Education", "Occupation", "Income per month"]}
      rows={profile.family.members.map((member) => [
        member.relation,
        member.name,
        member.ageYears,
        member.education,
        member.occupation,
        member.incomePerMonth,
      ])}
      emptyMessage="No family rows were found in the upload."
    />
  );
}

export function SportsTable({ profile }: { profile: CandidateProfile }) {
  return (
    <ReadOnlyTable
      caption="Participation in sports"
      headings={["Ser", "Sport or game", "From", "To", "Level played", "Service level", "Achievements"]}
      rows={profile.sports.map((row) => [
        row.serNo,
        row.sportOrGamePlayed,
        row.periodFrom,
        row.periodTo,
        row.levelAtWhichPlayed,
        row.levelForServiceCandidates,
        row.specialAchievements,
      ])}
      emptyMessage="No sports rows were found in the upload."
    />
  );
}

export function HobbiesTable({ profile }: { profile: CandidateProfile }) {
  return (
    <ReadOnlyTable
      caption="Hobbies and interests"
      headings={["Ser", "Hobby", "From", "To", "Level", "Achievements"]}
      rows={profile.hobbies.map((row) => [
        row.serNo,
        row.hobby,
        row.periodFrom,
        row.periodTo,
        row.levelAtWhichParticipated,
        row.specialAchievements,
      ])}
      emptyMessage="No hobby rows were found in the upload."
    />
  );
}

export function ExtracurricularTable({ profile }: { profile: CandidateProfile }) {
  return (
    <ReadOnlyTable
      caption="Extra-curricular activities"
      headings={["Ser", "Activity", "From", "To", "Level", "Achievements"]}
      rows={profile.extracurricularActivities.map((row) => [
        row.serNo,
        row.extracurricularActivity,
        row.periodFrom,
        row.periodTo,
        row.levelAtWhichParticipated,
        row.specialAchievements,
      ])}
      emptyMessage="No extra-curricular rows were found in the upload."
    />
  );
}

export function PreviousSsbTable({ profile }: { profile: CandidateProfile }) {
  return (
    <ReadOnlyTable
      caption="Chances availed for commission"
      headings={["Ser", "SSB", "Entry", "Place", "Date", "Batch and chest no.", "Result"]}
      rows={profile.previousSsb.attempts.map((row) => [
        row.serNo,
        row.ssb,
        row.entry,
        row.placesOfSsb,
        row.date,
        row.batchAndChestNo,
        row.result,
      ])}
      emptyMessage="No previous SSB attempts were found in the upload."
    />
  );
}

/** Positions of responsibility are free text on the form, one entry per line. */
export function AppointmentsList({ profile }: { profile: CandidateProfile }) {
  const appointments = profile.ncc.positionsOfResponsibility;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-medium text-slate-100">
        Positions of responsibility and appointments held
      </p>
      {appointments.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          None were found in the upload.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {appointments.map((entry, index) => (
            <li
              key={`${index}-${entry}`}
              className="rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
