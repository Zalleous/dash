<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { ms } from '#lib/motion.ts';

	let { value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string } = $props();

	/* Starts at 0, so first data counts up; later polls roll from the old value. */
	const n = new Tween(0, { easing: cubicOut });
	$effect(() => {
		n.set(value, { duration: ms(700) });
	});
</script>

{format(n.current)}
