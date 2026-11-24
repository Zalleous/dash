import { expect, test } from 'vitest';
import { fit, settle } from '#lib/panels/index.ts';
import { panels, presets, presetsAction } from '#lib/server/sources/presets.ts';
import { GET } from '../../../routes/api/[source]/+server.ts';

const act = (body: Record<string, unknown>) => presetsAction(body) as Promise<Awaited<ReturnType<typeof presets>> & { id?: string }>;
const get = (path: string) => GET({ params: { source: path.split('?')[0] }, url: new URL(`http://dash/api/${path}`) } as never);

test('a setting takes values of its default: a choice, a type, 1 to 100 characters, a finite number', () => {
	expect(fit(['a', 'b'], 'b')).toBe(true);
	expect(fit(['a', 'b'], 'c')).toBe(false);
	expect(fit('x', 'Tokyo')).toBe(true);
	expect(fit('x', '')).toBe(false);
	expect(fit('', '')).toBe(true);
	expect(fit('x', 'a'.repeat(101))).toBe(false);
	expect(fit('x', 3)).toBe(false);
	expect(fit(3, 4.5)).toBe(true);
	expect(fit(3, '4')).toBe(false);
	expect(fit(3, NaN)).toBe(false);
	expect(fit(3, Infinity)).toBe(false);
	expect(settle('media', { style: 'full', extra: 1 })).toEqual({ style: 'full' });
	expect(settle('media', { style: 'huge' })).toEqual({ style: 'auto' });
	expect(settle('weather')).toEqual({ place: 'Montreal' });
});

test('set takes known keys with fitting values, trims strings, and refuses the rest', async () => {
	const out = await act({ op: 'set', id: 'weather', settings: { place: '  Tokyo ' } });
	expect(out.panels.find((p) => p.id === 'weather')?.settings).toEqual({ place: 'Tokyo' });
	await expect(act({ op: 'set', id: 'weather', settings: { color: 'red' } })).rejects.toThrow(/no setting color/);
	await expect(act({ op: 'set', id: 'weather', settings: { place: 3 } })).rejects.toThrow(/place: 1 to 100/);
	await expect(act({ op: 'set', id: 'weather', settings: { place: '   ' } })).rejects.toThrow(/place: 1 to 100/);
	await expect(act({ op: 'set', id: 'weather', settings: { place: 'x'.repeat(101) } })).rejects.toThrow(/place: 1 to 100/);
	await expect(act({ op: 'set', id: 'media', settings: { style: 'huge' } })).rejects.toThrow(/style: one of auto, compact, full/);
	await expect(act({ op: 'set', id: 'weather', settings: { constructor: 'x' } })).rejects.toThrow(/no setting/);
	await expect(act({ op: 'set', id: 'weather', settings: 'Tokyo' })).rejects.toThrow(/bad settings/);
	await act({ op: 'set', id: 'weather', settings: { place: 'Montreal' } });
});

test('new numbers a kind with many from 2 up, the lowest free first; a kind without many is refused', async () => {
	expect((await act({ op: 'new', kind: 'weather' })).id).toBe('weather-2');
	expect((await act({ op: 'new', kind: 'weather' })).id).toBe('weather-3');
	await act({ op: 'drop', id: 'weather-2' });
	expect((await act({ op: 'new', kind: 'weather' })).id).toBe('weather-2');
	await expect(act({ op: 'new', kind: 'media' })).rejects.toThrow(/no second media/);
	await expect(act({ op: 'new', kind: 'nope' })).rejects.toThrow();
	expect(panels().filter((p) => p.kind === 'weather').map((p) => p.id)).toEqual(['weather', 'weather-3', 'weather-2']);
	await act({ op: 'drop', id: 'weather-2' });
	await act({ op: 'drop', id: 'weather-3' });
});

test('drop takes an added instance out of every preset at once, and refuses built-in and unknown ids', async () => {
	const { id } = await act({ op: 'new', kind: 'weather' });
	await act({ op: 'set', id, settings: { place: 'Tokyo' } });
	const layout = { [id!]: { x: 0, y: 40, w: 7, h: 6 }, weather: { x: 0, y: 12, w: 7, h: 6 } };
	await act({ op: 'save', name: 'a', layout });
	await act({ op: 'save', name: 'b', layout });
	const out = await act({ op: 'drop', id });
	expect(out.panels.map((p) => p.id)).not.toContain(id);
	for (const p of out.presets) expect(Object.keys(p.layout)).not.toContain(id);
	expect(out.presets.find((p) => p.name === 'a')?.layout).toEqual({ weather: { x: 0, y: 12, w: 7, h: 6 } });
	await expect(act({ op: 'save', name: 'a', layout })).rejects.toThrow(/bad layout/);
	await expect(act({ op: 'drop', id: 'weather' })).rejects.toThrow(/built in/);
	await expect(act({ op: 'drop', id: 'weather-9' })).rejects.toThrow(/no such panel/);
	await expect(act({ op: 'set', id: 'weather-9', settings: {} })).rejects.toThrow(/no such panel/);
});

test('?i= serves its own kind only: an unknown id is 404, a source of another kind 400', async () => {
	const { id } = await act({ op: 'new', kind: 'weather' });
	expect((await get('arr?i=nope')).status).toBe(404);
	expect((await get(`arr?i=${id}`)).status).toBe(400);
	expect((await get(`presets?i=${id}`)).status).toBe(400);
	expect((await get('weather?i=media')).status).toBe(400);
	expect((await get('weather?i=')).status).toBe(404);
	const shared = await get('presets');
	expect(shared.status).toBe(200);
	expect((await shared.json()).panels.map((p: { id: string }) => p.id)).toContain(id);
	await act({ op: 'drop', id });
});

test('a name every object inherits (constructor) is no source', async () => {
	await expect(get('constructor')).rejects.toMatchObject({ status: 404 });
});
