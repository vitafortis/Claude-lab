import { json } from '@sveltejs/kit';
import { DEFAULT_PROMPT, linearInfo } from '#lib/server/linear.ts';
import { listLinearRules, listLinearRuns } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json({ info: linearInfo(), rules: listLinearRules(), runs: listLinearRuns(), defaultPrompt: DEFAULT_PROMPT });
