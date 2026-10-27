import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demux, parseImageRef, supportsSubpath } from '#lib/server/docker.ts';
import { parseAuthStatus } from '#lib/server/accounts.ts';
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
	assert.deepEqual(parseImageRef('ghcr.io/vitafortis/orbital-session:latest'), { fromImage: 'ghcr.io/vitafortis/orbital-session', tag: 'latest' });
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
	assert.deepEqual(parseAuthStatus('{"loggedIn": true, "authMethod": "api_key"}', 0), { status: 'signed_in', email: null, plan: null });
	assert.equal(parseAuthStatus('garbage', 1).status, 'signed_out');
});

test('parseEnvLines keeps KEY=value lines only', () => {
	assert.deepEqual(parseEnvLines('# comment\nA=1\n\n bad line\nB_2=x=y\n1X=no'), ['A=1', 'B_2=x=y']);
});

test('sessionTokenFromHeader', () => {
	assert.equal(sessionTokenFromHeader('a=1; orb_session=tok%3D; b=2'), 'tok=');
	assert.equal(sessionTokenFromHeader(undefined), undefined);
});

test('renderPrompt fills in the issue', async () => {
	const { renderPrompt, DEFAULT_PROMPT } = await import('#lib/server/linear.ts');
	const issue = { identifier: 'ENG-7', title: 'Fix login', description: null, url: 'https://linear.app/x/issue/ENG-7' };
	const p = renderPrompt(DEFAULT_PROMPT, issue, 'sam/eng-7-fix-login');
	assert.match(p, /^You're working on Linear issue ENG-7: Fix login$/m);
	assert.match(p, /\(No description\.\)/);
	assert.match(p, /branch sam\/eng-7-fix-login/);
	assert.match(p, /"Fixes ENG-7"/);
	assert.equal(renderPrompt('/review {identifier} {unknown}', issue, 'b'), '/review ENG-7 {unknown}');
});

test('frontMatterDescription', async () => {
	const { frontMatterDescription } = await import('#lib/server/skills.ts');
	assert.equal(frontMatterDescription('---\nname: x\ndescription: "Reviews PRs"\n---\nbody'), 'Reviews PRs');
	assert.equal(frontMatterDescription('no front matter'), '');
});
