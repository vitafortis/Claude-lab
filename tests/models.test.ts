import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelGroups, modelLabel } from '#lib/models.ts';

test('modelLabel names the version', () => {
	assert.equal(modelLabel(null), 'Default');
	assert.equal(modelLabel('opus'), 'Opus 5.5');
	assert.equal(modelLabel('claude-opus-4-8'), 'Opus 4.8 (pinned)');
	assert.equal(modelLabel('us.anthropic.claude-x'), 'us.anthropic.claude-x');
});

test('modelGroups: exact versions only where the account takes Anthropic IDs', () => {
	assert.equal(modelGroups('claude', 'api_key').length, 2);
	assert.equal(modelGroups('claude', 'bedrock').length, 1);
	assert.deepEqual(modelGroups('codex', 'chatgpt'), []);
});
