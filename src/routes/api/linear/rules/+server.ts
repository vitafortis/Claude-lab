import { json } from '@sveltejs/kit';
import { body, handler } from '#lib/server/http.ts';
import { parseRuleInput } from '#lib/server/linear-input.ts';
import { skipExisting } from '#lib/server/linear.ts';
import { createLinearRule, deleteLinearRule } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/**
 * Adds a rule. Unless pickUpExisting is set, issues that already match are marked as
 * handled, so only issues labelled from now on start sessions.
 */
export const POST: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	const rule = createLinearRule(parseRuleInput(b));
	if (b.pickUpExisting !== true) {
		try {
			await skipExisting(rule);
		} catch (err) {
			deleteLinearRule(rule.id);
			throw err;
		}
	}
	return json(rule, { status: 201 });
});
