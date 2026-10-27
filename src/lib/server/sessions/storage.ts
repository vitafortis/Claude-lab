/**
 * Session data on disk, and how session containers mount it.
 *
 *   <sessionsDir>/accounts/<account>/       Claude config (CLAUDE_CONFIG_DIR) shared by the
 *                                           account's sessions: login, settings, transcripts
 *   <sessionsDir>/sessions/<id>/home/       the session's $HOME
 *   <sessionsDir>/sessions/<id>/repo/       the cloned repository
 *   <sessionsDir>/sessions/<id>/.ccm/       launch.json and other notes from Orbit
 *
 * Orbit sees this folder at sessionsDir; session containers get the parts they need,
 * from the same Docker volume (by subpath) or host folder that backs sessionsDir.
 */
import { chownSync, existsSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { config, IN_CONTAINER } from '../config.ts';
import { inspectContainer, supportsSubpath, version } from '../docker.ts';

export type Backing = { kind: 'volume'; name: string } | { kind: 'bind'; hostPath: string };

let cached: Backing | null = null;

/** Finds what backs sessionsDir, so session containers can mount the same data. */
export async function backing(): Promise<Backing> {
	if (cached) return cached;
	let b: Backing;
	if (config.sessionsHostPath) b = { kind: 'bind', hostPath: config.sessionsHostPath };
	else if (config.sessionsVolume) b = { kind: 'volume', name: config.sessionsVolume };
	else if (IN_CONTAINER) {
		const self = config.selfContainer ?? hostname();
		const info = await inspectContainer(self);
		if (!info) {
			throw new Error(`Can't find Orbit's own container ("${self}"). Set CCM_SELF_CONTAINER, or CCM_SESSIONS_VOLUME / CCM_SESSIONS_HOST_PATH.`);
		}
		const m = info.Mounts.find((m) => m.Destination === config.sessionsDir);
		if (!m) throw new Error(`Nothing is mounted at ${config.sessionsDir}. Mount a volume there (see compose.yaml).`);
		b = m.Type === 'volume' && m.Name ? { kind: 'volume', name: m.Name } : { kind: 'bind', hostPath: m.Source };
	} else {
		// Running on the Docker host itself (development): bind the folder directly.
		b = { kind: 'bind', hostPath: config.sessionsDir };
	}
	if (b.kind === 'volume' && !supportsSubpath(await version())) {
		throw new Error('Session volumes need Docker Engine 26 or newer. Upgrade Docker, or bind-mount a host folder and set CCM_SESSIONS_HOST_PATH.');
	}
	cached = b;
	return b;
}

/** A Docker mount of `sub` (relative to sessionsDir) at `target` inside a container. */
export function mountSpec(b: Backing, sub: string, target: string): Record<string, unknown> {
	// NoCopy: an empty volume path otherwise gets the image's folder copied in, owner included
	// (root, for a target the image doesn't have), and the session user can't write to it.
	if (b.kind === 'volume') return { Type: 'volume', Source: b.name, Target: target, VolumeOptions: { Subpath: sub, NoCopy: true } };
	return { Type: 'bind', Source: join(b.hostPath, sub), Target: target };
}

export const accountRel = (accountId: string) => `accounts/${accountId}`;
export const sessionRel = (id: string) => `sessions/${id}`;

export const abs = (rel: string) => join(config.sessionsDir, rel);
export const metaDir = (id: string) => abs(`${sessionRel(id)}/.ccm`);
/** Where Claude keeps this session's transcripts (CLAUDE_CODE_PROJECT_DIR_NAME is the session id). */
export const conversationsDir = (accountId: string, sessionId: string) => abs(`${accountRel(accountId)}/projects/${sessionId}`);

// Session containers run as the image's "node" user.
const UID = 1000;

/** Creates folders a session container will write to, owned by its user. */
export function ensureDirs(...rels: string[]) {
	mkdirSync(config.sessionsDir, { recursive: true });
	for (const rel of rels) {
		const parts = rel.split('/');
		for (let i = 1; i <= parts.length; i++) {
			const dir = abs(parts.slice(0, i).join('/'));
			if (existsSync(dir)) continue;
			mkdirSync(dir, { mode: 0o755 });
			// Volume subpaths and binds keep the creator's owner; as root (dev), hand them over.
			if (process.getuid?.() === 0) chownSync(dir, UID, UID);
		}
	}
}
