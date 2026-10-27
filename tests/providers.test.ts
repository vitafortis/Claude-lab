import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexArgs, geminiArgs, sessionWorkdir } from '#lib/launch.ts';
import { paneState } from '#lib/pane.ts';
import { matchProfile, parsePatterns, repoMatches } from '#lib/profiles.ts';
import { fitPermissionMode } from '#lib/providers.ts';
import type { ModelAccount } from '#lib/types.ts';

const opts = { name: 'api', model: null, permissionMode: 'default' as const, remoteControl: true };

test('codexArgs: new, continue, resume, bypass', () => {
	assert.deepEqual(codexArgs(opts, { mode: 'new', prompt: 'fix it' }), ['--no-daemon', '-s', 'danger-full-access', '-a', 'on-request', 'fix it']);
	assert.deepEqual(codexArgs({ ...opts, model: 'gpt-5.1-codex' }, { mode: 'continue' }), ['resume', '--last', '--no-daemon', '-s', 'danger-full-access', '-a', 'on-request', '-m', 'gpt-5.1-codex']);
	assert.deepEqual(codexArgs({ ...opts, permissionMode: 'bypassPermissions' }, { mode: 'new' }), ['--no-daemon', '--dangerously-bypass-approvals-and-sandbox']);
	assert.throws(() => codexArgs(opts, { mode: 'resume', conversationId: '--help' }));
	// A prompt can't be read as a flag.
	assert.equal(codexArgs(opts, { mode: 'new', prompt: '-rf' }).at(-1), ' -rf');
});

test('geminiArgs: approval modes and resume', () => {
	assert.deepEqual(geminiArgs(opts, { mode: 'new' }), ['--skip-trust', '--approval-mode', 'default']);
	assert.deepEqual(geminiArgs({ ...opts, permissionMode: 'bypassPermissions', model: 'gemini-2.5-pro' }, { mode: 'continue' }), [
		'--skip-trust',
		'--approval-mode',
		'yolo',
		'-m',
		'gemini-2.5-pro',
		'--resume',
		'latest'
	]);
	assert.deepEqual(geminiArgs({ ...opts, permissionMode: 'acceptEdits' }, { mode: 'new', prompt: 'hi' }).slice(-2), ['--prompt-interactive', 'hi']);
});

test('fitPermissionMode keeps to what the agent has', () => {
	assert.equal(fitPermissionMode('claude', 'auto'), 'auto');
	assert.equal(fitPermissionMode('codex', 'acceptEdits'), 'default');
	assert.equal(fitPermissionMode('codex', 'bypassPermissions'), 'bypassPermissions');
	assert.equal(fitPermissionMode('gemini', 'auto'), 'acceptEdits');
	assert.equal(fitPermissionMode('gemini', 'plan'), 'plan');
});

test('sessionWorkdir is unique per session for Codex and Gemini', () => {
	const id = '0123456789abcdef';
	assert.equal(sessionWorkdir({ id, repoDir: 'api', agent: 'claude' }), '/workspace/api');
	assert.equal(sessionWorkdir({ id, repoDir: 'api', agent: 'codex' }), '/workspace/01234567/api');
});

test('profiles: patterns and first match wins', () => {
	assert.ok(repoMatches('acme/*', 'Acme/API'));
	assert.ok(repoMatches('*', 'me/x'));
	assert.ok(repoMatches('*-infra', 'acme/k8s-infra'));
	assert.ok(!repoMatches('acme/*', 'acmecorp/api'));
	assert.ok(!repoMatches('a.c/x', 'abc/x'), 'dots are literal');
	const profiles = [
		{ id: 'all', repos: ['*'], position: 2 },
		{ id: 'acme', repos: ['acme/*'], position: 1 },
		{ id: 'api', repos: ['acme/api'], position: 0 }
	];
	assert.equal(matchProfile(profiles, 'acme/api')?.id, 'api');
	assert.equal(matchProfile(profiles, 'acme/web')?.id, 'acme');
	assert.equal(matchProfile(profiles, 'me/notes')?.id, 'all');
	assert.equal(matchProfile(profiles.slice(1, 3), null), null);
	assert.deepEqual(parsePatterns(' acme/*,\nme/x\n\nacme/* '), ['acme/*', 'me/x']);
});

test('paneState for Codex and Gemini panes', () => {
	assert.equal(paneState('node', ['• Working (3s • esc to interrupt)'], 'codex'), 'working');
	assert.equal(paneState('node', ['Would you like to run the following command?', '› 1. Yes, proceed'], 'codex'), 'waiting');
	assert.equal(paneState('node', ['› Ask Codex to do anything'], 'codex'), 'idle');
	assert.equal(paneState('node', ['⠏ Thinking (esc to cancel, 4s)'], 'gemini'), 'working');
	assert.equal(paneState('node', ['● 1. Yes, allow once'], 'gemini'), 'waiting');
	assert.equal(paneState('bash', ['── codex exited (status 0).'], 'codex'), 'shell');
	// For Claude, node is still orb-launch getting ready.
	assert.equal(paneState('node', [], 'claude'), 'starting');
});

test('providerEnv per kind', async () => {
	const { providerEnv } = await import('#lib/server/providers.ts');
	const acct = (kind: ModelAccount['kind'], config: Record<string, string> = {}): ModelAccount => ({
		id: 'a1',
		name: 'x',
		kind,
		agent: 'claude',
		config,
		secrets: [],
		email: null,
		plan: null,
		status: 'unknown',
		checkedAt: null,
		createdAt: ''
	});
	assert.deepEqual(providerEnv(acct('api_key'), { apiKey: 'sk-ant-1' }), ['ANTHROPIC_API_KEY=sk-ant-1']);
	assert.deepEqual(providerEnv(acct('bedrock', { region: 'eu-west-1', opusModel: 'eu.anthropic.x' }), { bearerToken: 'b' }), [
		'CLAUDE_CODE_USE_BEDROCK=1',
		'AWS_REGION=eu-west-1',
		'AWS_BEARER_TOKEN_BEDROCK=b',
		'ANTHROPIC_DEFAULT_OPUS_MODEL=eu.anthropic.x'
	]);
	assert.ok(providerEnv(acct('vertex', { projectId: 'p', region: 'global' }), {}).includes('GOOGLE_APPLICATION_CREDENTIALS=/claude/.orb/gcp-credentials.json'));
	assert.ok(providerEnv(acct('gateway', { baseUrl: 'https://gw', header: 'x-api-key' }), { token: 't' }).includes('ANTHROPIC_API_KEY=t'));
	assert.ok(providerEnv(acct('gateway', { baseUrl: 'https://gw' }), { token: 't' }).includes('ANTHROPIC_AUTH_TOKEN=t'));
	assert.deepEqual(providerEnv(acct('openai_api_key'), { apiKey: 'sk-o' }), ['OPENAI_API_KEY=sk-o']);
	assert.deepEqual(providerEnv(acct('chatgpt'), {}), []);
});
