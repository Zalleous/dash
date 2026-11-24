<script lang="ts">
	import { flushSync, type Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { COLS, ROW, fits, numbers, place, type Layout } from '#lib/layout.ts';
	import { move, ms } from '#lib/motion.ts';
	import { msg } from '#lib/msg.ts';
	import { setBoard } from '#lib/Panel.svelte';
	import { ALL, IDS, META, settle, type Instance, type Settings } from '#lib/panels/index.ts';
	import { view } from '#lib/panels/views.ts';
	import { poll, post, refresh } from '#lib/poll.svelte.ts';
	import type { presets as ps } from '#lib/server/sources/presets.ts';

	/* bar: the page's header, handed the preset tabs and the edit controls to show in it. */
	let { bar }: { bar: Snippet<[Snippet]> } = $props();

	/* Presets: every load opens on the first; keys 1 to 9 and the tabs pick one by place. current is the shown
	   preset's name, so a new order or a delete never swaps in another one. Editing works on a copy (draft) until it
	   is saved. */
	const presets = poll<Awaited<ReturnType<typeof ps>>>('/api/presets', 5 * 60_000);
	const saved = $derived(presets.data?.presets ?? []);
	let current = $state<string>();
	const preset = $derived(saved.find((p) => p.name === current) ?? saved[0]);
	$effect(() => {
		current ??= saved[0]?.name;
	});
	/* The instances, the same in every preset: each kind's built-in one, then the added ones (presets.ts). */
	const panels = $derived(presets.data?.panels ?? IDS.map((kind) => ({ id: kind, kind, settings: settle(kind) })));
	const kind = (id: string) => panels.find((p) => p.id === id)!.kind;
	let draft = $state<Layout | null>(null);
	const layout = $derived(draft ?? preset?.layout ?? ALL);
	let name = $state('');
	let sure = $state(false);
	let problem = $state<string | null>(null);
	let board: HTMLElement;
	/* How deep the tiles reach, and where the board starts on the page: the board's height comes from both (CSS). */
	const deep = $derived(Math.max(0, ...Object.values(layout).map((r) => r.y + r.h)) * ROW);
	let top = $state(43); // the bar's height on a desktop, until measured
	$effect(() => {
		const seen = new ResizeObserver(() => (top = board.offsetTop));
		seen.observe(board.parentElement!);
		return () => seen.disconnect();
	});
	const fail = (err: unknown) => (problem = msg(err));

	function key(e: KeyboardEvent) {
		const p = saved['123456789'.indexOf(e.key)];
		if (!p || draft || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
		pick(p.name);
	}

	/* Every layout change goes through move(): tiles glide, fly in and fly out (motion.ts). */
	const glide = (change: () => unknown) => move(board, () => (change(), flushSync()));
	const pick = (to: string) => to !== preset?.name && glide(() => (current = to));

	const edit = () => {
		draft = $state.snapshot(layout);
		name = '';
		sure = false;
		problem = null;
	};
	const hide = (id: string) => glide(() => delete draft![id]);
	const add = (id: string) => glide(() => (draft![id] = place(draft!, ALL[kind(id)].w, ALL[kind(id)].h)));
	const cancel = () => glide(() => (draft = null));

	/* Instances: a new one goes on the board at once; a new setting reloads the polls, since a source may answer
	   differently now; a deleted one has already left every stored preset (presets.ts), and leaves the draft too. */
	async function make(k: string) {
		try {
			const { id } = await post('presets', { op: 'new', kind: k });
			await presets.reload();
			add(id);
		} catch (err) {
			fail(err);
		}
	}
	async function set(id: string, settings: Settings) {
		await post('presets', { op: 'set', id, settings });
		await presets.reload();
		refresh();
	}
	async function drop(id: string) {
		await post('presets', { op: 'drop', id });
		hide(id);
		await presets.reload();
	}
	const edits = $derived(draft ? { hide, set, drop } : undefined);
	/* The + list names an instance by its kind's title, and one of a kind that comes several times by its first
	   setting too (weather · Tokyo). */
	const label = (p: Instance) => [META[p.kind].title, ...(META[p.kind].many ? Object.values(p.settings).slice(0, 1) : [])].join(' · ');

	/* What every tile reads (Panel.svelte). */
	const n = $derived(numbers(layout, Object.fromEntries(panels.map((p) => [p.id, META[p.kind]]))));
	setBoard({
		get layout() {
			return layout;
		},
		get edit() {
			return edits;
		},
		number: (id) => n[id],
		panel: (id) => panels.find((p) => p.id === id)!
	});

	async function save(as: string, op = 'save') {
		try {
			await post('presets', { op, name: as, layout: $state.snapshot(draft) });
			await presets.reload();
			glide(() => {
				current = as;
				draft = null;
			});
		} catch (err) {
			fail(err);
		}
	}

	/* Edit mode: a tab drags sideways to a new place, the others slide aside, and the new order saves on drop. The
	   nav holds the pointer, because the tab's node moves each time the order changes. */
	let order = $state<string[] | null>(null);
	let held = $state<string | null>(null);
	let shift = $state(0);
	const names = $derived(order ?? saved.map((p) => p.name));

	function drag(e: PointerEvent, dragged: string) {
		if (!draft || e.button !== 0) return;
		e.preventDefault();
		const tab = e.currentTarget as HTMLElement;
		const nav = tab.parentElement!;
		const from = [...names];
		const x0 = e.clientX;
		const left0 = tab.offsetLeft;
		const ac = new AbortController();
		held = dragged;
		nav.setPointerCapture(e.pointerId);
		nav.addEventListener(
			'pointermove',
			(m) => {
				/* The tab's new place: after every other tab whose middle is left of its own. offsetLeft is the slot,
				   whatever the slide or the drag offset show. */
				const mid = left0 + m.clientX - x0 + tab.offsetWidth / 2;
				const at = [...nav.children].filter((o) => o !== tab && (o as HTMLElement).offsetLeft + (o as HTMLElement).offsetWidth / 2 < mid).length;
				const next = from.filter((x) => x !== dragged);
				next.splice(at, 0, dragged);
				order = next;
				flushSync();
				/* The held tab follows the pointer but stays within the row. */
				const first = nav.firstElementChild as HTMLElement;
				const last = nav.lastElementChild as HTMLElement;
				shift = Math.min(Math.max(left0 + m.clientX - x0, first.offsetLeft), last.offsetLeft + last.offsetWidth - tab.offsetWidth) - tab.offsetLeft;
			},
			{ signal: ac.signal }
		);
		const release = async () => {
			ac.abort();
			held = null;
			shift = 0;
			if (order?.some((x, i) => x !== from[i]))
				try {
					await post('presets', { op: 'order', names: order });
					await presets.reload();
				} catch (err) {
					fail(err);
				}
			order = null;
		};
		nav.addEventListener('pointerup', release, { signal: ac.signal });
		nav.addEventListener('pointercancel', release, { signal: ac.signal });
	}

	/* Edit mode: the title strip (anywhere on a bare tile) moves a tile, the corner grip resizes it, both in whole
	   cells as the pointer goes. A drop onto another tile puts it back where it was. ponytail: no pushing the
	   neighbours aside. */
	function grab(e: PointerEvent) {
		const t = e.target as HTMLElement;
		const tile = t.closest<HTMLElement>('.panel');
		const resize = !!t.closest('.grip');
		if (!draft || !tile || e.button !== 0 || t.closest('button, a, form') || !(resize || t.closest('header') || tile.classList.contains('bare'))) return;
		e.preventDefault();
		const d = draft;
		const id = tile.dataset.id!;
		const from = d[id];
		const cw = board.clientWidth / COLS;
		const ac = new AbortController();
		tile.style.zIndex = '2';
		board.setPointerCapture(e.pointerId);
		board.addEventListener(
			'pointermove',
			(m) => {
				const dx = Math.round((m.clientX - e.clientX) / cw);
				const dy = Math.round((m.clientY - e.clientY) / ROW);
				d[id] = resize
					? { ...from, w: Math.min(Math.max(1, from.w + dx), COLS - from.x), h: Math.max(1, from.h + dy) }
					: { ...from, x: Math.min(Math.max(0, from.x + dx), COLS - from.w), y: Math.max(0, from.y + dy) };
				tile.classList.toggle('clash', !fits(d));
			},
			{ signal: ac.signal }
		);
		const release = () => {
			ac.abort();
			if (!fits(d)) d[id] = from;
			tile.style.zIndex = '';
			tile.classList.remove('clash');
		};
		board.addEventListener('pointerup', release, { signal: ac.signal });
		board.addEventListener('pointercancel', release, { signal: ac.signal });
	}
</script>

<svelte:window onkeydown={key} />

{#snippet controls()}
	<nav class="tabs" class:edit={draft} title={draft ? 'Drag a preset to a new place' : 'Keys 1 to 9 pick a preset'}>
		{#each names as p, i (p)}
			<button
				class:on={p === preset?.name}
				class:held={p === held}
				style:translate={p === held ? `${shift}px 0` : undefined}
				animate:flip={{ duration: p === held ? 0 : ms(200) }}
				onclick={() => draft || pick(p)}
				onpointerdown={(e) => drag(e, p)}><span class="key">{i + 1}</span>{p}</button
			>
		{/each}
	</nav>
	{#if draft}
		<span class="data">editing / {preset?.name}</span>
		{#each panels.filter((p) => !draft?.[p.id]) as p (p.id)}
			<button onclick={() => add(p.id)}>+ {label(p)}</button>
		{/each}
		{#each IDS.filter((k) => META[k].many) as k (k)}
			<button onclick={() => make(k)}>+ new {META[k].title}</button>
		{/each}
		{#if problem}<span class="err">{problem}</span>{/if}
		<button onclick={() => preset && save(preset.name)}>save</button>
		<form onsubmit={(e) => (e.preventDefault(), name.trim() && save(name.trim()))}>
			<input bind:value={name} maxlength="30" placeholder="new preset" aria-label="New preset name" /><button>save as</button>
		</form>
		{#if preset && preset.name !== 'glance'}
			<button onclick={() => (sure ? save(preset.name, 'delete') : (sure = true))}>{sure ? 'delete, sure?' : 'delete'}</button>
		{/if}
		<button onclick={cancel}>cancel</button>
	{:else}
		<button class="desk" onclick={edit} title="Move, resize, hide and add panels, then save as a preset">edit</button>
	{/if}
{/snippet}

{@render bar(controls)}
<div class="board" role="presentation" style:--deep="{deep}px" style:--top="{top}px" bind:this={board} onpointerdown={grab}>
	{#each panels as p (p.id)}
		{@const View = view(p.kind)}
		<View id={p.id} settings={p.settings} />
	{/each}
</div>

<style>
	form {
		display: flex;
	}

	input {
		width: 12ch;
		padding: 0.15rem 0.4rem;
	}

	/* The presets, each with its key. A dropped tab slides into its slot. */
	.tabs {
		display: flex;
		gap: 0.3rem;
	}

	.tabs button {
		transition:
			background-color 150ms ease-out,
			border-color 150ms ease-out,
			translate 200ms ease-out;
	}

	.key {
		margin-right: 0.5em;
		opacity: 0.6;
	}

	.tabs.edit button {
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.tabs .held {
		position: relative;
		z-index: 1;
		cursor: grabbing;
		transition: none;
	}

	.board :global(.clash) {
		border-color: var(--signal);
	}

	/* The board: 24 fluid columns, 24 px rows (layout.ts). The grid (app.css) shows wherever no tile sits. The board
	   ends on a major line, on whole big squares: the last one that fits on the screen, or, when a tile reaches
	   lower, the one the tile ends in, so a tile can fill the last square. The page ends 1 px under the board, for
	   the grid's bottom edge, so it scrolls only when a tile reaches below the screen. move() eases a change of depth.
	   ponytail: 24 columns down to 700 px; Dash runs full screen, so narrow tiles between 700 and 1400 px are accepted
	   until they bother. */
	.board {
		flex: none;
		min-height: max(round(up, var(--deep), var(--my)), round(down, 100dvh - var(--top) - 1px, var(--my)));
		display: grid;
		grid-template-columns: repeat(24, minmax(0, 1fr));
		grid-auto-rows: 24px;
	}

	/* The phone stacks the tiles, column by column, each as tall as its content. The bare tiles come first, by row,
	   as one band at the top: the car is a small box beside the time. ponytail: the box is placed for the clock at the
	   top; a preset without the clock still puts it there. The presets' tabs get their own row under the bar, without
	   key numbers: the phone has no keys. */
	@media (max-width: 700px) {
		.tabs {
			display: flex;
			flex-wrap: wrap;
			order: 1;
			width: 100%;
		}

		.key,
		.desk {
			display: none;
		}

		.board {
			min-height: round(down, 100dvh - var(--top) - 1px, var(--my));
			margin-bottom: 31px;
			display: flex;
			flex-direction: column;
		}

		.board :global(.panel) {
			flex: none;
			order: calc(var(--x) * 1000 + var(--y));
			margin: 0;
			border-width: 0;
		}

		/* As tall as its content, a tile body can answer width queries only. */
		.board :global(.panel .body) {
			overflow: visible;
			container-type: inline-size;
		}

		.board :global(.bare) {
			order: calc(var(--y) - 1000);
		}

		.board :global([data-id='car']) {
			position: absolute;
			top: 24px;
			right: 20px;
			width: min(30%, calc(100% - 256px));
			height: 3.4rem;
		}
	}
</style>
