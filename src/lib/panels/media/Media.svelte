<script lang="ts">
	import { page } from '$app/state';
	import Carousel from '#lib/Carousel.svelte';
	import Empty from '#lib/Empty.svelte';
	import Gauge from '#lib/Gauge.svelte';
	import Panel, { cells } from '#lib/Panel.svelte';
	import type { Link } from '#lib/links.ts';
	import { now } from '#lib/now.svelte.ts';
	import { poll, type Data } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { dur, isoDay } from '#lib/time.ts';
	import type { arr, jellyfin, requests } from '#lib/panels/media/data.server.ts';

	let { id, settings }: { id: string; settings: { style: 'auto' | 'compact' | 'full' } } = $props();
	const ar = poll<Data<typeof arr>>('/api/arr', 30_000);
	const jf = poll<Data<typeof jellyfin>>('/api/jellyfin', 30_000);
	const req = poll<Data<typeof requests>>('/api/requests', 60_000);

	/* What shows grows with the tile, in cells: what is playing always, this week from 7 rows, queue and requests from
	   10 (from 7 on a tile 12 wide, where they sit beside this week), latest from 12. At the home size, 18, every section fits. That is the auto
	   style; compact never grows, full shows everything at any size. */
	const size = cells(() => id);
	const from = (rows: number) => settings.style === 'full' || (settings.style === 'auto' && size.h >= rows);
	const show = $derived({ week: from(7), queue: from(size.w >= 12 ? 7 : 10), latest: from(12) });

	/* A page of a service in the links (by name); a service missing there gets no link. */
	const href = (name: string, path = '') => {
		const base = (page.data.links as Link[]).find((l) => l.name === name)?.href;
		return base && base + path;
	};
	const today = $derived(isoDay(new Date(now(60_000))));
	const pct = (n: number) => `${Math.round(n)}%`;
	const day = (d: string) => (d === today ? 'tonight' : new Date(d + 'T12:00').toLocaleDateString('en-CA', { weekday: 'short', day: 'numeric' }));
	/* This week stops at 6 rows; the Sonarr calendar has the rest. */
	const week = $derived(ar.data?.upcoming.slice(0, 6) ?? []);
	const more = $derived((ar.data?.upcoming.length ?? 0) - week.length);

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
     \  /
      \/
 ____________
| .--------. |
| |        | |
| '--------' |
|____________|
`;
</script>

<Panel {id} facts={[['playing', jf.data?.playing.length], ['queue', ar.data?.queue.length]]}>
	{#if jf.data?.playing.length}
		<div class="playing">
			{#each jf.data.playing as s (s.user + s.title)}
				<div class="item">
					<div class="line">
						<span class="name">{s.title}</span>
						<span class="side">{s.paused ? 'paused' : 'playing'} / {s.user}</span>
					</div>
					<Gauge value={s.pct} />
				</div>
			{/each}
		</div>
	{:else if !show.week}
		<p class="none">nothing playing</p>
	{/if}

	{#if show.week}
		<div class="cols">
			<section>
				<h3><a href={href('Sonarr', '/calendar')} target="_blank" rel="noreferrer">this week</a></h3>
				{#if ar.data}
					{#each week as u, i}
						<div class="row" class:tonight={u.day === today}>
							<span class="day">{u.day !== week[i - 1]?.day ? day(u.day) : ''}</span>
							<span class="time">{u.time || '–'}</span>
							<span class="mk" class:fill={u.has} title={u.has ? 'downloaded' : 'not yet'}></span>
							<span class="name">{u.title}</span>
							<span class="muted">{u.sub}</span>
						</div>
					{:else}
						<Empty drawing={DRAWING} text="nothing airing" />
					{/each}
					{#if more > 0}<a class="more" href={href('Sonarr', '/calendar')} target="_blank" rel="noreferrer">+{more} more</a>{/if}
				{:else}
					<Status p={ar} />
				{/if}
			</section>

			{#if show.queue}
				<section>
					<!-- The queue shows only while something downloads: the title strip already counts it. -->
					{#if ar.data?.queue.length}
						<h3><a href={href('Sonarr', '/activity/queue')} target="_blank" rel="noreferrer">queue</a></h3>
						{#each ar.data.queue as q}
							<div class="item" class:bad={q.bad} title={q.state}>
								<div class="line">
									<span class="name">{#if q.bad}<span aria-hidden="true">✱ </span>{/if}{q.title}</span>
									<span class="side">{q.bad ? q.state : `${pct(q.pct)} ${q.eta ? dur(Date.parse(q.eta) - Date.now()) : ''}`}</span>
								</div>
								<Gauge value={q.pct} />
							</div>
						{/each}
					{/if}

					<!-- Requests skip shows airing weekly (this week lists them); stuck ones come first. -->
					{#if req.data}
						{#if req.data.length}
							<Carousel
								label="requests"
								href={href('Seerr', '/requests?filter=processing')}
								items={req.data.map((r) => ({ id: r.id, name: r.title, note: r.state, title: `${r.title} (${r.type})`, href: href('Seerr', `/${r.type}/${r.tmdb}`) }))}
							/>
						{/if}
					{:else}
						<h3>requests</h3>
						<Status p={req} />
					{/if}
				</section>
			{/if}
		</div>
	{/if}

	{#if show.latest}
		{#if jf.data}
			<Carousel label="latest" href={href('Jellyfin')} items={jf.data.latest.map((i) => ({ id: i.id, name: i.name, href: href('Jellyfin', `/web/#/details?id=${i.id}`) }))} />
		{:else}
			<h3>latest</h3>
			<Status p={jf} />
		{/if}
	{/if}
</Panel>

<style>
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.8rem 1.2rem;
	}

	section {
		min-width: 0;
	}

	h3 {
		margin: 0.8rem 0 0.25rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
		font-weight: normal;
	}

	h3:first-child {
		margin-top: 0;
	}

	h3 a {
		color: var(--mute);
	}

	/* The day sits in the row, on a day's first row only. */
	.day {
		flex: none;
		width: 7ch;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.tonight .day {
		color: var(--ink);
		font-weight: 700;
	}

	.more {
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
		font-size: 0.85rem;
	}

	.row.tonight {
		font-weight: 600;
	}

	.time {
		flex: none;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.row .muted {
		flex: none;
		margin-left: auto;
		font-weight: normal;
	}

	.item {
		margin-bottom: 0.45rem;
		font-size: 0.85rem;
	}

	.line {
		display: flex;
		gap: 0.5rem;
	}

	.side {
		flex: none;
		margin-left: auto;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.item :global(.gauge) {
		margin-top: 0.1rem;
		font-size: 0.75rem;
	}

	.item.bad {
		--gauge: var(--signal);
		padding: 0.2rem 0.4rem;
		outline: 1px solid var(--signal);
		color: var(--signal);
	}

	.item.bad .side {
		color: inherit;
	}

	/* A small tile with nothing playing says so, instead of a blank body. */
	.none {
		margin: 0;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.playing {
		margin-bottom: 0.7rem;
	}
</style>
