"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OirHeader } from "@/components/assessment/oir/oir-header";
import { OirNavigator, type SaveState } from "@/components/assessment/oir/oir-navigator";
import { OirQuestionPanel } from "@/components/assessment/oir/oir-question-panel";
import { OirSubmitDialog } from "@/components/assessment/oir/oir-submit-dialog";
import { OirTerminalState } from "@/components/assessment/oir/oir-terminal-state";
import { useRemainingSeconds } from "@/hooks/use-remaining-seconds";
import { cn } from "@/lib/cn";
import {
  fetchAttempt,
  fetchQuestions,
  sameAnswer,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type OirAnswer,
  type OirAttemptView,
  type OirFailure,
  type OirQuestion,
} from "@/lib/oir/client/attempt-client";

/**
 * The OIR assessment, from the candidate's side.
 *
 * It owns presentation and nothing else. Every fact that decides what may
 * happen — which questions, in what order, how long is left, whether the
 * attempt is still open — comes from the server on each reply and is never
 * recomputed here. The countdown is drawn from `expiresAt`; it does not decide
 * anything, and reaching zero only prompts the client to ask the server what it
 * thinks.
 *
 * Answers are held locally the instant they are picked and saved behind a
 * serial queue. That split matters: a write to the Apps Script store takes a
 * couple of seconds, and a candidate with 25 minutes and 46 questions cannot
 * spend it watching spinners. What the queue must never do is claim an answer
 * is saved when it is not, so every question carries its own save state and an
 * unconfirmed one is said so plainly.
 */

const POLL_WHEN_EXPIRED_MS = 1500;

interface OirFlowProps {
  /** Display name only — resolved server-side from the verified session. */
  readonly candidateName: string;
}

type Phase = "loading" | "ready" | "fatal";

interface PendingSave {
  readonly questionId: string;
  readonly answer: OirAnswer;
}

