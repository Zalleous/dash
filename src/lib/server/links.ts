import { readFileSync } from 'node:fs';
import type { Link } from '#lib/links.ts';
import { msg } from '#lib/msg.ts';

/* The links (Ctrl+K, the uptime probes, the alerts' and media's links), from LINKS_FILE or ./links.json in the
   working directory (links.example.json shows the fields); none without the file.
   ponytail: read once, at startup; a change to the file needs a restart. */
const path = process.env.LINKS_FILE || './links.json';

function read(): Link[] {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw e;
	}
	try {
		return JSON.parse(text);
	} catch (e) {
		throw new Error(`${path} is not valid JSON: ${msg(e)}`);
	}
}

export const links = read();
