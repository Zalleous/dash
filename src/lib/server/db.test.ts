import { expect, test } from 'vitest';
import { db, tx } from '#lib/server/db.ts';

test('a transaction keeps all of its writes, or none when it throws', () => {
	db.exec('CREATE TABLE tx_test (n INTEGER)');
	const insert = db.prepare('INSERT INTO tx_test VALUES (?)');
	expect(() =>
		tx(() => {
			insert.run(1);
			throw new Error('boom');
		})
	).toThrow('boom');
	expect(tx(() => insert.run(2).changes)).toBe(1);
	expect(db.prepare('SELECT n FROM tx_test').all().map((r) => r.n)).toEqual([2]);
});
