import { browser } from '$app/env';
import { page } from '$app/state';
import { createSubscriber } from 'svelte/reactivity';
import { msg } from '#lib/msg.ts';

/* One poll per URL in the browser, shared by every panel that reads it: its interval runs while any reader is mounted
   (createSubscriber) and stops when the last one goes. The server makes a new one each time, so no data passes from
   one request to the next. ponytail: the first caller's interval wins; take the shortest if two panels ever ask for
   different ones. */
const shared = new Map<string, ReturnType<typeof make>>();

export function poll<T>(url: string, ms: number) {
	if (!browser) return make<T>(url, ms);
	if (!shared.has(url)) shared.set(url, make<T>(url, ms));
	return shared.get(url) as ReturnType<typeof make<T>>;
}

function make<T>(url: string, ms: number) {
	const first = page.data.first?.[url.slice('/api/'.length)] as T | undefined;
	const s = $state({ data: first ?? null, error: null as string | null });
	const load = async () => {
		try {
			const res = await fetch(url);
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			s.data = body;
			s.error = null;
		} catch (e) {
			s.error = msg(e);
		}
	};
	const subscribe = createSubscriber(() => {
		if (first === undefined) load();
		const id = setInterval(load, ms);
		const wake = () => document.visibilityState === 'visible' && load();
		document.addEventListener('visibilitychange', wake);
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', wake);
		};
	});
	return {
		get data() {
			subscribe();
			return s.data;
		},
		get error() {
			subscribe();
			return s.error;
		},
		reload: load
	};
}

/* Every poll again, now: after a panel's settings change, its sources answer differently. */
export const refresh = () => shared.forEach((p) => p.reload());

/* Fresh answers from every source (the refresh button, Ctrl+K): the server drops its caches first. The alerts go
   last, as they are built from the other sources' answers. */
export async function renew() {
	await post('refresh', {});
	await Promise.all([...shared].filter(([url]) => url !== '/api/alerts').map(([, p]) => p.reload()));
	await shared.get('/api/alerts')?.reload();
}

export async function post(source: string, body: object) {
	const res = await fetch(`/api/${source}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const out = await res.json();
	if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
	return out;
}

/* What a source resolves to, the data its poll holds. */
export type Data<F extends () => Promise<unknown>> = Awaited<ReturnType<F>>;
export type Poll<T> = { data: T | null; error: string | null };

/* A source whose keys are missing (env() in http.ts): the panel shows n/c. */
export const unset = (error: string | null | undefined) => !!error?.startsWith('not set up');

export type Todos = {
	boards: string[];
	doneToday: number;
	done: string[];
	cards: { raw: string; board: string; lane: string; priority: string; title: string; due: string | null; desc: string }[];
};

export type Ev = { title: string; start: string; end: string; allDay: boolean; t: number; cal: number };
export type Cal = { events: Ev[]; failed: number };
export type Deadlines = { events: { title: string; date: string; t: number }[]; failed: number };
