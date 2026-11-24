
type Card = {
	raw: string;
	lane: string;
	done: boolean;
	priority: string;
	title: string;
	due: string | null;
	desc: string;
};

type NewCard = { title: string; priority: string; due?: string; desc?: string };

const CARD = /^- \[[ x]\] /;
export const HOUSE = /^- \[([ x])\] (?:~~)?(?:(🔴|🟡|🟢) )?\*\*(.+?)\*\*(?:~~)?(?: · @\{(\d{4}-\d{2}-\d{2})\})?/;

function lanes(lines: string[]) {
	const end = lines.findIndex((l) => l.startsWith('%% kanban:settings'));
	const stop = end === -1 ? lines.length : end;
	const heads = lines.flatMap((l, i) => (i < stop && l.startsWith('## ') ? [i] : []));
	return heads.map((head, n) => ({ name: lines[head].slice(3).trim(), head, end: heads[n + 1] ?? stop }));
}

function blockEnd(lines: string[], i: number) {
	let j = i + 1;
	while (j < lines.length && /^(\t| {2,})\S/.test(lines[j])) j++;
	return j;
}

export function parseBoard(md: string): Card[] {
	const lines = md.split('\n');
	return lanes(lines).flatMap(({ name, head, end }) => {
		const cards: Card[] = [];
		for (let i = head + 1; i < end; i++) {
			if (!CARD.test(lines[i])) continue;
			const j = blockEnd(lines, i);
			const m = lines[i].match(HOUSE);
			cards.push({
				raw: lines[i],
				lane: name,
				done: lines[i][3] === 'x',
				priority: m?.[2] ?? '',
				title: m?.[3] ?? lines[i].slice(6).trim(),
				due: m?.[4] ?? null,
				desc: lines.slice(i + 1, j).map((l) => l.trim()).join(' ')
			});
			i = j - 1;
		}
		return cards;
	});
}

export function tickCard(md: string, raw: string, today: string): string {
	const lines = md.split('\n');
	const ls = lanes(lines);
	const i = lines.findIndex((l, n) => l === raw && n < (ls.at(-1)?.end ?? 0) && CARD.test(l));
	if (i === -1 || raw[3] === 'x') throw new Error('card not found');
	const j = blockEnd(lines, i);
	const m = raw.match(HOUSE);
	const first = m
		? `- [x] ~~${m[2] ? m[2] + ' ' : ''}**${m[3]}**~~ ✅ ${today}`
		: `- [x] ~~${raw.slice(6).trim()}~~ ✅ ${today}`;
	const block = [first, ...lines.slice(i + 1, j)];
	lines.splice(i, j - i);
	const done = lanes(lines).find((l) => /done/i.test(l.name)) ?? lanes(lines).at(-1)!;
	let at = done.head + 1;
	if (lines[at] === '') at++;
	lines.splice(at, 0, ...block);
	return lines.join('\n');
}

export function addCard(md: string, card: NewCard): string {
	const lines = md.split('\n');
	const lane = lanes(lines)[0];
	if (!lane) throw new Error('board has no lanes');
	let at = lane.head + 1;
	if (lines[at] === '') at++;
	for (let i = at; i < lane.end; i++) if (CARD.test(lines[i])) at = blockEnd(lines, i);
	const first = `- [ ] ${card.priority ? card.priority + ' ' : ''}**${card.title}**${card.due ? ` · @{${card.due}}` : ''}`;
	lines.splice(at, 0, first, ...(card.desc ? [`\t${card.desc}`] : []));
	return lines.join('\n');
}

export const BLANK_BOARD = `---

kanban-plugin: board

---

## 📥 Backlog



## 🏃 Sprint



## 🔨 In Progress



## ✅ Done




%% kanban:settings
\`\`\`
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
\`\`\`
%%
`;

export function appendLog(md: string, text: string): string {
	const lines = md.split('\n');
	const head = lines.findIndex((l) => /^## .*Work Log/.test(l));
	if (head === -1) throw new Error('daily note has no Work Log section');
	let at = head + 1;
	for (let i = head + 1; i < lines.length && !/^(## |---$)/.test(lines[i]); i++) if (lines[i].trim()) at = i + 1;
	if (at === head + 1 && lines[at] === '') at++;
	lines.splice(at, 0, `- ${text}`);
	return lines.join('\n');
}
