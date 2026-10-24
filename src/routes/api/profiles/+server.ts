import { json } from '@sveltejs/kit';
import { body, handler } from '#lib/server/http.ts';
import { parseProfileInput } from '#lib/server/profile-input.ts';
import { createProfile, listProfiles } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listProfiles());

export const POST: RequestHandler = handler(async ({ request }) => json(createProfile(parseProfileInput(await body(request))), { status: 201 }));
