<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import Gauge from '#lib/Gauge.svelte';
	import Panel from '#lib/Panel.svelte';
	import { EVERY, init, overCpu, overMem, turn, update } from '#lib/guests.ts';
	import { poll, unset, type Data, type Poll } from '#lib/poll.svelte.ts';
	import Roll from '#lib/Roll.svelte';
	import { pad2 } from '#lib/time.ts';
	import type { glances, guards, pihole, proxmox, truenas, wgdash } from '#lib/panels/homelab/data.server.ts';

	let { id }: { id: string } = $props();
	const pve = poll<Data<typeof proxmox>>('/api/proxmox', 10_000);
	const temp = poll<Data<typeof glances>>('/api/glances', 30_000);
	const guard = poll<Data<typeof guards>>('/api/guards', 60_000);
	const dns = poll<Data<typeof pihole>>('/api/pihole', 60_000);
	const nas = poll<Data<typeof truenas>>('/api/truenas', 60_000);
	const wg = poll<Data<typeof wgdash>>('/api/wgdash', 60_000);

	const pct = (n: number) => `${Math.round(n)}%`;
	/* The title strip: guests running, of all. */
	const running = $derived(pve.data && `${pve.data.guests.filter((g) => g.status === 'running').length}/${pve.data.guests.length}`);
	const peers = $derived(wg.data?.flatMap((c) => c.peers) ?? []);

	type Stat = { label: string; gauge?: boolean; p: Poll<unknown>; text: () => string; bad: boolean; n?: () => number | null; fmt?: (n: number) => string };
	/* Gauges first: cpu and mem, then one per NAS pool. Without pool data, nas shows its state as text. */
	const stats: Stat[] = $derived([
		{ label: 'cpu', gauge: true, p: pve, text: () => '', n: () => pve.data!.host.cpu, fmt: pct, bad: (pve.data?.host.cpu ?? 0) > 85 },
		{ label: 'mem', gauge: true, p: pve, text: () => '', n: () => pve.data!.host.mem, fmt: pct, bad: (pve.data?.host.mem ?? 0) > 90 },
		...(nas.data?.length
			? nas.data.map((x) => ({ label: x.name, gauge: true, p: nas, text: () => '', n: () => x.used, fmt: pct, bad: !x.healthy || x.used > 85 }))
			: [{ label: 'nas', p: nas, text: () => 'none', bad: false }]),
		{ label: 'temp', p: temp, text: () => '?°C', n: () => temp.data!.temp, fmt: (n) => `${Math.round(n)}°C`, bad: !!temp.data?.temp && temp.data.temp >= (temp.data.warn ?? 999) },
		{ label: 'dns', p: dns, text: () => '', n: () => dns.data!.blocked, fmt: (n) => `${pct(n)} blk`, bad: false },
		{ label: 'wg', p: wg, text: () => `${peers.filter((x) => x.online).length}/${peers.length}`, bad: !!wg.data?.some((c) => !c.up) },
		{ label: 'vpn', p: guard, text: () => (guard.data!.vpn.ok ? guard.data!.vpn.exit : guard.data!.vpn.status), bad: guard.data?.vpn.ok === false },
		{ label: 'av', p: guard, text: () => guard.data!.threat.status.toLowerCase(), bad: !!guard.data && guard.data.threat.status !== 'CLEAN' }
	]);

	const text = $derived(stats.filter((s) => !s.gauge));

	const show = (p: Poll<unknown>, text: () => string) =>
		p.error ? (unset(p.error) ? 'n/c' : 'err') : p.data ? text() : '…';

	/* Guest carousel (guests.ts). The first state comes from the server-rendered data, so it skips that poll. */
	const first = untrack(() => init(pve.data?.guests ?? [], Date.now()));
	let s = $state(first);
	let view = $state(first.shown.slice());
	let paused = $state(false);
	let seen = untrack(() => pve.data);
	const byId = $derived(new Map((pve.data?.guests ?? []).map((g) => [g.id, g])));
	const count = $derived(s.span ? `${pad2(s.span[0])}${s.span[1] === s.span[0] ? '' : '-' + pad2(s.span[1])} / ${pad2(s.pool.length)}` : '–');

	$effect(() => {
		const d = pve.data;
		if (!d || d === seen) return;
		seen = d;
		untrack(() => (s = update(s, d.guests, Date.now(), paused, Math.random)));
	});

	$effect(() => {
		if (paused) return;
		const t = setTimeout(() => (s = turn(s, Date.now())), s.turnAt - Date.now());
		return () => clearTimeout(t);
	});

	const resume = () => {
		paused = false;
		s.turnAt = Date.now() + EVERY;
	};

	/* The cards follow s.shown. A page turn changes its slots left to right, 200 ms apart, each new card wiping in.
	   One slot, or a card moving to another slot, changes at once: so no guest is ever on two cards. */
	$effect(() => {
		const next = s.shown.slice();
		const cur = untrack(() => view.slice());
		const slots = next.flatMap((id, i) => (id === cur[i] ? [] : [i]));
		if (slots.length < 2 || next.length !== cur.length || next.some((id, i) => cur.includes(id) && cur[i] !== id) || prefersReducedMotion.current) {
			view = next;
			return;
		}
		const ts = slots.map((i, k) => setTimeout(() => (view[i] = next[i]), k * 200));
		return () => ts.forEach(clearTimeout);
	});
</script>

