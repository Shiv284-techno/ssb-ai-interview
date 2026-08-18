"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { OirAnswer, OirQuestion } from "@/lib/oir/client/attempt-client";

/**
 * One question, in whichever of the four forms it takes.
 *
 * Which form is never guessed from the wording. A question with printed options
 * says so through `optionSource`; a question whose choices are numbered inside
 * its diagram lists them in `pictorialOptionIds`; a question answered by writing
 * declares its shape in `responseFormat`. Every one of those is decided at
 * ingestion by a person looking at the page, so nothing here parses prose.
 */

interface OirQuestionPanelProps {
  readonly question: OirQuestion;
  readonly answer: OirAnswer | null;
  readonly disabled: boolean;
  readonly onAnswer: (answer: OirAnswer | null) => void;
}

/**
 * Half-made input is kept here, not sent.
 *
 * A question asking for two figures or three letters is only a valid answer
 * once every part of it is there — the server checks the count and refuses
 * anything else. But the parts have to be typed one at a time, and if the
 * in-between state is not held somewhere the candidate's first keystroke
 * disappears the moment they make it. It is held in this component rather than
 * beside the saved answers because it is not an answer yet: nothing may send
 * it, count it as answered, or mistake it for something the server holds.
 *
 * The panel is mounted afresh for each question, so this resets when the
 * candidate moves on.
 */

const OPTION_BASE =
  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition " +
  "focus-within:ring-2 focus-within:ring-emerald-400/60";
const OPTION_IDLE = "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10";
const OPTION_PICKED = "border-emerald-400/50 bg-emerald-400/10";
const OPTION_OFF = "cursor-not-allowed opacity-60 hover:border-white/10 hover:bg-white/5";

function readValues(answer: OirAnswer | null, kind: "multi-token" | "ordered-sequence"): string[] {
  return answer !== null && answer.kind === kind ? [...answer.values] : [];
}

