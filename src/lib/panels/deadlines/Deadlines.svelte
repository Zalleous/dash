<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import { LEVEL } from '#lib/quickadd.ts';
	import Panel from '#lib/Panel.svelte';
	import { trackDeadlines } from '#lib/deadlines.svelte.ts';
	import { unset } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { gone, tick, ticking } from '#lib/tick.ts';
	import { now as clock } from '#lib/now.svelte.ts';
	import { daysLeft, until } from '#lib/time.ts';

	let { id }: { id: string } = $props();

	/* A deadline is one row here: the calendar gives the date, its todo card (same title) the priority and the
	   tick. live: the calendar deadlines minus the ones whose card is done. */
	const s = trackDeadlines();
	const { todos, deadlines } = s;
	const live = $derived(s.live);

	const now = $derived(new Date(clock(60_000)));
	let error = $state('');

	const short = (date: string) => new Date(date + 'T00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }).toLowerCase();
	const rows = $derived(
		live.flatMap((e) => {
			const card = todos.data?.cards.find((c) => c.title === e.title);
			return card && gone.has(card.raw) ? [] : [{ ...e, card, n: daysLeft(e.date, now) }];
		})
	);

	/* The title strip: days to the next deadline; ✱ when one is due within a day. */
	const next = $derived(live.length ? Math.min(...live.map((e) => daysLeft(e.date, now))) : null);
	const due = $derived(next !== null && next <= 1);

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
 _______
 \     /
  \ . /
   ) (
  / . \
 /_:::_\
`;
</script>

<Panel {id} attention={due} facts={[['next', next === null ? null : next ? `${next}d` : 'today'], ['total', deadlines.data && live.length]]}>
	{#if unset(deadlines.error)}<Status p={deadlines} />{:else if deadlines.error}<div class="err">deadlines: {deadlines.error}</div>{/if}
	{#if error}<div class="err">{error}</div>{/if}
	{#if deadlines.data && !rows.length}<Empty drawing={DRAWING} text="no deadlines" />{/if}

	{#each rows as e (e.t + e.title)}
		<div class="row" class:soon={e.n <= 2} class:ticking={e.card && ticking.has(e.card.raw)}>
			{#if e.card}
				{@const c = e.card}
				<button class="check" aria-label="Done: {e.title}" disabled={ticking.has(c.raw)} onclick={async () => (error = await tick(c, todos.reload))}></button>
			{:else}
				<span class="check-gap"></span>
			{/if}
			<span class="date">{short(e.date)}</span>
			<span class="title" title={e.title}>{e.title}</span>
			{#if e.card?.priority}<span class="prio p{LEVEL[e.card.priority]}">!{LEVEL[e.card.priority]}</span>{/if}
			<span class="left">{until(e.n)}</span>
		</div>
	{/each}
</Panel>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.2rem 0;
	}

	.check-gap {
		flex: none;
		width: 0.95rem;
	}

	.date,
	.left,
	.prio {
		flex: none;
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	.date {
		min-width: 3.2rem;
		color: var(--mute);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.left,
	.p3 {
		color: var(--mute);
	}

	.soon .left {
		color: var(--signal);
		font-weight: 700;
	}
</style>
