import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { decrypt, encrypt } from './crypto.ts';
import type {
	ClaudeAccount,
	ClaudeAuthKind,
	GithubAccount,
	PermissionMode,
	Session,
	SessionInput,
	SessionStatus,
	Settings,
	User
} from '#lib/types.ts';

let handle: DatabaseSync | undefined;

/** Opens the store on first use, so importing this module (e.g. during build) has no side effects. */
function db(): DatabaseSync {
	if (handle) return handle;
	mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
	const dbPath = join(config.dataDir, 'cc-modern.db');
	handle = new DatabaseSync(dbPath);
	try {
		chmodSync(dbPath, 0o600);
	} catch {
		// Best effort — some mounted volumes don't support chmod.
	}
	handle.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA foreign_keys = ON;

		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE COLLATE NOCASE,
			name TEXT,
			password_hash TEXT NOT NULL,
			created_at TEXT NOT NULL,
			last_login_at TEXT
		);

		CREATE TABLE IF NOT EXISTS auth_sessions (
			token_hash TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS claude_accounts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL,
			secret TEXT,
			email TEXT,
			plan TEXT,
			status TEXT NOT NULL DEFAULT 'unknown',
			checked_at TEXT,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS github_accounts (
			id TEXT PRIMARY KEY,
			login TEXT NOT NULL,
			name TEXT,
			avatar_url TEXT,
			kind TEXT NOT NULL,
			secret TEXT NOT NULL,
			scopes TEXT,
			orgs TEXT NOT NULL DEFAULT '[]',
			git_name TEXT,
			git_email TEXT,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			repo_url TEXT NOT NULL,
			repo_full_name TEXT,
			repo_dir TEXT NOT NULL,
			base_branch TEXT,
			new_branch TEXT,
			claude_account_id TEXT NOT NULL REFERENCES claude_accounts(id),
			github_account_id TEXT REFERENCES github_accounts(id) ON DELETE SET NULL,
			model TEXT,
			permission_mode TEXT NOT NULL DEFAULT 'default',
			remote_control INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'stopped',
			container_id TEXT,
			error TEXT,
			rc_url TEXT,
			created_at TEXT NOT NULL,
			last_started_at TEXT,
			stopped_at TEXT
		);
	`);
	return handle;
}

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

// ── key/value and settings ─────────────────────────────────────────────

export function getKv<T>(key: string, fallback: T): T {
	const r = db().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
	return r ? (JSON.parse(r.value) as T) : fallback;
}

export function setKv(key: string, value: unknown) {
	db()
		.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		.run(key, JSON.stringify(value));
}

export function defaultSettings(): Settings {
	return {
		sessionImage: config.sessionImage,
		network: config.sessionNetwork,
		memoryMb: 0,
		cpus: 0,
		defaultModel: '',
		defaultPermissionMode: 'default',
		defaultRemoteControl: true,
		extraEnv: ''
	};
}

export function getSettings(): Settings {
	return { ...defaultSettings(), ...getKv<Partial<Settings>>('settings', {}) };
}

export function saveSettings(settings: Settings) {
	setKv('settings', settings);
}

// ── users and sign-in sessions ─────────────────────────────────────────

function toUser(r: Row): User {
	return {
		id: r.id as string,
		email: r.email as string,
		name: (r.name as string) ?? null,
		createdAt: r.created_at as string,
		lastLoginAt: (r.last_login_at as string) ?? null
	};
}

export function countUsers(): number {
	return (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function findUserByEmail(email: string): User | undefined {
	const r = db().prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as Row | undefined;
	return r ? toUser(r) : undefined;
}

export function getPasswordHash(userId: string): string | undefined {
	const r = db().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
	return r?.password_hash;
}

export function createUser(input: { email: string; name?: string | null; passwordHash: string }): User {
	const id = randomUUID();
	db()
		.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
		.run(id, input.email.trim(), input.name ?? null, input.passwordHash, now());
	return findUserByEmail(input.email)!;
}

export function updateUser(id: string, patch: { name?: string | null; email?: string; passwordHash?: string }) {
	if (patch.name !== undefined) db().prepare('UPDATE users SET name = ? WHERE id = ?').run(patch.name, id);
	if (patch.email !== undefined) db().prepare('UPDATE users SET email = ? WHERE id = ?').run(patch.email.trim(), id);
	if (patch.passwordHash !== undefined) db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(patch.passwordHash, id);
}

export function touchUserLogin(id: string) {
	db().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id);
}

export function createAuthSession(tokenHash: string, userId: string, ttlMs: number) {
	const t = Date.now();
	db().prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(t);
	db().prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, t + ttlMs);
}

export function authSessionUser(tokenHash: string): User | undefined {
	const r = db()
		.prepare('SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
		.get(tokenHash, Date.now()) as Row | undefined;
	return r ? toUser(r) : undefined;
}

export function deleteAuthSession(tokenHash: string) {
	db().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function deleteUserAuthSessions(userId: string, except?: string) {
	db().prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?').run(userId, except ?? '');
}

// ── Claude accounts ────────────────────────────────────────────────────

function toClaudeAccount(r: Row): ClaudeAccount {
	return {
		id: r.id as string,
		name: r.name as string,
		kind: r.kind as ClaudeAuthKind,
		email: (r.email as string) ?? null,
		plan: (r.plan as string) ?? null,
		status: (r.status as ClaudeAccount['status']) ?? 'unknown',
		checkedAt: (r.checked_at as string) ?? null,
		createdAt: r.created_at as string,
		hasSecret: !!r.secret
	};
}

export function listClaudeAccounts(): ClaudeAccount[] {
	return (db().prepare('SELECT * FROM claude_accounts ORDER BY created_at').all() as Row[]).map(toClaudeAccount);
}

export function getClaudeAccount(id: string): ClaudeAccount | undefined {
	const r = db().prepare('SELECT * FROM claude_accounts WHERE id = ?').get(id) as Row | undefined;
	return r ? toClaudeAccount(r) : undefined;
}

export function getClaudeSecret(id: string): string | undefined {
	const r = db().prepare('SELECT secret FROM claude_accounts WHERE id = ?').get(id) as { secret: string | null } | undefined;
	return r?.secret ? decrypt(r.secret, `claude:${id}`) : undefined;
}

export function createClaudeAccount(input: { name: string; kind: ClaudeAuthKind; secret?: string }): ClaudeAccount {
	const id = randomUUID();
	const secret = input.secret ? encrypt(input.secret, `claude:${id}`) : null;
	// A token or key is usable right away; a subscription account signs in first.
	const status = input.kind === 'subscription' ? 'signed_out' : 'unknown';
	db()
		.prepare('INSERT INTO claude_accounts (id, name, kind, secret, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.run(id, input.name, input.kind, secret, status, now());
	return getClaudeAccount(id)!;
}

export function updateClaudeAccount(id: string, patch: { name?: string; secret?: string }) {
	if (patch.name !== undefined) db().prepare('UPDATE claude_accounts SET name = ? WHERE id = ?').run(patch.name, id);
	if (patch.secret !== undefined) {
		db().prepare('UPDATE claude_accounts SET secret = ? WHERE id = ?').run(encrypt(patch.secret, `claude:${id}`), id);
	}
}

export function setClaudeAuthStatus(id: string, s: { status: ClaudeAccount['status']; email?: string | null; plan?: string | null }) {
	db()
		.prepare('UPDATE claude_accounts SET status = ?, email = ?, plan = ?, checked_at = ? WHERE id = ?')
		.run(s.status, s.email ?? null, s.plan ?? null, now(), id);
}

export function deleteClaudeAccount(id: string): boolean {
	return db().prepare('DELETE FROM claude_accounts WHERE id = ?').run(id).changes > 0;
}

// ── GitHub accounts ────────────────────────────────────────────────────

function toGithubAccount(r: Row): GithubAccount {
	return {
		id: r.id as string,
		login: r.login as string,
		name: (r.name as string) ?? null,
		avatarUrl: (r.avatar_url as string) ?? null,
		kind: r.kind as GithubAccount['kind'],
		scopes: (r.scopes as string) ?? null,
		orgs: JSON.parse((r.orgs as string) || '[]'),
		createdAt: r.created_at as string
	};
}

export function listGithubAccounts(): GithubAccount[] {
	return (db().prepare('SELECT * FROM github_accounts ORDER BY created_at').all() as Row[]).map(toGithubAccount);
}

export function getGithubAccount(id: string): GithubAccount | undefined {
	const r = db().prepare('SELECT * FROM github_accounts WHERE id = ?').get(id) as Row | undefined;
	return r ? toGithubAccount(r) : undefined;
}

export function getGithubToken(id: string): string | undefined {
	const r = db().prepare('SELECT secret FROM github_accounts WHERE id = ?').get(id) as { secret: string } | undefined;
	return r ? decrypt(r.secret, `github:${id}`) : undefined;
}

export function getGitIdentity(id: string): { name: string; email: string } | undefined {
	const r = db().prepare('SELECT git_name, git_email FROM github_accounts WHERE id = ?').get(id) as Row | undefined;
	return r?.git_name && r.git_email ? { name: r.git_name as string, email: r.git_email as string } : undefined;
}

export type GithubAccountInput = {
	login: string;
	name: string | null;
	avatarUrl: string | null;
	kind: GithubAccount['kind'];
	token: string;
	scopes: string | null;
	orgs: string[];
	gitName: string;
	gitEmail: string;
};

/** Adds an account, or refreshes the token of the one already saved for that login. */
export function upsertGithubAccount(input: GithubAccountInput): GithubAccount {
	const existing = db().prepare('SELECT id FROM github_accounts WHERE login = ? COLLATE NOCASE').get(input.login) as { id: string } | undefined;
	const id = existing?.id ?? randomUUID();
	const secret = encrypt(input.token, `github:${id}`);
	if (existing) {
		db()
			.prepare(
				'UPDATE github_accounts SET login = ?, name = ?, avatar_url = ?, kind = ?, secret = ?, scopes = ?, orgs = ?, git_name = ?, git_email = ? WHERE id = ?'
			)
			.run(input.login, input.name, input.avatarUrl, input.kind, secret, input.scopes, JSON.stringify(input.orgs), input.gitName, input.gitEmail, id);
	} else {
		db()
			.prepare(
				`INSERT INTO github_accounts (id, login, name, avatar_url, kind, secret, scopes, orgs, git_name, git_email, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(id, input.login, input.name, input.avatarUrl, input.kind, secret, input.scopes, JSON.stringify(input.orgs), input.gitName, input.gitEmail, now());
	}
	return getGithubAccount(id)!;
}

