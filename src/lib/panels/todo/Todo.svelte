<script lang="ts">
	import Empty from '#lib/Empty.svelte';
	import { LEVEL, parseQuickAdd } from '#lib/quickadd.ts';
	import { commands } from '#lib/commands.svelte.ts';
	import Panel from '#lib/Panel.svelte';
	import { post, unset, type Todos } from '#lib/poll.svelte.ts';
	import Status from '#lib/Status.svelte';
	import { trackDeadlines } from '#lib/deadlines.svelte.ts';
	import { incoming, writing } from '#lib/orb.ts';
	import { ms } from '#lib/motion.ts';
	import { gone, tick, ticking } from '#lib/tick.ts';
	import { daysLeft, isoDay, until } from '#lib/time.ts';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';

	let { id }: { id: string } = $props();
	const s = trackDeadlines();
	const todos = s.todos;
	/* skip: titles of calendar deadlines. Their cards live in the deadlines panel, with this priority and tick. */
	const skip = $derived(s.dated);

	const PRIO = ['🔴', '🟡', '🟢', ''];

	let board = $state('all');
	let more = $state(false);
	let error = $state('');

	const rank = (due: string | null) => (due && due < isoDay() ? 0 : due === isoDay() ? 1 : 2);
	const cards = $derived(
		(todos.data?.cards ?? [])
			.filter((c) => !gone.has(c.raw) && !skip.has(c.title) && (board === 'all' || c.board === board))
			.toSorted(
				(a, b) =>
					rank(a.due) - rank(b.due) ||
					PRIO.indexOf(a.priority) - PRIO.indexOf(b.priority) ||
					(a.due ?? '9').localeCompare(b.due ?? '9')
			)
			// Two identical lines are two cards; the count keeps their keys apart.
			.map((c, i, all) => ({ ...c, key: `${c.board}\n${c.raw}\n${all.slice(0, i).filter((d) => d.board === c.board && d.raw === c.raw).length}` }))
	);

	/* The now set: overdue, due within a week, or 🔴. The rest waits behind '+n later'. */
	const now = (c: Todos['cards'][number]) => c.priority === '🔴' || (c.due !== null && daysLeft(c.due) <= 7);
	const shown = $derived(more ? cards : cards.filter(now));
	const later = $derived(cards.filter((c) => !now(c) && !incoming.has(c.title)).length);

	/* The title strip: the open count follows the board tab; ✱ while a card is overdue. */
	const open = $derived(cards.filter((c) => !incoming.has(c.title)).length);
	const overdue = $derived(todos.data?.cards.some((c) => !skip.has(c.title) && c.due && c.due < isoDay()) ?? false);

	const cat = (b: string) => `var(--cat-${(todos.data?.boards ?? []).indexOf(b) % 3})`;

	const plain = (s: string) => s.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');

	/* Ctrl+K: 'todo: …' adds the typed text as a card, which flies here as an orb (orb.ts). */
	commands((q) => {
		const card = parseQuickAdd(q, todos.data?.boards ?? []);
		return [{ label: `todo: ${card.title}`, hint: card.board, free: true, to: { todo: card.title }, run: () => post('vault', { op: 'add', ...card }).then(todos.reload) }];
	});

	/* The empty state's drawing (Empty.svelte). */
	const DRAWING = String.raw`
 ______________
|              |
| [x] -------- |
| [x] -----    |
| [x] ------   |
|______________|
`;
</script>

<Panel {id} attention={overdue} facts={[['open', todos.data ? open : null], ['done today', todos.data?.doneToday]]}>
	<div class="tabs">
		{#each ['all', ...(todos.data?.boards ?? [])] as b (b)}
			<button class:on={board === b} style:--cat={b === 'all' ? null : cat(b)} onclick={() => (board = b)}>{b}</button>
		{/each}
	</div>

	{#if unset(todos.error)}<Status p={todos} />{:else if todos.error}<div class="err">{todos.error}</div>{/if}
	{#if error}<div class="err">{error}</div>{/if}

	<ul>
		{#each shown as c (c.key)}
			<li
				class:overdue={rank(c.due) === 0}
				class:today={rank(c.due) === 1}
				class:ticking={ticking.has(c.raw)}
				class:incoming={incoming.has(c.title)}
				class:writing={writing.has(c.title)}
				title={plain(c.desc)}
				animate:flip={{ duration: ms(300) }}
				in:fade={{ duration: ms(200) }}
			>
				<button class="check" aria-label="Done: {c.title}" disabled={ticking.has(c.raw)} onclick={async () => (error = await tick(c, todos.reload))}></button>
				<span class="title">{c.title}</span>
				<span class="meta">
					{#if c.priority}<span class="p{LEVEL[c.priority]}">!{LEVEL[c.priority]}</span>{/if}
					{#if board === 'all'}<span style:color={cat(c.board)}>{c.board}</span>{/if}
					{#if c.due}<span class="due" title={c.due}>{until(daysLeft(c.due))}</span>{/if}
				</span>
			</li>
		{:else}
			{#if todos.data && !cards.length}<li class="none"><Empty drawing={DRAWING} text="nothing open" /></li>{/if}
		{/each}
	</ul>
	{#if later}<button class="more" onclick={() => (more = !more)}>{more ? 'less' : `+${later} later`}</button>{/if}
</Panel>

<style>
	.tabs {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 0.6rem;
	}

	.tabs button,
	.more {
		font-family: var(--font-data);
		font-size: 0.75rem;
		padding: 0.05rem 0.5rem;
	}

	.tabs button:not(.on, :active) {
		color: var(--cat, inherit);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--track);
	}

	.none {
		border: 0;
	}

	/* A new todo stays hidden, holding its place, until its cube lands (orb.ts). */
	.incoming {
		visibility: hidden;
	}

	/* The write-in is the tick's erase (app.css) played backwards: --e is how much of the row is not written yet. */
	.writing {
		clip-path: inset(-2px var(--e) -2px 0);
		animation: erase 400ms cubic-bezier(0.65, 0, 0.35, 1) reverse both;
	}

	.writing .check {
		animation: absorb 500ms ease-out;
	}

	@keyframes absorb {
		from {
			background: var(--live);
			border-color: var(--live);
		}
	}

	.more {
		margin-top: 0.4rem;
	}

	.title {
		flex: 1 1 12rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		display: flex;
		gap: 0.6rem;
		margin-left: auto;
		font-family: var(--font-data);
		font-size: 0.75rem;
		color: var(--mute);
	}

	.today .due {
		color: var(--ink);
		font-weight: 700;
	}

	.overdue .due {
		color: var(--signal);
		font-weight: 700;
	}
</style>
