/* Browser checks for the car tile and the other bare tiles, on the real GPU: the car's spot, the gauges, the label
   backgrounds, the draw rate, the alert blink, each view's dimensions and part names, frame times, off screen,
   reduced motion, no WebGL2 and the phone. Start `npm run preview` first. Playwright is not a dependency of this
   repo: PLAYWRIGHT_FROM names a folder whose node_modules has it, else it is imported as usual (a global or linked
   install). With PLAYWRIGHT_BROWSERS_PATH set, Chromium comes from that browser store, else Playwright picks its own.

   PLAYWRIGHT_FROM=/path/to/a/project/with/playwright node scripts/car.mjs http://localhost:4173 [folder for screenshots] [light|dark]

   ponytail: the timings were read once, on the author's laptop GPU. They are targets for it, not gates for
   another one. Takes about 80 s, because it waits for the lock. */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CALLOUTS, HOLD, LOCKED, VIEWS, WIPE } from '../src/lib/art.ts';

const from = process.env.PLAYWRIGHT_FROM;
const { chromium } = from ? createRequire(`${from}/`)('playwright') : await import('playwright');
const [url = 'http://localhost:4173', shots, theme = 'light'] = process.argv.slice(2);
const store = process.env.PLAYWRIGHT_BROWSERS_PATH;
const browser = await chromium.launch({
	executablePath: store && `${store}/${readdirSync(store).find((name) => /^chromium-\d+$/.test(name))}/chrome-linux64/chrome`,
	args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist']
});

