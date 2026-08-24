import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlayersByName } from './playerCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATCHLIST_PATH = path.join(__dirname, '..', 'data', 'watchlist.json');

/**
 * Reads the manually-maintained data/watchlist.json (see README for how to
 * update it) and resolves each name against the player database. This is a
 * local file, not a Sleeper API call — read fresh on every call rather than
 * cached, since it's expected to change rarely (mainly before draft day)
 * and a plain file read is cheap enough not to need caching.
 */
export async function getWatchlist() {
  let raw;
  try {
    raw = await readFile(WATCHLIST_PATH, 'utf-8');
  } catch (error) {
    throw new Error(`Could not read watchlist file at ${WATCHLIST_PATH}: ${error.message}`);
  }

  let names;
  try {
    names = JSON.parse(raw);
  } catch (error) {
    throw new Error(`watchlist.json is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(names)) {
    throw new Error('watchlist.json must contain a JSON array of player name strings');
  }

  return resolvePlayersByName(names);
}
