import { expect, test } from 'vitest';
import { parseQuickAdd } from '#lib/quickadd.ts';

const monday = new Date(2026, 9, 12);

test('plain text defaults', () => {
	expect(parseQuickAdd('buy milk', [], monday)).toEqual({ title: 'buy milk', board: 'Personal', priority: '🟢', due: '' });
});

test('tokens', () => {
	expect(parseQuickAdd('fix #engineering bazarr !1 @fri', ['Engineering'], monday)).toEqual({
		title: 'fix bazarr',
		board: 'Engineering',
		priority: '🔴',
		due: '2026-10-16'
	});
	expect(parseQuickAdd('a @mon', [], monday).due).toBe('2026-10-19');
	expect(parseQuickAdd('a @tomorrow', [], monday).due).toBe('2026-10-13');
	expect(parseQuickAdd('a @+10', [], monday).due).toBe('2026-10-22');
	expect(parseQuickAdd('email @someone', [], monday)).toMatchObject({ title: 'email @someone', due: '' });
});