export function OirQuestionPanel({
  question,
  answer,
  disabled,
  onAnswer,
}: OirQuestionPanelProps) {
  const { optionSource, pictorialOptionIds, responseFormat } = question;

  const selectedOne = answer !== null && answer.kind === "single-option" ? answer.optionId : null;

  const required = responseFormat.kind === "multiple-options" ? responseFormat.count : 0;
  const [ticked, setTicked] = useState<readonly string[]>(() =>
    answer !== null && answer.kind === "multiple-options" ? answer.optionIds : [],
  );
  const [boxes, setBoxes] = useState<readonly string[]>(() =>
    responseFormat.kind === "multi-token" || responseFormat.kind === "ordered-sequence"
      ? Array.from({ length: responseFormat.count }, (_, slot) =>
          readValues(answer, responseFormat.kind)[slot] ?? "")
      : [],
  );

  const toggleMany = (id: string) => {
    const next = ticked.includes(id)
      ? ticked.filter((existing) => existing !== id)
      : [...ticked, id];
    setTicked(next);
    // "Which TWO of these" means two: one tick is not an answer the server will
    // take, so it is kept on screen rather than sent and refused.
    onAnswer(next.length === required ? { kind: "multiple-options", optionIds: next } : null);
  };

  /**
   * Text choices and pictorial choices differ only in what the label says: the
   * numbered pictures are in the figure above, so the control beside them is the
   * number itself.
   */
  const choices: { id: string; label: string }[] =
    optionSource === "text"
      ? question.options.map((option) => ({ id: option.id, label: option.text }))
      : optionSource === "figure"
        ? pictorialOptionIds.map((id) => ({ id, label: `Figure ${id}` }))
        : [];

  /**
   * Whether more than one choice may be taken.
   *
   * From `responseFormat`, never from the current answer. Deriving it from the
   * answer was a real bug: before the candidate has picked anything the answer
   * is null, so the eight "which TWO figures" questions rendered radio buttons
   * and could not be answered at all. The declared format is known before the
   * candidate touches the page, which is exactly when the control has to be
   * right.
   */
  const multiSelect = responseFormat.kind === "multiple-options";

  return (
    <section aria-labelledby="oir-question-stem" className="space-y-5">
      {question.stem.length > 0 ? (
        <h2 id="oir-question-stem" className="text-base leading-relaxed text-slate-100 sm:text-lg">
          {question.stem}
        </h2>
      ) : (
        // Entirely pictorial questions carry no printed stem at all.
        <h2 id="oir-question-stem" className="text-base text-slate-300 sm:text-lg">
          Study the figure and choose the answer it calls for.
        </h2>
      )}

      {question.figures.length > 0 && (
        <div className="space-y-3">
          {question.figures.map((figure) => (
            <figure key={figure.mediaId} className="overflow-hidden rounded-lg border border-white/10 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- the media
                  route is authenticated and returns bytes; next/image would want
                  to proxy and cache it, which is exactly what must not happen. */}
              <img
                src={figure.url}
                alt={figure.altText}
                className="mx-auto h-auto w-full max-w-3xl"
              />
              {figure.needsAltText && (
                <figcaption className="px-1 pt-2 text-[11px] text-slate-500">
                  A written description of this diagram has not been authored yet.
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {(responseFormat.kind === "single-option" || responseFormat.kind === "multiple-options") && choices.length > 0 && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="sr-only">
            {multiSelect ? "Select every answer that applies" : "Select one answer"}
          </legend>
          {choices.map((choice) => {
            const picked = multiSelect ? ticked.includes(choice.id) : selectedOne === choice.id;
            return (
              <label
                key={choice.id}
                className={cn(OPTION_BASE, picked ? OPTION_PICKED : OPTION_IDLE, disabled && OPTION_OFF)}
              >
                <input
                  type={multiSelect ? "checkbox" : "radio"}
                  name="oir-choice"
                  value={choice.id}
                  checked={picked}
                  disabled={disabled}
                  onChange={() =>
                    multiSelect
                      ? toggleMany(choice.id)
                      : onAnswer({ kind: "single-option", optionId: choice.id })
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
                />
                <span className="text-sm text-slate-100">
                  <span className="mr-2 font-mono text-xs text-slate-400">{choice.id}</span>
                  {choice.label}
                </span>
              </label>
            );
          })}
          {optionSource === "figure" && (
            <p className="pt-1 text-xs text-slate-500">
              The numbered choices are printed inside the figure above.
            </p>
          )}
        </fieldset>
      )}

      {responseFormat.kind === "boolean" && (
        <fieldset disabled={disabled} className="flex gap-3">
          <legend className="sr-only">Answer yes or no</legend>
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ].map((choice) => {
            const picked = answer !== null && answer.kind === "boolean" && answer.value === choice.value;
            return (
              <label
                key={choice.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2",
                  picked ? OPTION_PICKED : OPTION_IDLE,
                  disabled && OPTION_OFF,
                )}
              >
                <input
                  type="radio"
                  name="oir-boolean"
                  checked={picked}
                  disabled={disabled}
                  onChange={() => onAnswer({ kind: "boolean", value: choice.value })}
                  className="h-4 w-4 accent-emerald-400"
                />
                <span className="text-sm text-slate-100">{choice.label}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {responseFormat.kind === "short-text" && (
        <div className="max-w-xs">
          <label htmlFor="oir-short-text" className="mb-1 block text-xs text-slate-400">
            Your answer
          </label>
          <input
            id="oir-short-text"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={responseFormat.maxLength}
            disabled={disabled}
            value={answer !== null && answer.kind === "short-text" ? answer.value : ""}
            onChange={(event) => {
              const value = event.target.value.trim();
              onAnswer(value.length === 0 ? null : { kind: "short-text", value });
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60"
          />
        </div>
      )}

      {(responseFormat.kind === "multi-token" || responseFormat.kind === "ordered-sequence") && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="mb-1 text-xs text-slate-400">
            {responseFormat.kind === "ordered-sequence"
              ? `Your answer — ${responseFormat.count} values, in order`
              : `Your answer — ${responseFormat.count} values`}
          </legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: responseFormat.count }, (_, index) => (
                <input
                  key={index}
                  type="text"
                  autoComplete="off"
                  maxLength={16}
                  disabled={disabled}
                  aria-label={`Value ${index + 1} of ${responseFormat.count}`}
                  value={boxes[index] ?? ""}
                  onChange={(event) => {
                    const next = Array.from(
                      { length: responseFormat.count },
                      (_, slot) => (slot === index ? event.target.value.trim() : boxes[slot] ?? ""),
                    );
                    setBoxes(next);
                    // Partial input is not a valid answer, so it stays in the
                    // boxes and only becomes one when every one is filled.
                    onAnswer(
                      next.every((value) => value.length > 0)
                        ? { kind: responseFormat.kind, values: next }
                        : null,
                    );
                  }}
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-slate-100 outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60"
                />
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}
