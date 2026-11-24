<script lang="ts">
	import { GLYPHS, gsap } from '#lib/motion.ts';
	import Panel from '#lib/Panel.svelte';
	import { now as clock } from '#lib/now.svelte.ts';
	import { hm, pad2 } from '#lib/time.ts';
	import { prefersReducedMotion } from 'svelte/motion';

	let { id }: { id: string } = $props();

	const now = $derived(clock());

	/* Each HH:MM digit owns a cell, so a minute change only scrambles the digits that moved. */
	let face: HTMLElement;
	const shown: string[] = [];
	$effect(() => {
		const digits = hm(now).replace(':', '');
		face.querySelectorAll('i').forEach((el, i) => {
			if (shown[i] === digits[i]) return;
			const first = shown[i] === undefined;
			shown[i] = digits[i];
			if (prefersReducedMotion.current) el.textContent = digits[i];
			else gsap.to(el, { scrambleText: { text: digits[i], chars: first ? GLYPHS : '0123456789' }, duration: first ? 0.8 : 0.45, delay: first ? 0.1 + i * 0.08 : 0, ease: 'none' });
		});
	});

	const d = $derived(new Date(now));
	const date = $derived(d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }));
	const week = $derived.by(() => {
		const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
		const jan1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
		return Math.ceil(((x.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
	});
</script>

<Panel {id}>
	<div class="clock">
		<time class="time" datetime={d.toISOString()} aria-label={hm(now)}><span class="face" bind:this={face} aria-hidden="true"><i></i><i></i>:<i></i><i></i></span><span class="sec">{pad2(d.getSeconds())}</span></time>
		<div class="date">{date} / week {week}</div>
	</div>
</Panel>

<style>
	.clock {
		padding: 24px 24px 0;
	}

	/* The digits scale with the tile (Panel.svelte makes its body a size container): 7.5rem in glance at 1920. */
	.time {
		display: block;
		font-family: var(--font-display);
		font-size: 22.3cqi;
		font-weight: 700;
		line-height: 0.85;
		letter-spacing: -0.02em;
	}

	.face i {
		display: inline-block;
		min-width: 0.62em;
		font-style: normal;
		text-align: center;
	}

	.sec {
		margin-left: 0.4rem;
		font-size: 0.25em;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--mute);
		vertical-align: top;
	}

	/* Small text knocks out the drawing behind it, as a label does on a drawing. */
	.sec,
	.date {
		width: fit-content;
		background: var(--label);
	}

	.date {
		margin-top: 0.9rem;
		font-size: 1.05rem;
	}

	/* The phone's band keeps the time clear of the car beside it. */
	@media (max-width: 700px) {
		.time {
			font-size: clamp(4rem, 15vw, 7.5rem);
		}
	}
</style>
