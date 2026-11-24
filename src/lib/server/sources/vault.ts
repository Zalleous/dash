import { cached, env, forget, giteaApi } from '#lib/server/http.ts';
import { addCard, appendLog, BLANK_BOARD, HOUSE, parseBoard, tickCard } from '#lib/server/kanban.ts';
import { isoDay } from '#lib/time.ts';

/* VAULT_REPO is the vault's Gitea repo (owner/name); the folders are paths in it. */
const BOARDS = process.env.VAULT_BOARDS || 'boards';
const PROJECTS = process.env.VAULT_PROJECTS || 'wiki/projects';
const DAILY = process.env.VAULT_DAILY || 'wiki/daily';

const contents = (path: string) => `/api/v1/repos/${env('VAULT_REPO')[0]}/contents/${encodeURI(path)}`;

async function read(path: string) {
	const f = await giteaApi(contents(path), {}, { allow404: true });
	if (!f) return null;
	return { text: Buffer.from(f.content, 'base64').toString('utf8'), sha: f.sha as string };
}

async function edit(path: string, message: string, change: (text: string | null) => string) {
	for (let attempt = 0; ; attempt++) {
		const f = await read(path);
		const content = Buffer.from(change(f?.text ?? null), 'utf8').toString('base64');
		try {
			await giteaApi(contents(path), {
				method: f ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, sha: f?.sha, message })
			});
			forget('vault');
			return { ok: true };
		} catch (e) {
			if (attempt) throw e;
		}
	}
}

export const todos = () =>
	cached('vault:todos', 60_000, async () => {
		const dir: { name: string; type: string }[] = await giteaApi(contents(BOARDS));
		const boards = dir.filter((f) => f.type === 'file' && f.name.endsWith('.md')).map((f) => f.name.slice(0, -3));
		const all = (
			await Promise.all(
				boards.map(async (board) => parseBoard((await read(`${BOARDS}/${board}.md`))?.text ?? '').map((c) => ({ ...c, board })))
			)
		).flat();
		const day = isoDay();
		return {
			boards,
			cards: all.filter((c) => !c.done),
			/* Lets a ticked card hide its calendar deadline.
			   ponytail: an old done card with the same title as a later deadline hides it too; keep only cards done in the
			   last 60 days if that bites. */
			done: all.filter((c) => c.done).map((c) => c.title),
			doneToday: all.filter((c) => c.done && c.raw.endsWith(`✅ ${day}`)).length
		};
	});

export const projects = () =>
	cached('vault:projects', 600_000, async () => {
		const dir: { name: string; type: string }[] = await giteaApi(contents(PROJECTS));
		/* The vault marks archived projects with an _archived_ name prefix. */
		return dir.filter((f) => f.type === 'file' && f.name.endsWith('.md') && !f.name.startsWith('_archived_')).map((f) => f.name.slice(0, -3));
	});

const BOARD = /^[\w -]{1,40}$/;
const PRIORITY = ['', '🔴', '🟡', '🟢'];
const clean = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function board(v: unknown) {
	const b = clean(v, 40);
	if (!BOARD.test(b)) throw new Error('bad board name');
	return b;
}

export async function vault(body: Record<string, unknown>) {
	if (body.op === 'tick') {
		const raw = String(body.raw ?? '');
		return edit(`${BOARDS}/${board(body.board)}.md`, `dash: done ${clean(raw.match(HOUSE)?.[3] ?? raw.slice(6), 80)}`, (t) => tickCard(t ?? '', raw, isoDay()));
	}
	if (body.op === 'add') {
		const title = clean(body.title);
		const priority = String(body.priority ?? '');
		const due = clean(body.due, 10);
		if (!title || !PRIORITY.includes(priority) || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) throw new Error('bad card');
		return edit(`${BOARDS}/${board(body.board)}.md`, `dash: add ${title}`, (t) =>
			addCard(t ?? BLANK_BOARD, { title, priority, due, desc: clean(body.desc, 500) })
		);
	}
	if (body.op === 'capture') {
		const text = clean(body.text, 500);
		if (!text) throw new Error('empty capture');
		return edit(`${DAILY}/${isoDay()}.md`, `dash: capture`, (t) => {
			if (t === null) throw new Error('no daily note yet today');
			return appendLog(t, text);
		});
	}
	throw new Error('unknown op');
}
