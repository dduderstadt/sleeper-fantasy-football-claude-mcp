/**
 * Which raw player positions can fill each Sleeper roster_positions slot
 * type. Standard fantasy football flex eligibility nests perfectly —
 * dedicated slot ⊂ FLEX ⊂ SUPER_FLEX — which is what makes the
 * most-constrained-first greedy assignment in assignPlayersToSlots()
 * provably optimal rather than just a heuristic.
 *
 * Exported so any tool needing "which of my players fill my starting
 * slots without double-counting" can reuse this — currently used by
 * roster_needs; draft_status doesn't need it (it only counts undrafted
 * players by raw position, no flex reasoning).
 */
export const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
};

// Sleeper roster_positions entries that aren't a starting slot at all.
const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);

export function isStartingSlot(slot) {
  return !NON_STARTING_SLOTS.has(slot) && Object.prototype.hasOwnProperty.call(SLOT_ELIGIBILITY, slot);
}

/**
 * Greedily assigns `players` (each needing at least a `position` field) to
 * `slotCounts` (e.g. { QB: 1, RB: 2, FLEX: 3, SUPER_FLEX: 1 }), filling the
 * most-constrained slot types (fewest eligible positions) first so a
 * narrowly-eligible player is never left stranded by a broadly-eligible
 * slot claiming it first. Each player is used for at most one slot.
 *
 * Returns a Map<slotType, Array<player | null>> — null marks an instance
 * of that slot type with no eligible player left to fill it.
 */
export function assignPlayersToSlots(slotCounts, players) {
  const slotTypesByConstraint = Object.keys(slotCounts).sort(
    (a, b) => (SLOT_ELIGIBILITY[a]?.length ?? 0) - (SLOT_ELIGIBILITY[b]?.length ?? 0)
  );

  const available = [...players];
  const assignments = new Map();

  for (const slotType of slotTypesByConstraint) {
    const eligible = SLOT_ELIGIBILITY[slotType] ?? [];
    const count = slotCounts[slotType];
    const filled = [];

    for (let i = 0; i < count; i++) {
      const idx = available.findIndex((p) => eligible.includes(p.position));
      filled.push(idx === -1 ? null : available.splice(idx, 1)[0]);
    }

    assignments.set(slotType, filled);
  }

  return assignments;
}
