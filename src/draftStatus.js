import { getLeague, getRosters, getDraft, getDraftPicks, getDraftTradedPicks } from './sleeperClient.js';
import { resolvePlayers, getCachedPlayers, getFallbackRankings } from './playerCache.js';

const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TOP_N_PER_POSITION = 5;

// Fields that fundamentally require live picks/roster data — there's no
// way to derive them from the search_rank-based fallback set, since that
// set has no idea what's actually been drafted or who owns which roster.
const FIELDS_UNAVAILABLE_IN_FALLBACK = [
  'status',
  'total_rounds',
  'current_round',
  'my_roster_id',
  'my_next_pick_number',
  'picks_so_far',
  'my_picks_so_far',
];

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
 * Computes remaining_players_by_position from the live picks list and the
 * cached player database. Returns null (with the caller expected to note
 * why) if the player cache itself has never successfully loaded — an
 * independent failure mode from the live picks/roster data this file
 * otherwise depends on.
 */
async function computeRemainingPlayersByPosition(allDraftedPlayerIds) {
  const players = await getCachedPlayers();
  if (Object.keys(players).length === 0) return null;

  const draftedPlayerIds = new Set(allDraftedPlayerIds);
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
  return remainingPlayersByPosition;
}

/**
 * Built when live picks/roster/draft data can't be fetched from Sleeper.
 * Falls back to the search_rank-based snapshot playerCache.js maintains —
 * which has no idea what's actually been drafted, so this is presented as
 * "generally strong players," never "available players." Every field that
 * genuinely can't be derived without live picks data is explicitly null
 * and listed in `unavailable_fields`, rather than silently omitted.
 */
async function buildFallbackResponse({ draftId, reason }) {
  const fallback = await getFallbackRankings();
  const hasFallbackData = fallback.top_100_overall.length > 0;

  return {
    draft_id: draftId,
    status: null,
    total_rounds: null,
    current_round: null,
    my_roster_id: null,
    my_next_pick_number: null,
    picks_so_far: null,
    my_picks_so_far: null,
    fallback_mode: true,
    fallback_reason: reason,
    unavailable_fields: FIELDS_UNAVAILABLE_IN_FALLBACK,
    note: hasFallbackData
      ? "Live draft/roster data from Sleeper is unavailable right now, so the fields above are unset — there's no way to know current_round, whose turn it is, or who's actually been drafted without it. Below are Sleeper's own generally-strong players by search_rank (a rough relevance signal, not a curated fantasy ranking), NOT a list of players still available in your draft."
      : "Live draft/roster data AND the local player database are both unavailable right now — Sleeper's API appears to be unreachable entirely, so there is no fallback data to offer either.",
    generally_strong_players_overall: fallback.top_100_overall,
    generally_strong_players_by_position: fallback.top_5_by_position,
  };
}

/**
 * Computes the full draft_status payload for the configured league/user.
 * Performance note: aside from the network calls (league, rosters, draft,
 * picks, traded picks — small/medium JSON, run in parallel), everything
 * else is synchronous in-memory work — snake-order math and a single pass
 * over the already-cached player database — so this stays fast under a
 * live draft clock regardless of draft size. It never re-fetches the
 * player database itself; that's playerCache.js's job on its own schedule.
 *
 * Graceful degradation: getLeague() failing is unrecoverable (no draft_id,
 * nothing else can be computed) and propagates as a normal tool error —
 * see sleeperClient.js for the timeout/network/HTTP-status error messages
 * that produces. If the rosters/draft/picks/traded-picks batch fails,
 * this falls back to a search_rank-based snapshot instead of throwing —
 * see buildFallbackResponse().
 */
export async function getDraftStatus({ leagueId, sleeperUserId }) {
  const league = await getLeague(leagueId);
  const draftId = league.draft_id;

  let rosters, draft, picks, tradedPicks;
  try {
    [rosters, draft, picks, tradedPicks] = await Promise.all([
      getRosters(leagueId),
      getDraft(draftId),
      getDraftPicks(draftId),
      getDraftTradedPicks(draftId),
    ]);
  } catch (error) {
    return buildFallbackResponse({ draftId, reason: error.message });
  }

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

  const remainingPlayersByPosition = await computeRemainingPlayersByPosition(allPlayerIds);

  return {
    draft_id: draftId,
    status: draft.status,
    total_rounds: totalRounds,
    current_round: currentRound,
    my_roster_id: myRosterId,
    my_next_pick_number: myNextPickNumber,
    picks_so_far: picksSoFar,
    my_picks_so_far: myPicksSoFar,
    fallback_mode: false,
    remaining_players_by_position:
      remainingPlayersByPosition ??
      "The local player database hasn't loaded yet, so undrafted-player counts/rankings aren't available this call — everything else above is still live.",
  };
}
