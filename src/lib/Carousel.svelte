<script lang="ts">
	import { EVERY, PAGE } from '#lib/guests.ts';
	import { pad2 } from '#lib/time.ts';

	/* A row of cells that turns a page on the guests' timer and holds still while hovered (media requests, latest).
	   Without an href, the label or a cell is plain text. */
	type Cell = { id: string | number; name: string; href?: string; note?: string; title?: string };
	let { label, href, items }: { label: string; href?: string; items: Cell[] } = $props();

	let page = $state(0);
	let paused = $state(false);
	const pages = $derived(Math.max(1, Math.ceil(items.length / PAGE)));
	const at = $derived((page % pages) * PAGE);
	const shown = $derived(items.slice(at, at + PAGE));
	const count = $derived(items.length ? `${pad2(at + 1)}-${pad2(at + shown.length)} / ${pad2(items.length)}` : '–');

	$effect(() => {
		if (paused) return;
		const p = page;
		const t = setTimeout(() => (page = p + 1), EVERY);
		return () => clearTimeout(t);
	});
</script>

<div class="carousel" role="group" aria-label={label} onpointerenter={() => (paused = true)} onpointerleave={() => (paused = false)}>
	<div class="head">
		<h3><a {href} target="_blank" rel="noreferrer">{label}</a></h3>
		<button onclick={() => page++} aria-label="next {label}">{count}</button>
	</div>
	<div class="cells">
		{#each shown as c, k (c.id)}
			<a href={c.href} title={c.title ?? c.name} target="_blank" rel="noreferrer" style:animation-delay="{k * 200}ms">
				<span>{c.name}</span>
				{#if c.note}<span class="note">{c.note}</span>{/if}
			</a>
		{/each}
	</div>
</div>

<style>
	.carousel:not(:first-child) {
		margin-top: 0.8rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.25rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	h3 {
		margin: 0;
		font-size: inherit;
		font-weight: normal;
	}

	h3 a,
	button {
		color: var(--mute);
	}

	.cells {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.3rem;
	}

	/* A new page plots in left to right in character steps, like the guest cards. */
	.cells a {
		display: grid;
		min-width: 0;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--rule);
		font-size: 0.8rem;
		/* backwards, not both: a clip-path kept after the wipe cuts the bottom border when the card sits on a fractional pixel (Firefox). */
		animation: wipe 0.4s steps(14) backwards;
		transition: border-color 150ms ease-out;
	}

	.cells a:hover {
		border-color: var(--ink);
		text-decoration: none;
	}

	.cells span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.note {
		font-family: var(--font-data);
		font-size: 0.7rem;
		color: var(--mute);
	}
</style>
