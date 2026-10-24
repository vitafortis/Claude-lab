import { json } from '@sveltejs/kit';
import { body, handler, str } from '#lib/server/http.ts';
import { pollDeviceFlow } from '#lib/server/github.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = handler(async ({ request }) => json(await pollDeviceFlow(str(await body(request), 'handle', { required: true })!)));
