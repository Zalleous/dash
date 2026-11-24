<script lang="ts">
	import Panel from '#lib/Panel.svelte';
	import { poll, unset, type Cal } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { now as clock } from '#lib/now.svelte.ts';
	import { endT, hm, hms } from '#lib/time.ts';

	let { id }: { id: string } = $props();
	const cal = poll<Cal>('/api/calendar', 5 * 60_000);

	const now = $derived(clock());

	const d = $derived(new Date(now));
	const events = $derived(cal.data?.events ?? []);
	const timed = $derived(events.filter((e) => !e.allDay));
	const current = $derived(timed.find((e) => e.t <= now && endT(e) > now));
	const next = $derived(timed.find((e) => e.t > now));
	const soon = $derived(!!next && next.t - now < 15 * 60_000);

	function countdown(ms: number) {
		const days = Math.floor(ms / 86_400_000);
		return days ? `${days}d ${hms(ms % 86_400_000)}` : hms(ms);
	}

	const when = (t: number) =>
		new Date(t).toDateString() === d.toDateString()
			? hm(t)
			: `${new Date(t).toLocaleDateString('en-CA', { weekday: 'short' })} ${hm(t)}`;
</script>

<Panel {id}>
	<!-- What is on now and what comes next, with a countdown. -->
	<div class="events">
		{#if current}
			<div class="row now">
				<span class="key">now</span>
				<span><b>{current.title}</b> <span class="data muted">until {hm(endT(current))}</span></span>
			</div>
		{/if}
		{#if next}
			<div class="row" class:soon>
				<span class="key">{#if soon}<span class="mark" aria-hidden="true">✱</span>{' '}{/if}next</span>
				<span><b>{next.title}</b> <span class="data muted">{when(next.t)}</span> <span class="count">in {countdown(next.t - now)}</span></span>
			</div>
		{:else if cal.data && !events.length}
			<div class="muted">nothing scheduled this week</div>
		{/if}
		{#if unset(cal.error)}<Status p={cal} />{:else if cal.error}<div class="err">calendar: {cal.error}</div>{/if}
		{#if cal.data?.failed}<div class="err">{cal.data.failed} calendar feed(s) failed</div>{/if}
	</div>
</Panel>

<style>
	.events {
		padding: 12px 24px;
	}

	/* On the phone the bare tiles stack as one band at the top (Board.svelte): more room above the rows, none below. */
	@media (max-width: 700px) {
		.events {
			padding: 1.1rem 24px 0;
		}
	}

	/* Small text knocks out the drawing behind it, as a label does on a drawing. */
	.row,
	.events > .muted {
		width: fit-content;
		background: var(--label);
	}


	.row {
		display: grid;
		grid-template-columns: 3rem 1fr;
		align-items: baseline;
	}

	.row b {
		font-weight: 600;
		margin-right: 0.3rem;
	}

	.row .data {
		margin-right: 0.5rem;
	}

	.row + .row {
		margin-top: 0.25rem;
	}

	.key {
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.count {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.now .key {
		color: var(--live);
	}

	/* Filled, because red type on the blue field is too faint to read. */
	.soon {
		grid-template-columns: auto 1fr;
		column-gap: 0.5rem;
	}

	.soon .key,
	.soon .count {
		padding: 0 0.3rem;
		background: var(--signal);
		color: var(--on-signal);
	}
</style>