export function setGithubOrgs(id: string, orgs: string[]) {
	db().prepare('UPDATE github_accounts SET orgs = ? WHERE id = ?').run(JSON.stringify(orgs), id);
}

export function deleteGithubAccount(id: string): boolean {
	return db().prepare('DELETE FROM github_accounts WHERE id = ?').run(id).changes > 0;
}

// ── sessions ───────────────────────────────────────────────────────────

function toSession(r: Row): Session {
	return {
		id: r.id as string,
		name: r.name as string,
		repoUrl: r.repo_url as string,
		repoFullName: (r.repo_full_name as string) ?? null,
		repoDir: r.repo_dir as string,
		baseBranch: (r.base_branch as string) ?? null,
		newBranch: (r.new_branch as string) ?? null,
		claudeAccountId: r.claude_account_id as string,
		githubAccountId: (r.github_account_id as string) ?? null,
		model: (r.model as string) ?? null,
		permissionMode: r.permission_mode as PermissionMode,
		remoteControl: !!r.remote_control,
		status: r.status as SessionStatus,
		containerId: (r.container_id as string) ?? null,
		error: (r.error as string) ?? null,
		rcUrl: (r.rc_url as string) ?? null,
		createdAt: r.created_at as string,
		lastStartedAt: (r.last_started_at as string) ?? null,
		stoppedAt: (r.stopped_at as string) ?? null
	};
}

