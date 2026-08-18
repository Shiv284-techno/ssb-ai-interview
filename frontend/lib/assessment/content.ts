import type { AssessmentActivityKind } from "@/lib/assessment/activities";
import type {
  OirAnswerKey,
  OirCuration,
  OirFigureRef,
  OirModality,
  OirOptionSource,
  OirResponseFormat,
  OirSourcePages,
} from "@/lib/assessment/oir/types";
import type {
  ContentItemId,
  ContentProvenance,
  ContentStatus,
  DifficultyBand,
  IsoTimestamp,
  MediaAssetId,
} from "@/lib/assessment/types";

/**
 * The content bank's item types.
 *
 * A content item is a *question*, and nothing else. It never holds an answer a
 * candidate gave, a time they took, a session they were in, or a judgement
 * about them — those live in `response.ts` and `evaluation.ts`. Keeping the two
 * apart is what lets one item be served to a thousand candidates and lets a
 * response survive an item being retired.
 *
 * The types are a discriminated union rather than one interface with thirty
 * optional fields: a word prompt genuinely has nothing in common with a group
 * planning exercise, and pretending otherwise produces a type where every
 * access needs a null check and every mistake compiles.
 */

export interface ContentItemBase {
  readonly id: ContentItemId;
  /**
   * Which activities may serve this item. Usually one, but a situation can
   * serve both SRT and a group discussion, so it is a list.
   */
  readonly usedBy: readonly AssessmentActivityKind[];
  /** Bumped when the wording changes; the id stays put. */
  readonly version: number;
  readonly status: ContentStatus;
  readonly provenance: ContentProvenance;
  /** Free-form labels for selection: "leadership", "family", "current-affairs". */
  readonly tags: readonly string[];
  /** Only where the activity has a real notion of difficulty. */
  readonly difficulty: DifficultyBand | null;
  readonly authoredAt: IsoTimestamp;
  /** Optional note for reviewers. Never shown to a candidate. */
  readonly editorialNote: string | null;
}

export interface ChoiceOption {
  readonly id: string;
  readonly text: string;
}

/** OIR reasoning questions. The only item type with an objective answer. */
export interface MultipleChoiceItem extends ContentItemBase {
  readonly type: "multiple-choice";
  readonly prompt: string;
  readonly options: readonly ChoiceOption[];
  /**
   * The answer key. This is exactly why the bank is server-only: shipping it
   * to a browser would hand the candidate the marks.
   */
  readonly correctOptionId: string;
  readonly explanation: string | null;
}

/**
 * An OIR question as the practice book prints it.
 *
 * Separate from `MultipleChoiceItem` because an OIR question need not offer
 * text options at all: about half of them number their choices inside the
 * diagram, and several ask for a written value. `answerKey` is a union for the
 * same reason — see `oir/types.ts`.
 */
export interface OirQuestionItem extends ContentItemBase {
  readonly type: "oir-question";
  /** Empty when the question is drawn entirely inside its figure. */
  readonly stem: string;
  /** Empty when the choices are numbered inside the figure, or when there are none. */
  readonly options: readonly ChoiceOption[];
  readonly optionSource: OirOptionSource;
  /**
   * The numbered choices the diagram shows, recorded at ingestion from the
   * rendered figure. Empty unless `optionSource` is "figure". Without it an
   * answer naming picture 9 of 4 could not be told from a valid one.
   */
  readonly pictorialOptionIds: readonly string[];
  /** How a written answer must be shaped. Null when the question offers choices. */
  readonly responseFormat: OirResponseFormat;
  readonly figures: readonly OirFigureRef[];
  readonly modality: OirModality;
  /**
   * The answer key. This is exactly why the bank is server-only: shipping it
   * to a browser would hand the candidate the marks.
   */
  readonly answerKey: OirAnswerKey;
  readonly explanation: string | null;
  /** Which set of the source book this came from, and where in it. */
  readonly setNumber: number;
  readonly position: number;
  readonly sourcePages: OirSourcePages;
  /** Fields a reviewer supplied because the source could not be parsed for them. */
  readonly curations: readonly OirCuration[];
}

