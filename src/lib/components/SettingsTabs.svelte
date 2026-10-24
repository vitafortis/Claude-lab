<script lang="ts">
	import { page } from '$app/state';

	let { admin }: { admin: boolean } = $props();
	const tabs = $derived([{ href: '/settings', label: 'General' }, ...(admin ? [{ href: '/settings/sign-in', label: 'Sign-in & users' }] : [])]);
</script>

{#if tabs.length > 1}
	<nav class="flex gap-1 border-b border-border px-4 sm:px-8">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class="-mb-px border-b-2 px-3 py-2 text-[0.8125rem] {page.url.pathname === t.href ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">{t.label}</a
			>
		{/each}
	</nav>
{/if}
