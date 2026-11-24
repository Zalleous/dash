import type { Meta } from '#lib/panels/index.ts';

/* style: auto grows with the tile, compact keeps what is playing only, full shows every section at any size. */
export default { title: 'media', home: { x: 18, y: 18, w: 6, h: 18 }, settings: { style: ['auto', 'compact', 'full'] } } satisfies Meta;
