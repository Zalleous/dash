import type { Handle } from '@sveltejs/kit/hooks';
import { startUptime } from '#lib/server/uptime.ts';

startUptime();

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { preload: (f) => (f.type === 'font' ? f.filename.includes('-latin-wght-') : f.type !== 'asset') });
