<script lang="ts">
	import { VIEWS } from '#lib/art.ts';
	import Panel from '#lib/Panel.svelte';
	import { drawing } from '#lib/panels/car/Car.svelte';

	let { id }: { id: string } = $props();
	const art = $derived(drawing.art);
	const view = $derived(!art.box ? '–' : art.yaw === null ? VIEWS[art.box.view].title : `yaw ${String(art.yaw).padStart(3, '0')}°`);
</script>

<Panel {id}>
	<!-- The drawing's title block, in the tile's bottom right corner. -->
	<dl>
		<div><dt>drawing</dt><dd>Supra MA70 / 1986.5</dd></div>
		<div class="view"><dt>view</dt><dd>{view}</dd></div>
		<div class="scale"><dt>scale</dt><dd>{art.box ? `1:${art.n}` : '–'}</dd></div>
		<div><dt>units</dt><dd>mm</dd></div>
		<div>
			<dt>model</dt>
			<dd>
				<a href="https://sketchfab.com/3d-models/toyota-supra-25-gt-twin-turbo-a70-6d002956a62a4e1085c6aab41b088ab1" target="_blank" rel="noreferrer">A70</a> by Mona x Supercars,
				<a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC&nbsp;BY&nbsp;4.0</a>, adapted
			</dd>
		</div>
	</dl>
</Panel>

<style>
	dl {
		display: flex;
		flex-wrap: wrap;
		width: fit-content;
		margin: 0 12px 0 auto;
		padding: 1px 0 0 1px;
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.3;
	}

	/* The -1px margins lay each border over its neighbour's, also where the cells wrap. */
	div {
		flex: auto;
		margin: -1px 0 0 -1px;
		padding: 0.2rem 0.6rem 0.25rem;
		border: 1px solid var(--rule);
		background: var(--paper);
	}

	dt {
		font-size: 0.6875rem;
		color: var(--mute);
	}

	dd {
		margin: 0;
	}

	/* Wide enough for the longest value, so the block keeps its size while the view changes. */
	.view {
		min-width: calc(15ch + 1.2rem + 2px);
	}

	.scale {
		min-width: calc(4ch + 1.2rem + 2px);
	}

	a {
		text-decoration: underline;
		text-decoration-color: var(--rule);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}

	a:hover {
		text-decoration-color: currentColor;
	}

	@media (max-width: 700px) {
		dl {
			width: auto;
			margin: 0 12px 12px;
		}
	}
</style>
