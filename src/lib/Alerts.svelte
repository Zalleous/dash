<script lang="ts">
	import { blink } from '#lib/art.ts';
	import { ms } from '#lib/motion.ts';
	import { poll } from '#lib/poll.svelte.ts';
	import type { Alert } from '#lib/server/alerts.ts';
	import { fade, slide } from 'svelte/transition';

	const alerts = poll<Alert[]>('/api/alerts', 20_000);
	const red = $derived(alerts.data?.some((a) => a.level === 'red') ?? false);
	$effect(() => blink(red)); // the car tile blinks its lights while a red alert stands
</script>

{#if alerts.data?.length}
	<div class="alerts" class:red role="alert" transition:slide={{ duration: ms(250) }}>
		<span class="head"><span class="mark" aria-hidden="true">✱</span> {alerts.data.length} need{alerts.data.length === 1 ? 's' : ''} you</span>
		{#each alerts.data as a (a.text)}
			<a class={a.level} in:fade={{ duration: ms(200) }} href={a.href} target="_blank" rel="noreferrer">{a.text}</a>
		{/each}
	</div>
{/if}

<style>
	.alerts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
		margin-bottom: 1rem;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--signal);
		color: var(--signal);
	}

	.alerts.red {
		background: var(--signal);
		color: var(--on-signal);
	}

	.head {
		margin-right: 0.6rem;
		font-family: var(--font-data);
		font-size: 0.8rem;
		font-weight: 700;
	}

	a {
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}

	.red a.red {
		background: var(--on-signal);
		color: var(--signal);
		border-color: var(--on-signal);
	}

	a:not([href]) {
		cursor: default;
	}
</style>
