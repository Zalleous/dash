<script lang="ts">
	import Panel from '#lib/Panel.svelte';
	import { api } from '#lib/panels/index.ts';
	import { poll } from '#lib/poll.svelte.ts';
	import Roll from '#lib/Roll.svelte';

	type W = { place: string; name: string; temp: number; feels: number; wind: number; sky: string; hi: number; lo: number; rain: number; sunrise: string; sunset: string };
	let { id, settings }: { id: string; settings: { place: string } } = $props();
	/* An instance's own poll (?i=, api()). A view keeps its id for life, so reading it once is right. */
	// svelte-ignore state_referenced_locally
	const w = poll<W>(api('weather', id), 10 * 60_000);
	/* Right after the place changes, the last answer is for the old one: wait for the new one, or its error. */
	const d = $derived(w.data?.place === settings.place ? w.data : null);
</script>

<Panel {id}>
	{#if d}
		<div class="weather">
			<div class="temp"><Roll value={d.temp} />°<span class="place">{d.name}</span></div>
			<div>{d.sky} / feels <Roll value={d.feels} />°</div>
			<div class="muted data">high {d.hi}° / low {d.lo}° / rain {d.rain}% / wind {d.wind} km/h</div>
			<div class="muted data">sun {d.sunrise}–{d.sunset}</div>
		</div>
	{:else}
		<div class="muted wait">{w.error ? `weather: ${w.error}` : 'weather…'}</div>
	{/if}
</Panel>

<style>
	.weather {
		padding: 16px 24px;
		line-height: 1.6;
	}

	.wait {
		margin: 16px 24px;
	}

	@media (max-width: 700px) {
		.weather {
			padding-bottom: 12px;
		}
	}

	.weather > div,
	.wait {
		width: fit-content;
		background: var(--label);
	}

	/* The place sits beside the temperature, in the room the line has anyway. */
	.place {
		margin-left: 0.6rem;
		font-family: var(--font-data);
		font-size: 0.75rem;
		font-weight: normal;
		color: var(--mute);
	}

	.temp {
		font-family: var(--font-display);
		font-size: 2.25rem;
		font-weight: 600;
		line-height: 1.1;
	}
</style>
