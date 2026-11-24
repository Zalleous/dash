<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import { commands } from '#lib/commands.svelte.ts';
	import { now as clock } from '#lib/now.svelte.ts';
	import Panel from '#lib/Panel.svelte';
	import { poll, post } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { hms } from '#lib/time.ts';
	import type { timer as src } from '#lib/server/sources/timer.ts';

	let { id }: { id: string } = $props();
	const timer = poll<Awaited<ReturnType<typeof src>>>('/api/timer', 60_000);

	const now = $derived(clock());

	const run = $derived(timer.data?.running);
	const goal = $derived(timer.data?.goal);
	const hours = (p: string) => timer.data?.week.find((w) => w.project === p)?.hours ?? 0;
	const rows = $derived.by(() => {
		if (!timer.data) return [];
		const names = [...(goal ? [goal.project] : []), ...timer.data.week.map((w) => w.project).filter((p) => p !== goal?.project)];
		return names.map((p) => ({ p, h: hours(p) }));
	});
	const max = $derived(Math.max(goal?.hours ?? 0, ...rows.map((r) => r.h)));
	/* Chips only for the goal and the 5 projects started last, sorted by name so a start doesn't move them under the
	   pointer; every other vault project sits in one menu. */
	const chips = $derived(timer.data ? [...(goal ? [goal.project] : []), ...timer.data.recent.filter((p) => p !== goal?.project).sort((a, b) => a.localeCompare(b))] : []);
	const others = $derived(timer.data?.projects.filter((p) => !chips.includes(p)) ?? []);

	/* A popover rather than a <select>: WebKitGTK draws a select's list as a GTK menu in the system theme, so in the
	   desktop app it never matched the sheet. The menu opens on whichever side of its button has more room. */
	let more = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	function place(e: ToggleEvent) {
		if (e.newState !== 'open') return;
		const r = more!.getBoundingClientRect();
		const below = innerHeight - r.bottom > r.top;
		Object.assign(menu!.style, {
			left: `${r.left}px`,
			top: below ? `${r.bottom}px` : 'auto',
			bottom: below ? 'auto' : `${innerHeight - r.top}px`,
			maxHeight: `${(below ? innerHeight - r.bottom : r.top) - 8}px`
		});
	}

	const toggle = (project: string) => post('timer', run?.project === project ? { op: 'stop' } : { op: 'start', project }).then(timer.reload, (e) => alert(e.message));

	/* The title strip: hours this week, and how far the goal is (without a goal, no goal cell). */
	const sum = $derived.by(() => {
		const t = timer.data;
		if (!t) return null;
		const h = (p?: string) => t.week.filter((w) => !p || w.project === p).reduce((s, w) => s + w.hours, 0);
		return { week: `${h().toFixed(1)}h`, goal: t.goal && `${Math.round((100 * h(t.goal.project)) / t.goal.hours)}%` };
	});

	/* Ctrl+K: each vault project toggles like its chip, so the entry that started a timer stops it. */
	commands(() => [
		...(run ? [{ label: 'timer: stop', hint: run.project, run: () => toggle(run.project) }] : []),
		...(timer.data?.projects ?? []).map((p) => ({ label: `timer: ${p}`, hint: run?.project === p ? 'stop' : 'start', run: () => toggle(p) }))
	]);

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
    [_]
  .-' '-.
 /   |   \
|    |    |
|    .    |
 \       /
  '-._.-'
`;
</script>

<svelte:window onscroll={() => menu?.hidePopover()} />

<Panel {id} facts={goal ? [['week', sum?.week], ['goal', sum?.goal]] : [['week', sum?.week]]}>
	{#if run}
		<div class="live">
			<span class="mk fill"></span>{run.project}
			<span class="count">{hms(now - run.start)}</span>
			<button onclick={() => toggle(run.project)}>stop</button>
		</div>
	{/if}

	{#if timer.data}
		<div class="chips">
			{#each chips as p (p)}
				<button class:on={run?.project === p} onclick={() => toggle(p)}>{p}</button>
			{/each}
			{#if others.length}
				<button popovertarget="timer-others" bind:this={more}>other project…</button>
				<div id="timer-others" class="menu" popover onbeforetoggle={place} bind:this={menu}>
					{#each others as p (p)}
						<button
							onclick={() => {
								menu!.hidePopover();
								toggle(p);
							}}>{p}</button
						>
					{/each}
				</div>
			{:else if !timer.data.projects.length}
				<Empty drawing={DRAWING} text="no projects in the vault" />
			{/if}
		</div>

		<div class="week">
			<div class="label">this week</div>
			{#each rows as r (r.p)}
				<div class="row" class:goal={r.p === goal?.project}>
					<span class="name">{r.p}</span>
					<div class="bar">
						<i style:width="{(100 * r.h) / (max || 1)}%"></i>
						{#if r.p === goal?.project}<b style:left="{(100 * goal.hours) / (max || 1)}%"></b>{/if}
					</div>
					<span class="h">{r.h.toFixed(1)}{r.p === goal?.project ? `/${goal.hours}` : ''}h</span>
				</div>
			{/each}
		</div>
	{:else}
		<Status p={timer} />
	{/if}
</Panel>

<style>
	.live {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
		font-weight: 600;
	}

	.live .mk {
		background: var(--live);
		border-color: var(--live);
	}

	.count {
		font-family: var(--font-display);
		font-size: 1.15rem;
	}

	button {
		font-size: 0.8rem;
	}

	.live button {
		margin-left: auto;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.menu {
		inset: auto;
		margin: 0;
		padding: 0.2rem;
		min-width: 10rem;
		overflow-y: auto;
		background: var(--paper);
		color: var(--ink);
		border: 1px solid var(--rule);
	}

	.menu:popover-open {
		display: grid;
	}

	.menu button {
		border-color: transparent;
		text-align: left;
	}

	.menu button:hover {
		border-color: var(--rule);
	}

	.week {
		margin-top: 0.9rem;
	}

	.label {
		margin-bottom: 0.2rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 8rem) 1fr auto;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row:not(.goal) {
		color: var(--mute);
	}

	.bar {
		position: relative;
		height: 0.5rem;
		background: var(--track);
	}

	.bar i {
		position: absolute;
		inset: 0 auto 0 0;
		max-width: 100%;
		background: var(--mute);
	}

	.row.goal .bar i {
		background: var(--ink);
	}

	.bar b {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		margin-left: -1px;
		background: var(--ink);
	}

	.h {
		font-family: var(--font-data);
		font-size: 0.75rem;
	}
</style>
