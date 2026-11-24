import { SvelteSet } from 'svelte/reactivity';
import type { To } from '#lib/orb.ts';

/** `to`: the item saves to the vault, and flies there as an orb (orb.ts). `free`: built from the typed text instead
    of matched against it, so it comes after the matches. */
export type Item = { label: string; hint: string; icon?: string; run: () => unknown; to?: To; free?: boolean };

export const registered = new SvelteSet<(q: string) => Item[]>();

/* A panel's Ctrl+K entries, offered while the panel is mounted. Hidden panels stay mounted, so their entries work in
   every preset. */
export function commands(list: (q: string) => Item[]) {
	$effect(() => {
		registered.add(list);
		return () => registered.delete(list);
	});
}