export function OirFlow({ candidateName }: OirFlowProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatal, setFatal] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<OirAttemptView | null>(null);
  const [questions, setQuestions] = useState<readonly OirQuestion[]>([]);
  const [index, setIndex] = useState(0);
  /** What the candidate has picked, which may be ahead of what the server holds. */
  const [local, setLocal] = useState<Record<string, OirAnswer | null>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The queue lives in refs: it must survive re-renders without causing them,
  // and only one write may be in flight at a time.
  const queue = useRef<PendingSave[]>([]);
  const draining = useRef(false);
  /** The running drain, so submission can wait for it. */
  const drainPromise = useRef<Promise<void> | null>(null);
  const attemptId = useRef<string | null>(null);
  const stemRef = useRef<HTMLDivElement>(null);

  const remainingSeconds = useRemainingSeconds(attempt?.expiresAt ?? null);
  const status = attempt?.status ?? "in-progress";
  const settled = status !== "in-progress";
  // Editing stops the moment the clock reads zero, but the SERVER decides the
  // attempt's fate; this only stops the candidate typing into a dead form.
  const readOnly = settled || remainingSeconds <= 0 || submitting;

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const ordered = useMemo(
    () => (attempt ? attempt.questionIds.map((id) => byId.get(id) ?? null) : []),
    [attempt, byId],
  );

  const describeFailure = useCallback((failure: OirFailure): string => {
    if (failure.kind === "unauthenticated") return "Your session has ended. Please sign in again.";
    return failure.message;
  }, []);

  // ---- loading and recovery ------------------------------------------------

  const adopt = useCallback((view: OirAttemptView) => {
    attemptId.current = view.attemptId;
    setAttempt(view);
    // The server's answers are the truth for anything not still queued locally.
    setLocal((current) => {
      const merged: Record<string, OirAnswer | null> = { ...current };
      for (const stored of view.answers) {
        if (queue.current.some((item) => item.questionId === stored.questionId)) continue;
        merged[stored.questionId] = stored.answer;
      }
      return merged;
    });
    setSaveStates((current) => {
      const next = { ...current };
      for (const stored of view.answers) {
        if (next[stored.questionId] !== "failed") next[stored.questionId] = "saved";
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [questionResult, attemptResult] = await Promise.all([
        fetchQuestions(),
        // GET first: a refresh must never start a second attempt.
        fetchAttempt(),
      ]);
      if (cancelled) return;

      if (!questionResult.ok) {
        setFatal(describeFailure(questionResult.failure));
        setPhase("fatal");
        return;
      }
      setQuestions(questionResult.value.questions);

      if (attemptResult.ok) {
        adopt(attemptResult.value);
        setPhase("ready");
        return;
      }
      if (attemptResult.failure.kind !== "not-found") {
        setFatal(describeFailure(attemptResult.failure));
        setPhase("fatal");
        return;
      }

      // No attempt yet — this is the first visit, so start one.
      const started = await startAttempt();
      if (cancelled) return;
      if (!started.ok) {
        setFatal(describeFailure(started.failure));
        setPhase("fatal");
        return;
      }
      adopt(started.value);
      setPhase("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt, describeFailure]);

  /**
   * When the countdown hits zero the client stops editing, but only the server
   * can say the attempt is over. Asking it settles the question, and keeps
   * asking until it answers, because the alternative is a candidate stuck on a
   * frozen screen.
   */
  useEffect(() => {
    if (phase !== "ready" || settled || remainingSeconds > 0) return;
    const id = window.setInterval(() => {
      void (async () => {
        const result = await fetchAttempt();
        if (result.ok) adopt(result.value);
      })();
    }, POLL_WHEN_EXPIRED_MS);
    return () => window.clearInterval(id);
  }, [phase, settled, remainingSeconds, adopt]);

  // ---- the serial save queue ----------------------------------------------

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length > 0) {
        const item = queue.current[0];
        const id = attemptId.current;
        if (id === null) break;

        setSaveStates((current) => ({ ...current, [item.questionId]: "saving" }));
        const result = await saveAnswer(id, item.questionId, item.answer);

        // Another change to the same question may have arrived while this was in
        // flight; the newest selection wins and this one is simply superseded.
        const superseded =
          queue.current.length > 1 &&
          queue.current.slice(1).some((later) => later.questionId === item.questionId);
        queue.current = queue.current.slice(1);

        if (result.ok) {
          adopt(result.value);
          if (!superseded) {
            setSaveStates((current) => ({ ...current, [item.questionId]: "saved" }));
          }
          continue;
        }

        const { failure } = result;
        if (failure.kind === "conflict") {
          // The server moved on without us — usually because the attempt settled
          // mid-flight. Re-read rather than overwrite whatever it now holds.
          const fresh = await fetchAttempt();
          if (fresh.ok) adopt(fresh.value);
          setSaveStates((current) => ({ ...current, [item.questionId]: "failed" }));
          setNotice(failure.message);
          continue;
        }
        if (failure.kind === "unauthenticated") {
          setFatal(describeFailure(failure));
          setPhase("fatal");
          queue.current = [];
          break;
        }
        // Network or store failure: the local selection stays, but it is never
        // shown as saved, and the candidate is told so.
        setSaveStates((current) => ({ ...current, [item.questionId]: "failed" }));
        setNotice(
          "We could not confirm that answer was saved. It is kept on this page — use Retry.",
        );
      }
    } finally {
      draining.current = false;
    }
  }, [adopt, describeFailure]);

  const enqueue = useCallback(
    (questionId: string, answer: OirAnswer) => {
      // A write already in flight cannot be recalled, so it stays at the head.
      // Everything waiting behind it for the same question is replaced: only
      // the newest value is worth sending, and without this a candidate typing
      // a word one letter at a time would buy a two-second write per letter and
      // push every other question further back in the queue.
      const inFlight = draining.current ? queue.current.slice(0, 1) : [];
      const waiting = (draining.current ? queue.current.slice(1) : queue.current).filter(
        (item) => item.questionId !== questionId,
      );
      queue.current = [...inFlight, ...waiting, { questionId, answer }];
      setSaveStates((current) => ({ ...current, [questionId]: "unsaved" }));
      // A drain already running will pick this up; starting a second one would
      // break the single-writer rule the whole queue rests on.
      if (!draining.current) drainPromise.current = drain();
    },
    [drain],
  );

  /**
   * Waits for the queue to empty.
   *
   * Submitting settles the attempt, and the server refuses a write against a
   * settled attempt — so an answer still queued at that moment is not merely
   * late, it is lost, and no retry can recover it because the paper is already
   * in. The queue is serial, so waiting on the running drain waits on
   * everything behind it too.
   */
  const flushQueue = useCallback(async () => {
    while (draining.current && drainPromise.current !== null) {
      await drainPromise.current;
    }
  }, []);

  const handleAnswer = useCallback(
    (questionId: string, answer: OirAnswer | null) => {
      setNotice(null);
      setLocal((current) => ({ ...current, [questionId]: answer }));
      // A cleared or half-filled answer is held locally; there is nothing valid
      // to send, and the server has no concept of "unanswer".
      if (answer === null) {
        setSaveStates((current) => ({ ...current, [questionId]: "unsaved" }));
        return;
      }
      const stored = attempt?.answers.find((a) => a.questionId === questionId)?.answer ?? null;
      if (sameAnswer(stored, answer)) return;
      enqueue(questionId, answer);
    },
    [attempt, enqueue],
  );

  const retry = useCallback(
    (questionId: string) => {
      const answer = local[questionId];
      if (!answer) return;
      setNotice(null);
      enqueue(questionId, answer);
    },
    [enqueue, local],
  );

  // ---- submission ----------------------------------------------------------

  const confirmSubmit = useCallback(async () => {
    const id = attemptId.current;
    if (id === null || submitting) return;
    setSubmitting(true);
    setNotice(null);
    // Editing is already closed by `readOnly`, so nothing new can join the
    // queue while this waits.
    await flushQueue();
    const result = await submitAttempt(id);
    setSubmitting(false);
    setConfirming(false);

    if (result.ok) {
      adopt(result.value);
      return;
    }
    // A rejected submission usually means the server already settled the
    // attempt — re-read so the screen shows what actually happened.
    if (result.failure.kind === "conflict" || result.failure.kind === "not-found") {
      const fresh = await fetchAttempt();
      if (fresh.ok) {
        adopt(fresh.value);
        return;
      }
    }
    setNotice(describeFailure(result.failure));
  }, [adopt, describeFailure, flushQueue, submitting]);

  // ---- derived view state --------------------------------------------------

  const answeredIndexes = useMemo(() => {
    const set = new Set<number>();
    ordered.forEach((question, position) => {
      if (question && local[question.id]) set.add(position);
    });
    return set;
  }, [ordered, local]);

  const failedIndexes = useMemo(() => {
    const set = new Set<number>();
    ordered.forEach((question, position) => {
      if (question && saveStates[question.id] === "failed") set.add(position);
    });
    return set;
  }, [ordered, saveStates]);

  /**
   * Answers the server has not confirmed.
   *
   * Counted from the per-question save states rather than from the queue: the
   * queue is a ref, reading it during render would be a lie the moment it
   * changed, and every queued item already has a state of its own. Anything not
   * "saved" is unconfirmed, which is the only claim worth making here.
   */
  const unconfirmedCount = useMemo(
    () =>
      ordered.filter((question) => {
        if (question === null || !local[question.id]) return false;
        return (saveStates[question.id] ?? "unsaved") !== "saved";
      }).length,
    [ordered, local, saveStates],
  );

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.min(Math.max(next, 0), Math.max(ordered.length - 1, 0));
        if (clamped !== current) stemRef.current?.focus();
        return clamped;
      });
    },
    [ordered.length],
  );

  // ---- render --------------------------------------------------------------

  if (phase === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <p className="text-sm text-slate-400" role="status">
          Preparing your test…
        </p>
      </main>
    );
  }

  if (phase === "fatal" || attempt === null) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 text-center">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-white">The test could not be opened</h1>
          <p role="alert" className="text-sm text-slate-300">
            {fatal ?? "Please try again."}
          </p>
        </div>
      </main>
    );
  }

  if (settled) {
    return (
      <OirTerminalState
        status={status}
        answeredCount={attempt.answers.length}
        questionCount={attempt.questionCount}
        submittedAt={attempt.submittedAt}
      />
    );
  }

  const question = ordered[index] ?? null;
  const saveState: SaveState = question ? (saveStates[question.id] ?? "unsaved") : "unsaved";

  return (
    <div className="min-h-dvh bg-slate-950">
      <OirHeader
        questionNumber={index + 1}
        questionCount={attempt.questionCount}
        answeredCount={answeredIndexes.size}
        remainingSeconds={remainingSeconds}
        showCountdown
      />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="sr-only">Candidate: {candidateName}</p>

        <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-5">
            <div ref={stemRef} tabIndex={-1} className="outline-none">
              {question === null ? (
                <p role="alert" className="text-sm text-rose-200">
                  This question could not be loaded. Please reload the page.
                </p>
              ) : (
                <OirQuestionPanel
                  // Keyed so each question gets a fresh panel: the half-typed
                  // input it holds belongs to one question and must not follow
                  // the candidate to the next.
                  key={question.id}
                  question={question}
                  answer={local[question.id] ?? null}
                  disabled={readOnly}
                  onAnswer={(answer) => handleAnswer(question.id, answer)}
                />
              )}
            </div>

            {question !== null && (
              <p className="text-xs" aria-live="polite">
                {saveState === "saved" && <span className="text-emerald-300">Answer saved</span>}
                {saveState === "saving" && <span className="text-slate-400">Saving…</span>}
                {saveState === "unsaved" && <span className="text-slate-500">Not sent yet</span>}
                {saveState === "failed" && (
                  <span className="text-rose-300">
                    Not saved.{" "}
                    <button
                      type="button"
                      onClick={() => retry(question.id)}
                      className="underline underline-offset-2 hover:text-rose-200"
                    >
                      Retry
                    </button>
                  </span>
                )}
              </p>
            )}

            {notice !== null && (
              <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                {notice}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => goTo(index - 1)}
                  disabled={index === 0}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goTo(index + 1)}
                  disabled={index >= ordered.length - 1}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
                >
                  Next
                </button>
              </div>

              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={readOnly}
                className={cn(
                  "rounded-lg bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950",
                  "hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
                  "disabled:opacity-50",
                )}
              >
                Submit Test
              </button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <OirNavigator
              total={ordered.length}
              currentIndex={index}
              answeredIndexes={answeredIndexes}
              failedIndexes={failedIndexes}
              onJump={goTo}
            />
          </aside>
        </div>
      </main>

      <OirSubmitDialog
        open={confirming}
        submitting={submitting}
        unconfirmedCount={unconfirmedCount}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmSubmit()}
      />
    </div>
  );
}
