import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRcUrl, paneState, parseGit, parseProbe } from '#lib/pane.ts';

const RS = '\x1e';

test('parseProbe splits command, screen and git', () => {
	const out = ['claude.exe', RS, '', 'line 1', 'line 2', '', '', RS, '# branch.oid abc', '# branch.head main', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 a b src/x.ts', '? new.txt', RS, ' 2 files changed, 10 insertions(+), 3 deletions(-)', ''].join('\n');
	const p = parseProbe(out);
	assert.equal(p.command, 'claude.exe');
	assert.deepEqual(p.lines, ['line 1', 'line 2']);
	assert.deepEqual(p.git, { branch: 'main', ahead: 2, behind: 1, changed: 2, insertions: 10, deletions: 3 });
});

test('parseProbe without git', () => {
	assert.equal(parseProbe(`bash\n${RS}\n$ ls\n`).git, null);
});

test('parseGit: detached head, one-sided stats', () => {
	assert.deepEqual(parseGit('# branch.head (detached)\n', ' 1 file changed, 1 insertion(+)'), { branch: null, ahead: 0, behind: 0, changed: 0, insertions: 1, deletions: 0 });
});

test('paneState reads what Claude is doing', () => {
	assert.equal(paneState('claude.exe', ['✻ Thinking… (12s · esc to interrupt)']), 'working');
	assert.equal(paneState('claude', ['Do you want to make this edit to app.ts?', '❯ 1. Yes', '  2. No']), 'waiting');
	assert.equal(paneState('claude', ['Enable Remote Control? (y/n)']), 'waiting');
	assert.equal(paneState('claude', ['❯ ', '  ⏵⏵ accept edits on']), 'idle');
	assert.equal(paneState('git', ['Cloning into…']), 'starting');
	assert.equal(paneState('node', []), 'starting');
	assert.equal(paneState('bash', ['── Claude exited (status 0).']), 'shell');
	assert.equal(paneState('bash', ['Cloning…']), 'starting');
	assert.equal(paneState('', []), 'starting');
	assert.equal(paneState('vim', []), 'unknown');
});

test('findRcUrl takes the newest link', () => {
	assert.equal(findRcUrl(['old https://claude.ai/code/session_abc', 'new https://claude.ai/code/session_XYZ_9?x=1']), 'https://claude.ai/code/session_XYZ_9');
	assert.equal(findRcUrl(['/rc active']), null);
});

test('extractLinks joins wrapped URLs and keeps the newest', async () => {
	const { extractLinks, findDeviceCode } = await import('#lib/pane.ts');
	const w = 'Open: https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e';
	const lines = ['Browser didn\'t open? Use the url below to sign in:', '', w, '&response_type=code&redirect_uri=https%3A%2F%2Fconsole', '.anthropic.com%2Foauth%2Fcode%2Fcallback&state=abc', '', 'Paste code here if prompted >'];
	assert.deepEqual(extractLinks(lines), [
		'https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&state=abc'
	]);
	// Short links aren't joined to the words after them.
	assert.deepEqual(extractLinks(['See https://x.io/a.', 'then run tests']), ['https://x.io/a']);
	assert.deepEqual(extractLinks(['│ https://a.io/1 │', 'https://b.io/2 and https://a.io/1']), ['https://b.io/2', 'https://a.io/1']);
	assert.equal(findDeviceCode(['Enter this one-time code', '   ABCD-12345   ', 'ENG-42 is unrelated']), 'ABCD-12345');
	assert.equal(findDeviceCode(['nothing here']), null);
});
