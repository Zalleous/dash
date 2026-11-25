<script lang="ts">
	import { blink } from '#lib/art.ts';
	import Empty from '#lib/Empty.svelte';
	import Panel from '#lib/Panel.svelte';
	import { poll } from '#lib/poll.svelte.ts';
	import type { Alert } from '#lib/server/alerts.ts';

	let { id }: { id: string } = $props();

	const alerts = poll<Alert[]>('/api/alerts', 20_000);
	const urgent = $derived(alerts.data && alerts.data.filter((a) => a.level === 'red').length);
	$effect(() => blink(!!urgent)); // the car tile blinks its lights while a red alert stands

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
       /
 \    /
  \__/
`;
</script>

<Panel {id} attention={!!urgent} facts={[['urgent', urgent], ['total', alerts.data?.length]]}>
	{#if alerts.error}<div class="err">alerts: {alerts.error}</div>{/if}
	{#if alerts.data && !alerts.data.length}<Empty drawing={DRAWING} text="all clear" />{/if}

	<!-- A red alert is a red fill; the others are red type. -->
	{#each alerts.data ?? [] as a (a.text)}
		<a class="row {a.level}" href={a.href} target="_blank" rel="noreferrer"><span aria-hidden="true">✱</span><span class="text" title={a.text}>{a.text}</span></a>
	{/each}
</Panel>

<style>
	.row {
		display: flex;
		gap: 0.5rem;
		margin: 0 -0.4rem 2px;
		padding: 0.2rem 0.4rem;
		color: var(--signal);
	}

	.row.red {
		background: var(--signal);
		color: var(--on-signal);
	}

	.row span:first-child {
		flex: none;
		font-family: var(--font-data);
		font-weight: 700;
	}

	.text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a:not([href]) {
		cursor: default;
	}
</style>
