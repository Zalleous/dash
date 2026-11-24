<script lang="ts">
	import { page } from '$app/state';
	import { registered, type Item } from '#lib/commands.svelte.ts';
	import { iconUrl, type Link } from '#lib/links.ts';
	import { deliver } from '#lib/orb.ts';
	import { post } from '#lib/poll.svelte.ts';

	let open = $state(false);
	let q = $state('');
	let sel = $state(0);
	let input = $state<HTMLInputElement>();

	function score(name: string, query: string) {
		const n = name.toLowerCase();
		const s = query.toLowerCase();
		if (n.startsWith(s)) return 3;
		if (n.includes(s)) return 2;
		let i = 0;
		for (const ch of n) if (ch === s[i]) i++;
		return i === s.length ? 1 : 0;
	}

	/* The entries the mounted panels offer (commands.svelte.ts), once something is typed. */
	const given = $derived(q ? [...registered].flatMap((f) => f(q)) : []);

	const items: Item[] = $derived.by(() => {
		const pool: Item[] = [...(page.data.links as Link[]).map((l) => ({ label: l.name, hint: l.group, icon: l.icon, run: () => window.open(l.href, '_blank') })), ...given.filter((it) => !it.free)];
		const found = pool
			.map((it) => ({ it, s: q ? score(it.label, q) : 1 }))
			.filter((x) => x.s)
			.sort((a, b) => b.s - a.s)
			.map((x) => x.it);
		if (!q.trim()) return found;
		return [
			...found,
			...given.filter((it) => it.free),
			{ label: `log: ${q}`, hint: 'daily note', to: { log: q.trim() }, run: () => post('vault', { op: 'capture', text: q }) }
		];
	});

	/** Also called by the header's `ctrl+k` button, the way in without a keyboard. */
	export function show() {
		open = true;
		q = '';
		sel = 0;
		queueMicrotask(() => input?.focus());
	}

	function key(e: KeyboardEvent) {
		const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
		if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !typing)) {
			e.preventDefault();
			show();
		} else if (open && e.key === 'Escape') open = false;
	}

	function nav(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') sel = Math.min(sel + 1, items.length - 1);
		else if (e.key === 'ArrowUp') sel = Math.max(sel - 1, 0);
		else if (e.key === 'Enter' && items[sel]) {
			const { run, to } = items[sel];
			const saved = q;
			if (to && input)
				deliver(input, Promise.resolve(run()), to, () => (open = false)).catch((err) => {
					open = true;
					q = saved;
					alert(err.message);
				});
			else {
				Promise.resolve(run()).catch((err) => alert(err.message));
				open = false;
			}
		} else return;
		e.preventDefault();
	}
</script>

<svelte:window onkeydown={key} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (open = false)}>
		<div class="box" role="dialog" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<input bind:this={input} bind:value={q} oninput={() => (sel = 0)} onkeydown={nav} aria-label="Jump to a link, start a timer, or add a todo" placeholder="jump to… or type a todo" />
			<ul>
				{#each items as it, i (it.label)}
					<li class:sel={i === sel}>
						<button onclick={() => ((sel = i), nav(new KeyboardEvent('keydown', { key: 'Enter' })))} onmouseenter={() => (sel = i)}>
							{#if it.icon}<img src={iconUrl(it.icon)} alt="" />{:else}<span class="dot"></span>{/if}
							<span>{it.label}</span>
							<span class="muted hint">{it.hint}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in srgb, var(--ink) 35%, transparent);
		display: grid;
		justify-items: center;
		align-items: start;
		padding-top: 12vh;
		z-index: 50;
	}

	.box {
		width: min(560px, calc(100vw - 32px));
		background: var(--sheet);
		border: 1px solid var(--ink);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.18);
	}

	input {
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--rule);
		padding: 0.75rem 0.9rem;
		font-size: 1.05rem;
	}

	input:focus {
		border-color: var(--rule);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0.3rem 0;
		max-height: 50vh;
		overflow-y: auto;
	}

	li button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		border: none;
		text-align: left;
		padding: 0.35rem 0.9rem;
		transition: none;
	}

	li.sel button {
		background: var(--ink);
		color: var(--paper);
	}

	img,
	.dot {
		width: 18px;
		flex: none;
	}

	.hint {
		margin-left: auto;
		font-family: var(--font-data);
		font-size: 0.75rem;
	}

	li.sel .hint {
		color: color-mix(in srgb, var(--paper) 75%, var(--ink));
	}
</style>
