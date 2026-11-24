import { DatabaseSync } from 'node:sqlite';
import { ALL, META } from '#lib/panels/index.ts';

export const db = new DatabaseSync(process.env.DB_PATH ?? 'dash.db', { timeout: 5000 });

/* fn in one transaction: all of its writes land, or none if it throws. */
export function tx<T>(fn: () => T): T {
	db.exec('BEGIN');
	try {
		const out = fn();
		db.exec('COMMIT');
		return out;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

db.exec(`
	CREATE TABLE IF NOT EXISTS uptime (service TEXT NOT NULL, ts INTEGER NOT NULL, up INTEGER NOT NULL);
	CREATE INDEX IF NOT EXISTS uptime_ts ON uptime (ts);
	CREATE TABLE IF NOT EXISTS sessions (project TEXT NOT NULL, start INTEGER NOT NULL, "end" INTEGER);
	CREATE TABLE IF NOT EXISTS presets (name TEXT PRIMARY KEY, pos INTEGER NOT NULL, layout TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS panels (id TEXT PRIMARY KEY, kind TEXT NOT NULL, settings TEXT NOT NULL);
`);

/* Glance, the preset every load opens on: the panels for a look in passing (all but the kinds whose meta says
   glance: false), at their homes. */
const glance = Object.fromEntries(Object.entries(ALL).filter(([id]) => META[id].glance !== false));
db.prepare("INSERT OR IGNORE INTO presets VALUES ('glance', 0, ?)").run(JSON.stringify(glance));
