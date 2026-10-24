import { json } from '@sveltejs/kit';
import { skillOptions } from '#lib/server/skills.ts';
import type { RequestHandler } from './$types';

/** Built-in skills plus the given Claude account's own skills and commands. */
export const GET: RequestHandler = ({ url }) => json(skillOptions(url.searchParams.get('account')));
