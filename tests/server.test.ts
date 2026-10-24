import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demux, parseImageRef, supportsSubpath } from '#lib/server/docker.ts';
import { parseAuthStatus } from '#lib/server/claude-accounts.ts';
import { parseEnvLines } from '#lib/server/sessions/runtime.ts';
import { sessionTokenFromHeader } from '#lib/server/auth.ts';

const frame = (kind: number, s: string) => {
	const body = Buffer.from(s);
	const h = Buffer.alloc(8);
	h[0] = kind;
	h.writeUInt32BE(body.length, 4);
	return Buffer.concat([h, body]);
};

test('demux splits stdout and stderr frames', () => {
	assert.deepEqual(demux(Buffer.concat([frame(1, 'out1 '), frame(2, 'err'), frame(1, 'out2')])), { stdout: 'out1 out2', stderr: 'err' });
});

test('parseImageRef handles registries with ports and digests', () => {
	assert.deepEqual(parseImageRef('ghcr.io/vitafortis/cc-modern-session:latest'), { fromImage: 'ghcr.io/vitafortis/cc-modern-session', tag: 'latest' });
	assert.deepEqual(parseImageRef('registry.lan:5000/session'), { fromImage: 'registry.lan:5000/session', tag: 'latest' });
	assert.deepEqual(parseImageRef('img@sha256:abc'), { fromImage: 'img', tag: 'sha256:abc' });
});

test('volume subpaths need API 1.45', () => {
	const v = (ApiVersion: string) => ({ Version: '', ApiVersion, Os: '', Arch: '' });
	assert.ok(supportsSubpath(v('1.45')));
	assert.ok(supportsSubpath(v('1.56')));
	assert.ok(!supportsSubpath(v('1.44')));
});

test('parseAuthStatus', () => {
	assert.deepEqual(parseAuthStatus('{"loggedIn": false, "authMethod": "none"}', 1), { status: 'signed_out', email: null, plan: null });
	assert.deepEqual(parseAuthStatus('{"loggedIn": true, "authMethod": "claude.ai", "account": {"email": "a@b.co"}, "subscriptionType": "max"}', 0), {
		status: 'signed_in',
		email: 'a@b.co',
		plan: 'max'
	});
	assert.deepEqual(parseAuthStatus('{"loggedIn": true, "authMethod": "api_key"}', 0), { status: 'signed_in', email: null, plan: 'api_key' });
	assert.equal(parseAuthStatus('garbage', 1).status, 'signed_out');
});

test('parseEnvLines keeps KEY=value lines only', () => {
	assert.deepEqual(parseEnvLines('# comment\nA=1\n\n bad line\nB_2=x=y\n1X=no'), ['A=1', 'B_2=x=y']);
});

test('sessionTokenFromHeader', () => {
	assert.equal(sessionTokenFromHeader('a=1; ccm_session=tok%3D; b=2'), 'tok=');
	assert.equal(sessionTokenFromHeader(undefined), undefined);
});
