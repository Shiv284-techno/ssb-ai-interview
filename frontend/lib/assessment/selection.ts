import "server-only";

import type { AssessmentActivityKind } from "@/lib/assessment/activities";
import type { ContentItem, ContentItemType } from "@/lib/assessment/content";
import type {
  ContentItemId,
  ContentStatus,
  DifficultyBand,
} from "@/lib/assessment/types";

/**
 * Contracts for the content bank and for choosing what to serve.
 *
 * Interfaces only — Step 4A defines the seam and implements nothing. Two
 * reasons it is worth writing down now: the bank has to be addressable by
 * query rather than by import, or adding a thousand items would mean editing
 * application code; and selection has to be replaceable, because the strategy
 * that picks a word for a word-association test has nothing in common with the
 * one that picks a reasoning question of the right difficulty.
 *
 * Server-only. Selection reads the bank, and the bank holds answer keys.
 */

export interface ContentQuery {
  readonly activityKind?: AssessmentActivityKind;
  readonly type?: ContentItemType;
  readonly status?: ContentStatus;
  readonly tags?: readonly string[];
  readonly difficulty?: DifficultyBand;
  /** Never serve these — already seen, or withdrawn mid-session. */
  readonly excludeIds?: readonly ContentItemId[];
}

/**
 * The bank, behind a query interface.
 *
 * Asynchronous from the start: today it may be a module of literals, but a file
 * store or a database must be able to replace it without every caller changing
 * shape.
 */
export interface ContentBank {
  get(id: ContentItemId): Promise<ContentItem | null>;
  list(query: ContentQuery): Promise<readonly ContentItem[]>;
  /** For paging an editorial view; not used when serving a candidate. */
  count(query: ContentQuery): Promise<number>;
}

/** How many of each difficulty a balanced request wants. */
export interface DifficultyDistribution {
  readonly easy: number;
  readonly moderate: number;
  readonly hard: number;
}

/**
 * How to choose.
 *
 * `deterministic` is the important one: given a seed, the same items come out
 * in the same order, which is what makes an attempt reproducible and a test
 * suite possible. `session-tailored` is the seam for anything cleverer later —
 * it carries a reference, not a model, and Step 4A implements none of it.
 */
export type SelectionStrategy =
  | { readonly kind: "deterministic"; readonly seed: string }
  | { readonly kind: "random" }
  | {
      readonly kind: "difficulty-balanced";
      readonly distribution: DifficultyDistribution;
      /** Deterministic within each band when set. */
      readonly seed: string | null;
    }
  | { readonly kind: "by-tag"; readonly tags: readonly string[]; readonly seed: string | null }
  | {
      /** Reserved: chooses from what this session has already done. */
      readonly kind: "session-tailored";
      readonly sessionRef: string;
      readonly seed: string | null;
    };

export type SelectionStrategyKind = SelectionStrategy["kind"];

export const SELECTION_STRATEGY_KINDS: readonly SelectionStrategyKind[] = [
  "deterministic",
  "random",
  "difficulty-balanced",
  "by-tag",
  "session-tailored",
];

/** True when the strategy will produce the same result every time. */
export function isReproducible(strategy: SelectionStrategy): boolean {
  switch (strategy.kind) {
    case "deterministic":
      return strategy.seed.length > 0;
    case "random":
      return false;
    case "difficulty-balanced":
    case "by-tag":
    case "session-tailored":
      return strategy.seed !== null && strategy.seed.length > 0;
  }
}

export interface SelectionRequest {
  readonly activityKind: AssessmentActivityKind;
  readonly count: number;
  readonly strategy: SelectionStrategy;
  /**
   * Items to keep back — usually what this candidate has already seen. Passed
   * in rather than looked up, so the selector needs no access to sessions.
   */
  readonly exclude: readonly ContentItemId[];
}

export interface SelectionResult {
  /** In the order they should be served. */
  readonly items: readonly ContentItem[];
  /**
   * True when the bank could not supply `count` items. Reported rather than
   * silently returning fewer, because a short psychology test is a broken one.
   */
  readonly underfilled: boolean;
  /** Echoed back so an attempt can record how its items were chosen. */
  readonly strategy: SelectionStrategy;
}

/**
 * The selector.
 *
 * An implementation must serve only items `isServable` accepts, must honour
 * `exclude`, and must return items in a stable order for a reproducible
 * strategy. Step 4B onwards supplies one.
 */
export interface ContentSelector {
  select(request: SelectionRequest, bank: ContentBank): Promise<SelectionResult>;
}
