import { json } from '@sveltejs/kit';
import { DockerError } from './docker.ts';

export class BadRequest extends Error {}
export class NotFound extends Error {}
export class Conflict extends Error {}

/** Wraps an API handler so thrown errors become JSON responses with useful messages. */
export function handler<E>(fn: (event: E) => Promise<Response> | Response) {
	return async (event: E) => {
		try {
			return await fn(event);
		} catch (err) {
			if (err instanceof Response) return err;
			if (err instanceof BadRequest) return json({ message: err.message }, { status: 400 });
			if (err instanceof NotFound) return json({ message: err.message }, { status: 404 });
			if (err instanceof Conflict) return json({ message: err.message }, { status: 409 });
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			if (err instanceof DockerError) return json({ message: err.message }, { status: 502 });
			console.error('[cc-modern]', err);
			return json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
		}
	};
}

/** The request's JSON body as an object, or a 400. */
export async function body(request: Request): Promise<Record<string, unknown>> {
	const b = await request.json().catch(() => null);
	if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BadRequest('Expected a JSON object');
	return b as Record<string, unknown>;
}

export function str(b: Record<string, unknown>, key: string, { required = false, max = 500 } = {}): string | null {
	const v = b[key];
	if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
		if (required) throw new BadRequest(`"${key}" is required`);
		return null;
	}
	if (typeof v !== 'string') throw new BadRequest(`"${key}" must be a string`);
	if (v.length > max) throw new BadRequest(`"${key}" is too long`);
	return v.trim();
}
