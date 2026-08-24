import { getLeague, getRosters } from './sleeperClient.js';
import { resolvePlayers } from './playerCache.js';
import { isStartingSlot, assignPlayersToSlots } from './flexEligibility.js';

/**
 * Computes starting-lineup fill status for the configured league/user's
 * roster. Assigns rostered players to starting slots most-constrained-first
 * (dedicated positions before FLEX before SUPER_FLEX) so no player is
 * double-counted against more than one slot. Fill status is based purely
 * on roster construction — whether a slot has an eligible player at all,
 * and Sleeper's own `injury_status` flag on whoever fills it — never a
 * judgment about whether that player is actually good.
 */
export async function getRosterNeeds({ leagueId, sleeperUserId }) {
  const league = await getLeague(leagueId);
  const rosters = await getRosters(leagueId);

  const myRoster = rosters.find((r) => r.owner_id === sleeperUserId);
  if (!myRoster) {
    throw new Error(`No roster in this league is owned by SLEEPER_USER_ID ${sleeperUserId}`);
  }

  const startingSlots = (league.roster_positions ?? []).filter(isStartingSlot);

  const slotCounts = {};
  for (const slot of startingSlots) {
    slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
  }

  const playerIds = (myRoster.players ?? []).filter((id) => id && id !== '0');
  const resolved = await resolvePlayers(playerIds);
  // A player with no resolvable position can't meaningfully fill any slot.
  const rosteredPlayers = resolved.filter((p) => p.position);

  const assignments = assignPlayersToSlots(slotCounts, rosteredPlayers);
  const cursors = {};
  for (const slotType of Object.keys(slotCounts)) cursors[slotType] = 0;

  const slots = startingSlots.map((slotType) => {
    const player = assignments.get(slotType)[cursors[slotType]++] ?? null;

    let fillStatus;
    if (!player) fillStatus = 'empty';
    else if (player.injury_status) fillStatus = 'questionable';
    else fillStatus = 'solid';

    return {
      slot: slotType,
      fill_status: fillStatus,
      player: player
        ? {
            player_id: player.player_id,
            name: player.name,
            position: player.position,
            team: player.team,
            injury_status: player.injury_status,
          }
        : null,
    };
  });

  return {
    my_roster_id: myRoster.roster_id,
    slots,
    summary: {
      solid: slots.filter((s) => s.fill_status === 'solid').length,
      questionable: slots.filter((s) => s.fill_status === 'questionable').length,
      empty: slots.filter((s) => s.fill_status === 'empty').length,
    },
  };
}
