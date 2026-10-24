import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, requireAdmin, str } from '#lib/server/http.ts';
import { discover } from '#lib/server/oidc.ts';
import type { RequestHandler } from './$types';

/** Reads the issuer's discovery document, to check the URL before saving. */
export const POST: RequestHandler = handler(async ({ locals, request }) => {
	requireAdmin(locals);
	const issuer = str(await body(request), 'issuer', { required: true })!;
	if (!/^https?:\/\//.test(issuer)) throw new BadRequest('The issuer must start with https://');
	const doc = await discover(issuer, true);
	return json({ issuer: doc.issuer, authorizationEndpoint: doc.authorization_endpoint });
});
