import { isoDay } from '#lib/time.ts';

/* A card's priority as a number, shown as !1 to !3; .p1 and .p2 (app.css) stand out. */
export const LEVEL: Record<string, number> = { '🔴': 1, '🟡': 2, '🟢': 3 };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function when(s: string, today: Date) {
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	const day = DAYS.indexOf(s.slice(0, 3).toLowerCase());
	const add =
		s === 'today' ? 0
		: s === 'tomorrow' ? 1
		: /^\+\d+$/.test(s) ? Number(s.slice(1))
		: day !== -1 ? ((day - today.getDay() + 6) % 7) + 1
		: null;
	if (add === null) return null;
	const d = new Date(today);
	d.setDate(d.getDate() + add);
	return isoDay(d);
}

export function parseQuickAdd(input: string, boards: string[], today = new Date()) {
	let board = 'Personal';
	let priority = '🟢';
	let due = '';
	const words = input
		.trim()
		.split(/\s+/)
		.filter((w) => {
			let m: RegExpMatchArray | null;
			if ((m = w.match(/^#([\w-]+)$/))) {
				board = boards.find((b) => b.toLowerCase() === m![1].toLowerCase()) ?? m[1];
				return false;
			}
			if ((m = w.match(/^!([123])$/))) {
				priority = ['🔴', '🟡', '🟢'][Number(m[1]) - 1];
				return false;
			}
			const d = w.startsWith('@') && when(w.slice(1), today);
			if (d) {
				due = d;
				return false;
			}
			return true;
		});
	return { title: words.join(' '), board, priority, due };
}