export function listSessions(): Session[] {
	return (db().prepare('SELECT * FROM sessions ORDER BY COALESCE(last_started_at, created_at) DESC').all() as Row[]).map(toSession);
}

export function getSession(id: string): Session | undefined {
	const r = db().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
	return r ? toSession(r) : undefined;
}

export function sessionsUsingClaudeAccount(id: string): number {
	return (db().prepare('SELECT COUNT(*) AS n FROM sessions WHERE claude_account_id = ?').get(id) as { n: number }).n;
}

export function createSession(id: string, input: Omit<SessionInput, 'prompt'> & { repoDir: string }): Session {
	db()
		.prepare(
			`INSERT INTO sessions (id, name, repo_url, repo_full_name, repo_dir, base_branch, new_branch, claude_account_id,
				github_account_id, model, permission_mode, remote_control, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?)`
		)
		.run(
			id,
			input.name,
			input.repoUrl,
			input.repoFullName,
			input.repoDir,
			input.baseBranch,
			input.newBranch,
			input.claudeAccountId,
			input.githubAccountId,
			input.model,
			input.permissionMode,
			input.remoteControl ? 1 : 0,
			now()
		);
	return getSession(id)!;
}

/** Fields that can change after creation; they apply from the next launch. */
export function updateSession(
	id: string,
	patch: Partial<Pick<Session, 'name' | 'model' | 'permissionMode' | 'remoteControl' | 'claudeAccountId' | 'githubAccountId'>>
) {
	const cols: Record<string, string> = {
		name: 'name',
		model: 'model',
		permissionMode: 'permission_mode',
		remoteControl: 'remote_control',
		claudeAccountId: 'claude_account_id',
		githubAccountId: 'github_account_id'
	};
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || !cols[k]) continue;
		db()
			.prepare(`UPDATE sessions SET ${cols[k]} = ? WHERE id = ?`)
			.run(typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | null), id);
	}
}

export function setSessionState(
	id: string,
	s: { status: SessionStatus; containerId?: string | null; error?: string | null; started?: boolean; stopped?: boolean }
) {
	const cur = getSession(id);
	if (!cur) return;
	db()
		.prepare('UPDATE sessions SET status = ?, container_id = ?, error = ?, last_started_at = ?, stopped_at = ? WHERE id = ?')
		.run(
			s.status,
			s.containerId === undefined ? cur.containerId : s.containerId,
			s.error === undefined ? cur.error : s.error,
			s.started ? now() : cur.lastStartedAt,
			s.stopped ? now() : s.started ? null : cur.stoppedAt,
			id
		);
}

export function setSessionRcUrl(id: string, url: string | null) {
	db().prepare('UPDATE sessions SET rc_url = ? WHERE id = ?').run(url, id);
}

export function deleteSession(id: string): boolean {
	return db().prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
}
