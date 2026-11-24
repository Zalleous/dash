import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { fits, place } from '#lib/layout.ts';
import { ALL, IDS, META, full, viewFile } from '#lib/panels/index.ts';

test('every panel folder has its meta and its view', () => {
	const dirs = readdirSync('src/lib/panels', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
	expect(new Set(dirs)).toEqual(new Set(IDS));
	for (const id of dirs) {
		expect(existsSync(`src/lib/panels/${id}/meta.ts`)).toBe(true);
		expect(existsSync(`src/lib/panels/${id}/${viewFile(id)}`)).toBe(true);
	}
	expect(viewFile('my-thing')).toBe('MyThing.svelte');
});

test('every panel at home fits', () => {
	expect(fits(ALL)).toBe(true);
});

test('a kind with no home gets the first free spot on the full board', () => {
	const all = full([...IDS, 'new'], { ...META, new: { title: 'new' } });
	expect(fits(all)).toBe(true);
	expect(all.new).toEqual(place(ALL, 6, 6));
});

test('the sources load, with no name twice', async () => {
	const { sources, actions } = await import('#lib/server/sources/index.ts');
	expect(Object.keys(sources)).toEqual(expect.arrayContaining(['weather', 'proxmox', 'arr', 'gitea', 'alerts', 'todos']));
	expect(Object.keys(actions)).toEqual(expect.arrayContaining(['vault', 'timer', 'presets']));
});

test('the panel script refuses a bad name, a taken folder and a taken source', () => {
	const refused = { Bad: /lowercase/, '1x': /lowercase/, a_b: /lowercase/, media: /exists/, arr: /taken/, calendar: /taken/, vault: /taken/ };
	for (const [name, why] of Object.entries(refused)) {
		const out = spawnSync(process.execPath, ['scripts/panel.ts', name], { encoding: 'utf8' });
		expect(out.status, name).toBe(1);
		expect(out.stderr, name).toMatch(why);
	}
});
