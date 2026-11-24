<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import Panel from '#lib/Panel.svelte';
	import type { gitea } from '#lib/panels/dev/data.server.ts';
	import { poll } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { dur } from '#lib/time.ts';

	let { id }: { id: string } = $props();
	/* The title strip shows the CI count and the last activity. Runs list only when not green. */
	const g = poll<Awaited<ReturnType<typeof gitea>>>('/api/gitea', 120_000);
	const ci = $derived(g.data && `${g.data.runs.filter((r) => r.status === 'success').length}/${g.data.runs.length}`);
	const ago = (at: string) => dur(Date.now() - Date.parse(at));
	const last = $derived(g.data?.activity[0] && ago(g.data.activity[0].at));
	const MARK: Record<string, string> = { success: 'fill', failure: 'bad', running: 'hatch', waiting: 'hatch' };

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
 ______________
| . . .        |
|--------------|
| $ _          |
|              |
|______________|
`;
</script>

<Panel {id} facts={[['ci', ci], ['last', last]]}>
	{#if g.data}
		{@const red = g.data.runs.filter((r) => r.status !== 'success')}
		{#if red.length}
			<div class="runs">
				{#each red as r (r.repo)}
					<a class="run {r.status}" href={r.href} target="_blank" rel="noreferrer" title="{r.title} / {r.status}"><span class="mk {MARK[r.status] ?? ''}"></span>{r.repo}</a>
				{/each}
			</div>
		{/if}
		{#each g.data.activity as a (a.repo)}
			<a class="row" href={a.href} target="_blank" rel="noreferrer" title="{a.repo}: {a.text}{a.more ? `, ${a.more} more in 24 h` : ''}">
				<span class="muted ago">{ago(a.at)}</span>
				<span class="repo">{a.repo}</span>
				<span class="text">{a.text}</span>
				{#if a.more}<span class="muted more">+{a.more}</span>{/if}
			</a>
		{:else}
			<Empty drawing={DRAWING} text="no commits this week" />
		{/each}
	{:else}
		<Status p={g} />
	{/if}
</Panel>

<style>
	.runs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.9rem;
		margin-bottom: 0.7rem;
		font-size: 0.85rem;
	}

	.run {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.run.failure {
		color: var(--signal);
		font-weight: 600;
	}

	.row {
		display: flex;
		gap: 0.6rem;
		min-width: 0;
		padding: 0.1rem 0;
		font-size: 0.85rem;
	}

	.ago {
		flex: none;
		width: 2.5rem;
		text-align: right;
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.repo {
		flex: none;
		font-weight: 500;
	}

	.more {
		flex: none;
		margin-left: auto;
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.text {
		color: var(--mute);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
