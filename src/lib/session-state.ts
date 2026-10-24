import type { Session, SessionLive } from './types.ts';

export type DisplayState = 'working' | 'waiting' | 'idle' | 'shell' | 'starting' | 'stopped' | 'error';

export const STATE_META: Record<DisplayState, { label: string; dot: string; badge: string; pulse?: boolean }> = {
	working: { label: 'Working', dot: 'bg-primary', badge: 'badge-primary', pulse: true },
	waiting: { label: 'Needs you', dot: 'bg-warning', badge: 'badge-warning', pulse: true },
	idle: { label: 'Idle', dot: 'bg-success', badge: 'badge-success' },
	shell: { label: 'Shell', dot: 'bg-muted-foreground', badge: '' },
	starting: { label: 'Starting', dot: 'bg-primary/60', badge: 'badge-primary', pulse: true },
	stopped: { label: 'Stopped', dot: 'bg-muted-foreground/40', badge: '' },
	error: { label: 'Error', dot: 'bg-danger', badge: 'badge-danger' }
};

/** One state for dots and badges, from the stored status and what the terminal shows. */
export function displayState(s: Session, live: SessionLive | undefined): DisplayState {
	if (s.status === 'error') return 'error';
	if (s.status === 'starting') return 'starting';
	if (s.status === 'stopped') return 'stopped';
	switch (live?.state) {
		case 'working':
		case 'waiting':
		case 'idle':
		case 'shell':
		case 'starting':
			return live.state;
		default:
			return 'idle';
	}
}

/** Sessions that need a person first, then busy ones, then the rest by recency. */
export function sortForOverview(list: Session[], live: Record<string, SessionLive>): Session[] {
	const rank: Record<DisplayState, number> = { waiting: 0, error: 1, working: 2, starting: 3, idle: 4, shell: 5, stopped: 6 };
	const when = (s: Session) => live[s.id]?.summary?.updatedAt ?? s.lastStartedAt ?? s.createdAt;
	return [...list].sort((a, b) => rank[displayState(a, live[a.id])] - rank[displayState(b, live[b.id])] || when(b).localeCompare(when(a)));
}
