/**
 * How a session container authenticates as a model account: environment variables, plus
 * where the account's config folder is mounted. Every account has a folder in the sessions
 * volume (accounts/<id>) that its sessions share: Claude Code's CLAUDE_CONFIG_DIR, Codex's
 * CODEX_HOME, or Gemini CLI's GEMINI_CLI_HOME.
 */
import { chmodSync, chownSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotFound } from './http.ts';
import { abs, accountRel } from './sessions/storage.ts';
import { getAccount, getAccountSecrets, getSettings } from './store.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { Agent, ModelAccount } from '#lib/types.ts';

/** Where an agent's config folder is mounted, and the variable that points the agent at it. */
export const AGENT_HOME: Record<Agent, { mount: string; env: string[] }> = {
	claude: { mount: '/claude', env: ['CLAUDE_CONFIG_DIR=/claude'] },
	codex: { mount: '/codex', env: ['CODEX_HOME=/codex'] },
	gemini: { mount: '/gemini', env: ['GEMINI_CLI_HOME=/gemini'] }
};

// The service account key is written into the account's folder, which only its sessions mount.
const VERTEX_CREDENTIALS = '.ccm/gcp-credentials.json';

function pins(c: Record<string, string>): string[] {
	return [
		...(c.opusModel ? [`ANTHROPIC_DEFAULT_OPUS_MODEL=${c.opusModel}`] : []),
		...(c.sonnetModel ? [`ANTHROPIC_DEFAULT_SONNET_MODEL=${c.sonnetModel}`] : []),
		...(c.haikuModel ? [`ANTHROPIC_DEFAULT_HAIKU_MODEL=${c.haikuModel}`] : [])
	];
}

/** Credentials and provider selection for the agent, as KEY=value lines. */
export function providerEnv(account: ModelAccount, secrets: Record<string, string>): string[] {
	const c = account.config;
	switch (account.kind) {
		case 'subscription':
		case 'chatgpt':
		case 'google':
			// Signed in from the browser; the login lives in the account's folder.
			return [];
		case 'token':
			return secrets.token ? [`CLAUDE_CODE_OAUTH_TOKEN=${secrets.token}`] : [];
		case 'api_key':
			return secrets.apiKey ? [`ANTHROPIC_API_KEY=${secrets.apiKey}`] : [];
		case 'bedrock':
			return [
				'CLAUDE_CODE_USE_BEDROCK=1',
				`AWS_REGION=${c.region || 'us-east-1'}`,
				...(secrets.bearerToken ? [`AWS_BEARER_TOKEN_BEDROCK=${secrets.bearerToken}`] : []),
				...(c.accessKeyId && secrets.secretAccessKey ? [`AWS_ACCESS_KEY_ID=${c.accessKeyId}`, `AWS_SECRET_ACCESS_KEY=${secrets.secretAccessKey}`] : []),
				...pins(c)
			];
		case 'vertex':
			return [
				'CLAUDE_CODE_USE_VERTEX=1',
				`CLOUD_ML_REGION=${c.region || 'global'}`,
				`ANTHROPIC_VERTEX_PROJECT_ID=${c.projectId}`,
				`GOOGLE_APPLICATION_CREDENTIALS=${AGENT_HOME.claude.mount}/${VERTEX_CREDENTIALS}`,
				...pins(c)
			];
		case 'foundry':
			return ['CLAUDE_CODE_USE_FOUNDRY=1', `ANTHROPIC_FOUNDRY_RESOURCE=${c.resource}`, `ANTHROPIC_FOUNDRY_API_KEY=${secrets.apiKey ?? ''}`, ...pins(c)];
		case 'gateway':
			return [
				`ANTHROPIC_BASE_URL=${c.baseUrl}`,
				c.header === 'x-api-key' ? `ANTHROPIC_API_KEY=${secrets.token ?? ''}` : `ANTHROPIC_AUTH_TOKEN=${secrets.token ?? ''}`,
				// Lists the gateway's models in Claude Code's /model picker.
				'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1',
				...pins(c)
			];
		case 'openai_api_key':
			// ccm-launch stores it with `codex login --with-api-key` before Codex starts.
			return secrets.apiKey ? [`OPENAI_API_KEY=${secrets.apiKey}`] : [];
		case 'gemini_api_key':
			return secrets.apiKey ? [`GEMINI_API_KEY=${secrets.apiKey}`] : [];
	}
}

/** Files a provider needs on disk before the container starts. */
function prepareFiles(account: ModelAccount, secrets: Record<string, string>) {
	if (account.kind === 'vertex' && secrets.serviceAccount) {
		const file = join(abs(accountRel(account.id)), VERTEX_CREDENTIALS);
		mkdirSync(join(file, '..'), { recursive: true });
		writeFileSync(file, secrets.serviceAccount, { mode: 0o600 });
		chmodSync(file, 0o600);
		if (process.getuid?.() === 0) {
			// Dev, running as root: the session's node user must read it.
			chownSync(join(file, '..'), 1000, 1000);
			chownSync(file, 1000, 1000);
		}
	}
}

export type AgentSetup = { account: ModelAccount; agent: Agent; env: string[]; mount: string; image: string };

/** Everything a container needs to run as this account. */
export function agentSetup(accountId: string): AgentSetup {
	const account = getAccount(accountId);
	if (!account) throw new NotFound('That model account no longer exists. Pick another one in the session settings.');
	const secrets = getAccountSecrets(accountId);
	prepareFiles(account, secrets);
	const settings = getSettings();
	const home = AGENT_HOME[account.agent];
	return {
		account,
		agent: account.agent,
		// CCM_AGENT tells ccm-launch, ccm-login and seed.mjs which CLI this container runs.
		env: [`CCM_AGENT=${account.agent}`, ...home.env, ...providerEnv(account, secrets)],
		mount: home.mount,
		image: account.agent === 'claude' ? settings.sessionImage : settings.agentsImage
	};
}

/** Remote Control needs a full claude.ai login on Anthropic's API. */
export const supportsRemoteControl = (account: ModelAccount | undefined) => !!account && !!ACCOUNT_KINDS[account.kind].remoteControl;
