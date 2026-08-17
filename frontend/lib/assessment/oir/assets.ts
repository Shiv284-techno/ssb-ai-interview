import "server-only";

/**
 * Reads OIR figure bytes from disk.
 *
 * The only module in the application that opens an OIR asset, and the only one
 * that needs to: everything else refers to figures by media id. That is the
 * whole point of the design. A request names an opaque id; the id is looked up
 * in the bank's media map; the bank's own stored reference — never anything
 * from the request — is what becomes a path. There is no code path here that
 * turns caller input into a filename, so traversal has nothing to traverse.
 *
 * The containment check below is therefore belt and braces. It exists because
 * this is the one place where a mistake means serving an arbitrary file, and a
 * check that never fires costs nothing while a missing one costs everything.
 */
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { isMediaReference } from "@/lib/assessment/media";
import { getOirSet, oirContentRoot, oirSetSlug } from "@/lib/assessment/oir/bank";
import type { MediaAssetId } from "@/lib/assessment/types";

export class OirAssetError extends Error {}

export interface OirAssetBytes {
  readonly bytes: Buffer;
  readonly mimeType: string;
  /** Kept available so a caller can attach it to the response it builds. */
  readonly altText: string;
}

/** True when `child` is the same as, or inside, `parent`. */
function isContainedBy(child: string, parent: string): boolean {
  const base = resolve(parent);
  const target = resolve(child);
  return target === base || target.startsWith(base.endsWith(sep) ? base : base + sep);
}

/**
 * Resolves a media id to its bytes, or null when no such asset exists.
 *
 * Null means "no such id" — an ordinary miss a route turns into a 404. A thrown
 * `OirAssetError` means the bank and the filesystem disagree, which is a fault
 * in the deployment rather than a bad request, and must not be reported as one.
 */
export function readOirFigure(setNumber: number, mediaId: MediaAssetId): OirAssetBytes | null {
  const asset = getOirSet(setNumber).media.get(mediaId);
  if (!asset) return null;

  // The bank validates this on load; re-checking costs one regex and keeps this
  // module safe to read on its own terms.
  if (!isMediaReference(asset.reference)) {
    throw new OirAssetError(`media ${mediaId} has a reference that is not safe to resolve`);
  }
  if (!asset.reference.startsWith(`oir/${oirSetSlug(setNumber)}/figures/`)) {
    throw new OirAssetError(`media ${mediaId} does not belong to set ${setNumber}`);
  }

  const setRoot = join(oirContentRoot(), oirSetSlug(setNumber), "figures");
  // The reference is repository-relative and begins with `oir/<slug>/`, which
  // the content root already accounts for, so only the file name is joined on.
  const fileName = asset.reference.slice(`oir/${oirSetSlug(setNumber)}/figures/`.length);
  const path = join(setRoot, fileName);

  if (!isContainedBy(path, setRoot)) {
    throw new OirAssetError(`media ${mediaId} resolved outside the set's figure directory`);
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    // The bank promised this file exists. It does not, so the content tree is
    // incomplete — a deployment fault, not a miss.
    throw new OirAssetError(`media ${mediaId} is registered but its file is missing`);
  }

  // A symlink could point out of the tree even though the path string does not.
  if (!isContainedBy(realpathSync(path), realpathSync(setRoot))) {
    throw new OirAssetError(`media ${mediaId} resolves through a link out of the content root`);
  }

  return { bytes, mimeType: asset.mimeType, altText: asset.altText };
}
