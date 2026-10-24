import { json } from '@sveltejs/kit';
import { BadRequest, body, handler } from '#lib/server/http.ts';
import { parseModel, parsePermissionMode } from '#lib/server/sessions/input.ts';
import { defaultSettings, getSettings, saveSettings } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

const IMAGE = /^[a-z0-9][a-z0-9._\-/:@]{0,250}$/i;
const NETWORK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/;

export const GET: RequestHandler = () => json({ settings: getSettings(), defaults: defaultSettings() });

export const PUT: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	const cur = getSettings();
	const num = (k: string, max: number) => {
		const v = Number(b[k] ?? 0);
		if (!Number.isFinite(v) || v < 0 || v > max) throw new BadRequest(`"${k}" must be between 0 and ${max}`);
		return v;
	};
	const sessionImage = typeof b.sessionImage === 'string' && b.sessionImage.trim() ? b.sessionImage.trim() : cur.sessionImage;
	if (!IMAGE.test(sessionImage)) throw new BadRequest('That doesn’t look like an image reference');
	const agentsImage = typeof b.agentsImage === 'string' && b.agentsImage.trim() ? b.agentsImage.trim() : cur.agentsImage;
	if (!IMAGE.test(agentsImage)) throw new BadRequest('That doesn’t look like an image reference');
	const network = typeof b.network === 'string' ? b.network.trim() : '';
	if (network && !NETWORK.test(network)) throw new BadRequest('That doesn’t look like a Docker network name');
	const extraEnv = typeof b.extraEnv === 'string' ? b.extraEnv.slice(0, 20_000) : '';
	let publicUrl = typeof b.publicUrl === 'string' ? b.publicUrl.trim().replace(/\/+$/, '') : '';
	if (publicUrl) {
		try {
			const u = new URL(publicUrl);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
			publicUrl = u.origin + u.pathname.replace(/\/+$/, '');
		} catch {
			throw new BadRequest('The public URL must start with http:// or https://');
		}
	}
	saveSettings({
		sessionImage,
		agentsImage,
		network,
		memoryMb: num('memoryMb', 1024 * 1024),
		cpus: num('cpus', 512),
		defaultModel: parseModel(b.defaultModel) ?? '',
		defaultPermissionMode: parsePermissionMode(b.defaultPermissionMode),
		defaultRemoteControl: b.defaultRemoteControl !== false,
		extraEnv,
		publicUrl
	});
	return json({ settings: getSettings() });
});