{#snippet stat(s: Stat)}
	{@const n = !s.p.error && s.p.data ? s.n?.() : null}
	<div class="stat" class:g={s.gauge} class:bad={s.bad} class:off={unset(s.p.error)} class:down={s.p.error && !unset(s.p.error)} title={s.p.error ?? ''}>
		<span class="muted">{s.label}</span>
		{#if s.gauge}<Gauge value={typeof n === 'number' ? n : 0} />{/if}
		<span class="v">{#if s.bad}<span aria-hidden="true">✱</span>{/if}{#if typeof n === 'number'}<Roll value={n} format={s.fmt} />{:else}{show(s.p, s.text)}{/if}</span>
	</div>
{/snippet}

{#snippet use(label: string, n: number, d: number | undefined, over: boolean)}
	<div class="use">
		<span>{label}</span>
		<span class="tag">{#if d !== undefined}{d > 0 ? '+' : '-'}{Math.abs(Math.round(d))}{/if}</span>
		<span class="v">{#if over}<span aria-hidden="true">✱</span>{/if}<Roll value={n} format={pct} /></span>
		<Gauge value={n} />
	</div>
{/snippet}

<Panel {id} facts={[['running', running]]}>
	<div class="gauges">
		{#each stats.filter((s) => s.gauge) as s (s.label)}{@render stat(s)}{/each}
	</div>
	<!-- The text stats wrap as two groups, so a panel too narrow for one row shows 3 + 2, never 4 + 1. -->
	<div class="stats">
		{#each [text.slice(0, 3), text.slice(3)] as group, i (i)}
			<div class="group">{#each group as s (s.label)}{@render stat(s)}{/each}</div>
		{/each}
	</div>

	{#if pve.error}<div class="error" class:off={unset(pve.error)}>proxmox: {pve.error}</div>{/if}

	<div class="carousel" role="group" aria-label="guests" onpointerenter={() => (paused = true)} onpointerleave={resume}>
		<div class="head">
			<span class="muted">guests</span>
			<button onclick={() => (s = turn(s, Date.now()))} aria-label="next guests">{count}</button>
		</div>
		<div class="guests">
			{#each view as id (id)}
				{@const g = byId.get(id)}
				{#if g}
					{@const crit = s.crit.includes(id)}
					<div class="guest" class:crit class:bump={s.bumped.includes(id)} title="{g.type} {g.status}">
						<div class="name"><span class="id">{g.id}</span> {g.name}</div>
						{#if g.status === 'running'}
							{@render use('cpu', g.cpu, s.delta[id]?.cpu, crit && overCpu(g))}
							{@render use('mem', g.mem, s.delta[id]?.mem, crit && overMem(g))}
						{:else}
							<div class="use"><span>state</span><span class="v">{g.status}</span></div>
							<div class="use"><span>type</span><span class="v">{g.type}</span></div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>
</Panel>

<style>
	.gauges,
	.stats {
		margin-bottom: 0.8rem;
		font-family: var(--font-data);
		font-size: 0.8rem;
	}

	/* Gauge rows in two columns; labels, gauges and values line up down each column. */
	.gauges {
		display: grid;
		grid-template-columns: repeat(2, auto 1fr auto);
		align-items: baseline;
		row-gap: 0.3rem;
		margin-bottom: 0.5rem;
	}

	.stat.g {
		display: contents;
	}

	.stat.g:nth-child(even) .muted {
		margin-left: 1.1rem;
	}

	.stats,
	.group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1.1rem;
	}

	.stat {
		white-space: nowrap;
	}

	.stat .muted {
		margin-right: 0.35rem;
	}

	.stat.g :global(.gauge) {
		margin-right: 0.35rem;
	}

	.stat.g .v,
	.use .v {
		min-width: 4ch;
		text-align: right;
	}

	.stat.bad {
		--gauge: var(--signal);
	}

	.stat.bad,
	.stat.down,
	.error {
		color: var(--signal);
	}

	.stat.off,
	.error.off {
		color: var(--mute);
	}

	.error {
		margin-bottom: 0.6rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.35rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	.head button {
		color: var(--mute);
	}

	.guests {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	/* A new card plots in like the boot: left to right in character steps on a page turn, top down a line at a
	   time on a bump. One keyframe for both, so dropping .bump on the next poll never replays it. */
	.guest {
		min-width: 0;
		padding: 0.35rem 0.5rem 0.45rem;
		border: 1px solid var(--rule);
		font-size: 0.8rem;
		/* backwards, not both: a clip-path kept after the wipe cuts the bottom border when the card sits on a fractional pixel (Firefox). */
		animation: wipe 0.4s steps(14) backwards;
	}

	.guest.bump {
		--wipe: inset(0 0 100% 0);
		animation-duration: 0.5s;
		animation-timing-function: steps(5);
	}

	.guest.crit {
		--gauge: var(--on-signal);
		border-color: var(--signal);
		background: var(--signal);
		color: var(--on-signal);
	}

	.crit .use,
	.crit .tag,
	.crit :global(.gauge) {
		color: inherit;
	}

	.tag {
		min-width: 3ch;
		text-align: right;
		color: var(--live);
	}

	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.id {
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.crit .id {
		color: inherit;
	}

	/* Label, tag and value on one line, the gauge across the card below: a third of a panel is about 12
	   characters wide, too narrow for all four on one line. */
	.use {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		column-gap: 0.35rem;
		margin-top: 0.25rem;
		font-family: var(--font-data);
		font-size: 0.7rem;
		color: var(--mute);
	}

	.use .tag {
		justify-self: end;
	}

	.use .v {
		grid-column: 3;
	}

	.use :global(.gauge) {
		grid-column: 1 / -1;
	}
</style>
