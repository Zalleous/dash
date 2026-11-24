import { cached, peek } from '#lib/server/http.ts';
import { compose } from '#lib/server/alerts.ts';
import { down, strips } from '#lib/server/uptime.ts';
import type { raw } from '#lib/panels/dev/data.server.ts';
import type { arr } from '#lib/panels/media/data.server.ts';
import { calendar, deadlines } from '#lib/server/sources/calendar.ts';
import { presets, presetsAction } from '#lib/server/sources/presets.ts';
import type { Settings } from '#lib/panels/index.ts';
import { isoDay } from '#lib/time.ts';
import { timer, timerAction } from '#lib/server/sources/timer.ts';
import { todos, vault } from '#lib/server/sources/vault.ts';

/* A source gets the settings of the instance it serves (none for the shared ones); one that needs none ignores them. */
type Source = (settings: Settings) => Promise<unknown>;
type Action = (body: Record<string, unknown>) => Promise<unknown>;

/* A source used by one panel lives in that panel's folder (data.server.ts); the ones here are shared. All of them
   end up in one flat map, so /api/<name> stays the same. A name used twice would serve one panel another's data, so
   it stops the server at startup instead. */
const own = Object.entries(import.meta.glob<{ sources?: Record<string, Source>; actions?: Record<string, Action> }>('../../panels/*/data.server.ts', { eager: true }));

function merge<T>(base: Record<string, T>, more: (Record<string, T> | undefined)[]) {
	for (const [name, f] of more.flatMap((m) => Object.entries(m ?? {}))) {
		if (Object.hasOwn(base, name)) throw new Error(`two sources named ${name}`);
		base[name] = f;
	}
	return base;
}

export const sources = merge<Source>(
	{
		calendar: () => cached('calendar', 5 * 60_000, calendar),
		deadlines: () => cached('deadlines', 15 * 60_000, deadlines),
		todos,
		timer,
		presets,
		uptime: async () => strips(),
		alerts: async () =>
			compose({
				down: down(),
				guards: peek('guards'),
				truenas: peek('truenas'),
				glances: peek('glances'),
				todos: peek('vault:todos'),
				queue: peek<Awaited<ReturnType<typeof arr>>>('arr')?.queue,
				runs: peek<Awaited<ReturnType<typeof raw>>>('gitea')?.runs,
				now: Date.now(),
				today: isoDay()
			})
	},
	own.map(([, o]) => o.sources)
);

export const actions = merge<Action>({ vault, timer: timerAction, presets: presetsAction }, own.map(([, o]) => o.actions));

/* The kind each panel's own source belongs to, so that /api/<source>?i=<id> serves that kind's instances only. */
export const kinds: Record<string, string> = Object.fromEntries(own.flatMap(([path, o]) => Object.keys(o.sources ?? {}).map((name) => [name, path.split('/')[3]])));
