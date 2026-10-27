<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { LogIn } from '@lucide/svelte';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import BrandIcon from '#lib/components/BrandIcon.svelte';
	import { brandForLabel } from '#lib/brands.ts';
	import { api, errorMessage } from '#lib/client/api.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// "Sign in with Authentik" gets Authentik's logo, when it's one we have.
	const ssoBrand = $derived(data.sso ? brandForLabel(data.sso) : null);

	const next = $derived.by(() => {
		const n = page.url.searchParams.get('next');
		return n?.startsWith('/') && !n.startsWith('//') ? n : '/';
	});

	async function login(email: string, password: string) {
		try {
			await api.post('/api/auth/login', { email, password });
			await invalidateAll();
			goto(next);
		} catch (err) {
			return errorMessage(err);
		}
	}
</script>

<svelte:head><title>Sign in · Orbital</title></svelte:head>

{#snippet ssoButtons()}
	<a class="btn btn-primary h-9 w-full" href="/api/auth/oidc/start?next={encodeURIComponent(next)}" data-sveltekit-reload
		>{#if ssoBrand}<span class="grid size-5 place-items-center rounded bg-white"><BrandIcon brand={ssoBrand} class="size-3.5" /></span>{:else}<LogIn />{/if}Sign in with {data.sso}</a
	>
	{#if !data.passwordForm}
		<a class="block text-center text-[0.6875rem] text-muted-foreground hover:text-foreground" href="/login?local">Sign in with the local admin account</a>
	{/if}
{/snippet}

<AuthCard
	title="Welcome back"
	subtitle="Sign in to your Claude Code sessions."
	cta="Sign in"
	form={data.passwordForm}
	sso={data.sso ? ssoButtons : undefined}
	error={data.error}
	hint={data.proxy && !data.sso ? 'Signed in at your reverse proxy? Open Orbital through it.' : undefined}
	onsubmit={login}
/>
