/**
 * Profiles pick the account, model and permissions for a repository: the first profile (in
 * the order set on the Accounts page) with a pattern matching the repo wins. Patterns are
 * matched against owner/name (or the clone URL for repos outside GitHub), ignoring case;
 * "*" matches anything: "acme/*", "*-infra", "acme/api", "*".
 */
import type { Profile } from './types.ts';

const cache = new Map<string, RegExp>();

export function repoMatches(pattern: string, repo: string): boolean {
	let re = cache.get(pattern);
	if (!re) {
		const body = pattern
			.trim()
			.split('*')
			.map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
			.join('.*');
		re = new RegExp(`^${body}$`, 'i');
		cache.set(pattern, re);
	}
	return re.test(repo.trim());
}

export function matchProfile<P extends Pick<Profile, 'repos' | 'position'>>(profiles: P[], repo: string | null | undefined): P | null {
	if (!repo) return null;
	const ordered = [...profiles].sort((a, b) => a.position - b.position);
	return ordered.find((p) => p.repos.some((pat) => pat.trim() && repoMatches(pat, repo))) ?? null;
}

/** Cleans a pattern list typed as text: one per line or comma separated. */
export function parsePatterns(text: string): string[] {
	return [
		...new Set(
			text
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean)
		)
	];
}
