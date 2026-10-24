import { json } from '@sveltejs/kit';
import { getAuthSettings } from '#lib/server/auth-config.ts';
import { endSession } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

/** Signs out here; someone signed in by the reverse proxy is sent to its logout too, or it would sign them straight back in. */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	endSession(cookies);
	const proxy = getAuthSettings().proxy;
	const redirect = locals.user?.source === 'proxy' && proxy.enabled && proxy.logoutUrl ? proxy.logoutUrl : null;
	return json({ ok: true, redirect });
};
