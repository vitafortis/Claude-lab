/** How a Claude account signs in. Only `subscription` (a full claude.ai login) supports Remote Control. */
export type ClaudeAuthKind = 'subscription' | 'token' | 'api_key';

export const CLAUDE_AUTH_LABEL: Record<ClaudeAuthKind, string> = {
	subscription: 'Claude subscription',
	token: 'Long-lived token',
	api_key: 'API key'
};

export interface ClaudeAccount {
	id: string;
	name: string;
	kind: ClaudeAuthKind;
	/** From `claude auth status`, once signed in. */
	email: string | null;
	plan: string | null;
	status: 'signed_in' | 'signed_out' | 'unknown';
	checkedAt: string | null;
	createdAt: string;
	/** A token or key is stored (token / api_key accounts). */
	hasSecret: boolean;
}

export interface GithubAccount {
	id: string;
	login: string;
	name: string | null;
	avatarUrl: string | null;
	kind: 'pat' | 'oauth';
	scopes: string | null;
	/** Organizations the token can see. */
	orgs: string[];
	createdAt: string;
}

export interface GithubRepo {
	fullName: string;
	owner: string;
	name: string;
	private: boolean;
	defaultBranch: string;
	description: string | null;
	pushedAt: string | null;
	url: string;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions';

export const PERMISSION_MODES: { value: PermissionMode; label: string; hint: string }[] = [
	{ value: 'default', label: 'Ask', hint: 'Claude asks before edits and commands' },
	{ value: 'acceptEdits', label: 'Accept edits', hint: 'File edits go through; commands still ask' },
	{ value: 'plan', label: 'Plan', hint: 'Read-only until you approve a plan' },
	{ value: 'auto', label: 'Auto', hint: 'A classifier approves safe actions' },
	{ value: 'bypassPermissions', label: 'Bypass', hint: 'No prompts. The container is the sandbox' }
];

export type SessionStatus = 'starting' | 'running' | 'stopped' | 'error';

export interface Session {
	id: string;
	name: string;
	repoUrl: string;
	/** owner/name for GitHub repos, null for other URLs. */
	repoFullName: string | null;
	/** Folder name under /workspace. */
	repoDir: string;
	baseBranch: string | null;
	newBranch: string | null;
	claudeAccountId: string;
	githubAccountId: string | null;
	model: string | null;
	permissionMode: PermissionMode;
	remoteControl: boolean;
	status: SessionStatus;
	containerId: string | null;
	error: string | null;
	/** The claude.ai/code link Remote Control printed, once seen. */
	rcUrl: string | null;
	createdAt: string;
	lastStartedAt: string | null;
	stoppedAt: string | null;
}

export interface SessionInput {
	name: string;
	repoUrl: string;
	repoFullName: string | null;
	baseBranch: string | null;
	newBranch: string | null;
	claudeAccountId: string;
	githubAccountId: string | null;
	model: string | null;
	permissionMode: PermissionMode;
	remoteControl: boolean;
	prompt: string | null;
}

/** What Claude is doing right now, read from the terminal. */
export type PaneState = 'working' | 'waiting' | 'idle' | 'shell' | 'starting' | 'unknown';

export interface Todo {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
}

/** A short, cheap summary of the newest conversation, read from its transcript. */
export interface TranscriptSummary {
	conversationId: string;
	title: string | null;
	lastPrompt: string | null;
	lastReply: string | null;
	lastTool: string | null;
	messages: number;
	updatedAt: string;
	todos: Todo[];
}

export interface Conversation {
	id: string;
	title: string | null;
	firstPrompt: string | null;
	updatedAt: string;
	messages: number;
	bytes: number;
}

export interface GitState {
	branch: string | null;
	ahead: number;
	behind: number;
	changed: number;
	insertions: number;
	deletions: number;
}

/** Everything the overview and session page show live, per session. */
export interface SessionLive {
	id: string;
	status: SessionStatus;
	state: PaneState;
	/** The last lines of the terminal, plain text. */
	tail: string[];
	rcUrl: string | null;
	summary: TranscriptSummary | null;
	git: GitState | null;
	/** An AI summary, if one was asked for. */
	aiSummary: { text: string; at: string } | null;
	at: string;
}

export interface Settings {
	sessionImage: string;
	/** Docker network for session containers (blank: Docker's default bridge). */
	network: string;
	/** Per-container limits; 0 means none. */
	memoryMb: number;
	cpus: number;
	defaultModel: string;
	defaultPermissionMode: PermissionMode;
	defaultRemoteControl: boolean;
	/** Extra KEY=value lines passed to every session container. */
	extraEnv: string;
}

export interface Viewer {
	email: string;
	name: string | null;
}

export interface User {
	id: string;
	email: string;
	name: string | null;
	createdAt: string;
	lastLoginAt: string | null;
}
