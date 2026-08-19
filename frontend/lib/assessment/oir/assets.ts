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
import { getOirMediaById, OIR_SETS, oirContentRoot, oirSetSlug } from "@/lib/assessment/oir/bank";
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
export function readOirFigure(mediaId: MediaAssetId): OirAssetBytes | null {
  const asset = getOirMediaById(mediaId);
  if (!asset) return null;

  // The bank validates this on load; re-checking costs one regex and keeps this
  // module safe to read on its own terms.
  if (!isMediaReference(asset.reference)) {
    throw new OirAssetError(`media ${mediaId} has a reference that is not safe to resolve`);
  }

  // Which set owns the figure is read from the bank's own stored reference, not
  // taken from the caller. A production paper mixes sets, so the caller no
  // longer knows the set — and asking it to would have put a second
  // caller-supplied value on the one path where that must never happen.
  //
  // The prefix must still match an INGESTED set exactly, so a reference the
  // bank somehow held for `oir/set-99/` or for anything outside `oir/` resolves
  // to nothing rather than to a directory that is merely plausible.
  const owner = OIR_SETS.find((setNumber) =>
    asset.reference.startsWith(`oir/${oirSetSlug(setNumber)}/figures/`),
  );
  if (owner === undefined) {
    throw new OirAssetError(`media ${mediaId} does not belong to any ingested set`);
  }

  const prefix = `oir/${oirSetSlug(owner)}/figures/`;
  const setRoot = join(oirContentRoot(), oirSetSlug(owner), "figures");
  // The reference is repository-relative and begins with `oir/<slug>/`, which
  // the content root already accounts for, so only the file name is joined on.
  const fileName = asset.reference.slice(prefix.length);
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
