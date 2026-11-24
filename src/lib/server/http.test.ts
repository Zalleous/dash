import { expect, test } from 'vitest';
import { unset } from '#lib/poll.svelte.ts';
import { env } from '#lib/server/http.ts';

test('a missing key names every key, and panels read it as not set up', () => {
	expect(() => env('ZZ_A', 'ZZ_B')).toThrow('not set up: ZZ_A, ZZ_B');
	expect(unset('not set up: ZZ_A, ZZ_B')).toBe(true);
	expect(unset('example.com: HTTP 500')).toBe(false);
	expect(unset(null)).toBe(false);
});
