<script lang="ts">
	import Panel from '#lib/Panel.svelte';
	import { poll } from '#lib/poll.svelte.ts';
	import { hm } from '#lib/time.ts';
	import type { strips } from '#lib/server/uptime.ts';

	let { id }: { id: string } = $props();
	const up = poll<ReturnType<typeof strips>>('/api/uptime', 60_000);

	/* Characters like the homelab gauges, as many as fit: each one sums a run of 15-minute slots. # all up, : partly
	   down, # in red all down, . no data. ponytail: a character is taken as 0.6 em at 0.75 rem (JetBrains Mono);
	   measure it if the font changes. The SSR guess of 300 px is corrected on hydration. */
	let width = $state(300);
	const mean = (xs: number[]) => (xs.length ? xs.reduce((sum, v) => sum + v, 0) / xs.length : null);
	const cells = (slots: (number | null)[]) => {
		const n = Math.max(1, Math.min(slots.length, Math.floor(width / 7.2) - 2));
		return Array.from({ length: n }, (_, k) => {
			const [a, b] = [k, k + 1].map((j) => Math.floor((j * slots.length) / n));
			return { a, b, v: mean(slots.slice(a, b).filter((v) => v !== null)) };
		});
	};
	const at = (i: number) => hm(up.data!.from + i * up.data!.step);

	/* One combined strip for every service, the slot-wise mean. A service gets its own row only after a failed check
	   in the window, the most recent failure first; red with ✱ while its latest slot failed (the ok fact's test). */
	const list = $derived(up.data?.services ?? []);
	const failed = (b: (number | null)[]) => b.findLastIndex((v) => v !== null && v < 1);
	const all = $derived(list[0]?.buckets.map((_, k) => mean(list.map((s) => s.buckets[k]).filter((v) => v !== null))) ?? []);
	const rows = $derived([
		{ name: `all ${list.length}`, buckets: all, all: true, bad: false },
		...list
			.filter((s) => failed(s.buckets) >= 0)
			.sort((a, b) => failed(b.buckets) - failed(a.buckets))
			.map((s) => ({ ...s, all: false, bad: (s.buckets.findLast((v) => v !== null) ?? 1) < 1 }))
	]);
	/* Floor, so a cell with one failed check never reads 100%. The combined row names who failed in the cell. */
	const tip = (r: (typeof rows)[number], c: { a: number; b: number; v: number | null }) => {
		const down = r.all ? list.filter((s) => s.buckets.slice(c.a, c.b).some((v) => v !== null && v < 1)).map((s) => s.name) : [];
		return `${r.name} ${at(c.a)}–${at(c.b)}: ${c.v === null ? 'no data' : `${Math.floor(c.v * 100)}% up`}${down.length ? `, down: ${down.join(', ')}` : ''}`;
	};

	/* The title strip: the services up and the 24 h average. A service counts as ok when its latest 15-minute slot had
	   no failed check. */
	const known = $derived(list.map((s) => s.buckets.filter((b) => b !== null)));
	const ok = $derived(up.data && `${known.filter((b) => b.at(-1) === 1).length}/${known.length}`);
	const avg = $derived.by(() => {
		const m = mean(known.flat());
		return m === null ? null : `${(100 * m).toFixed(1)}%`;
	});
</script>

<Panel {id} facts={[['ok', ok], ['avg', avg]]}>
	{#if up.error}<div class="err">{up.error}</div>{/if}
	{#if up.data && !up.data.services.length}<div class="muted">collecting… first samples within a minute</div>{/if}

	<div class="rows">
		{#if list.length}
			{#each rows as r, i (r.name)}
				<div class="name" class:bad={r.bad} title={r.name}>{#if r.bad}<span aria-hidden="true">✱</span>{/if}{r.name}</div>
				<div class="strip" style:--i={i}>
					[{#each cells(r.buckets) as c (c.a)}<i class:none={c.v === null} class:down={c.v !== null && c.v < 1} title={tip(r, c)}>{c.v === null ? '.' : c.v > 0 && c.v < 1 ? ':' : '#'}</i>{/each}]
				</div>
			{/each}
			<span></span>
			<div class="axis muted" bind:clientWidth={width}><span>-24h</span><span>-12h</span><span>now</span></div>
			{#if rows.length === 1}<span></span><div class="muted">no outage in 24 h</div>{/if}
		{/if}
	</div>
</Panel>

<style>
	.rows {
		display: grid;
		/* Names at their own width up to 8rem; the strip takes the rest and its character count follows that width. */
		grid-template-columns: fit-content(8rem) minmax(0, 1fr);
		gap: 3px 0.7rem;
		align-items: center;
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.name.bad {
		color: var(--signal);
	}

	/* Wipes in once when a row first appears; polls keep the row, so it doesn't replay. */
	.strip {
		display: flex;
		overflow: hidden;
		white-space: nowrap;
		color: var(--mute);
		animation: wipe 0.7s cubic-bezier(0.65, 0, 0.35, 1) calc(var(--i) * 25ms) backwards;
	}

	.strip i {
		font-style: normal;
		color: var(--live);
	}

	.strip i.down {
		color: var(--signal);
	}

	.strip i.none {
		color: var(--mute);
	}

	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
	}
</style>
