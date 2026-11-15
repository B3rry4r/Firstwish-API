/**
 * The wish's state machine: ONE table of allowed moves. The stored columns are status (draft, sealed, live, resting, removed)
 * plus erasedAt and removedAt; the state the machine speaks in is derived from them: removed with erasedAt is "erased",
 * removed without it is "taken_down".
 */
export const WISH_STATES = ["draft", "sealed", "live", "resting", "erased", "taken_down"] as const;
export type WishState = (typeof WISH_STATES)[number];

export const MOVES: Record<WishState, readonly WishState[]> = {
  draft: ["sealed", "taken_down", "erased"],
  sealed: ["live", "taken_down", "erased"],
  live: ["resting", "taken_down", "erased"],
  resting: ["live", "erased", "taken_down"],
  taken_down: ["draft", "sealed", "live", "resting", "erased"],
  erased: [],
};

export function canMove(from: WishState, to: WishState): boolean {
  return MOVES[from].includes(to);
}

export function stateOf(row: { status: string; erasedAt: Date | null }): WishState {
  if (row.erasedAt) return "erased";
  return row.status === "removed" ? "taken_down" : (row.status as WishState);
}

/** A state that takes the wish out of sight: its saves go and its link answers gone. */
export function outOfSight(to: WishState): boolean {
  return to === "taken_down" || to === "erased";
}
