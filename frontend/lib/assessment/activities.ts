import type { OirAnswerKeyKind } from "@/lib/assessment/oir/types";
import type {
  ActivityDefinitionId,
  DifficultyBand,
} from "@/lib/assessment/types";

/**
 * The activities this simulator models, and the shape of each one's
 * configuration.
 *
 * The thirteen non-physical activities are one discriminated union. The three
 * physical ones are a **separate** type that is deliberately not part of it, so
 * a ground task cannot be assigned, scheduled, or given a definition by
 * accident — the compiler refuses rather than a comment asking politely.
 *
 * Client-safe: definitions describe how an activity runs, never its content and
 * never a candidate's answers.
 */

/** The thirteen activities in scope. */
export type AssessmentActivityKind =
  // Day 1 — screening
  | "oir"
  | "ppdt"
  // Day 2 — psychology
  | "tat"
  | "wat"
  | "srt"
  | "sd"
  // Day 3 — group testing, non-physical
  | "gd"
  | "gpe"
  // Day 4 — group testing, non-physical
  | "lecturette"
  | "command-task"
  | "fgt"
  // Day 5
  | "interview"
  | "conference";

export const ASSESSMENT_ACTIVITY_KINDS: readonly AssessmentActivityKind[] = [
  "oir",
  "ppdt",
  "tat",
  "wat",
  "srt",
  "sd",
  "gd",
  "gpe",
  "lecturette",
  "command-task",
  "fgt",
  "interview",
  "conference",
];

/**
 * Physical ground tasks. Out of scope: they cannot be simulated meaningfully in
 * a browser, and pretending otherwise would produce a score that means nothing.
 *
 * This is its own type on purpose. `AssessmentActivityKind` does not include
 * it, so no schedule, definition, attempt, or content item can reference one.
 */
export type PhysicalActivityKind =
  | "pgt"
  | "gor-snake-race"
  | "individual-obstacles";

export interface ExcludedActivity {
  readonly kind: PhysicalActivityKind;
  readonly title: string;
  readonly reason: string;
}

/** Recorded so the exclusion is documented rather than merely absent. */
export const EXCLUDED_PHYSICAL_ACTIVITIES: readonly ExcludedActivity[] = [
  {
    kind: "pgt",
    title: "Progressive Group Task",
    reason: "Physical obstacle work; cannot be represented without a ground.",
  },
  {
    kind: "gor-snake-race",
    title: "Group Obstacle Race (Snake Race)",
    reason: "Physical team race; cannot be represented without a ground.",
  },
  {
    kind: "individual-obstacles",
    title: "Individual Obstacles",
    reason: "Timed physical course; cannot be represented without a ground.",
  },
];

export type ActivityParticipation = "individual" | "group";

/**
 * How the clock behaves.
 *
 * `hard` closes the response when it expires — the psychology tests depend on
 * that pressure. `soft` records the overrun but accepts the answer. `none` is
 * for activities the assessor paces, such as the interview.
 */
export interface ActivityTiming {
  /** Total budget in seconds, or null when the activity is open-ended. */
  readonly totalSeconds: number | null;
  readonly enforcement: "hard" | "soft" | "none";
}

interface ActivityDefinitionBase<K extends AssessmentActivityKind> {
  readonly kind: K;
  readonly id: ActivityDefinitionId;
  readonly title: string;
  /** Full name, for screens that have room for it. */
  readonly fullTitle: string;
  /** Shown to the candidate before the activity begins, in order. */
  readonly instructions: readonly string[];
  readonly participation: ActivityParticipation;
  readonly timing: ActivityTiming;
  /**
   * Which slices of the PIQ this activity may see. Empty for the psychology
   * tests, which must not be coloured by what the candidate wrote elsewhere.
   */
  readonly piqAspects: readonly PiqAspect[];
}

/**
 * The parts of a candidate's PIQ an activity is allowed to request.
 *
 * Coarse on purpose. An activity asks for "education", not for a home address,
 * so the projection in `context.ts` can hand over the least that will do.
 */
export type PiqAspect =
  | "identity"
  | "family"
  | "education"
  | "activities"
  | "service-background";

// ---------------------------------------------------------------------------
// Activity-specific configuration
// ---------------------------------------------------------------------------

export interface OirSection {
  readonly label: string;
  readonly questionCount: number;
  readonly timeLimitSeconds: number;
}

export interface OirActivity extends ActivityDefinitionBase<"oir"> {
  readonly sections: readonly OirSection[];
  readonly negativeMarking: boolean;
  /**
   * The forms an answer may take on this paper.
   *
   * Stated rather than assumed. An OIR paper is not uniformly multiple choice:
   * some questions want two of the printed figures, some are answered yes or
   * no, and some are written into blanks. Code that assumed one correct option
   * per question would mark a two-value answer wrong for being two values.
   */
  readonly answerFormats: readonly OirAnswerKeyKind[];
}

export interface PpdtActivity extends ActivityDefinitionBase<"ppdt"> {
  readonly perceptionSeconds: number;
  readonly storyWritingSeconds: number;
  readonly narrationSeconds: number;
  readonly groupDiscussionSeconds: number;
}

