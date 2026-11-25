const store = new Map<string, { at: number; value: Promise<unknown>; last?: unknown }>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	const hit = store.get(key);
	if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
	const entry = { at: Date.now(), value: fn(), last: hit?.last };
	store.set(key, entry);
	entry.value.then(
		(v) => (entry.last = v),
		() => store.delete(key)
	);
	return entry.value as Promise<T>;
}

export const peek = <T>(key: string) => store.get(key)?.last as T | undefined;

/* Every answer stale, so the next read of each fetches again (the refresh action). The entries stay, and with them
   the last answers that peek() gives the alerts. */
export const expire = () => store.forEach((e) => (e.at = 0));

export function forget(prefix: string) {
	for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

export const TIMEOUT = 8000;

type Opts = { allow404?: boolean };

/* A fetch that throws on any status but 2xx; with allow404, a 404 resolves null. */
export async function http(url: string, init?: RequestInit): Promise<Response>;
export async function http(url: string, init: RequestInit, opts: Opts): Promise<Response | null>;
export async function http(url: string, init: RequestInit = {}, { allow404 = false }: Opts = {}) {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
	if (allow404 && res.status === 404) return null;
	if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
	return res;
}

export const env = (...keys: string[]) => {
	const v = keys.map((k) => process.env[k]);
	const missing = keys.filter((_, i) => !v[i]);
	if (missing.length) throw new Error(`not set up: ${missing.join(', ')}`);
	return v as string[];
};

export const json = async <T = any>(url: string, init: RequestInit = {}, opts: Opts = {}): Promise<T> => (await http(url, init, opts))?.json() ?? null;

/* A fetcher for one service's API: its URL and key come from the environment on each call (so a missing one fails
   that call with "not set up"), the key sent in the header the service wants. */
export const service =
	(urlVar: string, keyVar: string, header: (key: string) => Record<string, string>) =>
	async <T = any>(path: string, init: RequestInit = {}, opts?: Opts): Promise<T> => {
		const [url, key] = env(urlVar, keyVar);
		return json(url + path, { ...init, headers: { ...header(key), ...(init.headers as Record<string, string>) } }, opts);
	};

export const giteaApi = service('GITEA_URL', 'GITEA_TOKEN', (token) => ({ Authorization: `token ${token}` }));
