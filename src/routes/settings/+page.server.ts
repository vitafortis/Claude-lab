import type { PageServerLoad } from './$types';
import { getSettings } from '#lib/server/store.ts';

export const load: PageServerLoad = ({ locals }) => ({
	settings: getSettings(),
	account: locals.user && locals.user.id !== 'open' ? { email: locals.user.email, name: locals.user.name } : null
});
