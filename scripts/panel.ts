/* A new panel: npm run panel -- <name>. It writes src/lib/panels/<name>/, a small working example of each panel
   feature once (a server source, its poll, strip facts, a size step, a setting, a container query, a Ctrl+K entry, an
   empty state), and the board finds the folder on its own. Plain node: Node 24 strips the types, so only erasable TS here,
   and no #lib/ imports (they pull in Svelte and Vite). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const name = process.argv[2] ?? '';
const panels = `${import.meta.dirname}/../src/lib/panels`;

function stop(why: string): never {
	console.error(why);
	process.exit(1);
}

/* The names /api/ already answers to: the shared ones in server/sources/index.ts and each panel's sources and
   actions. ponytail: a text scan that reads today's files right (keys two tabs in, or on one line); the server
   still refuses to start on a name used twice. */
function served() {
	const shared = readFileSync(`${panels}/../server/sources/index.ts`, 'utf8');
	const own = readdirSync(panels)
		.filter((d) => existsSync(`${panels}/${d}/data.server.ts`))
		.map((d) => readFileSync(`${panels}/${d}/data.server.ts`, 'utf8'));
	const lines = [...shared.matchAll(/^\t\t'?([\w-]+)'?(?=[:,]|$)/gm)];
	const inline = [shared, ...own].flatMap((text) =>
		[...text.matchAll(/(?:sources|actions) = (?:merge<\w+>\()?\{([^}\n]*)\}/g)].flatMap((m) => [...m[1].matchAll(/(?:^|,)\s*'?([\w-]+)'?\s*(?=[:,]|$)/g)])
	);
	return [...lines, ...inline].map((m) => m[1]);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) stop('A panel name is lowercase letters, digits and -, and starts with a letter: npm run panel -- <name>');
if (existsSync(`${panels}/${name}`)) stop(`src/lib/panels/${name}/ already exists.`);
if (served().includes(name)) stop(`/api/${name} is taken: pick another name.`);

/* The view file is the name in PascalCase, my-thing/MyThing.svelte, as viewFile() in panels/index.ts reads it. */
const Name = name.replace(/(?:^|-)(.)/g, (_, c: string) => c.toUpperCase());
const key = name.includes('-') ? `'${name}'` : name;

const meta = `import type { Meta } from '#lib/panels/index.ts';

/* No home: the panel takes the first free spot on the full board. home: { x, y, w, h }, in cells, gives it one.
   settings: each key's default; a list is a choice, its first item the default. Edit mode's set changes them. */
export default { title: '${name}', settings: { style: ['list', 'first'] } } satisfies Meta;
`;

const data = `/* Served at /api/${name}, to the panel's poll and to the first paint. Sample data, so the panel works at once; a real
   source fetches with json(), keeps the answer a while with cached() and reads its keys with env(), all from
   #lib/server/http.ts (weather/data.server.ts uses the first two, homelab/data.server.ts all three). A name is used once across every panel. */
export async function sample() {
	return [
		{ name: 'first', value: 3 },
		{ name: 'second', value: 12 },
		{ name: 'third', value: 7 }
	];
}

export const sources = { ${key}: sample };
`;

const view = `<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import { commands } from '#lib/commands.svelte.ts';
	import Panel, { cells } from '#lib/Panel.svelte';
	import { poll } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import type { sample } from '#lib/panels/${name}/data.server.ts';

	let { id, settings }: { id: string; settings: { style: 'list' | 'first' } } = $props();
	/* This folder's source, again every minute. Panels that ask for the same URL share one poll. */
	const data = poll<Awaited<ReturnType<typeof sample>>>('/api/${name}', 60_000);

	/* The tile's size in whole cells (24 columns, 24 px rows; 24 wide on the phone): from 5 rows tall it lists every
	   item, below that the first one. The style setting (meta.ts) first shows the first one at any size. */
	const size = cells(() => id);
	const items = $derived(data.data?.slice(0, settings.style === 'list' && size.h >= 5 ? undefined : 1) ?? []);

	/* Ctrl+K: the panel's entries, offered while it is mounted. This one hides the list, which shows the empty state. */
	let hide = $state(false);
	commands(() => [{ label: '${name}: list', hint: hide ? 'show' : 'hide', run: () => (hide = !hide) }]);

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw\`
|      |
|      |
'------'
\`;
</script>

<Panel {id} facts={[['items', data.data?.length]]}>
	{#if data.data}
		{#each hide ? [] : items as item (item.name)}
			<div class="row">
				<span>{item.name}</span>
				<span class="value">{item.value}</span>
			</div>
		{:else}
			<Empty drawing={DRAWING} text="nothing here" />
		{/each}
	{:else}
		<Status p={data} />
	{/if}
</Panel>

<style>
	.row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.value {
		font-family: var(--font-data);
		color: var(--mute);
	}

	/* A container query on the tile's body: a narrow tile leaves the values out. */
	@container tile (width < 16rem) {
		.value {
			display: none;
		}
	}
</style>
`;

mkdirSync(`${panels}/${name}`);
writeFileSync(`${panels}/${name}/meta.ts`, meta);
writeFileSync(`${panels}/${name}/data.server.ts`, data);
writeFileSync(`${panels}/${name}/${Name}.svelte`, view);

console.log(`Made src/lib/panels/${name}/:
  meta.ts          its title and style setting; a home on the full board once you give it one
  ${`${Name}.svelte`.padEnd(17)}the view: its tile, poll, facts, size step, style and Ctrl+K entry
  data.server.ts   /api/${name}, sample data for now

Next:
  1. On the board (npm run dev): edit, + ${name}, place and size it, save.
  2. Put real data in data.server.ts and draw it in ${Name}.svelte. DESIGN.md, Panels, has the recipe.
  3. npm run check and npm test.`);
