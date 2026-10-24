// Pre-answers Claude Code's first-run questions that cc·modern already knows the answer to:
// onboarding, trusting the session's repo folder, and approving the account's API key.
// Anything else (e.g. the Remote Control confirmation) is answered in the terminal.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = process.env.CLAUDE_CONFIG_DIR;
const file = dir ? join(dir, '.claude.json') : join(homedir(), '.claude.json');

let cfg = {};
try {
	cfg = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
	// Only start from scratch when there is no file. A half-written one (another session
	// saving at the same moment) is left alone rather than clobbered.
	if (err.code !== 'ENOENT') process.exit(0);
}

cfg.hasCompletedOnboarding = true;
cfg.theme ??= 'dark';

const repo = process.argv[2];
if (repo) {
	cfg.projects ??= {};
	const p = (cfg.projects[repo] ??= {});
	p.hasTrustDialogAccepted = true;
	p.hasCompletedProjectOnboarding = true;
}

const key = process.env.ANTHROPIC_API_KEY;
if (key) {
	const r = (cfg.customApiKeyResponses ??= { approved: [], rejected: [] });
	const tail = key.slice(-20);
	r.approved = [...new Set([...(r.approved ?? []), tail])];
	r.rejected = (r.rejected ?? []).filter((k) => k !== tail);
}

if (process.env.CCM_BYPASS_PERMISSIONS === '1') cfg.bypassPermissionsModeAccepted = true;

const tmp = `${file}.ccm-${process.pid}`;
writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
renameSync(tmp, file);
