import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { prefersReducedMotion } from 'svelte/motion';

gsap.registerPlugin(Flip, ScrambleTextPlugin);

export { gsap };

export const GLYPHS = '+/<>[]_-=:#01';

/** n ms, or 0 under reduced motion. */
export const ms = (n: number) => (prefersReducedMotion.current ? 0 : n);

/* The boot runs in CSS from first paint (app.css). This adds the page title decode once the app has loaded,
   timed against page start so a slow load does not push it late. */
export function boot(root: HTMLElement) {
	const html = document.documentElement;
	if (!html.classList.contains('boot')) return;
	const t0 = performance.now() / 1000;
	const tl = gsap.timeline();
	const decode = (el: Element, at: number, duration = 0.5) =>
		tl.to(el, { scrambleText: { text: el.textContent!, chars: GLYPHS, speed: 0.5 }, duration, ease: 'none' }, Math.max(0, at - t0));

	decode(root.querySelector('.bar h1')!, 0, 0.7);

	const skip = () => {
		tl.progress(1);
		html.classList.remove('boot');
	};
	addEventListener('keydown', skip, { once: true });
	addEventListener('pointerdown', skip, { once: true });
	return () => {
		tl.progress(1).kill();
		removeEventListener('keydown', skip);
		removeEventListener('pointerdown', skip);
	};
}

/* How far to push a w x h viewport's rect r along angle a so that all of it is off screen, plus a margin for the
   frame and the registration cross. A rect already off screen that way does not move. */
export function off(r: { left: number; top: number; right: number; bottom: number }, a: number, w: number, h: number) {
	const c = Math.cos(a);
	const s = Math.sin(a);
	const d = Math.min(c < 0 ? r.right / -c : c > 0 ? (w - r.left) / c : Infinity, s < 0 ? r.bottom / -s : s > 0 ? (h - r.top) / s : Infinity);
	const far = Math.max(0, d) + 40;
	return { x: c * far, y: s * far };
}

/* A layout change: a preset switch, or a tile hidden, added or put back in edit mode. apply() must put the new
   layout in the DOM before it returns. Dropped tiles fly out first, each its own random way; a dropped tile is
   hidden by then, so it flies from its old spot, set absolutely on the board. As they clear the screen (IN), tiles
   that stay glide to their new spots with their content showing, new tiles fly in from off screen, and the board
   grows or shrinks to its new depth. The 'glide' event lets the car ease its scale (art.ts). A switch during a glide
   finishes the glide first. Reduced motion switches at once. */
let last: gsap.core.Timeline | undefined;
const LEAVE = 'display,position,left,top,width,height,margin,zIndex,transform';
const OUT = 0.45;
const IN = 0.3;

export function move(board: HTMLElement, apply: () => void) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
	last?.progress(1).kill();
	const tiles = [...board.querySelectorAll<HTMLElement>('.panel')];
	const shown = tiles.filter((t) => !t.hidden);
	const was = new Map(shown.map((t) => [t, t.getBoundingClientRect()]));
	const box = board.getBoundingClientRect();
	const state = Flip.getState(shown);
	apply();
	dispatchEvent(new Event('glide'));
	const away = (r: DOMRect) => off(r, Math.random() * 2 * Math.PI, innerWidth, innerHeight);
	const tl = (last = gsap.timeline());
	const at = shown.some((t) => t.hidden) ? IN : 0;
	tl.add(Flip.from(state, { targets: shown.filter((t) => !t.hidden), duration: 0.6, ease: 'power3.inOut' }), at);
	tl.fromTo(board, { height: box.height, minHeight: 0 }, { height: board.offsetHeight, duration: 0.6, ease: 'power3.inOut', clearProps: 'height,minHeight' }, at);
	for (const t of tiles.filter((t) => !t.hidden && !was.has(t))) {
		gsap.set(t, { zIndex: 1 });
		tl.from(t, { ...away(t.getBoundingClientRect()), duration: 0.7, ease: 'power3.out', clearProps: 'zIndex,transform' }, at);
	}
	for (const [t, r] of was) {
		if (!t.hidden) continue;
		gsap.set(t, { display: 'flex', position: 'absolute', left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height, margin: 0, zIndex: 1 });
		tl.to(t, { ...away(r), duration: OUT, ease: 'power3.in', clearProps: LEAVE }, 0);
	}
}
