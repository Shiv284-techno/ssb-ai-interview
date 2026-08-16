import "server-only";

import {
  analyseAnswer,
  type AnswerAnalysis,
  type Specificity,
} from "@/lib/interview/engine/analysis";

/**
 * Conversation state for the interview engine.
 *
 * Everything here is derived from the transcript the client sends, so the
 * server stays stateless: no database, no cache, no session storage. The state
 * is rebuilt on every request and thrown away when the response is written.
 * Every field is plain JSON data, so the whole thing stays serialisable and
 * deterministic — the same transcript always produces the same state.
 *
 * This module is provider-agnostic. It knows nothing about question banks or
 * models; the only judgement it makes about an answer comes from the shared
 * deterministic analyser.
 *
 * Candidate facts and claims are deliberately absent. Those need normalisation
 * and identity handling that this step does not attempt.
 */

export type TurnRole = "officer" | "candidate";

export interface InterviewTurn {
  role: TurnRole;
  text: string;
}

/** How much ground a single topic has covered so far. */
export interface TopicCoverage {
  topicId: string;
  /** How many analysed answers have raised it. */
  timesRaised: number;
  /** Index into `turns` of the answer that most recently raised it. */
  lastTurnIndex: number;
}

/** A compact, serialisable record of what one answer looked like. */
export interface AnswerQualityRecord {
  readonly turnIndex: number;
  readonly wordCount: number;
  readonly specificity: Specificity;
  readonly isTooShort: boolean;
  readonly isEvasive: boolean;
  readonly isFollowUpWorthy: boolean;
  readonly topicIds: readonly string[];
}

export interface ConversationState {
  readonly turns: readonly InterviewTurn[];
  readonly elapsedSeconds: number;
  /** Every question the officer has already put, in the order asked. */
  readonly askedQuestions: readonly string[];
  readonly officerTurnCount: number;
  readonly candidateTurnCount: number;
  /** The most recent candidate answer, trimmed. Empty when there is none. */
  readonly latestAnswer: string;
  /** Index of that answer in `turns`, or -1 when there is none. */
  readonly latestAnswerTurnIndex: number;
  /**
   * Topic coverage across the whole transcript. Populated by `recordAnalysis`,
   * never by `deriveState` — recognising a topic is an analysis concern.
   */
  readonly topics: Readonly<Record<string, TopicCoverage>>;
  /** Analysis of the latest answer, or null before `recordAnalysis` has run. */
  readonly latestAnswerAnalysis: AnswerAnalysis | null;
  /** One record per candidate turn, oldest first. */
  readonly answerQuality: readonly AnswerQualityRecord[];
  /** Answers that were too short or evasive, across the whole transcript. */
  readonly weakAnswerCount: number;
  /** How many of those ran up to and including the latest answer. */
  readonly consecutiveWeakAnswers: number;
}

/**
 * Builds the structural state for this turn from the transcript alone. Pure:
 * no I/O, no randomness, no clock. Analysis fields are left empty; they are
 * filled by `recordAnalysis` once the provider has read the latest answer.
 */
export function deriveState(
  turns: readonly InterviewTurn[],
  elapsedSeconds: number,
): ConversationState {
  const askedQuestions: string[] = [];
  let officerTurnCount = 0;
  let candidateTurnCount = 0;
  let latestAnswer = "";
  let latestAnswerTurnIndex = -1;

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];

    if (turn.role === "officer") {
      officerTurnCount += 1;
      askedQuestions.push(turn.text);
      continue;
    }

    candidateTurnCount += 1;
    // Later answers overwrite earlier ones, so this ends on the most recent.
    latestAnswer = turn.text.trim();
    latestAnswerTurnIndex = index;
  }

  return {
    turns,
    elapsedSeconds,
    askedQuestions,
    officerTurnCount,
    candidateTurnCount,
    latestAnswer,
    latestAnswerTurnIndex,
    topics: {},
    latestAnswerAnalysis: null,
    answerQuality: [],
    weakAnswerCount: 0,
    consecutiveWeakAnswers: 0,
  };
}

function toQualityRecord(
  analysis: AnswerAnalysis,
  turnIndex: number,
): AnswerQualityRecord {
  return {
    turnIndex,
    wordCount: analysis.wordCount,
    specificity: analysis.specificity,
    isTooShort: analysis.isTooShort,
    isEvasive: analysis.isEvasive,
    isFollowUpWorthy: analysis.isFollowUpWorthy,
    topicIds: analysis.topicIds,
  };
}

function isWeak(record: AnswerQualityRecord): boolean {
  return record.isTooShort || record.isEvasive;
}

/**
 * Folds the analysis of the latest answer into the state, together with a
 * history built by re-running the deterministic analyser over the earlier
 * answers in the transcript.
 *
 * The latest answer's record comes from `latestAnalysis` — which the provider
 * supplied and could one day be model-backed — while earlier answers use the
 * local analyser. That keeps the history reproducible without re-querying a
 * model for turns that have already been answered.
 *
 * Pure: returns a new state rather than mutating the one passed in.
 */
export function recordAnalysis(
  state: ConversationState,
  latestAnalysis: AnswerAnalysis,
): ConversationState {
  const answerQuality: AnswerQualityRecord[] = [];

  for (let index = 0; index < state.turns.length; index += 1) {
    const turn = state.turns[index];
    if (turn.role !== "candidate") continue;

    answerQuality.push(
      index === state.latestAnswerTurnIndex
        ? toQualityRecord(latestAnalysis, index)
        : toQualityRecord(analyseAnswer(turn.text), index),
    );
  }

  const topics: Record<string, TopicCoverage> = {};
  for (const record of answerQuality) {
    for (const topicId of record.topicIds) {
      const existing = topics[topicId];
      topics[topicId] = {
        topicId,
        timesRaised: (existing?.timesRaised ?? 0) + 1,
        lastTurnIndex: record.turnIndex,
      };
    }
  }

  let weakAnswerCount = 0;
  for (const record of answerQuality) {
    if (isWeak(record)) weakAnswerCount += 1;
  }

  let consecutiveWeakAnswers = 0;
  for (let index = answerQuality.length - 1; index >= 0; index -= 1) {
    if (!isWeak(answerQuality[index])) break;
    consecutiveWeakAnswers += 1;
  }

  return {
    ...state,
    topics,
    latestAnswerAnalysis: latestAnalysis,
    answerQuality,
    weakAnswerCount,
    consecutiveWeakAnswers,
  };
}
