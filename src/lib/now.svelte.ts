import { createSubscriber } from 'svelte/reactivity';

/* The time, read in a template or a $derived: it reads again every ms while anything shows it. One interval per
   distinct ms, shared by every reader (createSubscriber), stopped when the last one goes. */
const ticks = new Map<number, () => void>();

export function now(ms = 1000) {
	let tick = ticks.get(ms);
	if (!tick) {
		tick = createSubscriber((update) => {
			const id = setInterval(update, ms);
			return () => clearInterval(id);
		});
		ticks.set(ms, tick);
	}
	tick();
	return Date.now();
}
