import { json } from '@sveltejs/kit';
import { body, handler, NotFound } from '#lib/server/http.ts';
import { parseProfileInput } from '#lib/server/profile-input.ts';
import { deleteProfile, getProfile, updateProfile } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = handler(async ({ params, request }) => {
	if (!getProfile(params.id)) throw new NotFound('Profile not found');
	updateProfile(params.id, parseProfileInput(await body(request)));
	return json(getProfile(params.id));
});

/** Linear rules that used it fall back to their own account and model. */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!deleteProfile(params.id)) throw new NotFound('Profile not found');
	return json({ ok: true });
});
