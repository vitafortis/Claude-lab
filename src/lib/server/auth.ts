import type { Cookies } from '@sveltejs/kit';
import { config } from './config.ts';
import { hashPassword, randomToken, sha256 } from './crypto.ts';
import { authSessionUser, countUsers, createAuthSession, createUser, deleteAuthSession, touchUserLogin } from './store.ts';
import type { User } from '#lib/types.ts';

export const SESSION_COOKIE = 'ccm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthState = 'disabled' | 'setup' | 'anonymous' | 'authenticated';

/** Stand-in user when CCM_AUTH=disabled. */
const OPEN_USER: User = { id: 'open', email: 'admin', name: 'Admin', createdAt: new Date(0).toISOString(), lastLoginAt: null };

let bootstrapped = false;

/** CCM_ADMIN_EMAIL + CCM_ADMIN_PASSWORD create the first account, so headless installs skip setup. */
function bootstrapAdmin() {
	bootstrapped = true;
	const b = config.bootstrapAdmin;
	if (!b || countUsers() > 0) return;
	if (b.password.length < 8) {
		console.warn('[cc-modern] CCM_ADMIN_PASSWORD must be at least 8 characters; showing the setup wizard instead.');
		return;
	}
	createUser({ email: b.email, name: b.name, passwordHash: hashPassword(b.password) });
	console.log(`[cc-modern] Created account ${b.email} from CCM_ADMIN_EMAIL.`);
}

/** Resolves the signed-in user from the session cookie's value. */
export function authenticateToken(token: string | undefined): { state: AuthState; user: User | null } {
	if (config.authDisabled) return { state: 'disabled', user: OPEN_USER };
	if (!bootstrapped) bootstrapAdmin();
	if (countUsers() === 0) return { state: 'setup', user: null };
	const user = token ? authSessionUser(sha256(token)) : undefined;
	return user ? { state: 'authenticated', user } : { state: 'anonymous', user: null };
}

export function authenticate(cookies: Cookies) {
	return authenticateToken(cookies.get(SESSION_COOKIE));
}

/** Reads the session cookie from a raw Cookie header (WebSocket upgrades have no Cookies API). */
export function sessionTokenFromHeader(header: string | undefined): string | undefined {
	for (const part of (header ?? '').split(';')) {
		const [k, ...v] = part.trim().split('=');
		if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
	}
	return undefined;
}

export function startSession(cookies: Cookies, userId: string, secure: boolean) {
	const token = randomToken();
	createAuthSession(sha256(token), userId, SESSION_TTL_MS);
	touchUserLogin(userId);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// Cross-site writes are blocked by the Origin check in hooks.server.ts.
		sameSite: 'lax',
		secure,
		maxAge: SESSION_TTL_MS / 1000
	});
}

export function endSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) deleteAuthSession(sha256(token));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

// Simple in-memory login throttle: 10 attempts per 5 minutes per client address.
const attempts = new Map<string, number[]>();
export function throttled(key: string): boolean {
	const now = Date.now();
	const recent = (attempts.get(key) ?? []).filter((t) => now - t < 5 * 60_000);
	recent.push(now);
	attempts.set(key, recent);
	return recent.length > 10;
}
