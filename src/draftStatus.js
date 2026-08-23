import { getLeague, getRosters, getDraft, getDraftPicks, getDraftTradedPicks } from './sleeperClient.js';
import { resolvePlayers, getCachedPlayers } from './playerCache.js';

const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TOP_N_PER_POSITION = 5;

/**
 * Effective current owner of the pick at (round, originalRosterId), after
 * accounting for trades. Sleeper's /draft/<id>/traded_picks reflects final
 * ownership (not a trade history log) — one entry per pick that has ever
 * moved from its original slot, keyed by round + the original owner's
 * roster_id, with the current owner in `owner_id`.
 */
function buildTradedPickLookup(tradedPicks) {
  const lookup = new Map();
  for (const trade of tradedPicks) {
    lookup.set(`${trade.round}-${trade.roster_id}`, trade.owner_id);
  }
  return lookup;
}

function effectiveRosterId(round, originalRosterId, tradedLookup) {
  return tradedLookup.get(`${round}-${originalRosterId}`) ?? originalRosterId;
}

// Standard snake order: odd rounds go slot 1..N, even rounds reverse N..1.
function slotOrderForRound(round, numTeams) {
  const slots = Array.from({ length: numTeams }, (_, i) => i + 1);
  return round % 2 === 1 ? slots : slots.reverse();
}

/**
 * Finds the next (or current, if on the clock right now) overall pick
 * number belonging to `myRosterId`, searching forward from the first
 * not-yet-made pick. Returns null if there's no slot assignment yet, or
 * no rounds left for this roster (draft complete).
 */
function findMyNextPickNumber({ picksMade, numTeams, totalRounds, currentRound, myRosterId, slotToRosterId, tradedLookup }) {
  if (!totalRounds || Object.keys(slotToRosterId).length === 0) return null;

  for (let round = currentRound; round <= totalRounds; round++) {
    const order = slotOrderForRound(round, numTeams);
    for (let i = 0; i < order.length; i++) {
      const pickNo = (round - 1) * numTeams + i + 1;
      if (pickNo < picksMade + 1) continue;

      const originalRosterId = slotToRosterId[order[i]];
      const owner = effectiveRosterId(round, originalRosterId, tradedLookup);
      if (owner === myRosterId) return pickNo;
    }
  }
  return null;
}

function playerName(p) {
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
}

/**
 * Computes the full draft_status payload for the configured league/user.
 * Performance note: aside from the network calls (league, rosters, draft,
 * picks, traded picks — small/medium JSON, run in parallel), everything
 * else is synchronous in-memory work — snake-order math and a single pass
 * over the already-cached player database — so this stays fast under a
 * live draft clock regardless of draft size. It never re-fetches the
 * player database itself; that's playerCache.js's job on its own schedule.
 */
export async function getDraftStatus({ leagueId, sleeperUserId }) {
  const league = await getLeague(leagueId);
  const draftId = league.draft_id;

  const [rosters, draft, picks, tradedPicks] = await Promise.all([
    getRosters(leagueId),
    getDraft(draftId),
    getDraftPicks(draftId),
    getDraftTradedPicks(draftId),
  ]);

  const myRoster = rosters.find((r) => r.owner_id === sleeperUserId);
  if (!myRoster) {
    throw new Error(`No roster in this league is owned by SLEEPER_USER_ID ${sleeperUserId}`);
  }
  const myRosterId = myRoster.roster_id;

  const numTeams = league.settings?.num_teams ?? rosters.length;
  const totalRounds = draft.settings?.rounds ?? null;
  const picksMade = picks.length;
  const currentRound = totalRounds ? Math.min(Math.floor(picksMade / numTeams) + 1, totalRounds) : null;

  const slotToRosterId = draft.slot_to_roster_id ?? {};
  const tradedLookup = buildTradedPickLookup(tradedPicks);

  const myNextPickNumber = findMyNextPickNumber({
    picksMade,
    numTeams,
    totalRounds,
    currentRound,
    myRosterId,
    slotToRosterId,
    tradedLookup,
  });

  const allPlayerIds = picks.map((pick) => pick.player_id).filter(Boolean);
  const resolved = await resolvePlayers(allPlayerIds);
  const resolvedById = new Map(allPlayerIds.map((id, i) => [id, resolved[i]]));

  const picksSoFar = picks.map((pick) => ({
    pick_no: pick.pick_no,
    round: pick.round,
    roster_id: pick.roster_id,
    player: pick.player_id ? resolvedById.get(pick.player_id) : null,
  }));

  const myPicksSoFar = picksSoFar
    .filter((pick) => pick.roster_id === myRosterId)
    .map(({ pick_no, round, player }) => ({ pick_no, round, player }));

  // Never fetches over the network — pulls from the already-loaded/refreshed
  // in-memory cache, so this respects Sleeper's once-a-day guidance no
  // matter how many times draft_status is called during a draft.
  const draftedPlayerIds = new Set(allPlayerIds);
  const players = await getCachedPlayers();

  const byPosition = {};
  for (const position of FANTASY_POSITIONS) byPosition[position] = [];

  for (const [playerId, p] of Object.entries(players)) {
    if (draftedPlayerIds.has(playerId)) continue;
    if (!p.team) continue;
    if (!FANTASY_POSITIONS.includes(p.position)) continue;
    byPosition[p.position].push({
      player_id: playerId,
      name: playerName(p),
      team: p.team,
      search_rank: p.search_rank ?? Infinity,
    });
  }

  const remainingPlayersByPosition = {};
  for (const position of FANTASY_POSITIONS) {
    const list = byPosition[position];
    list.sort((a, b) => a.search_rank - b.search_rank);
    remainingPlayersByPosition[position] = {
      count: list.length,
      // Sleeper's search_rank is a general search-relevance field (lower =
      // more prominent in Sleeper's own search/UI), not a curated fantasy
      // ranking or ADP — named explicitly so callers don't mistake this
      // for "best available."
      search_rank_reference: list.slice(0, TOP_N_PER_POSITION).map(({ player_id, name, team }) => ({
        player_id,
        name,
        team,
      })),
    };
  }

  return {
    draft_id: draftId,
    status: draft.status,
    total_rounds: totalRounds,
    current_round: currentRound,
    my_roster_id: myRosterId,
    my_next_pick_number: myNextPickNumber,
    picks_so_far: picksSoFar,
    my_picks_so_far: myPicksSoFar,
    remaining_players_by_position: remainingPlayersByPosition,
  };
}
