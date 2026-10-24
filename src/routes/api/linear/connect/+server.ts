import { json } from '@sveltejs/kit';
import { body, handler, str } from '#lib/server/http.ts';
import { connectLinear, disconnectLinear, linearInfo } from '#lib/server/linear.ts';
import type { RequestHandler } from './$types';

/** Checks a Linear API key and saves it (encrypted). */
export const POST: RequestHandler = handler(async ({ request }) => json(await connectLinear(str(await body(request), 'key', { required: true, max: 200 })!)));

/** Forgets the key. Rules stay, paused until Linear is connected again. */
export const DELETE: RequestHandler = () => {
	disconnectLinear();
	return json(linearInfo());
};