let failed = 0;
function rule(name, ok, detail = '') {
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && `: ${detail}`}`);
}

/* Runs in the page before its own code: counts mesh draws, and keeps the long tasks and the layout shift. */
function probe() {
	window.draws = 0;
	const draw = WebGL2RenderingContext.prototype.drawElements;
	WebGL2RenderingContext.prototype.drawElements = function (...args) {
		window.draws++;
		return draw.apply(this, args);
	};
	window.long = [];
	window.shift = 0;
	new PerformanceObserver((list) => list.getEntries().forEach((e) => window.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
	new PerformanceObserver((list) => list.getEntries().forEach((e) => e.hadRecentInput || (window.shift += e.value))).observe({ type: 'layout-shift', buffered: true });
}

async function open(options = {}, ...scripts) {
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: theme, ...options });
	for (const script of [probe, ...scripts]) await context.addInitScript(script);
	const page = await context.newPage();
	page.on('console', (m) => m.type() === 'error' && console.log(`     console: ${m.text()}`));
	await page.goto(url);
	return page;
}

const live = (page) => page.waitForFunction(() => document.querySelector('[data-id=title] .scale dd')?.textContent.startsWith('1:'), null, { timeout: 15_000 });
const until = (page, ms) => page.waitForFunction((ms) => performance.now() >= ms, ms, { timeout: 90_000 });
const shot = (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
/* The long tasks of a page so far, longest first, as text. */
const tasks = async (page) => {
	const list = (await page.evaluate(() => window.long)).sort((a, b) => b[1] - a[1]);
	return { longest: list[0]?.[1] ?? 0, text: list.map(([at, ms]) => `${ms.toFixed(0)} ms at ${(at / 1000).toFixed(1)} s`).join(', ') || 'none' };
};
/* Canvas pixels in the signal red at t seconds into the cycle: with the lights lit, then not. */
const reds = (page, t) =>
	page.evaluate((t) => {
		const canvas = document.querySelector('[data-id=car] canvas');
		const copy = document.createElement('canvas');
		copy.width = canvas.width;
		copy.height = canvas.height;
		const g = copy.getContext('2d');
		return [true, false].map((lit) => {
			canvas.draw(t, lit);
			g.clearRect(0, 0, copy.width, copy.height);
			g.drawImage(canvas, 0, 0);
			const { data } = g.getImageData(0, 0, copy.width, copy.height);
			let n = 0;
			for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 96 && data[i] > 2 * data[i + 2]) n++;
			return n;
		});
	}, t);

/* Mesh draws per second over the next ms. */
async function draws(page, ms) {
	const a = await page.evaluate(() => [window.draws, performance.now()]);
	await page.waitForTimeout(ms);
	const b = await page.evaluate(() => [window.draws, performance.now()]);
	return ((b[0] - a[0]) * 1000) / (b[1] - a[1]);
}

/* 1920x1080: layout, then the turn, then the lock. The page opens 12 s before the lock. */
const page = await open();
await live(page);
console.log(
	await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const info = gl.getExtension('WEBGL_debug_renderer_info');
		return `     ${gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)}`;
	})
);
const layout = await page.evaluate(() => {
	const rect = (q) => document.querySelector(q).getBoundingClientRect();
	const bare = [];
	for (const tile of document.querySelectorAll('.board .bare')) {
		const walk = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
		while (walk.nextNode()) {
			const text = walk.currentNode.textContent.trim();
			let el = walk.currentNode.parentElement;
			if (!text || el.closest('.face')) continue;
			while (el !== tile && !getComputedStyle(el).backgroundColor.startsWith('rgb(')) el = el.parentElement;
			if (el === tile) bare.push(text);
		}
	}
	const board = rect('.board');
	const car = rect('[data-id=car]');
	const cell = board.width / 24;
	const spot = [(car.left - board.left) / cell, (car.top - board.top) / 24, car.width / cell, car.height / 24].map((n) => Math.round(n * 10) / 10);
	return { spot, todo: rect('[data-id=todo]').top / innerHeight, bare };
});
rule('the car tile sits at its glance spot, 7,0 and 17 x 16 cells', layout.spot.join() === '7,0,17,16', layout.spot.join());
rule('the panels start above 60% of the viewport', layout.todo <= 0.6, `${(layout.todo * 100).toFixed(1)}%`);

/* Each gauge is a row of whole cells, and its filled cells show its value: # is one cell, : is half a cell. */
const gauges = await page.evaluate(() =>
	[...document.querySelectorAll('.gauge')].map((gauge) => {
		const track = gauge.querySelector('b');
		const probe = track.appendChild(document.createElement('u'));
		probe.style.cssText = 'flex: none; width: 1ch';
		const ch = probe.getBoundingClientRect().width;
		probe.remove();
		const cells = track.getBoundingClientRect().width / ch;
		const full = parseFloat(getComputedStyle(track, '::before').width) / ch;
		const half = track.querySelector('i').getBoundingClientRect().width / ch;
		const want = (parseFloat(getComputedStyle(gauge).getPropertyValue('--w')) / 100) * cells;
		return { cells, full, half, off: Math.abs(full + half / 2 - want) };
	})
);
const whole = (n) => Math.abs(n - Math.round(n)) < 0.02;
const wrong = gauges.filter((g) => g.cells < 4 || !whole(g.cells) || !whole(g.full) || !whole(g.half) || g.off > 0.26);
rule('gauges fill in whole cells and show their value', gauges.length > 0 && !wrong.length, `${gauges.length} gauges${wrong.length ? `, ${wrong.length} wrong, first ${JSON.stringify(wrong[0])}` : ''}`);
rule('every text on a bare tile, except the clock digits, has an opaque background', !layout.bare.length, layout.bare.join(' | '));

await until(page, 4000);
const turning = await draws(page, 3000);
rule('11 to 13 draws per second while turning', turning >= 11 && turning <= 13, turning.toFixed(1));
await shot(page, 'turn');

await until(page, 18_000);
const held = await draws(page, 3000);
/* Under a red alert the lights blink, which is two draws a second. Only the alerts panel tells the car, so the blink
   rules need it on the board. */
const panel = await page.evaluate(() => !!document.querySelector('[data-id=alerts]'));
const alert = await page.evaluate(() => !!document.querySelector('[data-id=alerts] .row.red'));
rule(alert ? 'only the blink is drawn while the lock holds' : 'no draws while the lock holds', (alert ? held > 1.5 && held < 2.5 : held === 0) && (await page.evaluate(() => document.querySelector('.car').classList.contains('lock'))), held.toFixed(1));
await shot(page, 'lock');
const busy = await tasks(page); // read here: the measuring below is one long task of its own
const shift = await page.evaluate(() => window.shift);

/* A red alert, faked here: the lights blink once a second, and stop when the alert clears. */
if (!panel) console.log('skip  the blink: no alerts panel on the board');
else if (!alert) {
	await page.route('**/api/alerts', (route) => route.fulfill({ json: [{ level: 'red', text: 'rule check' }] }));
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForSelector('[data-id=alerts] .row.red', { state: 'attached' });
	const blinking = await draws(page, 3000);
	await page.unroute('**/api/alerts');
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForSelector('[data-id=alerts] .row.red', { state: 'detached' });
	await page.waitForTimeout(300);
	const after = await draws(page, 1000);
	rule('a red alert blinks the lights once a second, and only while it stands', blinking > 1.5 && blinking < 2.5 && after === 0, `${blinking.toFixed(1)} draws per second, then ${after.toFixed(1)}`);
}

/* Each view in turn. The hook goes to the view's hold and stays there; the dimensions and the part names
   then take 1.6 s to draw in. */
for (const [i, view] of VIEWS.entries()) {
	const t = LOCKED[i] + WIPE + 5;
	await page.evaluate((t) => document.querySelector('[data-id=car] canvas').draw(t), t);
	await page.waitForTimeout(1600);
	await shot(page, view.name);
	const seen = await page.evaluate((t) => {
		const canvas = document.querySelector('[data-id=car] canvas');
		const k = canvas.width / canvas.getBoundingClientRect().width;
		const left = Math.floor((document.querySelector('[data-id=car] .stage').getBoundingClientRect().left - canvas.getBoundingClientRect().left) * k);
		canvas.draw(t);
		const copy = document.createElement('canvas');
		copy.width = canvas.width;
		copy.height = canvas.height;
		const g = copy.getContext('2d');
		g.drawImage(canvas, 0, 0);
		const { data } = g.getImageData(0, 0, copy.width, copy.height);
		const ink = (x, y) => data[(y * copy.width + x) * 4 + 3] > 96;
		let [x0, x1, y0, y1] = [Infinity, 0, Infinity, 0];
		for (let y = 0; y < copy.height; y++)
			for (let x = left; x < copy.width; x++)
				if (ink(x, y)) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
		/* Where each tyre stands: the middle of the lowest ink, left and right of the middle of the car. */
		const mid = (x0 + x1) >> 1;
		const feet = [[x0, mid], [mid, x1 + 1]].map(([from, to]) => {
			for (let y = y1; y > y0; y--) {
				const xs = [];
				for (let x = from; x < to; x++) if (ink(x, y) || ink(x, y - 1) || ink(x, y - 2)) xs.push(x);
				if (xs.length) return (xs[0] + xs.at(-1) + 1) / 2 / k;
			}
		});
		/* A dimension with an upright label measures the outline from top to bottom, any other from left to right: the
		   ink within 30 px of its own ends, so that beside its twin each end view has its own width. */
		const across = ([a, b]) => {
			let [u, v] = [Infinity, 0];
			for (let y = y0; y <= y1; y++)
				for (let x = Math.max(left, Math.floor((a - 30) * k)); x < Math.min(copy.width, Math.ceil((b + 30) * k)); x++) if (ink(x, y)) [u, v] = [Math.min(u, x), Math.max(v, x)];
			return [u / k, (v + 1) / k];
		};
		const off = [];
		for (const path of document.querySelectorAll('[data-id=car] path[data-dim]')) {
			const name = path.dataset.dim;
			const ends = path.dataset.ends.split(',').map(Number);
			const upright = document.querySelector(`[data-id=car] span[data-dim="${name}"]`).classList.contains('up');
			const outline = name === 'wheelbase' ? feet : upright ? [y0 / k, (y1 + 1) / k] : across(ends);
			off.push([name, Math.max(...ends.map((v, i) => Math.abs(v - outline[i])))]);
		}
		const tile = document.querySelector('[data-id=car]').getBoundingClientRect();
		const labels = [...document.querySelectorAll('[data-id=car] .dims span')].map((span) => span.getBoundingClientRect());
		return {
			off,
			names: document.querySelectorAll('[data-id=car] .dims span.lead').length,
			inside: labels.every((r) => r.left >= tile.left && r.right <= tile.right && r.top >= tile.top && r.bottom <= tile.bottom),
			apart: labels.every((a, i) => labels.every((b, j) => j <= i || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top))
		};
	}, t);
	const off = seen.off.map(([name, v]) => `${name} ${v.toFixed(1)}`);
	rule(`${view.name}: dimension ends are within 2 px of the drawn outline`, off.length > 1 && seen.off.every(([, v]) => v <= 2), off.join(', '));
	const names = CALLOUTS[view.name].length;
	rule(`${view.name}: every part name shows, inside the car's tile and clear of the other labels`, seen.names === names && seen.inside && seen.apart, `${seen.names} of ${names}${seen.inside ? '' : ', a label leaves the tile'}${seen.apart ? '' : ', two labels meet'}`);
	const red = await reds(page, t);
	rule(`${view.name}: the lights are red when lit, and only then`, red[0] > 100 && red[1] === 0, red.join(' and '));
}
const red = await reds(page, LOCKED[0] - 20);
rule('turning: the lights are red when lit, and only then', red[0] > 100 && red[1] === 0, red.join(' and '));

