import { expect, test } from 'vitest';
import { daysLeft, hms, isoDay, pad2 } from '#lib/time.ts';

const noon = new Date(2026, 9, 31, 12);

test('days left', () => {
	expect(daysLeft('2026-10-31', noon)).toBe(0);
	expect(daysLeft('2026-11-01', noon)).toBe(1);
	expect(daysLeft('2026-10-29', noon)).toBe(-2);
});

test('across the DST change', () => {
	expect(daysLeft('2026-11-02', new Date(2026, 9, 31, 23, 59))).toBe(2);
	expect(daysLeft('2027-03-15', new Date(2027, 2, 13, 0, 1))).toBe(2);
});

test('a local day, two digits, a span as hh:mm:ss', () => {
	expect(isoDay(noon)).toBe('2026-10-31');
	expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	expect(pad2(7)).toBe('07');
	expect(pad2(12)).toBe('12');
	expect(hms(0)).toBe('00:00:00');
	expect(hms(90_061_999)).toBe('25:01:01');
});
