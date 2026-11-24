import { gsap } from '#lib/motion.ts';
import { tick } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { SvelteSet } from 'svelte/reactivity';

/* Adding a todo or a log, like an XP orb: a caret sweep highlights the typed text, the highlight squashes
   into a cube, and the cube is pulled into the todo row it became. A log has no panel: it sweeps and dings. */

/** Titles of new todos, hidden in the list until their cube lands. */
export const incoming = new SvelteSet<string>();
/** Titles of rows playing the write-in. */
export const writing = new SvelteSet<string>();

export type To = { todo: string } | { log: string };

const SIZE = 16;
let audio: AudioContext | undefined;

/** A short bell with a random pitch. Only sounds once deliver() has unlocked audio from a key or click. */
function ding() {
	if (!audio) return;
	const t = audio.currentTime;
	const f = 1320 * (0.85 + Math.random() * 0.3);
	for (const [mul, vol] of [
		[1, 0.1],
		[2.76, 0.03]
	]) {
		const o = audio.createOscillator();
		const g = audio.createGain();
		o.frequency.value = f * mul;
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(vol, t + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
		o.connect(g).connect(audio.destination);
		o.start(t);
		o.stop(t + 0.5);
	}
}

const div = (cls: string, parent: Element) => parent.appendChild(Object.assign(document.createElement('div'), { className: cls }));

const svg = (tag: string, parent: Element) => parent.appendChild(document.createElementNS('http://www.w3.org/2000/svg', tag));

/* Anime speed trail: a streak over the last 120 ms of the path, so it stretches as the cube speeds up and
   pulls in behind it when it stops, plus speed lines that flick off behind it, more often the faster it goes. */
function trail(fx: Element, streak: Element, path: number[][], x: number, y: number, s: number) {
	const now = performance.now();
	path.push([x, y, now]);
	while (now - path[0][2] > 120) path.shift();
	const n = path.length;
	const left: string[] = [];
	const right: string[] = [];
	path.forEach(([px, py], i) => {
		const [ax, ay] = path[Math.max(0, i - 1)];
		const [bx, by] = path[Math.min(n - 1, i + 1)];
		const r = (5 * s * Math.sqrt(i / Math.max(1, n - 1))) / (Math.hypot(bx - ax, by - ay) || 1);
		left.push(`${px - (by - ay) * r},${py + (bx - ax) * r}`);
		right.unshift(`${px + (by - ay) * r},${py - (bx - ax) * r}`);
	});
	streak.setAttribute('d', `M${left.join('L')}L${right.join('L')}Z`);

	if (n < 2) return;
	const [px, py, pt] = path[n - 2];
	const d = Math.hypot(x - px, y - py);
	const v = d / Math.max(1, now - pt);
	if (!d || Math.random() > v / 2) return;
	const ux = (x - px) / d;
	const uy = (y - py) / d;
	const off = gsap.utils.random(-14, 14);
	const back = gsap.utils.random(8, 30);
	const len = gsap.utils.random(15, 30) * v;
	const sx = x - ux * back - uy * off;
	const sy = y - uy * back + ux * off;
	const line = svg('line', fx);
	gsap.set(line, { attr: { x1: sx, y1: sy, x2: sx - ux * len, y2: sy - uy * len, 'stroke-width': gsap.utils.random(1, 2) } });
	gsap.to(line, { x: -ux * len * 0.6, y: -uy * len * 0.6, opacity: 0, duration: 0.16, ease: 'power1.out', onComplete: () => line.remove() });
}

function find(to: { todo: string }) {
	const p = document.querySelector('section.panel[data-id="todo"]');
	const row = [...(p?.querySelectorAll('li') ?? [])].find((li) => li.querySelector('.title')?.textContent === to.todo);
	// A card outside the now set lands on its '+n later' row.
	return row?.querySelector('.check') ?? p?.querySelector('.more') ?? p?.querySelector('h2');
}

/* Scrolls el into view inside its panel's own scroll box, never the page. */
function reveal(el: Element) {
	for (let p = el.parentElement; p && !p.classList.contains('panel'); p = p.parentElement) {
		if (p.scrollHeight <= p.clientHeight || !/auto|scroll/.test(getComputedStyle(p).overflowY)) continue;
		const a = el.getBoundingClientRect();
		const b = p.getBoundingClientRect();
		if (a.top < b.top || a.bottom > b.bottom) p.scrollTo({ top: p.scrollTop + a.top - b.top - p.clientHeight / 2, behavior: 'smooth' });
		return;
	}
}

/**
 * Plays the orb for one capture. `req` is the save plus the reload that brings the new row or line in.
 * `swept` runs once the text is highlighted, to clear the input or close the palette.
 * Rejects with the save's error after the cube drops, so the caller can put the text back.
 */
export async function deliver(input: HTMLInputElement, req: Promise<unknown>, to: To, swept: () => void) {
	req.catch(() => {}); // handled later; a fast failure would otherwise log as unhandled while the sweep plays
	audio ??= new AudioContext();
	if (audio.state === 'suspended') audio.resume();
	if (prefersReducedMotion.current || 'log' in to) {
		swept();
		await req;
		ding();
		return;
	}
	incoming.add(to.todo);
	try {
		await fly(input, req, to, swept);
	} finally {
		incoming.delete(to.todo);
	}
}

async function fly(input: HTMLInputElement, req: Promise<unknown>, to: { todo: string }, swept: () => void) {
	let layer = document.querySelector('.orb-layer');
	layer ??= div('orb-layer', document.body);

	// Highlight: a copy of the visible text over the input, revealed left to right behind a caret.
	const cs = getComputedStyle(input);
	const px = (k: string) => parseFloat(cs.getPropertyValue(k));
	const r = input.getBoundingClientRect();
	const left = r.left + px('border-left-width') + px('padding-left');
	const top = r.top + px('border-top-width') + px('padding-top');
	const height = input.clientHeight - px('padding-top') - px('padding-bottom');
	const clip = div('orb-clip', layer);
	const text = clip.appendChild(document.createElement('span'));
	text.textContent = input.value;
	Object.assign(text.style, {
		left: `${-input.scrollLeft}px`,
		lineHeight: `${height}px`,
		fontFamily: cs.fontFamily,
		fontSize: cs.fontSize,
		fontWeight: cs.fontWeight,
		letterSpacing: cs.letterSpacing
	});
	const w = Math.max(4, Math.min(text.offsetWidth - input.scrollLeft, input.clientWidth - px('padding-left') - px('padding-right')));
	const caret = div('orb-caret', layer);
	gsap.set(clip, { x: left, y: top, width: w, height });
	gsap.set(caret, { x: left, y: top - 2, height: height + 4 });
	await gsap
		.timeline({ defaults: { duration: 0.4, ease: 'power2.inOut' } })
		.fromTo(clip, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' })
		.to(caret, { x: left + w }, 0);
	swept();
	caret.remove();

	// Squash into a cube that pops up, then bobs and tumbles while the save runs.
	await gsap.to(clip, { scaleX: SIZE / w, scaleY: SIZE / height, duration: 0.22, ease: 'power3.in' });
	const cube = div('orb-cube', layer);
	cube.innerHTML = `<b>${'<i></i>'.repeat(6)}</b>`;
	const x0 = left + w / 2;
	gsap.set(cube, { x: x0, y: top + height / 2, xPercent: -50, yPercent: -50 });
	clip.remove();
	const spin = gsap.to(cube.firstChild, { rotationX: '+=360', rotationY: '+=720', duration: 1.6, repeat: -1, ease: 'none' });
	const pop = gsap.to(cube, { y: '-=28', duration: 0.35, ease: 'back.out(2)' });
	const bob = gsap.to(cube, { y: '+=5', duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 0.35 });
	const done = () => {
		spin.kill();
		cube.remove();
	};

	try {
		await Promise.all([req, pop]);
	} catch (e) {
		pop.kill();
		bob.kill();
		cube.classList.add('fail');
		await gsap.to(cube, { y: '+=90', opacity: 0, rotation: 120, duration: 0.55, ease: 'power2.in' });
		done();
		throw e;
	}

	await tick();
	const target = find(to);
	pop.kill();
	bob.kill();
	if (!target) return done();
	reveal(target);

	// Flight: a curve that arcs up, then speeds into the target, re-aimed every frame as rows flip and scroll.
	const y0 = gsap.getProperty(cube, 'y') as number;
	// A target off screen (far down on a phone) is aimed at the nearest point of the screen edge.
	const aim = () => {
		const t = target.getBoundingClientRect();
		const x = t.left + t.width / 2;
		const y = t.top + t.height / 2;
		const cx = gsap.utils.clamp(SIZE, innerWidth - SIZE, x);
		const cy = gsap.utils.clamp(SIZE, innerHeight - SIZE, y);
		return [cx, cy, cx === x && cy === y ? Math.min(t.width, t.height, SIZE) / SIZE : 1];
	};
	const [ex, ey] = aim();
	const fx = layer.insertBefore(svg('svg', layer), cube);
	fx.classList.add('orb-fx');
	const streak = svg('path', fx);
	const path: number[][] = [];
	let x = x0;
	let y = y0;
	let s = 1;
	const p = { t: 0 };
	await gsap.to(p, {
		t: 1,
		duration: gsap.utils.clamp(0.45, 0.9, Math.hypot(ex - x0, ey - y0) / 1500),
		ease: 'power2.in',
		onUpdate() {
			const [tx, ty, ts] = aim();
			const { t } = p;
			const u = 1 - t;
			const cx = x0 + (tx - x0) * 0.25;
			const cy = Math.min(y0, ty) - 70;
			x = u * u * x0 + 2 * u * t * cx + t * t * tx;
			y = u * u * y0 + 2 * u * t * cy + t * t * ty;
			s = 1 + (ts - 1) * t;
			gsap.set(cube, { x, y, scale: s });
			trail(fx, streak, path, x, y, s);
		}
	});

	// Land: the cube collapses into the target, which writes itself in (todo row) or flashes (anything else).
	ding();
	gsap.to({}, { duration: 0.2, onUpdate: () => trail(fx, streak, path, x, y, s), onComplete: () => fx.remove() });
	const t = target.getBoundingClientRect();
	if (t.bottom < 0 || t.top > innerHeight) gsap.to(cube, { scale: 2.5, opacity: 0, duration: 0.3, ease: 'power2.out', onComplete: done });
	else gsap.to(cube, { scale: 0, duration: 0.15, ease: 'power2.in', onComplete: done });
	if (target.matches('.check')) {
		writing.add(to.todo);
		incoming.delete(to.todo);
		setTimeout(() => writing.delete(to.todo), 450);
	} else {
		target.classList.add('landed');
		setTimeout(() => target.classList.remove('landed'), 800);
	}
}
