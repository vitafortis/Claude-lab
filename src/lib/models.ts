import type { AccountKind, Agent } from './types.ts';

export type ModelOption = { value: string; label: string; hint?: string };

/**
 * Claude Code's aliases follow the newest model of each line, and work on every provider
 * (on cloud ones through the account's model pins). The labels say what they mean now.
 */
export const CLAUDE_ALIASES: ModelOption[] = [
	{ value: 'opus', label: 'Opus 5.5', hint: 'everyday, complex tasks' },
	{ value: 'fable', label: 'Fable 5.1', hint: 'the hardest, longest tasks' },
	{ value: 'sonnet', label: 'Sonnet 5.5', hint: 'routine tasks' },
	{ value: 'haiku', label: 'Haiku 5.5', hint: 'quick answers' }
];

/** Exact versions, for accounts that take Anthropic's model IDs. */
export const CLAUDE_VERSIONS: ModelOption[] = [
	{ value: 'claude-fable-5-1', label: 'Fable 5.1' },
	{ value: 'claude-fable-5', label: 'Fable 5' },
	{ value: 'claude-opus-5-5', label: 'Opus 5.5' },
	{ value: 'claude-opus-5', label: 'Opus 5' },
	{ value: 'claude-opus-4-8', label: 'Opus 4.8' },
	{ value: 'claude-opus-4-7', label: 'Opus 4.7' },
	{ value: 'claude-opus-4-6', label: 'Opus 4.6' },
	{ value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
	{ value: 'claude-sonnet-5', label: 'Sonnet 5' },
	{ value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
	{ value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
	{ value: 'claude-haiku-4-5', label: 'Haiku 4.5' }
];

// Bedrock, Foundry and gateways name models their own way: aliases (and pins) or an ID typed in.
const TAKES_ANTHROPIC_IDS: AccountKind[] = ['subscription', 'token', 'api_key', 'vertex'];

/** The models to offer for an agent on an account kind, grouped; empty when only free text makes sense. */
export function modelGroups(agent: Agent, kind: AccountKind | null | undefined): { label: string; options: ModelOption[] }[] {
	if (agent !== 'claude') return [];
	const groups = [{ label: 'Newest of each', options: CLAUDE_ALIASES }];
	if (!kind || TAKES_ANTHROPIC_IDS.includes(kind)) groups.push({ label: 'A specific version', options: CLAUDE_VERSIONS });
	return groups;
}

/** A model setting as people read it: "Opus 5.5", "Opus 4.8 (pinned)", the ID as typed, or "Default". */
export function modelLabel(value: string | null | undefined): string {
	if (!value) return 'Default';
	const alias = CLAUDE_ALIASES.find((m) => m.value === value);
	if (alias) return alias.label;
	const version = CLAUDE_VERSIONS.find((m) => m.value === value);
	return version ? `${version.label} (pinned)` : value;
}
