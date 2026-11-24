import { expect, test } from 'vitest';
import { addCard, appendLog, BLANK_BOARD, parseBoard, tickCard } from '#lib/server/kanban.ts';

const board = `---

kanban-plugin: board

---

## 📥 Backlog

- [ ] 🟢 **Pin images** · @{2026-10-31}
\tSupply-chain risk. [[Media Stack]]
- [ ] plain obsidian card

## ✅ Done

- [x] ~~🟡 **Old thing**~~ ✅ 2026-10-08
\tNotes.


%% kanban:settings
\`\`\`
{"kanban-plugin":"board"}
\`\`\`
%%
`;

test('parse', () => {
	const cards = parseBoard(board);
	expect(cards.map((c) => [c.lane, c.done, c.priority, c.title, c.due, c.desc])).toEqual([
		['📥 Backlog', false, '🟢', 'Pin images', '2026-10-31', 'Supply-chain risk. [[Media Stack]]'],
		['📥 Backlog', false, '', 'plain obsidian card', null, ''],
		['✅ Done', true, '🟡', 'Old thing', null, 'Notes.']
	]);
	expect(parseBoard(BLANK_BOARD)).toEqual([]);
});

test('tick moves the card to the top of Done in house format', () => {
	const out = tickCard(board, '- [ ] 🟢 **Pin images** · @{2026-10-31}', '2026-10-12');
	expect(out).toBe(
		board
			.replace('- [ ] 🟢 **Pin images** · @{2026-10-31}\n\tSupply-chain risk. [[Media Stack]]\n', '')
			.replace(
				'## ✅ Done\n\n',
				'## ✅ Done\n\n- [x] ~~🟢 **Pin images**~~ ✅ 2026-10-12\n\tSupply-chain risk. [[Media Stack]]\n'
			)
	);
	expect(() => tickCard(board, '- [ ] gone', '2026-10-12')).toThrow();
});

test('add appends to the end of the first lane', () => {
	const out = addCard(board, { title: 'New', priority: '🔴', due: '2026-11-01', desc: 'Why.' });
	expect(out).toBe(
		board.replace('- [ ] plain obsidian card\n', '- [ ] plain obsidian card\n- [ ] 🔴 **New** · @{2026-11-01}\n\tWhy.\n')
	);
	expect(addCard(BLANK_BOARD, { title: 'First', priority: '' })).toContain('## 📥 Backlog\n\n- [ ] **First**\n');
});

test('appendLog adds a bullet at the end of Work Log', () => {
	const note = '# day\n\n## 💼 Work Log\n\n- a\n- b\n\n---\n\n## 🌙 Evening\n';
	expect(appendLog(note, 'c')).toBe(note.replace('- b\n', '- b\n- c\n'));
	expect(appendLog('## 💼 Work Log\n\n---\n', 'c')).toBe('## 💼 Work Log\n\n- c\n---\n');
	expect(() => appendLog('# nothing\n', 'c')).toThrow();
});
