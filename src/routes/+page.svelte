<script lang="ts">
	import Board from '#lib/Board.svelte';
	import { commands } from '#lib/commands.svelte.ts';
	import { boot } from '#lib/motion.ts';
	import Palette from '#lib/Palette.svelte';
	import { renew } from '#lib/poll.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let main: HTMLElement;
	$effect(() => boot(main));
	let palette: Palette;

	let renewing = $state(false);
	async function refresh() {
		renewing = true;
		try {
			await renew();
		} finally {
			renewing = false;
		}
	}
	commands(() => [{ label: 'refresh', hint: 'every panel, fresh from its source', run: refresh }]);

	const MODES = ['auto', 'light', 'dark'] as const;
	let theme = $state<(typeof MODES)[number]>('auto');

	$effect(() => {
		const t = document.documentElement.dataset.theme;
		if (t === 'light' || t === 'dark') theme = t;
	});

	function cycle() {
		theme = MODES[(MODES.indexOf(theme) + 1) % MODES.length];
		const root = document.documentElement;
		if (theme === 'auto') delete root.dataset.theme;
		else root.dataset.theme = theme;
		try {
			if (theme === 'auto') localStorage.removeItem('theme');
			else localStorage.setItem('theme', theme);
		} catch {}
	}
</script>

<Palette bind:this={palette} />

<main bind:this={main}>
	<Board>
		{#snippet bar(controls)}
			<header class="bar">
				<h1 class="data">{data.name.toLowerCase()}</h1>
				{@render controls()}
				<button onclick={refresh} disabled={renewing} title="Every panel fetches again, past the server's caches">{renewing ? 'refresh…' : 'refresh'}</button>
				<button onclick={() => palette.show()} title="Links, timers, todos: ctrl+k or /">ctrl+k</button>
				<button onclick={cycle} title="Theme: auto follows the system">theme / {theme}</button>
			</header>
		{/snippet}
	</Board>
</main>

<style>
	/* At least the screen's height, so that body's clip (app.css) is at the bottom of the screen or below. */
	main {
		display: flex;
		flex-direction: column;
		max-width: 1880px;
		min-height: 100dvh;
		margin: 0 auto;
		padding: 0 16px 1px;
	}

	/* It wraps when edit mode's + list is long, and on the phone, where the presets' tabs take their own row
	   (Board.svelte). */
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0;
		font-size: 0.85rem;
	}

	h1 {
		margin: 0 auto 0 0;
		font-size: 0.85rem;
		font-weight: normal;
	}

	/* The bar's buttons, the board's too (Board.svelte). */
	.bar :global(button),
	.bar :global(input) {
		font-family: var(--font-data);
		font-size: 0.75rem;
		white-space: nowrap;
	}</style>
