import "server-only";

import { matchTopicIds } from "@/lib/interview/engine/topics";

/**
 * Deterministic answer analysis.
 *
 * Every rule here is a countable property of the text: how many words it has,
 * which topic keywords it contains, whether it is one of a small set of stock
 * non-answers. Nothing infers mood, personality, or confidence — a transcript
 * cannot support those claims, and an SSB assessment that pretended otherwise
 * would be worse than useless.
 *
 * Pure and provider-independent: no model, no network, no environment, no
 * clock, no browser API. The same string always yields the same analysis, which
 * is what makes the engine testable without a provider running.
 */

export type Specificity = "low" | "medium" | "high";

export interface AnswerAnalysis {
  /** The answer that was analysed, trimmed. */
  readonly answer: string;
  /** Words in the answer, by the tokeniser below. */
  readonly wordCount: number;
  /**
   * Topics recognised in the answer, most relevant first. Provider-defined
   * ids — the engine treats them as opaque strings and never enumerates them.
   */
  readonly topicIds: readonly string[];
  /** How much concrete detail the answer carries. */
  readonly specificity: Specificity;
  /** True when the answer is too thin to interpret and needs repeating. */
  readonly isTooShort: boolean;
  /** True only for stock non-answers such as "yes" or "I don't know". */
  readonly isEvasive: boolean;
  /** True when there is something concrete an interviewer could probe. */
  readonly isFollowUpWorthy: boolean;
  /** Which detail markers fired, so a verdict can always be explained. */
  readonly detailMarkers: readonly string[];
}

/**
 * Unchanged from the pre-analysis engine: an answer shorter than two characters
 * is treated as speech recognition returning nothing usable.
 */
const MIN_ANSWER_LENGTH = 2;

/** Keeps "don't" and "father-in-law" as single words. */
const WORD_PATTERN = /[a-z0-9]+(?:['-][a-z0-9]+)*/gi;

/**
 * Stock non-answers, matched against the *entire* normalised answer. Matching
 * the whole string is what keeps this conservative: "No, I disagree, because
 * the plan ignored the weather" starts with "no" but is not in this set, so it
 * is never called evasive. A short but real answer is not evasive either —
 * "I play cricket" is brief, specific, and perfectly responsive.
 */
const EVASIVE_ANSWERS: ReadonlySet<string> = new Set([
  "yes",
  "yeah",
  "yep",
  "no",
  "nope",
  "maybe",
  "perhaps",
  "i don't know",
  "i dont know",
  "don't know",
  "dont know",
  "no idea",
  "i have no idea",
  "not really",
  "not sure",
  "i'm not sure",
  "im not sure",
  "i am not sure",
  "i can't say",
  "i cant say",
  "can't say",
  "cant say",
  "nothing",
  "nothing much",
  "no comment",
  "none",
]);

/** Stripped from the front before the evasive check, so "Well, no" still counts. */
const FILLER_PREFIXES: readonly string[] = [
  "well",
  "um",
  "umm",
  "uh",
  "er",
  "sir",
  "ma'am",
  "madam",
  "actually",
  "basically",
  "i mean",
  "you know",
];

/**
 * Concrete-detail signals. Each fires at most once, and each is a surface
 * feature of the text rather than a judgement about the candidate.
 */
const DETAIL_MARKERS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "number", pattern: /\d/ },
  {
    id: "causal",
    pattern:
      /\b(?:because|since|so that|therefore|as a result|which is why|due to|in order to)\b/i,
  },
  {
    id: "temporal",
    pattern:
      /\b(?:when|after|before|during|while|then|finally|yesterday|today|tomorrow|last year|this year|every day|daily|weekly|monthly)\b/i,
  },
  {
    id: "example",
    pattern: /\b(?:for example|for instance|such as|first|second|third|once)\b/i,
  },
];

function countWords(answer: string): number {
  return (answer.match(WORD_PATTERN) ?? []).length;
}

/** Lowercases, folds curly apostrophes, and reduces punctuation to spaces. */
function normalise(answer: string): string {
  return answer
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripFiller(normalised: string): string {
  let result = normalised;
  let changed = true;

  while (changed) {
    changed = false;
    for (const filler of FILLER_PREFIXES) {
      if (result === filler) return "";
      if (result.startsWith(`${filler} `)) {
        result = result.slice(filler.length + 1);
        changed = true;
      }
    }
  }

  return result;
}

function findDetailMarkers(answer: string): string[] {
  return DETAIL_MARKERS.filter((marker) => marker.pattern.test(answer)).map(
    (marker) => marker.id,
  );
}

/**
 * Thresholds are deliberately blunt and stated in one place:
 *
 *   high   — 30+ words, or 12+ words carrying at least one detail marker
 *   medium — 8+ words, or any detail marker
 *   low    — anything else
 */
function gradeSpecificity(wordCount: number, markerCount: number): Specificity {
  if (wordCount >= 30 || (wordCount >= 12 && markerCount >= 1)) return "high";
  if (wordCount >= 8 || markerCount >= 1) return "medium";
  return "low";
}

export function analyseAnswer(rawAnswer: string): AnswerAnalysis {
  const answer = rawAnswer.trim();

  const isTooShort = answer.length < MIN_ANSWER_LENGTH;
  if (isTooShort) {
    return {
      answer,
      wordCount: countWords(answer),
      topicIds: [],
      specificity: "low",
      isTooShort: true,
      isEvasive: false,
      isFollowUpWorthy: false,
      detailMarkers: [],
    };
  }

  const wordCount = countWords(answer);
  const topicIds = matchTopicIds(answer);
  const detailMarkers = findDetailMarkers(answer);
  const specificity = gradeSpecificity(wordCount, detailMarkers.length);
  const isEvasive = EVASIVE_ANSWERS.has(stripFiller(normalise(answer)));

  // Something concrete to probe: a recognised topic, or enough detail to be
  // worth pursuing even when no topic keyword appeared.
  const isFollowUpWorthy =
    !isEvasive && (topicIds.length > 0 || specificity !== "low");

  return {
    answer,
    wordCount,
    topicIds,
    specificity,
    isTooShort: false,
    isEvasive,
    isFollowUpWorthy,
    detailMarkers,
  };
}
