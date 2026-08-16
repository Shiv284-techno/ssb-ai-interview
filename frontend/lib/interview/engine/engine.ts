import "server-only";

import type { AnswerAnalysis } from "@/lib/interview/engine/analysis";
import type {
  InterviewerProvider,
  QuestionStrategy,
} from "@/lib/interview/engine/provider";
import {
  recordAnalysis,
  type ConversationState,
} from "@/lib/interview/engine/state";

/**
 * Orchestration for one interviewing turn:
 *
 *   1. derive state          (the caller does this with `deriveState`)
 *   2. analyse the answer    provider.analyse — deterministic today, a model later
 *   3. update state          recordAnalysis — pure, engine-owned
 *   4. choose a strategy     selectStrategy — pure, engine-owned
 *   5. generate a question   provider.generate
 *
 * Steps 3 and 4 never touch the provider, and the provider never mutates state.
 * That is what lets fact extraction, claim tracking, contradiction detection,
 * and adaptive difficulty grow here later without rewriting the provider — and
 * lets the provider be swapped without rewriting any of that.
 */

export interface InterviewTurnResult {
  readonly question: string;
  readonly isClosing: boolean;
  /** State after this turn's analysis was folded in. */
  readonly state: ConversationState;
  /** The strategy that produced the question, for tests and future logging. */
  readonly strategy: QuestionStrategy;
}

/**
 * Decides what the next question should do. Pure and deterministic.
 *
 * Three rules, in order:
 *
 *   1. too short or evasive        -> clarify
 *   2. a recognised topic worth pursuing -> probe that topic
 *   3. otherwise                   -> broaden
 *
 * Rules 2 and 3 are the pre-existing behaviour, unchanged: only the *first*
 * recognised topic is considered, matching the original `TOPICS.find(...)`, and
 * an exhausted topic still falls through to the generic pool inside the
 * provider rather than trying the next match.
 *
 * Only rule 1's evasive half is new. Note that `isFollowUpWorthy` is guaranteed
 * true whenever an answer reaches rule 2 with a topic — it can only be false
 * here if the answer were evasive, which rule 1 has already caught — so rule 2
 * selects exactly the cases the old `topicIds[0] ?? null` check did.
 */
function selectStrategy(analysis: AnswerAnalysis): QuestionStrategy {
  if (analysis.isTooShort) {
    return { kind: "clarify", topicId: null, reason: "answer-too-short" };
  }

  if (analysis.isEvasive) {
    return { kind: "clarify", topicId: null, reason: "answer-evasive" };
  }

  const topicId = analysis.topicIds[0] ?? null;
  if (analysis.isFollowUpWorthy && topicId !== null) {
    return { kind: "probe", topicId, reason: "follow-up-worthy-topic" };
  }

  return { kind: "broaden", topicId: null, reason: "no-recognised-topic" };
}

export async function runTurn(
  state: ConversationState,
  provider: InterviewerProvider,
): Promise<InterviewTurnResult> {
  const analysis = await provider.analyse({ state });
  const nextState = recordAnalysis(state, analysis);
  const strategy = selectStrategy(analysis);
  const question = await provider.generate({
    state: nextState,
    analysis,
    strategy,
  });

  return {
    question,
    // Interview-ending logic is not implemented yet.
    isClosing: false,
    state: nextState,
    strategy,
  };
}
