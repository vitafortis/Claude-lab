import type { Agent, GitState, PaneState } from './types.ts';

const RS = '\x1e';

/** Splits ccm-status output (see session/bin/ccm-status) into its sections. */
export function parseProbe(out: string): { command: string; lines: string[]; git: GitState | null } {
	const [cmd = '', pane = '', porcelain, shortstat] = out.split(`\n${RS}\n`);
	const lines = pane.replace(/\s+$/, '').split('\n');
	return {
		command: cmd.replace(new RegExp(RS, 'g'), '').trim(),
		lines: trimBlank(lines),
		git: porcelain === undefined ? null : parseGit(porcelain, shortstat ?? '')
	};
}

function trimBlank(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && !lines[end - 1].trim()) end--;
	let start = 0;
	while (start < end && !lines[start].trim()) start++;
	return lines.slice(start, end).map((l) => l.replace(/\s+$/, ''));
}

/** `git status --porcelain=v2 --branch` plus `git diff --shortstat HEAD`. */
export function parseGit(porcelain: string, shortstat: string): GitState {
	const g: GitState = { branch: null, ahead: 0, behind: 0, changed: 0, insertions: 0, deletions: 0 };
	for (const line of porcelain.split('\n')) {
		if (line.startsWith('# branch.head ')) {
			const b = line.slice('# branch.head '.length).trim();
			g.branch = b === '(detached)' ? null : b;
		} else if (line.startsWith('# branch.ab ')) {
			const m = /\+(\d+) -(\d+)/.exec(line);
			if (m) {
				g.ahead = Number(m[1]);
				g.behind = Number(m[2]);
			}
		} else if (/^[12u?] /.test(line)) {
			g.changed++;
		}
	}
	g.insertions = Number(/(\d+) insertion/.exec(shortstat)?.[1] ?? 0);
	g.deletions = Number(/(\d+) deletion/.exec(shortstat)?.[1] ?? 0);
	return g;
}

// The agents' spinner lines while a turn runs: "esc to interrupt" (Claude Code, Codex),
// "esc to cancel" (Gemini CLI).
const WORKING = /esc to interrupt|ctrl\+c to interrupt|esc to cancel/i;
// Questions that block until someone answers: permission prompts, menus, confirmations.
const WAITING = [
	/Do you want to (?:proceed|make this edit|create|run|allow|continue)/i,
	/Would you like to/i,
	/Allow execution of/i,
	/Apply this change\?/i,
	/Trust this folder\?/i,
	/[❯›●]\s*\d+\.\s/,
	/\[y\/N\]|\(y\/n\)/i,
	/Enable Remote Control\?/i,
	/Press Enter to continue/i,
	/Paste code here/i
];

// The process tmux reports while each agent runs. Codex and Gemini start from npm's node
// wrappers, so for them "node" is the agent (ccm-launch's own node step takes a moment).
const AGENT_COMMAND: Record<Agent, RegExp> = {
	claude: /^claude\b/,
	codex: /^(?:codex|node)\b/,
	gemini: /^(?:gemini|node)\b/
};

/** What the pane shows: the agent busy, waiting on a person, idle, or a shell. */
export function paneState(command: string, lines: string[], agent: Agent = 'claude'): PaneState {
	const recent = lines.slice(-25).join('\n');
	if (AGENT_COMMAND[agent].test(command)) {
		if (WORKING.test(recent)) return 'working';
		if (WAITING.some((r) => r.test(recent))) return 'waiting';
		return 'idle';
	}
	// ccm-launch cloning (git) or seeding config (node) before the agent starts.
	if (command === 'git' || command === 'node') return 'starting';
	if (/^(?:ba|z|da)?sh$/.test(command)) {
		// ccm-launch prints this when the agent exits; before that, the shell is still launching.
		return lines.some((l) => /── \w+ exited/i.test(l)) ? 'shell' : 'starting';
	}
	return command ? 'unknown' : 'starting';
}

const RC_URL = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+/g;

/** The newest Remote Control session link on screen, if any. */
export function findRcUrl(lines: string[]): string | null {
	const all = lines.join('\n').match(RC_URL);
	return all ? all[all.length - 1] : null;
}
