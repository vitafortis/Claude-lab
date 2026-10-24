import { BadRequest } from './http.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { AccountKind, ModelAccount } from '#lib/types.ts';

type Fields = { config: Record<string, string>; secrets: Record<string, string> };

/**
 * Reads a kind's fields from a request: settings into `config`, secrets into `secrets`.
 * When editing, a secret left empty keeps the stored one.
 */
export function parseAccountFields(kind: AccountKind, b: Record<string, unknown>, existing?: { account: ModelAccount; secrets: Record<string, string> }): Fields {
	const spec = ACCOUNT_KINDS[kind];
	const input = (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Record<string, unknown>;
	const out: Fields = { config: {}, secrets: {} };
	for (const f of spec.fields) {
		const raw = input[f.key];
		if (raw !== undefined && raw !== null && typeof raw !== 'string') throw new BadRequest(`${f.label} must be text`);
		let v = (raw ?? '').trim();
		if (v.length > (f.multiline ? 20_000 : 2000)) throw new BadRequest(`${f.label} is too long`);
		if (!f.multiline && /[\r\n]/.test(v)) throw new BadRequest(`${f.label} must be one line`);
		if (f.options && v && !f.options.some((o) => o.value === v)) throw new BadRequest(`Pick one of the options for ${f.label}`);
		if (f.secret) {
			if (v) out.secrets[f.key] = v;
			else if (f.required && !existing?.secrets[f.key]) throw new BadRequest(`${f.label} is required`);
			continue;
		}
		v ||= f.default ?? '';
		if (f.required && !v) throw new BadRequest(`${f.label} is required`);
		if (v) out.config[f.key] = v;
	}
	const has = (key: string) => !!(out.secrets[key] ?? existing?.secrets[key]);

	if (kind === 'token' && out.secrets.token && !out.secrets.token.startsWith('sk-ant-oat')) {
		throw new BadRequest('Paste the token `claude setup-token` printed (sk-ant-oat…)');
	}
	if (kind === 'api_key' && out.secrets.apiKey && !out.secrets.apiKey.startsWith('sk-ant-')) throw new BadRequest('Paste an Anthropic API key (sk-ant-…)');
	if (kind === 'bedrock' && !has('bearerToken') && !(out.config.accessKeyId && has('secretAccessKey'))) {
		throw new BadRequest('Add a Bedrock API key, or an access key ID and secret access key');
	}
	if (kind === 'vertex' && out.secrets.serviceAccount) {
		let key: Record<string, unknown>;
		try {
			key = JSON.parse(out.secrets.serviceAccount);
		} catch {
			throw new BadRequest('The service account key must be the JSON file Google Cloud gave you');
		}
		if (key.type !== 'service_account' || typeof key.private_key !== 'string') throw new BadRequest('That JSON is not a service account key');
	}
	if (kind === 'gateway') {
		let u: URL | null = null;
		try {
			u = new URL(out.config.baseUrl);
		} catch {}
		if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) throw new BadRequest('The base URL must start with https:// or http://');
		out.config.baseUrl = out.config.baseUrl.replace(/\/+$/, '');
	}
	return out;
}
