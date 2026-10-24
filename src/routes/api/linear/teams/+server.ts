import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { listTeams } from '#lib/server/linear.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = handler(async () => json(await listTeams()));
