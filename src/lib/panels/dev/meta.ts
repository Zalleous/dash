import type { Meta } from '#lib/panels/index.ts';

/* skip: hide the commits whose message starts with this (a bot's sync commits, say); empty hides none. */
export default { title: 'dev', home: { x: 18, y: 36, w: 6, h: 6 }, glance: false, settings: { skip: '' } } satisfies Meta;