/* Seconds into the cycle: the turn and the swing into the plan view, both wipes of two views, each hold. */
const steps = {
	turn: [10, 20, 30, 40, 50, 60, 65, LOCKED[2] - 3, LOCKED[2] - 1.5],
	wipe: [0, 2].flatMap((i) => [0.4, 0.9, 1.4, 1.9, WIPE + HOLD + 0.5, WIPE + HOLD + 1.1, WIPE + HOLD + 1.7].map((d) => LOCKED[i] + d)),
	lock: LOCKED.map((at) => at + WIPE + 3)
};
/* The steps above leave the dimension lines in a transition, so the compositor draws 60 frames a second. A frame
   that lands inside a measure adds its own GPU time (about 6 ms on this GPU), so wait until the page is still. */
await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState !== 'running'));
const drawn = await page.evaluate((steps) => {
	const canvas = document.querySelector('[data-id=car] canvas');
	const gl = canvas.getContext('webgl2');
	/* Time until the GPU has finished. Reading a pixel back waits for it; `idle` is what that wait costs alone. */
	const pixel = new Uint8Array(4);
	const time = (work) => {
		const a = performance.now();
		work();
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return performance.now() - a;
	};
	const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
	const idle = median(Array.from({ length: 9 }, () => time(() => {})));
	return { idle, ...Object.fromEntries(Object.entries(steps).map(([name, ts]) => [name, median(ts.map((t) => time(() => canvas.draw(t)))) - idle])) };
}, steps);
rule('a turn step takes at most 8 ms', drawn.turn <= 8, `${drawn.turn.toFixed(1)} ms, plus ${drawn.idle.toFixed(1)} ms to read it back`);
rule('a wipe or lock frame takes at most 12 ms', Math.max(drawn.wipe, drawn.lock) <= 12, `wipe ${drawn.wipe.toFixed(1)} ms, lock ${drawn.lock.toFixed(1)} ms`);
rule('no long task over 100 ms', busy.longest <= 100, busy.text);
rule('layout shift is at most 0.01', shift <= 0.01, shift.toFixed(4));

