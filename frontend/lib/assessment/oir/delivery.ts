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
import { candidateFacingOirSet } from "@/lib/assessment/oir/projection";
import type {
  OirModality,
  OirOptionSource,
  OirResponseFormat,
} from "@/lib/assessment/oir/types";
import type { MediaAssetId } from "@/lib/assessment/types";

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

export function deliverOirSet(setNumber: number): DeliveredOirSet {
  const facing = candidateFacingOirSet(setNumber);

  const questions = facing.questions.map(({ question, media }): DeliveredOirQuestion => {
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

  return { setNumber, questionCount: questions.length, questions };
}
