import { goto } from '$app/navigation';
import { api, errorMessage } from './api.ts';
import { confirmAction, removeSessionLocal, toast, upsertSession } from './state.svelte.ts';
import { sessionWorkdir } from '#lib/launch.ts';
import { AGENT_LABEL } from '#lib/providers.ts';
import type { Session } from '#lib/types.ts';

export type Launch = { mode: 'new'; prompt?: string } | { mode: 'continue' } | { mode: 'resume'; conversationId: string };

export async function startSession(s: Pick<Session, 'id' | 'name'>, launch?: Launch) {
	try {
		upsertSession(await api.post<Session>(`/api/sessions/${s.id}/start`, launch ?? {}));
	} catch (err) {
		toast('error', `Couldn't start ${s.name}`, errorMessage(err));
	}
}

export async function stopSession(s: Pick<Session, 'id' | 'name'>) {
	try {
		upsertSession(await api.post<Session>(`/api/sessions/${s.id}/stop`));
		toast('success', `Stopped ${s.name}`, 'The repo and conversations are kept. Start it again any time.');
	} catch (err) {
		toast('error', `Couldn't stop ${s.name}`, errorMessage(err));
	}
}

/** Restarts the agent inside the running container (new, continue, or a chosen conversation). */
export async function relaunchAgent(s: Pick<Session, 'id' | 'name' | 'agent'>, launch?: Launch) {
	const agent = AGENT_LABEL[s.agent];
	try {
		await api.post(`/api/sessions/${s.id}/relaunch`, launch ?? {});
		toast('success', `Restarted ${agent}`);
	} catch (err) {
		toast('error', `Couldn't restart ${agent}`, errorMessage(err));
	}
}

export async function sendToSession(s: Pick<Session, 'id'>, input: { text?: string; keys?: string[]; enter?: boolean }) {
	try {
		await api.post(`/api/sessions/${s.id}/send`, input);
		return true;
	} catch (err) {
		toast('error', `Couldn't send`, errorMessage(err));
		return false;
	}
}

export async function deleteSession(s: Pick<Session, 'id' | 'name' | 'repoDir' | 'agent'>, after = '/') {
	const ok = await confirmAction({
		title: `Delete ${s.name}?`,
		body: 'This stops the session and deletes its clone of the repo, its home folder and its conversations. Commits you pushed stay on GitHub.',
		detail: sessionWorkdir(s),
		confirmLabel: 'Delete session',
		danger: true
	});
	if (!ok) return;
	try {
		await api.del(`/api/sessions/${s.id}`);
		removeSessionLocal(s.id);
		toast('success', `Deleted ${s.name}`);
		if (after) goto(after);
	} catch (err) {
		toast('error', `Couldn't delete ${s.name}`, errorMessage(err));
	}
}
