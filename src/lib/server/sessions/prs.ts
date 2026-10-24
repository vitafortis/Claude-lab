/**
 * Finds the pull request each running session opened from its branch, so the overview
 * can link to it. Linear listens for "pr" events to comment on the issue.
 */
import { EventEmitter } from 'node:events';
import { findPrForBranch } from '../github.ts';
import { getGithubAccount, setSessionPr } from '../store.ts';
import type { GitState, Session, SessionPr } from '#lib/types.ts';

const CHECK_EVERY_MS = 60_000;
const lastCheck = new Map<string, number>();

export const prEvents = new EventEmitter<{ opened: [session: Session, pr: SessionPr] }>();

export async function checkPr(s: Session, git: GitState | null) {
	const branch = git?.branch;
	if (s.status !== 'running' || !s.repoFullName || !branch) return;
	// The branch it started from is someone else's PR (or the default branch): nothing to find.
	if (!s.newBranch && !s.linear) return;
	if (Date.now() - (lastCheck.get(s.id) ?? 0) < CHECK_EVERY_MS) return;
	lastCheck.set(s.id, Date.now());
	try {
		const pr = await findPrForBranch(s.githubAccountId ? (getGithubAccount(s.githubAccountId) ?? null) : null, s.repoFullName, branch);
		if (!pr || (s.pr?.number === pr.number && s.pr.state === pr.state)) return;
		setSessionPr(s.id, pr);
		if (s.pr?.number !== pr.number) prEvents.emit('opened', s, pr);
	} catch {
		// Rate limits or a missing token: try again next minute.
	}
}
