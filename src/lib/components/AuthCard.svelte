<script lang="ts">
	import type { Snippet } from 'svelte';
	import { LoaderCircle } from '@lucide/svelte';
	import Logo from './Logo.svelte';

	let {
		title,
		subtitle,
		cta,
		confirm = false,
		error: initialError = '',
		hint,
		form = true,
		sso,
		onsubmit
	}: {
		title: string;
		subtitle: string;
		cta: string;
		confirm?: boolean;
		error?: string;
		/** Small note under the form. */
		hint?: string;
		/** Show the email and password form. */
		form?: boolean;
		/** Single sign-on buttons, above the form. */
		sso?: Snippet;
		onsubmit: (email: string, password: string) => Promise<string | void>;
	} = $props();

	let email = $state('');
	let password = $state('');
	let repeat = $state('');
	let error = $state('');
	let busy = $state(false);

	$effect(() => {
		error = initialError;
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (confirm && password !== repeat) {
			error = 'Passwords do not match';
			return;
		}
		busy = true;
		error = (await onsubmit(email, password)) ?? '';
		busy = false;
	}
</script>

<div class="relative grid min-h-dvh place-items-center overflow-hidden px-4">

	<div class="card relative w-full max-w-sm p-7">
		<div class="mb-6 flex flex-col items-center text-center">
			<Logo size={44} />
			<h1 class="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
			<p class="mt-1 text-[0.8125rem] text-muted-foreground">{subtitle}</p>
		</div>

		{#if sso}
			<div class="space-y-2">{@render sso()}</div>
			{#if form}
				<div class="my-5 flex items-center gap-3 text-[0.6875rem] text-muted-foreground"><span class="h-px flex-1 bg-border"></span>or with a password<span class="h-px flex-1 bg-border"></span></div>
			{/if}
		{/if}
		{#if form}
			<form onsubmit={submit}>
				<label class="label" for="email">Email</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="email" class="input" type="email" autocomplete="username" autofocus bind:value={email} required />
				<label class="label mt-3" for="pw">Password</label>
				<input id="pw" class="input" type="password" autocomplete={confirm ? 'new-password' : 'current-password'} bind:value={password} required />
				{#if confirm}
					<label class="label mt-3" for="pw2">Repeat password</label>
					<input id="pw2" class="input" type="password" autocomplete="new-password" bind:value={repeat} required />
				{/if}
				<button class="btn btn-primary mt-5 h-9 w-full" disabled={busy}>
					{#if busy}<LoaderCircle class="animate-spin" />{/if}{cta}
				</button>
			</form>
		{/if}
		{#if error}<p class="mt-3 text-center text-xs text-danger">{error}</p>{/if}
		{#if hint}
			<p class="mt-4 rounded-lg bg-surface px-3 py-2 text-center text-[0.6875rem] text-muted-foreground">{hint}</p>
		{/if}
	</div>
</div>
