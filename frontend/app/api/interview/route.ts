import { NextResponse } from "next/server";

/**
 * Mock interviewing officer. Deterministic keyword matching only — no external
 * API, no API key, no cost. The request/response contract matches what the real
 * AI-backed route will expose, so the frontend can be wired now and the body of
 * this handler swapped later.
 */

type TurnRole = "officer" | "candidate";

interface InterviewTurn {
  role: TurnRole;
  text: string;
}

interface InterviewRequest {
  turns: InterviewTurn[];
  elapsedSeconds: number;
}

interface InterviewResponse {
  question: string;
  isClosing: boolean;
}

interface Topic {
  id: string;
  keywords: string[];
  followUps: string[];
}

/**
 * Ordered by specificity — the first topic whose keyword appears in the answer
 * wins. Family sits above motivation so "my father is in the army" is read as a
 * family cue rather than a motivation one.
 */
const TOPICS: Topic[] = [
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
    followUps: [
      "What has your family's example taught you that you still carry?",
      "How does your family view your decision to appear before the board?",
      "Which of your family's expectations do you find hardest to meet?",
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
    followUps: [
      "Why the armed forces and not a civilian career with the same qualifications?",
      "What do you expect service life to demand of you that civilian life would not?",
      "If you are not selected this time, what will you do next?",
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
    followUps: [
      "Describe a time that group did not follow you. What did you do?",
      "How did you divide the work, and who decided that division?",
      "What did that responsibility cost you personally?",
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
    followUps: [
      "What were you weighing when you made that decision?",
      "Whom did you consult before deciding, and why them?",
      "Knowing the outcome now, would you decide the same way?",
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
    followUps: [
      "What did that outcome change about the way you prepare?",
      "Who or what was responsible for it, in your own assessment?",
      "Tell me about something you attempted and did not complete.",
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
    followUps: [
      "Who else would describe you that way, and what would they point to?",
      "What are you doing about it at present?",
      "Where has that quality worked against you?",
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
    followUps: [
      "Why did you choose that course over the alternatives available to you?",
      "Which subject did you struggle with, and how did you handle it?",
      "How would your teachers describe you as a student?",
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
    followUps: [
      "How much time did you give it in the last month?",
      "What has it taught you that your studies did not?",
      "Whom do you pursue it with?",
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
    followUps: [
      "What is your own view on it, and what is it based on?",
      "Where do you follow that from, and how regularly?",
      "What argument would someone on the other side of it make?",
    ],
  },
];

/** Used when nothing matches, or when a matched topic is already exhausted. */
const GENERIC_FOLLOW_UPS = [
  "Take me through that in a little more detail.",
  "What did you learn from that?",
  "How would the people around you describe that same event?",
  "What would you do differently if it happened again tomorrow?",
  "Give me a specific instance of that.",
  "Why does that matter to you?",
];

/** Asked when speech recognition returns an empty or near-empty answer. */
const CLARIFICATION = "I did not catch that. Say it again, please.";

const MIN_ANSWER_LENGTH = 2;

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

function isTurn(value: unknown): value is InterviewTurn {
  if (typeof value !== "object" || value === null) return false;

  const { role, text } = value as { role?: unknown; text?: unknown };
  return (role === "officer" || role === "candidate") && typeof text === "string";
}

type ParseResult =
  | { ok: true; data: InterviewRequest }
  | { ok: false; error: string };

function parseRequest(payload: unknown): ParseResult {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { turns, elapsedSeconds } = payload as {
    turns?: unknown;
    elapsedSeconds?: unknown;
  };

  if (!Array.isArray(turns)) {
    return { ok: false, error: "`turns` must be an array." };
  }

  if (!turns.every(isTurn)) {
    return {
      ok: false,
      error:
        '`turns` entries must be { role: "officer" | "candidate", text: string }.',
    };
  }

  if (typeof elapsedSeconds !== "number" || !Number.isFinite(elapsedSeconds)) {
    return { ok: false, error: "`elapsedSeconds` must be a finite number." };
  }

  if (elapsedSeconds < 0) {
    return { ok: false, error: "`elapsedSeconds` must not be negative." };
  }

  if (!turns.some((turn) => turn.role === "candidate")) {
    return {
      ok: false,
      error: "`turns` must contain at least one candidate turn to follow up on.",
    };
  }

  return { ok: true, data: { turns, elapsedSeconds } };
}

function latestCandidateAnswer(turns: InterviewTurn[]): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === "candidate") return turn.text.trim();
  }
  return "";
}

/**
 * Picks the next question. Anything the officer has already asked is excluded,
 * so a topic raised twice yields a different probe rather than a repeat.
 */
function selectQuestion(turns: InterviewTurn[]): string {
  const answer = latestCandidateAnswer(turns);
  if (answer.length < MIN_ANSWER_LENGTH) return CLARIFICATION;

  const alreadyAsked = new Set(
    turns.filter((turn) => turn.role === "officer").map((turn) => turn.text),
  );

  const matched = TOPICS.find((topic) => TOPIC_PATTERNS.get(topic.id)?.test(answer));
  const unusedInTopic = matched?.followUps.find(
    (question) => !alreadyAsked.has(question),
  );
  if (unusedInTopic) return unusedInTopic;

  const unusedGeneric = GENERIC_FOLLOW_UPS.find(
    (question) => !alreadyAsked.has(question),
  );
  if (unusedGeneric) return unusedGeneric;

  // Every canned question has been used — cycle deterministically.
  const officerTurns = turns.filter((turn) => turn.role === "officer").length;
  return GENERIC_FOLLOW_UPS[officerTurns % GENERIC_FOLLOW_UPS.length];
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseRequest(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body: InterviewResponse = {
    question: selectQuestion(parsed.data.turns),
    // Interview-ending logic is not implemented yet.
    isClosing: false,
  };

  return NextResponse.json(body);
}
