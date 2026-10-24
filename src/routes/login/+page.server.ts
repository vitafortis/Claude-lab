import { redirect } from '@sveltejs/kit';
import { getAuthSettings } from '#lib/server/auth-config.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.auth === 'setup') redirect(303, '/setup');
	if (locals.auth === 'authenticated' || locals.auth === 'disabled') redirect(303, '/');
	const s = getAuthSettings();
	const sso = s.oidc.enabled && s.oidc.issuer && s.oidc.clientId ? s.oidc.label : null;
	return {
		sso,
		// ?local always shows it, so the local admin can get in when SSO is broken.
		passwordForm: s.passwordForm || !sso || url.searchParams.has('local'),
		proxy: s.proxy.enabled,
		error: url.searchParams.get('error')?.slice(0, 300) ?? ''
	};
};
