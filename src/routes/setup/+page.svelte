<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';

	async function setup(email: string, password: string) {
		try {
			await api.post('/api/auth/setup', { email, password });
			await invalidateAll();
			goto('/accounts?welcome=1');
		} catch (err) {
			return errorMessage(err);
		}
	}
</script>

<svelte:head><title>Set up · cc·modern</title></svelte:head>

<AuthCard
	title="Set up cc·modern"
	subtitle="Create the account that signs in to this console. Next, connect Claude and GitHub."
	cta="Create account"
	confirm
	hint="Anyone who signs in here can run code on this Docker host. Keep it on your LAN or behind a VPN."
	onsubmit={setup}
/>
