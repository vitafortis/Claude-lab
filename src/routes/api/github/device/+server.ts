import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { startDeviceFlow } from '#lib/server/github.ts';
import type { RequestHandler } from './$types';

/** Starts "Sign in with GitHub": returns the code to enter at github.com/login/device. */
export const POST: RequestHandler = handler(async () => json(await startDeviceFlow()));
