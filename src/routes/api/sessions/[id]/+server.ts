import { json } from '@sveltejs/kit';
import { body, handler, NotFound } from '#lib/server/http.ts';
import { parseModel, parseName, parsePermissionMode } from '#lib/server/sessions/input.ts';
import { pokeLive } from '#lib/server/sessions/live.ts';
import { deleteSession } from '#lib/server/sessions/runtime.ts';
import { getClaudeAccount, getGithubAccount, getSession, updateSession } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

function load(id: string) {
	const s = getSession(id);
	if (!s) throw new NotFound('Session not found');
	return s;
}

export const GET: RequestHandler = handler(({ params }) => json(load(params.id)));

/** Settings that apply from the next launch (Restart Claude, or Stop then Start). */
export const PATCH: RequestHandler = handler(async ({ params, request }) => {
	load(params.id);
	const b = await body(request);
	const patch: Parameters<typeof updateSession>[1] = {};
	if ('name' in b) patch.name = parseName(b.name);
	if ('model' in b) patch.model = parseModel(b.model);
	if ('permissionMode' in b) patch.permissionMode = parsePermissionMode(b.permissionMode);
	if ('remoteControl' in b) patch.remoteControl = b.remoteControl !== false;
	if (typeof b.claudeAccountId === 'string') {
		if (!getClaudeAccount(b.claudeAccountId)) throw new NotFound('Claude account not found');
		patch.claudeAccountId = b.claudeAccountId;
	}
	if ('githubAccountId' in b) {
		const gid = typeof b.githubAccountId === 'string' && b.githubAccountId ? b.githubAccountId : null;
		if (gid && !getGithubAccount(gid)) throw new NotFound('GitHub account not found');
		patch.githubAccountId = gid;
	}
	updateSession(params.id, patch);
	return json(load(params.id));
});

/** Stops the session and deletes its repo clone, home folder and transcripts. */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	await deleteSession(params.id);
	pokeLive();
	return json({ ok: true });
});
