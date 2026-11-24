import { ms } from '#lib/motion.ts';
import { msg } from '#lib/msg.ts';
import { post } from '#lib/poll.svelte.ts';
import { SvelteSet } from 'svelte/reactivity';

/* Ticking a card, from the todo or the deadlines panel: a caret sweeps right to left and erases the row while the
   commit runs (the .ticking styles in app.css); the row then stays hidden until the reload drops the card. */

/** Raw lines of the cards playing the erase. */
export const ticking = new SvelteSet<string>();
/** Raw lines of the cards erased and waiting for the reload. */
export const gone = new SvelteSet<string>();

/** Ticks the card on its board. Returns the error text, or '' when the tick landed. */
export async function tick(c: { board: string; raw: string }, reload: () => Promise<void>) {
	ticking.add(c.raw);
	const req = post('vault', { op: 'tick', board: c.board, raw: c.raw });
	await new Promise((r) => setTimeout(r, ms(450)));
	gone.add(c.raw);
	let error = '';
	try {
		await req;
	} catch (e) {
		error = msg(e);
	}
	await reload();
	gone.delete(c.raw);
	ticking.delete(c.raw);
	return error;
}
