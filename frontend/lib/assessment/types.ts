/**
 * Primitives shared by every part of the assessment architecture.
 *
 * Nothing here knows about a particular test. It defines the identifiers, the
 * lifecycle states, and the provenance record that the content bank, the
 * session model, and the evaluation layer all speak in.
 *
 * Client-safe by design: this module is types and pure functions, no data and
 * no secrets, so both a route handler and a component may use it. Modules that
 * hold actual content — answer keys above all — carry `import "server-only"`
 * instead, and that is what keeps a question bank out of a browser bundle.
 */

/**
 * A nominal string type. Two ids of different kinds are both strings at run
 * time, but the compiler refuses to swap them, which is worth the small
 * ceremony when a session id and a candidate reference sit side by side.
 */
declare const brand: unique symbol;
type Branded<Kind extends string> = string & { readonly [brand]: Kind };

export type ContentItemId = Branded<"ContentItemId">;
export type MediaAssetId = Branded<"MediaAssetId">;
export type ActivityDefinitionId = Branded<"ActivityDefinitionId">;
export type SessionId = Branded<"SessionId">;
export type AttemptId = Branded<"AttemptId">;
export type ResponseId = Branded<"ResponseId">;
export type EvaluationId = Branded<"EvaluationId">;
export type ObservationId = Branded<"ObservationId">;
export type RubricCriterionId = Branded<"RubricCriterionId">;

/**
 * An opaque handle for the candidate taking a session.
 *
 * Deliberately NOT the account id, email, or name. The mapping from a session
 * to an account is held server-side, outside this model, so that a session
 * object can be passed around, logged in aggregate, or handed to an evaluator
 * without carrying an identity with it.
 */
export type CandidateRef = Branded<"CandidateRef">;

/** ISO 8601. Stored as a string so every structure stays plain JSON. */
export type IsoTimestamp = string;

/**
 * Content ids read `<activity>.<sequence>`, e.g. `wat.0001`.
 *
 * The shape is deliberate: ids sort into a stable order, say which activity
 * they belong to on sight, and never encode anything about a candidate.
 */
const CONTENT_ID_PATTERN = /^[a-z][a-z0-9-]*\.[0-9]{4,}$/;
/** Every other id is a lowercase, dash-separated token. */
const SIMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isContentItemId(value: string): boolean {
  return CONTENT_ID_PATTERN.test(value);
}

function makeId<T extends string>(
  value: string,
  pattern: RegExp,
  kind: string,
): T {
  if (!pattern.test(value)) {
    // The offending value is named because ids are authored content, never
    // candidate data — this message can never quote a person.
    throw new Error(`Invalid ${kind}: ${JSON.stringify(value)}`);
  }
  return value as T;
}

export const contentItemId = (value: string): ContentItemId =>
  makeId<ContentItemId>(value, CONTENT_ID_PATTERN, "content item id");
export const mediaAssetId = (value: string): MediaAssetId =>
  makeId<MediaAssetId>(value, CONTENT_ID_PATTERN, "media asset id");
export const activityDefinitionId = (value: string): ActivityDefinitionId =>
  makeId<ActivityDefinitionId>(value, SIMPLE_ID_PATTERN, "activity definition id");
export const rubricCriterionId = (value: string): RubricCriterionId =>
  makeId<RubricCriterionId>(value, SIMPLE_ID_PATTERN, "rubric criterion id");

/**
 * Runtime ids belong to one session and are opaque. They are validated only for
 * shape, never parsed for meaning.
 */
const OPAQUE_PATTERN = /^[A-Za-z0-9_-]{8,}$/;
export const sessionId = (value: string): SessionId =>
  makeId<SessionId>(value, OPAQUE_PATTERN, "session id");
export const attemptId = (value: string): AttemptId =>
  makeId<AttemptId>(value, OPAQUE_PATTERN, "attempt id");
export const responseId = (value: string): ResponseId =>
  makeId<ResponseId>(value, OPAQUE_PATTERN, "response id");
export const evaluationId = (value: string): EvaluationId =>
  makeId<EvaluationId>(value, OPAQUE_PATTERN, "evaluation id");
export const observationId = (value: string): ObservationId =>
  makeId<ObservationId>(value, OPAQUE_PATTERN, "observation id");
export const candidateRef = (value: string): CandidateRef =>
  makeId<CandidateRef>(value, OPAQUE_PATTERN, "candidate reference");

/** Where a piece of content came from. Required on every item and asset. */
export type ContentProvenance =
  | {
      readonly kind: "original";
      /** Who wrote it for this platform. */
      readonly author: string;
      readonly createdAt: IsoTimestamp;
    }
  | {
      readonly kind: "synthetic";
      /** What produced it — a script, a template, a model. */
      readonly generator: string;
      readonly createdAt: IsoTimestamp;
    }
  | {
      readonly kind: "public-domain";
      readonly source: string;
      readonly retrievedAt: IsoTimestamp;
    }
  | {
      readonly kind: "licensed";
      readonly licensor: string;
      readonly licence: string;
      /** Null when the licence does not expire. */
      readonly expiresAt: IsoTimestamp | null;
    }
  | {
      readonly kind: "user-provided";
      readonly suppliedBy: "candidate" | "assessor";
      readonly createdAt: IsoTimestamp;
    }
  | {
      /**
       * Held for comparison or study and NEVER shown to a candidate. Real
       * examination material would sit here if it were ever held at all, and
       * `isServable` below is what stops it reaching a session.
       */
      readonly kind: "reference-only";
      readonly note: string;
    };

export type ProvenanceKind = ContentProvenance["kind"];

/** Editorial lifecycle, independent of whether an item is currently chosen. */
export type ContentStatus = "draft" | "active" | "retired";

/**
 * Whether an item may be put in front of a candidate.
 *
 * Two conditions, both required: it has been published, and its provenance
 * permits use. Reference-only material fails the second no matter how it is
 * flagged elsewhere, so a mistake in the bank cannot leak it into a session.
 */
export function isServable(item: {
  readonly status: ContentStatus;
  readonly provenance: ContentProvenance;
}): boolean {
  return item.status === "active" && item.provenance.kind !== "reference-only";
}

/** Coarse authoring difficulty, where an activity has a meaningful notion. */
export type DifficultyBand = "easy" | "moderate" | "hard";
