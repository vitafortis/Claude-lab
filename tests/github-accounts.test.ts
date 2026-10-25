import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The store opens its database on first use, under CCM_DATA_DIR.
process.env.CCM_DATA_DIR = mkdtempSync(join(tmpdir(), 'ccm-test-'));
process.env.CCM_SECRET_KEY = 'test-key';
const store = await import('#lib/server/store.ts');

const input = (token: string, kind: 'pat' | 'oauth' = 'pat') => ({
	login: 'octo',
	name: 'Octo Cat',
	avatarUrl: null,
	kind,
	token,
	scopes: null,
	orgs: [],
	gitName: 'Octo Cat',
	gitEmail: '1+octo@users.noreply.github.com'
});

test('several named tokens for one GitHub login', () => {
	const work = store.upsertGithubAccount(input('tok-work'), { label: 'Work org' });
	const home = store.upsertGithubAccount(input('tok-home'), { label: 'Personal' });
	assert.notEqual(work.id, home.id);
	assert.deepEqual(
		store.listGithubAccounts().map((a) => a.label),
		['Work org', 'Personal']
	);

	// The same token again updates its connection instead of adding one.
	const again = store.upsertGithubAccount(input('tok-work'));
	assert.equal(again.id, work.id);
	assert.equal(again.label, 'Work org');
	assert.equal(store.listGithubAccounts().length, 2);

	// Replacing keeps the id (sessions refer to it) and can rename.
	const swapped = store.upsertGithubAccount(input('tok-work-2'), { label: 'Work', replace: work.id });
	assert.equal(swapped.id, work.id);
	assert.equal(swapped.label, 'Work');
	assert.equal(store.getGithubToken(work.id), 'tok-work-2');

	store.setGithubLabel(home.id, '');
	assert.equal(store.getGithubAccount(home.id)?.label, null);
});

test('signing in with GitHub again replaces that login’s signed-in connection', () => {
	const a = store.upsertGithubAccount(input('oauth-1', 'oauth'));
	const b = store.upsertGithubAccount(input('oauth-2', 'oauth'));
	assert.equal(a.id, b.id);
	assert.equal(store.getGithubToken(a.id), 'oauth-2');
});
