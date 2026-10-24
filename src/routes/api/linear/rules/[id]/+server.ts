import { json } from '@sveltejs/kit';
import { body, handler, NotFound } from '#lib/server/http.ts';
import { parseRuleInput } from '#lib/server/linear-input.ts';
import { deleteLinearRule, getLinearRule, updateLinearRule } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = handler(async ({ params, request }) => {
	if (!getLinearRule(params.id)) throw new NotFound('Rule not found');
	updateLinearRule(params.id, parseRuleInput(await body(request)));
	return json(getLinearRule(params.id));
});

/** Deletes the rule. Sessions it started keep running. */
export const DELETE: RequestHandler = handler(({ params }) => {
	if (!deleteLinearRule(params.id)) throw new NotFound('Rule not found');
	return json({ ok: true });
});
