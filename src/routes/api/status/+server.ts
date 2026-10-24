import { json } from '@sveltejs/kit';
import { config } from '#lib/server/config.ts';
import { imageCreated, version } from '#lib/server/docker.ts';
import { backing } from '#lib/server/sessions/storage.ts';
import { getSettings } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Docker, storage and image health, for Settings and the first-run checklist. */
export const GET: RequestHandler = async () => {
	const ref = getSettings().sessionImage;
	const docker = await version().then(
		(v) => ({ ok: true as const, version: v.Version, api: v.ApiVersion, os: v.Os, arch: v.Arch }),
		(err) => ({ ok: false as const, error: message(err) })
	);
	const storage = docker.ok
		? await backing().then(
				(b) => ({ ok: true as const, ...b }),
				(err) => ({ ok: false as const, error: message(err) })
			)
		: { ok: false as const, error: 'Needs Docker' };
	const image = docker.ok
		? await imageCreated(ref).then(
				(created) => ({ ok: !!created, ref, created }),
				(err) => ({ ok: false, ref, created: null, error: message(err) })
			)
		: { ok: false, ref, created: null };
	return json({ docker, storage, image, sessionsDir: config.sessionsDir, dockerHost: config.dockerHost, instance: config.instance });
};