/** PP&DT and TAT pictures. */
export interface PictureItem extends ContentItemBase {
  readonly type: "picture";
  readonly mediaId: MediaAssetId;
  /** Shown only if the activity permits a caption; usually none. */
  readonly caption: string | null;
}

/**
 * The blank TAT slide. Modelled separately rather than as a picture with a null
 * media id, so a renderer cannot fail halfway looking for an image that was
 * never meant to exist.
 */
export interface BlankPictureItem extends ContentItemBase {
  readonly type: "blank-picture";
  readonly instruction: string;
}

/** WAT. One word, shown briefly. */
export interface WordPromptItem extends ContentItemBase {
  readonly type: "word-prompt";
  readonly word: string;
}

/** SRT. A short situation the candidate must respond to. */
export interface SituationItem extends ContentItemBase {
  readonly type: "situation";
  readonly situation: string;
}

/** SD, and any other "write about X" prompt. */
export interface WritingPromptItem extends ContentItemBase {
  readonly type: "writing-prompt";
  readonly prompt: string;
  readonly guidance: string | null;
}

/** GD topics and Lecturette topics. */
export interface DiscussionTopicItem extends ContentItemBase {
  readonly type: "discussion-topic";
  readonly topic: string;
  /** Optional framing points; never a model answer. */
  readonly talkingPoints: readonly string[];
}

/** GPE. A narrated scenario with a map and a set of problems. */
export interface GroupPlanningItem extends ContentItemBase {
  readonly type: "group-planning";
  readonly narrative: string;
  readonly problems: readonly string[];
  readonly resources: readonly string[];
  /** The sketch map, when one exists. */
  readonly mediaId: MediaAssetId | null;
}

/** Command Task and FGT. A structure to be crossed with given materials. */
export interface GroupTaskItem extends ContentItemBase {
  readonly type: "group-task";
  readonly briefing: string;
  readonly materials: readonly string[];
  readonly rules: readonly string[];
  readonly mediaId: MediaAssetId | null;
}

/**
 * An interview prompt.
 *
 * Present so the interview can eventually draw on the same bank as everything
 * else. The existing conversation engine is untouched by this step and keeps
 * its own question handling; this type is the seam for later, not a
 * replacement.
 */
export interface InterviewPromptItem extends ContentItemBase {
  readonly type: "interview-prompt";
  readonly prompt: string;
  /** What the prompt is meant to open up, for the assessor's benefit. */
  readonly focus: string;
}

export type ContentItem =
  | MultipleChoiceItem
  | OirQuestionItem
  | PictureItem
  | BlankPictureItem
  | WordPromptItem
  | SituationItem
  | WritingPromptItem
  | DiscussionTopicItem
  | GroupPlanningItem
  | GroupTaskItem
  | InterviewPromptItem;

export type ContentItemType = ContentItem["type"];

export const CONTENT_ITEM_TYPES: readonly ContentItemType[] = [
  "multiple-choice",
  "oir-question",
  "picture",
  "blank-picture",
  "word-prompt",
  "situation",
  "writing-prompt",
  "discussion-topic",
  "group-planning",
  "group-task",
  "interview-prompt",
];

export function isContentItemOfType<T extends ContentItemType>(
  item: ContentItem,
  type: T,
): item is Extract<ContentItem, { type: T }> {
  return item.type === type;
}

// ---------------------------------------------------------------------------
// What the candidate is allowed to see
// ---------------------------------------------------------------------------

/**
 * The candidate-facing form of an item.
 *
 * Built by subtraction from the stored item: the answer key, the editorial
 * note, the provenance record, and the lifecycle flags are all removed. Written
 * as an explicit mapping rather than a spread-and-delete so that a field added
 * to the bank later is *not* served by default — a new secret would have to be
 * deliberately added here to escape.
 */
