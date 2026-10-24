<script lang="ts">
	import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, SquareKanban, Wand } from '@lucide/svelte';
	import type { Session } from '#lib/types.ts';

	let { session: s }: { session: Session } = $props();

	const PR = {
		open: { icon: GitPullRequest, cls: 'badge-success' },
		draft: { icon: GitPullRequestDraft, cls: '' },
		merged: { icon: GitMerge, cls: 'badge-primary' },
		closed: { icon: GitPullRequestClosed, cls: 'badge-danger' }
	} as const;
</script>

{#if s.skill || s.linear || s.pr || s.checkoutPr}
	<span class="flex flex-wrap items-center gap-1.5">
		{#if s.linear}
			<a class="badge hover:text-foreground" href={s.linear.url} target="_blank" rel="noopener" title="Started from this Linear issue"><SquareKanban />{s.linear.identifier}</a>
		{/if}
		{#if s.skill}
			<span class="badge font-mono" title="Started with this skill"><Wand />{s.skill}</span>
		{/if}
		{#if s.checkoutPr && s.repoFullName && s.pr?.number !== s.checkoutPr}
			<a class="badge hover:text-foreground" href="https://github.com/{s.repoFullName}/pull/{s.checkoutPr}" target="_blank" rel="noopener" title="Checked out this pull request"><GitPullRequest />#{s.checkoutPr}</a>
		{/if}
		{#if s.pr}
			{@const meta = PR[s.pr.state]}
			<a class="badge {meta.cls}" href={s.pr.url} target="_blank" rel="noopener" title="Pull request from this session's branch ({s.pr.state})"><meta.icon />#{s.pr.number} {s.pr.state}</a>
		{/if}
	</span>
{/if}
