import type {
  ContentProvenance,
  ContentStatus,
  IsoTimestamp,
  MediaAssetId,
} from "@/lib/assessment/types";

/**
 * References to pictures and audio, never the bytes themselves.
 *
 * PP&DT and TAT are picture tests, so the architecture has to carry images —
 * but a TypeScript module is the wrong place for them. Inlining a picture would
 * bloat every bundle that touched the bank, put binary data into source
 * control and into diffs, and make it impossible to serve an image with the
 * caching and access control it needs. So an asset is a *reference* plus the
 * metadata required to display it safely, and `isMediaReference` refuses the
 * shapes that would smuggle bytes back in.
 *
 * No real examination pictures are held. Assets are placeholders until
 * original or properly licensed artwork exists, and provenance records which.
 */

export type MediaKind = "image" | "audio";

export interface MediaAsset {
  readonly id: MediaAssetId;
  readonly kind: MediaKind;
  /**
   * A path relative to the media root, e.g. `ppdt/placeholder-01.webp`.
   * Resolved to a URL at serving time by whatever is hosting the files, so the
   * bank never hard-codes a host.
   */
  readonly reference: string;
  readonly mimeType: string;
  /**
   * Required. A picture test still has to be usable by a candidate relying on
   * a screen reader, and an image with no description is not.
   */
  readonly altText: string;
  /** Pixels; null when not yet known. */
  readonly width: number | null;
  readonly height: number | null;
  /**
   * True for the deliberately indistinct PP&DT picture, so a renderer never
   * "helpfully" sharpens it and a reviewer never files it as a bad scan.
   */
  readonly isIntentionallyIndistinct: boolean;
  readonly status: ContentStatus;
  readonly provenance: ContentProvenance;
  readonly addedAt: IsoTimestamp;
}

/**
 * Rejects anything that carries data rather than pointing at it.
 *
 * A `data:` URL, a base64 blob, or an absolute URL to somewhere else all fail:
 * the first two are bytes in disguise, and the third would let content pull
 * from a host nobody reviewed.
 */
export function isMediaReference(value: string): boolean {
  if (value.length === 0) return false;
  if (/^data:/i.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  // No traversal out of the media root.
  if (value.split(/[\\/]/).includes("..")) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(value);
}

/** A media asset with everything a candidate's browser needs, and nothing else. */
export interface CandidateFacingMedia {
  readonly id: MediaAssetId;
  readonly kind: MediaKind;
  readonly reference: string;
  readonly mimeType: string;
  readonly altText: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly isIntentionallyIndistinct: boolean;
}

/**
 * Strips the editorial record — provenance, status, when it was added — which
 * is of no use to a candidate and is nobody's business outside the bank.
 */
export function toCandidateFacingMedia(asset: MediaAsset): CandidateFacingMedia {
  return {
    id: asset.id,
    kind: asset.kind,
    reference: asset.reference,
    mimeType: asset.mimeType,
    altText: asset.altText,
    width: asset.width,
    height: asset.height,
    isIntentionallyIndistinct: asset.isIntentionallyIndistinct,
  };
}
