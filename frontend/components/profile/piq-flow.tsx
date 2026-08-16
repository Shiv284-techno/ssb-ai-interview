"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ShieldIcon } from "@/components/icons";
import { PiqReview } from "@/components/profile/piq-review";
import { PiqUploadPanel, type UploadPhase } from "@/components/profile/piq-upload-panel";
import type { CandidateProfile } from "@/lib/interview/profile/profile";
import {
  applyCorrections,
  buildReviewFields,
  summariseReview,
} from "@/lib/interview/profile/review/review-model";
import { checkSelectedFile } from "@/lib/interview/profile/review/upload-check";

/**
 * The PIQ upload and review flow.
 *
 * The candidate's document lives in this component's state for as long as the
 * page is open, and nowhere else. It is never written to localStorage,
 * sessionStorage, a cookie, or a URL, never sent anywhere except the upload
 * endpoint it came from, and never logged — the whole point of reading it here
 * is to prepare an interview, not to accumulate a file about someone.
 *
 * Corrections are held separately from the extracted profile, so the page can
 * always tell the candidate what came out of their PDF and what they changed.
 */

const ENDPOINT = "/api/profile/piq";
const GENERIC_ERROR = "We could not read your PIQ right now. Please try again.";

type FlowStatus =
  | "empty"
  | "selected"
  | "uploading"
  | "processing"
  | "review"
  | "confirmed"
  | "error";

interface ExtractionSummary {
  pageCount: number;
  tablesReconstructed: number;
}

/** Reads the route's safe `{ error }` message without trusting the shape. */
function readErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.length > 0 ? error : null;
}

/** A 5xx never surfaces the server's wording, only a generic line. */
function messageForStatus(status: number, payload: unknown): string {
  if (status >= 500) return GENERIC_ERROR;
  return readErrorMessage(payload) ?? GENERIC_ERROR;
}

function isCandidateProfile(value: unknown): value is CandidateProfile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CandidateProfile>;
  return (
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    typeof candidate.personal === "object" &&
    Array.isArray(candidate.unparsed)
  );
}

interface PiqFlowProps {
  /** Display name only — resolved server-side from the verified session. */
  candidateName: string;
}

export function PiqFlow({ candidateName }: PiqFlowProps) {
  const [status, setStatus] = useState<FlowStatus>("empty");
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [extraction, setExtraction] = useState<ExtractionSummary | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});

  const displayName = candidateName.trim() || "Candidate";

  // The profile as it now stands: what was extracted, plus what the candidate
  // has changed. Recomputed rather than stored, so the two never drift apart.
  const workingProfile = useMemo(
    () => (profile ? applyCorrections(profile, corrections) : null),
    [profile, corrections],
  );
  const fields = useMemo(
    () => (workingProfile ? buildReviewFields(workingProfile) : []),
    [workingProfile],
  );
  const summary = useMemo(
    () => (workingProfile ? summariseReview(workingProfile) : null),
    [workingProfile],
  );

  const handleSelect = useCallback((selected: File | null) => {
    setServerError(null);

    if (!selected) {
      setFile(null);
      setClientError(null);
      setStatus("empty");
      return;
    }

    // A courtesy check only — the server re-checks everything regardless.
    const check = checkSelectedFile(selected);
    setFile(selected);
    setClientError(check.ok ? null : check.message);
    setStatus("selected");
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setClientError(null);
    setServerError(null);
    setStatus("empty");
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    const check = checkSelectedFile(file);
    if (!check.ok) {
      setClientError(check.message);
      setStatus("selected");
      return;
    }

    setStatus("uploading");
    setClientError(null);
    setServerError(null);

    const body = new FormData();
    body.append("file", file);

    let response: Response;
    try {
      // The only place the document is ever sent.
      response = await fetch(ENDPOINT, { method: "POST", body });
    } catch {
      setStatus("error");
      setServerError("Unable to connect. Please try again.");
      return;
    }

    setStatus("processing");

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setServerError(messageForStatus(response.status, payload));
      return;
    }

    const parsed = payload as { profile?: unknown; extraction?: unknown } | null;
    if (!parsed || !isCandidateProfile(parsed.profile)) {
      setStatus("error");
      setServerError(GENERIC_ERROR);
      return;
    }

    const stats = parsed.extraction as Partial<ExtractionSummary> | undefined;
    setProfile(parsed.profile);
    setExtraction({
      pageCount: typeof stats?.pageCount === "number" ? stats.pageCount : 0,
      tablesReconstructed:
        typeof stats?.tablesReconstructed === "number"
          ? stats.tablesReconstructed
          : 0,
    });
    setCorrections({});
    setStatus("review");
  }, [file]);

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setCorrections((current) => ({ ...current, [fieldId]: value }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!summary?.readyToConfirm) return;
    setStatus("confirmed");
  }, [summary]);

  const handleStartOver = useCallback(() => {
    setProfile(null);
    setExtraction(null);
    setCorrections({});
    setFile(null);
    setClientError(null);
    setServerError(null);
    setStatus("empty");
  }, []);

  const uploadPhase: UploadPhase =
    status === "uploading" || status === "processing" || status === "error"
      ? status
      : file
        ? "selected"
        : "empty";

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-4 py-10 font-sans text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-slate-700 to-slate-900 text-emerald-300 ring-1 ring-white/15">
              <ShieldIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-white">
                SSB AI Interviewer
              </p>
              <p className="truncate text-xs text-slate-400">
                Personal Information Questionnaire
              </p>
            </div>
          </div>
          <span className="hidden max-w-[12rem] items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 sm:flex">
            <span className="truncate">{displayName}</span>
          </span>
        </header>

        {status !== "review" && status !== "confirmed" && (
          <PiqUploadPanel
            phase={uploadPhase}
            fileName={file?.name ?? null}
            fileSize={file?.size ?? null}
            clientError={clientError}
            serverError={serverError}
            onSelect={handleSelect}
            onUpload={() => void handleUpload()}
            onClear={handleClear}
          />
        )}

        {status === "review" && workingProfile && summary && (
          <>
            {extraction && (
              <p className="mb-6 text-sm text-slate-400">
                Read {extraction.pageCount} page
                {extraction.pageCount === 1 ? "" : "s"} and rebuilt{" "}
                {extraction.tablesReconstructed} table
                {extraction.tablesReconstructed === 1 ? "" : "s"} from your PIQ.
              </p>
            )}
            <PiqReview
              profile={workingProfile}
              fields={fields}
              summary={summary}
              onFieldChange={handleFieldChange}
              onConfirm={handleConfirm}
              onStartOver={handleStartOver}
            />
          </>
        )}

        {status === "confirmed" && (
          <section
            aria-labelledby="piq-confirmed-heading"
            className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 sm:p-8"
          >
            <h1
              id="piq-confirmed-heading"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Your PIQ is confirmed
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Thank you. Your profile is ready for this session. It has not been
              saved anywhere — if you reload this page you will need to upload
              your PIQ again.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/interview"
                className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Go to the interview room
              </Link>
              <button
                type="button"
                onClick={() => setStatus("review")}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                Back to review
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
