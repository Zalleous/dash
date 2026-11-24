<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import Panel from '#lib/Panel.svelte';
	import { poll, type Cal, type Ev } from '#lib/poll.svelte.ts';
	import { trackDeadlines } from '#lib/deadlines.svelte.ts';
	import { now as clock } from '#lib/now.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { daysLeft, endT, hm, isoDay } from '#lib/time.ts';

	/* Today and tomorrow event by event, later days one line each. Deadlines live in their own panel: their all-day
	   copies (dated) are left out, and a day holding one still open (live) gets a ◆. Ended events are left out. */
	let { id }: { id: string } = $props();
	const cal = poll<Cal>('/api/calendar', 5 * 60_000);
	const s = trackDeadlines();
	const dated = $derived(s.dated);
	const live = $derived(new Set(s.live.map((e) => e.title)));

	const now = $derived(clock(30_000));

	const dayKey = (e: Ev) => (e.allDay ? e.start : isoDay(new Date(e.t)));
	/* The title strip: events today and this week. */
	const today = $derived(cal.data?.events.filter((e) => dayKey(e) === isoDay()).length);
	const days = $derived(
		[...Map.groupBy(cal.data?.events ?? [], dayKey)]
			.map(([key, list]) => ({
				key,
				n: daysLeft(key, new Date(now)),
				marks: list.filter((e) => e.allDay && live.has(e.title)).map((e) => e.title),
				evs: list.filter((e) => !(e.allDay && dated.has(e.title)) && endT(e) > now)
			}))
			.filter((d) => d.evs.length || d.marks.length)
	);

	function label(key: string, n: number) {
		if (n === 0) return 'today';
		if (n === 1) return 'tomorrow';
		const d = new Date(key + 'T00:00');
		return `${d.toLocaleDateString('en-CA', { weekday: 'short' }).toLowerCase()} ${d.getDate()}`;
	}
	const time = (e: Ev) => (e.allDay ? 'all day' : hm(e.t));
	const line = (e: Ev) => (e.allDay ? e.title : `${hm(e.t)} ${e.title}`);

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
 _o___o___o_
|___________|
| . . . . . |
| . . . . . |
| . . . . . |
|___________|
`;
</script>

<Panel {id} facts={[['today', today], ['week', cal.data?.events.length]]}>
	{#if !cal.data}<Status p={cal} />{:else if !days.length}<Empty drawing={DRAWING} text="nothing this week" />{/if}

	{#each days as d (d.key)}
		<div class="day" title={d.n > 1 ? [...d.marks.map((m) => `◆ ${m}`), ...d.evs.map(line)].join('\n') : null}>
			<span class="label">
				{label(d.key, d.n)}{#if d.marks.length}<span class="due" title={d.marks.join('\n')}>◆</span>{/if}
			</span>
			{#if d.n <= 1}
				<div>
					{#each d.evs as e (e.t + e.title)}
						<p class="ev" style:--cat="var(--cat-{e.cal % 3})"><span class="time">{time(e)}</span><span class="title">{e.title}</span></p>
					{/each}
				</div>
			{:else if d.evs.length}
				<p class="ev">
					<span class="title">
						{#each d.evs.slice(0, 2) as e, i (e.t + e.title)}{#if i}{' · '}{/if}{#if !e.allDay}<span class="time">{hm(e.t)}</span>{' '}{/if}{e.title}{/each}
					</span>{#if d.evs.length > 2}<span class="more">+{d.evs.length - 2}</span>{/if}</p>
			{/if}
		</div>
	{/each}
</Panel>

<style>
	.day {
		display: grid;
		grid-template-columns: 4.8rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: baseline;
	}

	.day + .day {
		margin-top: 0.3rem;
	}

	.label,
	.time,
	.more {
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	.label {
		color: var(--mute);
		white-space: nowrap;
	}

	.due {
		margin-left: 0.4rem;
		color: var(--ink);
	}

	.ev {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin: 0;
		padding: 0.05rem 0 0.05rem 0.5rem;
		border-left: 2px solid var(--cat, var(--track));
	}

	.time {
		flex: none;
		min-width: 3rem;
	}

	.title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more {
		flex: none;
		margin-left: auto;
		color: var(--mute);
	}
</style>
