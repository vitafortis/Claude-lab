import { BadRequest, str } from '../http.ts';
import { getClaudeAccount, getGithubAccount } from '../store.ts';
import { isValidBranch, parseRepo, type LaunchMode } from '#lib/launch.ts';
import { PERMISSION_MODES, type PermissionMode, type SessionInput } from '#lib/types.ts';

const MODEL = /^[A-Za-z0-9._[\]-]{1,80}$/;

export function parsePermissionMode(v: unknown): PermissionMode {
	if (v === undefined || v === null || v === '') return 'default';
	if (!PERMISSION_MODES.some((m) => m.value === v)) throw new BadRequest('Unknown permission mode');
	return v as PermissionMode;
}

export function parseModel(v: unknown): string | null {
	if (v === undefined || v === null || v === '') return null;
	if (typeof v !== 'string' || !MODEL.test(v.trim())) throw new BadRequest('Model must be an alias like opus or sonnet, or a model name');
	return v.trim();
}

export function parseName(v: unknown): string {
	if (typeof v !== 'string' || !v.trim()) throw new BadRequest('Give the session a name');
	const name = v.trim().replace(/\s+/g, ' ');
	if (name.length > 80) throw new BadRequest('Keep the name under 80 characters');
	return name;
}

// A slash command or skill: /code-review, /security-review, /my-plugin:skill…
const COMMAND = /^\/[A-Za-z0-9][A-Za-z0-9:_.-]{0,80}$/;

export function parseSessionInput(b: Record<string, unknown>): SessionInput & { repoDir: string } {
	const repo = parseRepo(str(b, 'repo', { required: true }) ?? '');
	if (!repo) throw new BadRequest('Enter a GitHub repository (owner/name) or an https git URL');

	const claudeAccountId = str(b, 'claudeAccountId', { required: true })!;
	if (!getClaudeAccount(claudeAccountId)) throw new BadRequest('Pick a Claude account');
	const githubAccountId = str(b, 'githubAccountId');
	if (githubAccountId && !getGithubAccount(githubAccountId)) throw new BadRequest('That GitHub account no longer exists');

	const kind = b.kind === 'skill' ? 'skill' : 'task';
	let skill: string | null = null;
	if (kind === 'skill') {
		const command = str(b, 'command', { required: true, max: 82 })!;
		if (!COMMAND.test(command)) throw new BadRequest('A skill or command starts with "/", e.g. /code-review');
		const args = (str(b, 'args', { max: 2000 }) ?? '').replace(/\s+/g, ' ');
		skill = args ? `${command} ${args}` : command;
	}

	let checkoutPr: number | null = null;
	if (b.checkoutPr !== undefined && b.checkoutPr !== null && b.checkoutPr !== '') {
		checkoutPr = Number(b.checkoutPr);
		if (!Number.isInteger(checkoutPr) || checkoutPr < 1) throw new BadRequest('Pull request must be a number');
		if (!repo.fullName) throw new BadRequest('Pull requests can only be checked out from GitHub repositories');
	}

	const baseBranch = str(b, 'baseBranch', { max: 200 });
	const newBranch = str(b, 'newBranch', { max: 200 });
	for (const br of [baseBranch, newBranch]) if (br && !isValidBranch(br)) throw new BadRequest(`"${br}" isn't a valid branch name`);

	const defaultName = skill ? `${repo.dir} ${skill.split(' ')[0].slice(1)}${checkoutPr ? ` #${checkoutPr}` : ''}` : repo.dir;
	return {
		name: parseName(b.name ?? defaultName),
		kind,
		skill,
		checkoutPr,
		repoUrl: repo.url,
		repoFullName: repo.fullName,
		repoDir: repo.dir,
		baseBranch,
		newBranch,
		claudeAccountId,
		githubAccountId,
		model: parseModel(b.model),
		permissionMode: parsePermissionMode(b.permissionMode),
		remoteControl: b.remoteControl !== false,
		// A skill session's first message is the command itself.
		prompt: skill ?? str(b, 'prompt', { max: 20_000 })
	};
}

/** {mode: 'new' | 'continue' | 'resume', conversationId} from a start/relaunch request. */
export function parseLaunch(b: Record<string, unknown>): LaunchMode | undefined {
	if (b.mode === 'new') return { mode: 'new', prompt: str(b, 'prompt', { max: 20_000 }) };
	if (b.mode === 'continue') return { mode: 'continue' };
	if (b.mode === 'resume') {
		const id = str(b, 'conversationId', { required: true })!;
		if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequest('Invalid conversation id');
		return { mode: 'resume', conversationId: id };
	}
	return undefined;
}
