import "server-only";

import type { ConversationState } from "@/lib/interview/engine/state";

/**
 * The seam between the conversation engine and whatever produces language.
 *
 * A provider does two things and nothing else: it reads an answer and reports
 * what it found (`analyse`), and it turns a decision the engine has already
 * made into a sentence (`generate`). It never decides *what kind* of question
 * comes next, and it never mutates state — those are the engine's job, and they
 * are the reason a future `OllamaProvider` can replace `mockInterviewerProvider`
 * without the engine changing.
 *
 * `AnswerAnalysis` is defined in `analysis.ts`, which owns the deterministic
 * implementation, and re-exported here so the provider contract still reads as
 * one file. A model-backed provider may produce that shape however it likes,
 * provided the fields keep their documented meaning.
 */

export type {
  AnswerAnalysis,
  Specificity,
} from "@/lib/interview/engine/analysis";

import type { AnswerAnalysis } from "@/lib/interview/engine/analysis";

/**
 * What the engine wants the next question to do.
 *
 * - `clarify` — the answer could not be used; ask for it again.
 * - `probe`   — go deeper on `topicId`.
 * - `broaden` — nothing recognisable to follow; open the ground up.
 */
export type StrategyKind = "clarify" | "probe" | "broaden";

export interface QuestionStrategy {
  readonly kind: StrategyKind;
  /** Set only for `probe`; null otherwise. */
  readonly topicId: string | null;
  /** Why the engine chose this, for logging and for prompting a model later. */
  readonly reason: StrategyReason;
}

/**
 * The rule that fired, kept as a closed union so a provider can branch on it
 * without parsing prose.
 */
export type StrategyReason =
  | "answer-too-short"
  | "answer-evasive"
  | "follow-up-worthy-topic"
  | "no-recognised-topic";

export interface AnalyseInput {
  readonly state: ConversationState;
}

export interface GenerateInput {
  readonly state: ConversationState;
  readonly analysis: AnswerAnalysis;
  readonly strategy: QuestionStrategy;
}

export interface InterviewerProvider {
  /** Stable identifier, e.g. "mock" or "ollama". Never a URL or a key. */
  readonly id: string;
  analyse(input: AnalyseInput): Promise<AnswerAnalysis>;
  /** Returns the question text only — no metadata, no transport concerns. */
  generate(input: GenerateInput): Promise<string>;
}
