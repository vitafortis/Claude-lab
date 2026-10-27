import type { Agent, GitState, PaneState } from './types.ts';

const RS = '\x1e';

/** Splits orb-status output (see session/bin/orb-status) into its sections. */
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
// wrappers, so for them "node" is the agent (orb-launch's own node step takes a moment).
const AGENT_COMMAND: Record<Agent, RegExp> = {
	claude: /^claude\b/,
	codex: /^(?:codex|node)\b/,
	gemini: /^(?:gemini|node)\b/
};

/** What the pane shows: the agent busy, waiting on a person, idle, or a shell. */
export function paneState(command: string, lines: string[], agent: Agent = 'claude'): PaneState {
	const recent = lines.slice(-25).join('\n');
	if (AGENT_COMMAND[agent].test(command)) {
		// A menu first: its footer can read like a spinner's ("Esc to cancel").
		if (findQuestion(lines)) return 'waiting';
		if (WORKING.test(recent)) return 'working';
		if (WAITING.some((r) => r.test(recent))) return 'waiting';
		return 'idle';
	}
	// orb-launch cloning (git) or seeding config (node) before the agent starts.
	if (command === 'git' || command === 'node') return 'starting';
	if (/^(?:ba|z|da)?sh$/.test(command)) {
		// orb-launch prints this when the agent exits; before that, the shell is still launching.
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

const URL_START = /https?:\/\/[^\s"'<>`│┃|]+/g;
// What a wrapped URL continues with: a run of URL characters and nothing else on the line.
const URL_REST = /^[\s│┃|]*([A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)[\s│┃|]*$/;

/**
 * Links on screen, newest last, with URLs that wrapped onto the next lines joined back.
 * A URL counts as wrapped when it runs to the end of a long line and the next line is
 * nothing but URL characters (what tmux shows for a long sign-in link).
 */
export function extractLinks(lines: string[], max = 5): string[] {
	const found: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\s+$/, '');
		for (const m of line.matchAll(URL_START)) {
			let url = m[0];
			let j = i;
			const atEnd = m.index + url.length >= line.length;
			if (atEnd && line.length >= 40) {
				while (j + 1 < lines.length) {
					const next = URL_REST.exec(lines[j + 1]);
					// Ordinary words are URL characters too: only take lines that look like URL parts.
					if (!next || !/[/?=&%._-]/.test(next[1]) || /^https?:/.test(next[1])) break;
					url += next[1];
					j++;
					if (lines[j].replace(/\s+$/, '').length < 40) break;
				}
			}
			found.push(url.replace(/[).,;:!?'"\]]+$/, ''));
		}
	}
	const unique = [...new Set(found.reverse())].reverse();
	return unique.slice(-max);
}

/** A one-time sign-in code on screen, like Codex's "ABCD-12345". */
export function findDeviceCode(lines: string[]): string | null {
	const text = lines.join('\n');
	const all = [...text.matchAll(/\b([A-Z0-9]{4,6}-[A-Z0-9]{4,6})\b/g)].map((m) => m[1]).filter((c) => /[A-Z]/.test(c) && /\d/.test(c));
	return all.at(-1) ?? null;
}

export type QuestionOption = { n: number; label: string; detail: string; selected: boolean };
export type Question = { title: string; options: QuestionOption[] };

// "❯ 1. Yes" / "  2. No, and tell Claude…": a menu row, maybe inside a │ box.
const OPTION = /^[│|\s]*([❯›>●])?\s*(\d{1,2})\.\s+(.+?)[\s│|]*$/;
const RULE = /^[\s─━═▔▁╭╮╰╯│|-]*$/;

/**
 * The numbered menu on screen, if the agent is showing one: a permission
 * prompt, a question it asks, a picker. Pressing an option's number picks it. Rows that wrap
 * are left out of the label; text in a second column (after a wide gap) is the detail.
 */
export function findQuestion(lines: string[]): Question | null {
	const rows = lines.slice(-40);
	let end = -1;
	for (let i = rows.length - 1; i >= 0; i--) {
		if (OPTION.test(rows[i])) {
			end = i;
			break;
		}
	}
	if (end < 0) return null;
	// Walk up through the menu: numbered rows, plus wrapped or detail lines between them.
	const found: QuestionOption[] = [];
	let start = end;
	for (let i = end; i >= 0 && start - i < 30; i--) {
		const m = OPTION.exec(rows[i]);
		if (m) {
			const [label, ...rest] = m[3].split(/\s{2,}/);
			found.unshift({ n: Number(m[2]), label: label.trim(), detail: rest.join(' ').trim(), selected: !!m[1] });
			start = i;
			if (m[2] === '1') break;
		} else if (RULE.test(rows[i])) break;
	}
	const options = found.filter((o, i) => o.n === i + 1);
	// A menu has a cursor on one row; a numbered list in the agent's reply doesn't.
	if (options.length < 2 || options.length !== found.length || !options.some((o) => o.selected)) return null;
	// The question: in the lines just above the options, the one asking ("…?"), else the
	// first of them (a heading; the lines after it may be a description wrapping).
	const above: string[] = [];
	for (let i = start - 1; i >= Math.max(0, start - 8); i--) {
		const t = rows[i].replace(/^[│|\s]+|[\s│|]+$/g, '');
		if (!t && !above.length) continue;
		if (!t || RULE.test(t)) break;
		above.unshift(t);
	}
	const title = above.findLast((t) => t.endsWith('?')) ?? above[0] ?? '';
	return { title, options };
}
