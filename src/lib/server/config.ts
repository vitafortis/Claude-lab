import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** True when this process itself runs inside a container. */
export const IN_CONTAINER = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

const dataDir = resolve(process.env.CCM_DATA_DIR ?? './data');

function defaultDockerHost(): string {
	if (process.env.CCM_DOCKER_HOST) return process.env.CCM_DOCKER_HOST;
	if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
	const candidates = [
		'/var/run/docker.sock',
		`${process.env.HOME}/.docker/run/docker.sock`,
		`${process.env.HOME}/.orbstack/run/docker.sock`,
		`${process.env.HOME}/.colima/default/docker.sock`
	];
	return `unix://${candidates.find((p) => existsSync(p)) ?? candidates[0]}`;
}

export const config = {
	dataDir,
	/** Optional master secret. When unset, a random key is generated in the data dir. */
	secretKey: process.env.CCM_SECRET_KEY,
	/** Creates the first account on start (skips the setup wizard). */
	bootstrapAdmin:
		process.env.CCM_ADMIN_EMAIL && process.env.CCM_ADMIN_PASSWORD
			? { email: process.env.CCM_ADMIN_EMAIL.trim(), password: process.env.CCM_ADMIN_PASSWORD, name: process.env.CCM_ADMIN_NAME?.trim() || null }
			: undefined,
	/** `disabled` turns off the login screen — only for fully trusted networks. */
	authDisabled: process.env.CCM_AUTH === 'disabled',
	/** `unix:///var/run/docker.sock` or `tcp://host:2375`. */
	dockerHost: defaultDockerHost(),
	/**
	 * Where session data lives as this process sees it: Claude config per account, and per
	 * session a home folder and the cloned repo. Session containers mount parts of it.
	 */
	sessionsDir: resolve(process.env.CCM_SESSIONS_DIR ?? (IN_CONTAINER ? '/sessions' : `${dataDir}/sessions`)),
	/**
	 * How session containers reach sessionsDir. Normally found by inspecting our own container;
	 * set one of these when that doesn't work. A volume needs Docker Engine 26+ (volume subpaths).
	 */
	sessionsVolume: process.env.CCM_SESSIONS_VOLUME?.trim() || undefined,
	sessionsHostPath: process.env.CCM_SESSIONS_HOST_PATH?.trim() || undefined,
	/** The image session containers run. Overridable in Settings. */
	sessionImage: process.env.CCM_SESSION_IMAGE?.trim() || 'ghcr.io/vitafortis/cc-modern-session:latest',
	/** For Codex and Gemini sessions: the same image with those CLIs added. */
	agentsImage: process.env.CCM_AGENTS_IMAGE?.trim() || 'ghcr.io/vitafortis/cc-modern-session:latest-all',
	sessionNetwork: process.env.CCM_SESSION_NETWORK?.trim() || '',
	/** Labels our containers so several installs can share one Docker host. */
	instance: process.env.CCM_INSTANCE?.trim() || 'cc-modern',
	/** Our own container (name or id), when the hostname isn't it. */
	selfContainer: process.env.CCM_SELF_CONTAINER?.trim() || undefined,
	/** A GitHub OAuth app (device flow enabled) for "Sign in with GitHub"; PATs work without it. */
	githubClientId: process.env.CCM_GITHUB_CLIENT_ID?.trim() || undefined,
	/** Linear's GraphQL endpoint (override for testing against a mock). */
	linearApiUrl: process.env.CCM_LINEAR_API_URL?.trim() || 'https://api.linear.app/graphql'
};
