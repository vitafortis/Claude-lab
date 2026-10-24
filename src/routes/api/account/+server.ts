import { json } from '@sveltejs/kit';
import { SESSION_COOKIE } from '#lib/server/auth.ts';
import { hashPassword, sha256, verifyPassword } from '#lib/server/crypto.ts';
import { BadRequest, body, handler } from '#lib/server/http.ts';
import { deleteUserAuthSessions, findUserByEmail, getPasswordHash, updateUser } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lets the signed-in user change their name, email and password. */
export const PUT: RequestHandler = handler(async ({ request, locals, cookies }) => {
	const user = locals.user;
	if (!user || user.id === 'open') throw new BadRequest('Accounts are disabled (CCM_AUTH=disabled)');
	const b = await body(request);
	const patch: Parameters<typeof updateUser>[1] = {};
	if (typeof b.name === 'string') patch.name = b.name.trim() || null;
	if (typeof b.email === 'string' && b.email.trim() !== user.email) {
		// SSO decides who someone is; a changed email would come back as another user.
		if (user.source !== 'local') throw new BadRequest('Your email comes from single sign-on; change it there');
		const email = b.email.trim();
		if (!EMAIL.test(email)) throw new BadRequest('Enter a valid email address');
		const taken = findUserByEmail(email);
		if (taken && taken.id !== user.id) throw new BadRequest(`${email} is already used by another account`);
		patch.email = email;
	}
	if (typeof b.newPassword === 'string' && b.newPassword) {
		if (b.newPassword.length < 8) throw new BadRequest('Use at least 8 characters for the new password');
		const current = getPasswordHash(user.id);
		if (!(typeof b.currentPassword === 'string' && current && verifyPassword(b.currentPassword, current))) {
			throw new BadRequest('Current password is incorrect');
		}
		patch.passwordHash = hashPassword(b.newPassword);
		// Sign out everywhere else.
		const token = cookies.get(SESSION_COOKIE);
		deleteUserAuthSessions(user.id, token ? sha256(token) : undefined);
	}
	updateUser(user.id, patch);
	return json({ ok: true });
});
