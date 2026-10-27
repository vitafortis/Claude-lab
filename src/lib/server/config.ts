import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** True when this process itself runs inside a container. */
export const IN_CONTAINER = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

/** ORB_<name>, or CCM_<name> as set up before the rename to Orbital. */
function env(name: string): string | undefined {
	return process.env[`ORB_${name}`] ?? process.env[`CCM_${name}`];
}

const dataDir = resolve(env('DATA_DIR') ?? './data');

function defaultDockerHost(): string {
	const host = env('DOCKER_HOST');
	if (host) return host;
	if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
	const candidates = [
		'/var/run/docker.sock',
		`${process.env.HOME}/.docker/run/docker.sock`,
		`${process.env.HOME}/.orbstack/run/docker.sock`,
		`${process.env.HOME}/.colima/default/docker.sock`
	];
	return `unix://${candidates.find((p) => existsSync(p)) ?? candidates[0]}`;
}

const adminEmail = env('ADMIN_EMAIL');
const adminPassword = env('ADMIN_PASSWORD');

export const config = {
	dataDir,
	/** Optional master secret. When unset, a random key is generated in the data dir. */
	secretKey: env('SECRET_KEY'),
	/** Creates the first account on start (skips the setup wizard). */
	bootstrapAdmin:
		adminEmail && adminPassword
			? { email: adminEmail.trim(), password: adminPassword, name: env('ADMIN_NAME')?.trim() || null }
			: undefined,
	/** `disabled` turns off the login screen — only for fully trusted networks. */
	authDisabled: env('AUTH') === 'disabled',
	/** `unix:///var/run/docker.sock` or `tcp://host:2375`. */
	dockerHost: defaultDockerHost(),
	/**
	 * Where session data lives as this process sees it: Claude config per account, and per
	 * session a home folder and the cloned repo. Session containers mount parts of it.
	 */
	sessionsDir: resolve(env('SESSIONS_DIR') ?? (IN_CONTAINER ? '/sessions' : `${dataDir}/sessions`)),
	/**
	 * How session containers reach sessionsDir. Normally found by inspecting our own container;
	 * set one of these when that doesn't work. A volume needs Docker Engine 26+ (volume subpaths).
	 */
	sessionsVolume: env('SESSIONS_VOLUME')?.trim() || undefined,
	sessionsHostPath: env('SESSIONS_HOST_PATH')?.trim() || undefined,
	/** The image session containers run. Overridable in Settings. */
	sessionImage: env('SESSION_IMAGE')?.trim() || 'ghcr.io/vitafortis/orbital-session:latest',
	/** For Codex and Gemini sessions: the same image with those CLIs added. */
	agentsImage: env('AGENTS_IMAGE')?.trim() || 'ghcr.io/vitafortis/orbital-session:latest-all',
	sessionNetwork: env('SESSION_NETWORK')?.trim() || '',
	/** Labels our containers so several installs can share one Docker host. */
	instance: env('INSTANCE')?.trim() || 'orbital',
	/** Our own container (name or id), when the hostname isn't it. */
	selfContainer: env('SELF_CONTAINER')?.trim() || undefined,
	/** A GitHub OAuth app (device flow enabled) for "Sign in with GitHub"; PATs work without it. */
	githubClientId: env('GITHUB_CLIENT_ID')?.trim() || undefined,
	/** Linear's GraphQL endpoint (override for testing against a mock). */
	linearApiUrl: env('LINEAR_API_URL')?.trim() || 'https://api.linear.app/graphql'
};
