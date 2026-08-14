import { getCollection, type CollectionEntry } from 'astro:content';

export type Game = CollectionEntry<'games'>;

/** Slug to game entry, for resolving the references stored on streamers. */
export async function getGameIndex(): Promise<Map<string, Game>> {
	const games = await getCollection('games');
	return new Map(games.map((g) => [g.id, g]));
}

/**
 * Resolve a streamer's game references. The schema already guarantees these exist
 * at build time, so a miss here only happens mid-edit in dev; drop it rather than crash.
 */
export function resolveGames(index: Map<string, Game>, refs: readonly { id: string }[]): Game[] {
	return refs.map((r) => index.get(r.id)).filter((g): g is Game => g !== undefined);
}

/** Every spelling of a game that search should match on. */
export function gameSearchTerms(game: Game): string[] {
	return [game.data.name, game.data.short, ...game.data.aliases];
}

/** Games sorted for display in a filter dropdown. */
export function sortGames(games: Game[]): Game[] {
	return [...games].sort((a, b) => a.data.name.localeCompare(b.data.name));
}