export interface TatActivity extends ActivityDefinitionBase<"tat"> {
  readonly slideCount: number;
  /** The last slide is traditionally blank; the candidate invents the picture. */
  readonly includesBlankSlide: boolean;
  readonly viewingSecondsPerSlide: number;
  readonly writingSecondsPerSlide: number;
}

export interface WatActivity extends ActivityDefinitionBase<"wat"> {
  readonly wordCount: number;
  readonly secondsPerWord: number;
}

export interface SrtActivity extends ActivityDefinitionBase<"srt"> {
  readonly situationCount: number;
  readonly totalSeconds: number;
}

/** Self Description: several short pieces from different points of view. */
export type SelfDescriptionPart =
  | "parents"
  | "teachers"
  | "friends"
  | "self"
  | "aspirations";

export interface SdActivity extends ActivityDefinitionBase<"sd"> {
  readonly parts: readonly SelfDescriptionPart[];
  readonly totalSeconds: number;
}

export interface GdActivity extends ActivityDefinitionBase<"gd"> {
  /** How many topics the group is offered to choose between. */
  readonly topicChoices: number;
  readonly discussionSeconds: number;
  readonly groupSize: number;
}

export interface GpeActivity extends ActivityDefinitionBase<"gpe"> {
  readonly narrationSeconds: number;
  readonly individualWritingSeconds: number;
  readonly groupDiscussionSeconds: number;
  readonly groupSize: number;
}

export interface LecturetteActivity extends ActivityDefinitionBase<"lecturette"> {
  readonly topicChoices: number;
  readonly preparationSeconds: number;
  readonly speakingSeconds: number;
}

export interface CommandTaskActivity extends ActivityDefinitionBase<"command-task"> {
  readonly subordinateCount: number;
  readonly totalSeconds: number;
}

export interface FgtActivity extends ActivityDefinitionBase<"fgt"> {
  readonly totalSeconds: number;
  readonly groupSize: number;
}

export interface InterviewActivity extends ActivityDefinitionBase<"interview"> {
  readonly expectedSeconds: number;
  /** The interview is the one activity that reads the PIQ in depth. */
  readonly usesCandidateProfile: true;
}

export interface ConferenceActivity extends ActivityDefinitionBase<"conference"> {
  readonly expectedSeconds: number;
}

/** Every activity definition, discriminated on `kind`. */
export type AssessmentActivity =
  | OirActivity
  | PpdtActivity
  | TatActivity
  | WatActivity
  | SrtActivity
  | SdActivity
  | GdActivity
  | GpeActivity
  | LecturetteActivity
  | CommandTaskActivity
  | FgtActivity
  | InterviewActivity
  | ConferenceActivity;

/** Narrows an activity to one kind without a cast at the call site. */
export function isActivityOfKind<K extends AssessmentActivityKind>(
  activity: AssessmentActivity,
  kind: K,
): activity is Extract<AssessmentActivity, { kind: K }> {
  return activity.kind === kind;
}

export function isGroupActivity(activity: AssessmentActivity): boolean {
  return activity.participation === "group";
}

// ---------------------------------------------------------------------------
// Sequencing, as data
// ---------------------------------------------------------------------------

export interface ScheduledDay {
  readonly day: number;
  readonly title: string;
  /** In the order the day runs them. */
  readonly activities: readonly AssessmentActivityKind[];
}

export interface AssessmentSchedule {
  readonly id: string;
  readonly title: string;
  readonly days: readonly ScheduledDay[];
}

/**
 * The default five-day order.
 *
 * Data, not control flow: an alternative schedule is another value of this
 * type, so a shortened run or a re-ordered day needs no code change. A session
 * records which schedule it followed.
 */
export const DEFAULT_SCHEDULE: AssessmentSchedule = {
  id: "standard-five-day",
  title: "Standard five-day board (non-physical activities)",
  days: [
    { day: 1, title: "Screening", activities: ["oir", "ppdt"] },
    { day: 2, title: "Psychology", activities: ["tat", "wat", "srt", "sd"] },
    { day: 3, title: "Group testing", activities: ["gd", "gpe"] },
    {
      day: 4,
      title: "Group testing",
      activities: ["lecturette", "command-task", "fgt"],
    },
    { day: 5, title: "Interview and conference", activities: ["interview", "conference"] },
  ],
};

/** The activities of a schedule, flattened into running order. */
export function scheduleOrder(
  schedule: AssessmentSchedule,
): readonly AssessmentActivityKind[] {
  return schedule.days.flatMap((day) => day.activities);
}

/** Which day an activity falls on, or null when the schedule omits it. */
export function dayOf(
  schedule: AssessmentSchedule,
  kind: AssessmentActivityKind,
): number | null {
  const day = schedule.days.find((entry) => entry.activities.includes(kind));
  return day ? day.day : null;
}

/**
 * Difficulty is only meaningful where an item can genuinely be harder than
 * another. A word for a word-association test is not "hard"; a reasoning
 * question is.
 */
export function supportsDifficulty(kind: AssessmentActivityKind): boolean {
  return kind === "oir";
}

export type { DifficultyBand };
