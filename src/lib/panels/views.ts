import type { Component } from 'svelte';
import { viewFile, type Settings } from '#lib/panels/index.ts';

/* Each kind's view, <kind>/<Kind>.svelte (viewFile). Every view renders its own tile. The glob lives in a .ts file
   because the dev server updates it when a panel is added or removed; in Board.svelte it kept its first list. */
const views = import.meta.glob<Component<{ id: string; settings: Settings }>>('./*/*.svelte', { eager: true, import: 'default' });
export const view = (kind: string) => views[`./${kind}/${viewFile(kind)}`];