/* Off screen while it would be turning. */
const away = await open({ viewport: { width: 1920, height: 400 } });
await live(away);
await until(away, 3200);
await away.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
await away.waitForTimeout(300);
const hidden = await away.evaluate(() => document.querySelector('[data-id=car]').getBoundingClientRect().bottom < 0);
const unseen = await draws(away, 1500);
rule('no draws off screen', hidden && unseen === 0, hidden ? unseen.toFixed(1) : 'the car did not leave the viewport');
await away.evaluate(() => scrollTo(0, 0));
const back = await draws(away, 1500);
rule('draws again once back on screen', back > 8, back.toFixed(1));

const calm = await open({ reducedMotion: 'reduce' });
await live(calm);
await calm.waitForTimeout(1500);
const still = await draws(calm, 2000);
const side = await calm.evaluate(() => document.querySelector('.car').classList.contains('lock') && document.querySelector('[data-id=title] .view dd').textContent);
rule('reduced motion shows one still side elevation', still === 0 && side === 'side elevation', `${still.toFixed(1)} draws per second, view "${side}"`);
await shot(calm, 'still');

const plain = await open({}, () => (HTMLCanvasElement.prototype.getContext = () => null));
await plain.waitForTimeout(3000);
console.log(`     long tasks without the art: ${(await tasks(plain)).text}`);
const face = await plain.evaluate(() => document.querySelector('.face').textContent);
rule('without WebGL2 the clock still shows', /^\d\d:\d\d$/.test(face), face);
await shot(plain, 'plain');

const phone = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await live(phone);
await until(phone, 18_000);
const narrow = await phone.evaluate(() => ({ wide: document.documentElement.scrollWidth - innerWidth, dims: getComputedStyle(document.querySelector('[data-id=car] .dims')).display }));
rule('at 390 px nothing overflows and the dimension lines are hidden', narrow.wide <= 0 && narrow.dims === 'none', `overflow ${narrow.wide} px, .dims ${narrow.dims}`);
await shot(phone, 'phone');

await browser.close();
process.exit(failed ? 1 : 0);
