import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { imageCreated, pullImage } from '#lib/server/docker.ts';
import { getSettings } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Pulls the newest session image. Running sessions keep theirs until they restart. */
export const POST: RequestHandler = handler(async () => {
	const ref = getSettings().sessionImage;
	await pullImage(ref);
	return json({ ref, created: await imageCreated(ref) });
});
