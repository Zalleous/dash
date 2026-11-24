import { links } from '#lib/server/links.ts';
import type { LayoutServerLoad } from './$types';

/* The links for Ctrl+K and the media panel, and the dashboard's name for the title and the header. */
export const load: LayoutServerLoad = () => ({ links, name: process.env.DASH_NAME || 'SYS://DASH' });
