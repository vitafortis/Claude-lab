// Pre-answers first-run questions that Orbital already knows the answer to, for the
// session's agent ($ORB_AGENT):
//   claude  onboarding, trusting the repo folder, approving the account's API key
//   codex   trusting the repo folder
//   gemini  which sign-in to use (it asks even when GEMINI_API_KEY is set)
// Anything else (e.g. the Remote Control confirmation) is answered in the terminal.
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const agent = process.env.ORB_AGENT || 'claude';
const repo = process.argv[2];

/** Reads a JSON file, or {} when there is none. A half-written one (another session saving
 * at the same moment) is left alone rather than clobbered: returns null. */
function readJson(file) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		return err.code === 'ENOENT' ? {} : null;
	}
}

function writeJson(file, data) {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.orb-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
	renameSync(tmp, file);
}

function seedClaude() {
	const dir = process.env.CLAUDE_CONFIG_DIR;
	const file = dir ? join(dir, '.claude.json') : join(homedir(), '.claude.json');
	const cfg = readJson(file);
	if (!cfg) return;

	cfg.hasCompletedOnboarding = true;
	cfg.theme ??= 'dark';

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

	if (process.env.ORB_BYPASS_PERMISSIONS === '1') cfg.bypassPermissionsModeAccepted = true;
	writeJson(file, cfg);
}

function seedCodex() {
	if (!repo) return;
	const file = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
	let text = '';
	try {
		text = readFileSync(file, 'utf8');
	} catch {}
	const table = `[projects.${JSON.stringify(repo)}]`;
	if (text.includes(table)) return;
	// Appending leaves whatever Codex wrote alone.
	mkdirSync(dirname(file), { recursive: true });
	appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}\n${table}\ntrust_level = "trusted"\n`);
}

function seedGemini() {
	const file = join(process.env.GEMINI_CLI_HOME || homedir(), '.gemini', 'settings.json');
	const cfg = readJson(file);
	if (!cfg) return;
	cfg.security ??= {};
	cfg.security.auth ??= {};
	cfg.security.auth.selectedType = process.env.GEMINI_API_KEY ? 'gemini-api-key' : 'oauth-personal';
	writeJson(file, cfg);
}

if (agent === 'codex') seedCodex();
else if (agent === 'gemini') seedGemini();
else seedClaude();
