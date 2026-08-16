import "server-only";

/**
 * The topic vocabulary, shared by the analyser and by any provider that wants
 * to know which topic an answer touched.
 *
 * These keyword lists were moved here verbatim from the mock provider so the
 * analyser and the question bank cannot drift apart, and so the regexes are
 * compiled exactly once rather than duplicated per consumer. Only the topic
 * *identity* lives here — the questions themselves stay with the provider that
 * asks them, because a model-backed provider will not use canned strings.
 *
 * Pure data plus two pure functions: no I/O, no environment, no clock.
 */

export interface TopicDefinition {
  readonly id: string;
  readonly keywords: readonly string[];
}

/**
 * Ordered by specificity — the first topic whose keyword appears in the answer
 * wins. Family sits above motivation so "my father is in the army" is read as a
 * family cue rather than a motivation one.
 */
export const TOPICS: readonly TopicDefinition[] = [
  {
    id: "family",
    keywords: [
      "family",
      "father",
      "mother",
      "parents",
      "brother",
      "sister",
      "sibling",
      "dad",
      "mom",
      "grandfather",
      "grandmother",
      "hometown",
    ],
  },
  {
    id: "armed-forces",
    keywords: [
      "army",
      "navy",
      "air force",
      "armed forces",
      "defence",
      "defense",
      "military",
      "nda",
      "cds",
      "afcat",
      "ssb",
      "soldier",
      "uniform",
      "serve the country",
      "commission",
    ],
  },
  {
    id: "leadership",
    keywords: [
      "lead",
      "led",
      "leader",
      "leadership",
      "captain",
      "team",
      "teamwork",
      "group",
      "organised",
      "organized",
      "coordinated",
      "president",
      "secretary",
      "volunteer",
      "club",
    ],
  },
  {
    id: "decision-making",
    keywords: [
      "decision",
      "decided",
      "decide",
      "chose",
      "choice",
      "dilemma",
      "pressure",
      "risk",
      "judgement",
      "judgment",
      "priority",
    ],
  },
  {
    id: "achievement-failure",
    keywords: [
      "achievement",
      "achieved",
      "award",
      "won",
      "winner",
      "prize",
      "medal",
      "topper",
      "failure",
      "failed",
      "mistake",
      "setback",
      "rejected",
      "lost",
    ],
  },
  {
    id: "strengths-weaknesses",
    keywords: [
      "strength",
      "strengths",
      "weakness",
      "weaknesses",
      "shortcoming",
      "flaw",
      "improve",
      "confident",
      "confidence",
      "discipline",
      "disciplined",
      "patience",
      "impatient",
      "temper",
      "hard working",
      "hardworking",
    ],
  },
  {
    id: "education",
    keywords: [
      "school",
      "college",
      "university",
      "degree",
      "engineering",
      "b.tech",
      "btech",
      "graduate",
      "graduation",
      "marks",
      "percentage",
      "cgpa",
      "semester",
      "exam",
      "study",
      "studied",
      "studying",
      "subject",
    ],
  },
  {
    id: "hobbies",
    keywords: [
      "hobby",
      "hobbies",
      "interest",
      "interests",
      "sport",
      "sports",
      "cricket",
      "football",
      "hockey",
      "athletics",
      "running",
      "swimming",
      "cycling",
      "trekking",
      "gym",
      "chess",
      "reading",
      "books",
      "music",
      "painting",
      "photography",
    ],
  },
  {
    id: "awareness",
    keywords: [
      "news",
      "current affairs",
      "politics",
      "political",
      "economy",
      "economic",
      "government",
      "policy",
      "border",
      "neighbour",
      "neighbor",
      "international",
      "technology",
      "climate",
      "society",
    ],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One word-boundary alternation per topic, compiled once at module load. */
const TOPIC_PATTERNS = new Map<string, RegExp>(
  TOPICS.map((topic) => [
    topic.id,
    new RegExp(`\\b(?:${topic.keywords.map(escapeRegExp).join("|")})\\b`, "i"),
  ]),
);

/**
 * Every topic the answer touches, in `TOPICS` order. The first element is
 * therefore the same topic the original `TOPICS.find(...)` would have picked.
 */
export function matchTopicIds(answer: string): string[] {
  return TOPICS.filter(
    (topic) => TOPIC_PATTERNS.get(topic.id)?.test(answer) ?? false,
  ).map((topic) => topic.id);
}
