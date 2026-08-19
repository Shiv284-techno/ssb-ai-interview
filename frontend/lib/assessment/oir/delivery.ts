import "server-only";

/**
 * The shapes that actually go over the wire, and the mapping that builds them.
 *
 * There is a second projection here, on top of `projection.ts`, for one
 * specific reason: `CandidateFacingMedia` still carries `reference` — the
 * content-relative path `oir/set-01/figures/q01-fig1.png`. That is a location
 * inside the repository. It is not a secret, but it is internal, it tells a
 * caller how the content tree is laid out, and it invites a client to build a
 * URL from it. So the wire shape drops it and offers a media endpoint URL
 * instead: the browser learns an opaque id and a route, and nothing about where
 * anything lives.
 *
 * Both mappings are written field by field, never `{ ...item }`. A field added
 * to the bank or to a projection later must be added here deliberately before a
 * candidate can see it.
 */
import type { ChoiceOption } from "@/lib/assessment/content";
import {
  candidateFacingOirBank,
  candidateFacingOirSet,
  type CandidateFacingOirQuestion,
} from "@/lib/assessment/oir/projection";
import type {
  OirModality,
  OirOptionSource,
  OirResponseFormat,
} from "@/lib/assessment/oir/types";
import type { MediaAssetId } from "@/lib/assessment/types";

/**
 * Which sets exist, for callers on this side of the delivery boundary.
 *
 * Re-exported rather than imported from the bank by each caller. The question
 * route needs the list to validate `?set=`, and it must not reach into
 * `oir/bank` to get it: the whole point of this module is that a route can
 * only ever see what delivery chooses to expose.
 */
export { OIR_SETS } from "@/lib/assessment/oir/bank";

/** Where the media route lives. One definition, used to build every URL. */
export const OIR_MEDIA_ROUTE = "/api/assessment/oir/media";

export function oirMediaUrl(mediaId: MediaAssetId): string {
  return `${OIR_MEDIA_ROUTE}/${encodeURIComponent(mediaId)}`;
}

export interface DeliveredOirFigure {
  readonly mediaId: MediaAssetId;
  /** 1-based, in the order the source prints them. */
  readonly order: number;
  /** Fetch this; it requires the same session as the question did. */
  readonly url: string;
  readonly mimeType: string;
  readonly altText: string;
  /**
   * True while `altText` is the authored placeholder rather than a description.
   * Sent deliberately: a client that hides this is choosing to, and an assistive
   * user is better served by knowing a description is missing than by a
   * confident sentence nobody wrote.
   */
  readonly needsAltText: boolean;
}

export interface DeliveredOirQuestion {
  readonly id: string;
  readonly type: "oir-question";
  /** Empty when the question is drawn entirely inside its figure. */
  readonly stem: string;
  readonly options: readonly ChoiceOption[];
  readonly optionSource: OirOptionSource;
  /**
   * The numbered choices the diagram shows. Empty unless `optionSource` is
   * "figure". The browser needs it to render exactly the choices the candidate
   * can see, rather than guessing at how many there are.
   */
  readonly pictorialOptionIds: readonly string[];
  /** How a written answer must be shaped. Null when the question offers choices. */
  readonly responseFormat: OirResponseFormat;
  readonly modality: OirModality;
  readonly figures: readonly DeliveredOirFigure[];
}

export interface DeliveredOirSet {
  readonly setNumber: number;
  readonly questionCount: number;
  readonly questions: readonly DeliveredOirQuestion[];
}

/**
 * The combined bank as delivered.
 *
 * No `setNumber`, deliberately: it spans sets, and a single number here would
 * be a lie a client could act on. Which set a question came from is not
 * something a candidate is told — the id is global and that is all they need.
 */
export interface DeliveredOirBank {
  readonly questionCount: number;
  readonly questions: readonly DeliveredOirQuestion[];
}

function deliverQuestions(
  facing: readonly CandidateFacingOirQuestion[],
): readonly DeliveredOirQuestion[] {
  return facing.map(({ question, media }): DeliveredOirQuestion => {
    const byId = new Map(media.map((asset) => [asset.id, asset]));

    const figures = question.figures.map((figure): DeliveredOirFigure => {
      const asset = byId.get(figure.mediaId);
      if (!asset) {
        // The projection guarantees this; failing loudly beats serving a
        // question whose picture the candidate cannot fetch.
        throw new Error(`OIR delivery: ${question.id} references unresolved media`);
      }
      // `reference`, `kind`, `width`, `height` and `isIntentionallyIndistinct`
      // are deliberately not forwarded. The first is an internal path; the rest
      // say nothing a candidate needs about a diagram they are about to see.
      return {
        mediaId: figure.mediaId,
        order: figure.order,
        url: oirMediaUrl(figure.mediaId),
        mimeType: asset.mimeType,
        altText: asset.altText,
        needsAltText: figure.needsAltText,
      };
    });

    return {
      id: question.id,
      type: "oir-question",
      stem: question.stem,
      options: question.options,
      optionSource: question.optionSource,
      pictorialOptionIds: question.pictorialOptionIds,
      responseFormat: question.responseFormat,
      modality: question.modality,
      figures,
    };
  });
}

export function deliverOirSet(setNumber: number): DeliveredOirSet {
  const questions = deliverQuestions(candidateFacingOirSet(setNumber).questions);
  return { setNumber, questionCount: questions.length, questions };
}

/**
 * Every candidate-ready question across every ingested set.
 *
 * What the OIR client actually needs now that a paper mixes sets: it holds the
 * attempt's question ids and looks each one up, so it must be able to resolve
 * an id from any set. Delivering the whole verified bank rather than only the
 * fifty served keeps this boundary doing no selection, which is what the
 * per-set version was written to do and is still the right split — the served
 * fifty are decided by the attempt service and pinned in the attempt, and this
 * route has no business knowing which fifty they were.
 *
 * Nothing new crosses the boundary. These are the same field-by-field
 * projections, with the same answer keys, explanations, provenance, curations
 * and source pages left behind; there are simply more of them.
 */
export function deliverOirBank(): DeliveredOirBank {
  const questions = deliverQuestions(candidateFacingOirBank());
  return { questionCount: questions.length, questions };
}
