import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { listLabels } from '#lib/server/linear.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = handler(async ({ url }) => json(await listLabels(url.searchParams.get('team'))));