export type CandidateFacingItem =
  | { readonly id: ContentItemId; readonly type: "multiple-choice"; readonly prompt: string; readonly options: readonly ChoiceOption[] }
  | {
      readonly id: ContentItemId;
      readonly type: "oir-question";
      readonly stem: string;
      readonly options: readonly ChoiceOption[];
      readonly optionSource: OirOptionSource;
      readonly pictorialOptionIds: readonly string[];
      readonly responseFormat: OirResponseFormat;
      readonly figures: readonly OirFigureRef[];
      readonly modality: OirModality;
    }
  | { readonly id: ContentItemId; readonly type: "picture"; readonly mediaId: MediaAssetId; readonly caption: string | null }
  | { readonly id: ContentItemId; readonly type: "blank-picture"; readonly instruction: string }
  | { readonly id: ContentItemId; readonly type: "word-prompt"; readonly word: string }
  | { readonly id: ContentItemId; readonly type: "situation"; readonly situation: string }
  | { readonly id: ContentItemId; readonly type: "writing-prompt"; readonly prompt: string; readonly guidance: string | null }
  | { readonly id: ContentItemId; readonly type: "discussion-topic"; readonly topic: string; readonly talkingPoints: readonly string[] }
  | { readonly id: ContentItemId; readonly type: "group-planning"; readonly narrative: string; readonly problems: readonly string[]; readonly resources: readonly string[]; readonly mediaId: MediaAssetId | null }
  | { readonly id: ContentItemId; readonly type: "group-task"; readonly briefing: string; readonly materials: readonly string[]; readonly rules: readonly string[]; readonly mediaId: MediaAssetId | null }
  | { readonly id: ContentItemId; readonly type: "interview-prompt"; readonly prompt: string };

export function toCandidateFacingItem(item: ContentItem): CandidateFacingItem {
  switch (item.type) {
    case "multiple-choice":
      // correctOptionId and explanation stay behind.
      return { id: item.id, type: "multiple-choice", prompt: item.prompt, options: item.options };
    case "oir-question":
      // answerKey, explanation, sourcePages and curations stay behind. The
      // figures are references to media, not the pictures themselves, and carry
      // no answer of their own.
      return {
        id: item.id,
        type: "oir-question",
        stem: item.stem,
        options: item.options,
        optionSource: item.optionSource,
        // Both of these were reviewed as candidate-safe: the numbered choices
        // are printed inside the figure the candidate is looking at, and the
        // response format describes the shape of the box they must fill in,
        // never its contents.
        pictorialOptionIds: item.pictorialOptionIds,
        responseFormat: item.responseFormat,
        figures: item.figures,
        modality: item.modality,
      };
    case "picture":
      return { id: item.id, type: "picture", mediaId: item.mediaId, caption: item.caption };
    case "blank-picture":
      return { id: item.id, type: "blank-picture", instruction: item.instruction };
    case "word-prompt":
      return { id: item.id, type: "word-prompt", word: item.word };
    case "situation":
      return { id: item.id, type: "situation", situation: item.situation };
    case "writing-prompt":
      return { id: item.id, type: "writing-prompt", prompt: item.prompt, guidance: item.guidance };
    case "discussion-topic":
      return { id: item.id, type: "discussion-topic", topic: item.topic, talkingPoints: item.talkingPoints };
    case "group-planning":
      return {
        id: item.id,
        type: "group-planning",
        narrative: item.narrative,
        problems: item.problems,
        resources: item.resources,
        mediaId: item.mediaId,
      };
    case "group-task":
      return {
        id: item.id,
        type: "group-task",
        briefing: item.briefing,
        materials: item.materials,
        rules: item.rules,
        mediaId: item.mediaId,
      };
    case "interview-prompt":
      // `focus` is the assessor's note on why the question is asked; telling the
      // candidate what is being looked for would change the answer.
      return { id: item.id, type: "interview-prompt", prompt: item.prompt };
  }
}
