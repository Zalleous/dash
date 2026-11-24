<script module lang="ts">
	import { createContext } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { COLS, type Layout } from '#lib/layout.ts';
	import type { Instance, Settings } from '#lib/panels/index.ts';

	/* What the board (Board.svelte) tells every tile: the layout on show, in edit mode how to hide a tile, change its
	   settings or delete it, the detail numbers, which follow the tiles' places, and each tile's instance. */
	export const [board, setBoard] = createContext<{
		layout: Layout;
		edit?: { hide: (id: string) => void; set: (id: string, settings: Settings) => Promise<unknown>; drop: (id: string) => Promise<unknown> };
		number: (id: string) => string | undefined;
		panel: (id: string) => Instance;
	}>();

	const phone = new MediaQuery('max-width: 700px', false);

	/* A tile's size in whole cells (24 columns, 24 px rows), for a view to change its look by: its rect on the board,
	   and 24 wide on the phone, where the tiles stack. The view renders its own Panel, so it asks here, with its id as a
	   function so the answer stays live: cells(() => id). */
	export function cells(id: () => string) {
		const b = board();
		return {
			get w() {
				return phone.current ? COLS : (b.layout[id()]?.w ?? 0);
			},
			get h() {
				return b.layout[id()]?.h ?? 0;
			}
		};
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Roll from '#lib/Roll.svelte';
	import { area } from '#lib/layout.ts';
	import { msg } from '#lib/msg.ts';
	import { META } from '#lib/panels/index.ts';

	type Fact = [label: string, value: string | number | null | undefined];
	type Props = { id: string; facts?: Fact[]; attention?: boolean; children: Snippet };
	let { id, facts = [], attention = false, children }: Props = $props();
	const b = board();
	const p = $derived(b.panel(id));
	const meta = $derived(META[p.kind]);
	const title = $derived(meta.title);
	const bare = $derived(!!meta.bare);
	const rect = $derived(b.layout[id]);
	const edit = $derived(b.edit);
	const n = $derived(b.number(id));

	/* Edit mode: set opens the instance's settings in the tile, one field per key of its kind's defaults (index.ts),
	   and on an added instance a delete that asks once more. A choice is a row of buttons, not a <select>: in the
	   desktop app a select's list is a GTK menu in the system theme (see Focus). */
	const fields = $derived(Object.entries(meta.settings ?? {}));
	let open = $state(false);
	let values = $state<Settings>({});
	let sure = $state(false);
	let problem = $state<string | null>(null);
	$effect(() => {
		if (!edit) open = false;
	});
	function show() {
		values = { ...p.settings };
		sure = false;
		problem = null;
		open = true;
	}
	const run = (change: () => Promise<unknown>) => change().then(() => (open = false), (err) => (problem = msg(err)));
</script>

<!-- A tile on the board (layout.ts). --x and --y order the phone stack and time the boot wave (app.css). A panel the
     layout leaves out stays mounted but hidden, so its view keeps its state. In edit mode (edit set), the title
     strip drags the tile and the corner grip resizes it; Board.svelte does the dragging. A bare tile (the clock,
     the car, …) has no strip and drags from anywhere. -->
{#snippet tools()}
	{#if fields.length}<button class="tool" class:on={open} onclick={() => (open ? (open = false) : show())} title="Settings of {title}">set</button>{/if}
	<button class="tool hide" onclick={() => edit?.hide(id)} title="Hide {title}">×</button>
{/snippet}

<section class="panel" class:edit={!!edit} class:bare hidden={!rect} aria-label={bare ? title : undefined} data-id={id} style:grid-area={rect && area(rect)} style:--x={rect?.x} style:--y={rect?.y}>
	{#if bare}
		{#if edit}<div class="corner">{@render tools()}</div>{/if}
	{:else}
		<!-- Title strip: the detail number, the name and live facts in ruled cells, like the title block. -->
		<header>
			<span class="n" aria-hidden="true">{n}</span>
			<h2 aria-label={attention ? `${title}, needs attention` : undefined}>
				{#if attention}<span class="mark" aria-hidden="true">✱</span>{/if}<span class="t">{title}</span>
			</h2>
			{#if facts.length}
				<dl>
					{#each facts as [label, value] (label)}
						<div>
							<dt>{label}</dt>
							<dd>{#if typeof value === 'number'}<Roll {value} />{:else}{value ?? '–'}{/if}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			{#if edit}{@render tools()}{/if}
		</header>
	{/if}
	<!-- A view that throws breaks only its own tile, not the whole page. Content taller than the tile scrolls. -->
	<div class="body">
		{#if edit && open}
			<form class="settings" onsubmit={(e) => (e.preventDefault(), run(() => edit.set(id, values)))}>
				{#each fields as [key, d] (key)}
					{#if Array.isArray(d)}
						<div class="field" role="group" aria-label={key}>
							<span>{key}</span>
							{#each d as c (c)}
								<button type="button" class:on={values[key] === c} aria-pressed={values[key] === c} onclick={() => (values[key] = c)}>{c}</button>
							{/each}
						</div>
					{:else if typeof d === 'number'}
						<label class="field"><span>{key}</span><input type="number" step="any" bind:value={values[key]} /></label>
					{:else}
						<label class="field"><span>{key}</span><input bind:value={values[key]} maxlength="100" /></label>
					{/if}
				{/each}
				{#if problem}<span class="err">{problem}</span>{/if}
				<div class="field">
					<button>ok</button>
					{#if p.id !== p.kind}
						<button type="button" onclick={() => (sure ? run(() => edit.drop(id)) : (sure = true))}>{sure ? 'delete, sure?' : 'delete'}</button>
					{/if}
				</div>
			</form>
		{:else}
			<svelte:boundary>
				{@render children()}
				{#snippet failed(e, reset)}
					<div class="err">{(e as Error)?.message ?? e} <button onclick={reset}>retry</button></div>
				{/snippet}
			</svelte:boundary>
		{/if}
	</div>
	{#if edit}<span class="grip" aria-hidden="true"></span>{/if}
</section>

<style>
	/* An opaque sheet framed in hairlines. The negative margin lays each tile's right and bottom rules over its
	   neighbour's left and top ones, so shared edges stay 1 px. */
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		margin: 0 -1px -1px 0;
		padding: 0.7rem 1rem 1.1rem;
		border: 1px solid var(--rule);
		border-top-color: transparent;
		background: var(--paper);
	}

	.panel[hidden] {
		display: none;
	}

	/* The body is a container named tile, so a view's CSS can ask its size: @container tile (…). A tile's height is
	   fixed, so height queries work too, except on the phone (Board.svelte). */
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		container: tile / size;
	}

	/* The top rule, drawn over the transparent border so that the boot can plot it (app.css). */
	.panel::after {
		content: '';
		position: absolute;
		top: -1px;
		left: -1px;
		right: -1px;
		height: 1px;
		background: var(--rule);
		transform-origin: left;
	}

	/* Registration cross where the hairlines meet. */
	.panel::before {
		content: '';
		position: absolute;
		top: -5px;
		left: -5px;
		width: 9px;
		height: 9px;
		background:
			linear-gradient(var(--ink), var(--ink)) center / 1px 100% no-repeat,
			linear-gradient(var(--ink), var(--ink)) center / 100% 1px no-repeat;
	}

	/* The strip hangs from the panel's top rule and spans it; its first and last cells keep the panel's gutter. */
	header {
		display: flex;
		margin: -0.7rem -1rem 0.7rem;
		border-bottom: 1px solid var(--rule);
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.3;
	}

	.n,
	h2,
	dl div {
		padding: 0.2rem 0.6rem 0.25rem;
	}

	.n {
		padding-left: 1rem;
		border-right: 1px solid var(--rule);
		color: var(--mute);
	}

	/* The name gives way to the facts with an ellipsis. */
	h2 {
		display: flex;
		flex: 1;
		min-width: 0;
		margin: 0;
		font: inherit;
		white-space: nowrap;
	}

	.t {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}


	dl {
		display: flex;
		margin: 0;
	}

	dl div {
		display: flex;
		gap: 0.4rem;
		border-left: 1px solid var(--rule);
		white-space: nowrap;
	}

	dl div:last-child {
		padding-right: 1rem;
	}

	dt {
		color: var(--mute);
	}

	dd {
		margin: 0;
	}

	.edit header {
		cursor: move;
		user-select: none;
		touch-action: none;
	}

	.tool {
		padding: 0 0.6rem;
		border: none;
		border-left: 1px solid var(--rule);
		font-family: var(--font-data);
		cursor: pointer;
	}

	.tool:hover {
		background: var(--sheet);
	}

	.hide:hover {
		background: var(--signal);
		color: var(--on-signal);
	}

	/* A bare tile floats on the grid with no sheet under it. Its frame shows only in edit mode, and then all of it
	   is the handle; the view sets its own margins. The clock sizes its digits to the body (container units). */
	.bare {
		padding: 0;
		border-color: transparent;
		background: none;
	}

	.bare:not(.edit)::before,
	.bare:not(.edit)::after {
		display: none;
	}

	.bare.edit {
		border-color: var(--rule);
		border-top-color: transparent;
		cursor: move;
		user-select: none;
		touch-action: none;
	}

	.bare .body {
		container-type: inline-size;
	}

	.corner {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 1;
		display: flex;
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
		font-size: 0.75rem;
	}

	.corner .tool {
		padding: 0.2rem 0.6rem 0.25rem;
	}

	/* The settings form, in place of the tile's content: a row per setting, its key as the label. */
	.settings {
		display: grid;
		align-content: start;
		gap: 0.4rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	.bare .settings {
		padding: 2rem 1rem 1rem;
	}

	.field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}

	.field > span {
		min-width: 6ch;
		color: var(--mute);
	}

	.field input {
		flex: 1;
		min-width: 0;
		padding: 0.15rem 0.4rem;
	}

	/* Resize grip: the bottom right corner, hatched. */
	.grip {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 14px;
		height: 14px;
		background: var(--hatch);
		border-top: 1px solid var(--rule);
		border-left: 1px solid var(--rule);
		cursor: nwse-resize;
		touch-action: none;
	}

	.mark {
		color: var(--signal);
		margin-right: 0.35rem;
	}
</style>
