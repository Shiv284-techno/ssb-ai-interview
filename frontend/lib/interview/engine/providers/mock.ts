import "server-only";

import {
  analyseAnswer,
  type AnswerAnalysis,
} from "@/lib/interview/engine/analysis";
import type {
  AnalyseInput,
  GenerateInput,
  InterviewerProvider,
} from "@/lib/interview/engine/provider";

/**
 * Deterministic provider. No external API, no API key, no network, no cost —
 * and no model, so it is also the offline fallback once a real provider exists.
 *
 * It owns the question bank and nothing else. The topic keywords it used to
 * carry now live in `topics.ts`, shared with the analyser so the two cannot
 * drift; the analysis itself is `analyseAnswer`, which this provider simply
 * delegates to. A model-backed provider would replace that delegation with a
 * call to the model and write its own sentences instead of picking canned ones.
 *
 * Every question string below is unchanged from the original route handler, and
 * no new ones were added: the `clarify` strategy reuses the existing
 * clarification line, and `probe`/`broaden` reuse the existing ladder.
 */

/**
 * Follow-ups keyed by the shared topic ids, in their original order — the
 * ladder takes the first one nobody has used yet.
 */
const TOPIC_FOLLOW_UPS: Readonly<Record<string, readonly string[]>> = {
  family: [
    "What has your family's example taught you that you still carry?",
    "How does your family view your decision to appear before the board?",
    "Which of your family's expectations do you find hardest to meet?",
  ],
  "armed-forces": [
    "Why the armed forces and not a civilian career with the same qualifications?",
    "What do you expect service life to demand of you that civilian life would not?",
    "If you are not selected this time, what will you do next?",
  ],
  leadership: [
    "Describe a time that group did not follow you. What did you do?",
    "How did you divide the work, and who decided that division?",
    "What did that responsibility cost you personally?",
  ],
  "decision-making": [
    "What were you weighing when you made that decision?",
    "Whom did you consult before deciding, and why them?",
    "Knowing the outcome now, would you decide the same way?",
  ],
  "achievement-failure": [
    "What did that outcome change about the way you prepare?",
    "Who or what was responsible for it, in your own assessment?",
    "Tell me about something you attempted and did not complete.",
  ],
  "strengths-weaknesses": [
    "Who else would describe you that way, and what would they point to?",
    "What are you doing about it at present?",
    "Where has that quality worked against you?",
  ],
  education: [
    "Why did you choose that course over the alternatives available to you?",
    "Which subject did you struggle with, and how did you handle it?",
    "How would your teachers describe you as a student?",
  ],
  hobbies: [
    "How much time did you give it in the last month?",
    "What has it taught you that your studies did not?",
    "Whom do you pursue it with?",
  ],
  awareness: [
    "What is your own view on it, and what is it based on?",
    "Where do you follow that from, and how regularly?",
    "What argument would someone on the other side of it make?",
  ],
};

/** Used when nothing matches, or when a matched topic is already exhausted. */
const GENERIC_FOLLOW_UPS = [
  "Take me through that in a little more detail.",
  "What did you learn from that?",
  "How would the people around you describe that same event?",
  "What would you do differently if it happened again tomorrow?",
  "Give me a specific instance of that.",
  "Why does that matter to you?",
];

/**
 * Asked when speech recognition returns an empty or near-empty answer, and now
 * also when the answer is a stock non-answer. Reused rather than replaced, so
 * the question bank is unchanged from the previous step.
 */
const CLARIFICATION = "I did not catch that. Say it again, please.";

/**
 * The canned-question ladder: the first follow-up nobody has used yet, then the
 * generic pool, then a deterministic cycle once even that is exhausted. This is
 * bookkeeping over a fixed list of strings, which is why it lives in the
 * provider — a model-backed provider writes a sentence instead.
 */
function nextGeneric(askedQuestions: ReadonlySet<string>, officerTurnCount: number): string {
  const unusedGeneric = GENERIC_FOLLOW_UPS.find(
    (question) => !askedQuestions.has(question),
  );
  if (unusedGeneric) return unusedGeneric;

  // Every canned question has been used — cycle deterministically.
  return GENERIC_FOLLOW_UPS[officerTurnCount % GENERIC_FOLLOW_UPS.length];
}

export const mockInterviewerProvider: InterviewerProvider = {
  id: "mock",

  analyse({ state }: AnalyseInput): Promise<AnswerAnalysis> {
    return Promise.resolve(analyseAnswer(state.latestAnswer));
  },

  generate({ state, strategy }: GenerateInput): Promise<string> {
    if (strategy.kind === "clarify") {
      return Promise.resolve(CLARIFICATION);
    }

    const askedQuestions = new Set(state.askedQuestions);

    if (strategy.kind === "probe" && strategy.topicId !== null) {
      const unusedInTopic = TOPIC_FOLLOW_UPS[strategy.topicId]?.find(
        (question) => !askedQuestions.has(question),
      );
      if (unusedInTopic) return Promise.resolve(unusedInTopic);
    }

    return Promise.resolve(nextGeneric(askedQuestions, state.officerTurnCount));
  },
};
