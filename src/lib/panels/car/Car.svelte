<script module lang="ts">
	import type { Art } from '#lib/art.ts';

	/* The live drawing, shown in this tile and named in the title block (panels/title). */
	let art = $state.raw<Art>({ live: false, box: null, n: 0, yaw: null, lock: false });
	export const drawing = {
		get art() {
			return art;
		}
	};
</script>

<script lang="ts">
	import { CALLOUTS, VIEWS, project, start } from '#lib/art.ts';
	import Panel from '#lib/Panel.svelte';
	/* ponytail: the mesh goes out uncompressed (764 KB, once; the hashed file is cached for good). Give it an
	   extension that adapter-node precompresses if the first load ever matters. */
	import mesh from '#lib/assets/supra.bin?url';

	let { id }: { id: string } = $props();

	/* Factory figures for the 1986.5 MA70, in mm. The model is close to them, not exact: it stands about 80 mm
	   lower, its wheelbase is 44 mm longer and its body is about 45 mm wider. */
	const SPEC = { wheelbase: 2595, length: 4620, width: 1745, height: 1310 };
	const UNIT = SPEC.length / 2; // mm in one unit of the mesh

	let root: HTMLElement;
	let canvas: HTMLCanvasElement;
	let stage: HTMLElement;
	/* In a task of its own: making the WebGL context takes up to 40 ms, and the page is still hydrating here.
	   ponytail: when a preset switch resizes the tile, the drawing lays out and draws again on every frame of the
	   0.6 s glide (art.ts, 60 fps on the laptop); freeze it during the glide if a slower screen stutters. */
	$effect(() => {
		let stop = () => {};
		const timer = setTimeout(() => (stop = start(canvas, root, mesh, (a) => (art = a))));
		return () => {
			clearTimeout(timer);
			stop();
		};
	});

	const box = $derived(art.box);

	/* Each dimension is one path: two extension lines, the dimension line, and a tick on each end. */
	const px = (v: number) => Math.round(v) + 0.5;
	const TICK = 'l6 -6';
	const across = (a: number, b: number, from: number, y: number) => `M${a} ${from}V${y + 5}M${b} ${from}V${y + 5}M${a} ${y}H${b}M${a - 3} ${y + 3}${TICK}M${b - 3} ${y + 3}${TICK}`;
	const upright = (a: number, b: number, from: number[], x: number) => `M${from[0]} ${a}H${x + 5}M${from[1]} ${b}H${x + 5}M${x} ${a}V${b}M${x - 3} ${a + 3}${TICK}M${x - 3} ${b + 3}${TICK}`;
	/* A part name: a dot on the part, a leader to where it bends, a short shelf, then the label. A view shows all
	   of its names or none: each needs room in the stage, clear of the others. */
	const leaders = $derived.by(() => {
		if (!box) return [];
		const { m } = box;
		const mm = Math.hypot(m[0], m[2]) / UNIT; // CSS px per mm
		const list = CALLOUTS[VIEWS[box.view].name].map(({ label, at, to }) => {
			const [ax, ay] = project(at.map((v) => v / UNIT), m).map(px);
			const [ex, ey] = [m[3] + to[0] * mm, m[7] - to[1] * mm].map(px);
			const side = ex < ax ? -1 : 1;
			const x = ex + side * 12;
			/* ponytail: the label's width is an estimate (0.6 em a character, plus the padding). Measure it if the font changes. */
			const end = x + side * (7.2 * label.length + 9.6);
			return { label, ax, ay, side, x, y: ey, x0: Math.min(x, end), x1: Math.max(x, end), d: `M${ax} ${ay}L${ex} ${ey}h${side * 12}` };
		});
		const [left, right] = [stage.offsetLeft, stage.offsetLeft + stage.offsetWidth - 30];
		const clear = list.every((a, i) => a.x0 >= left && a.x1 <= right && list.every((b, j) => j <= i || Math.abs(a.y - b.y) >= 18 || a.x0 > b.x1 + 6 || b.x0 > a.x1 + 6));
		return clear ? list : [];
	});

	const dims = $derived.by(() => {
		if (!box) return [];
		const [x0, x1, y0, y1, front, rear, apex] = [box.x0, box.x1, box.y0, box.y1, box.front, box.rear, box.apex].map(px);
		type Name = keyof typeof SPEC;
		const flat = (name: Name, a: number, b: number, y: number) => ({ name, up: false, ends: [a, b], d: across(a, b, y1 + 4, y), x: (a + b) / 2, y });
		const tall = (name: Name, from: number, x: number) => ({ name, up: true, ends: [y0, y1], d: upright(y0, y1, [from, x1 + 4], x), x, y: (y0 + y1) / 2 });
		const name = VIEWS[box.view].name;
		if (name === 'side') return [flat('wheelbase', front, rear, y1 + 16), flat('length', x0, x1, y1 + 34), tall('height', apex + 6, x1 + 18)];
		/* In the plan view the width goes right of the part names. */
		if (name === 'top') return [flat('length', x0, x1, y1 + 16), tall('width', x1 + 4, Math.max(x1 + 18, ...leaders.map((l) => px(l.x1 + 16))))];
		return [flat('width', x0, x1, y1 + 16), tall('height', x1 + 4, x1 + 18)];
	});
</script>

<Panel {id}>
	<!-- The canvas covers the tile; art.ts draws the car into the empty .stage box and reports where it locked. -->
	<div class="car" class:lock={art.lock} bind:this={root}>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<div class="dims" aria-hidden="true">
			<svg>
				{#each dims as dim (dim.name)}<path data-dim={dim.name} data-ends={dim.ends.join()} d={dim.d} pathLength="1" />{/each}
				{#each leaders as lead (lead.label)}
					<path class="lead" d={lead.d} pathLength="1" />
					<circle cx={lead.ax} cy={lead.ay} r="2" />
				{/each}
			</svg>
			{#each dims as dim (dim.name)}<span class:up={dim.up} data-dim={dim.name} style:left="{dim.x}px" style:top="{dim.y}px">{SPEC[dim.name]}</span>{/each}
			{#each leaders as lead (lead.label)}<span class="lead" class:left={lead.side < 0} style:left="{lead.x}px" style:top="{lead.y}px">{lead.label}</span>{/each}
		</div>
		<div class="stage" bind:this={stage}></div>
	</div>
</Panel>

<style>
	/* The drawing fills its tile. */
	.car,
	canvas,
	.dims,
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	/* --dim: CSS px that art.ts keeps free right of the car and under it, for the dimension lines. */
	.stage {
		--dim: 44;
		position: absolute;
		inset: 12px 12px 0 0;
	}

	path {
		fill: none;
		stroke: var(--mute);
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		transition: stroke-dashoffset 0.4s cubic-bezier(0.65, 0, 0.35, 1);
	}

	.dims span {
		position: absolute;
		padding: 0 0.3rem;
		background: var(--paper);
		font-family: var(--font-data);
		font-size: 0.75rem;
		line-height: 1.2;
		opacity: 0;
		transform: translate(-50%, -50%);
		transition: opacity 0.2s ease-out;
	}

	.dims .up {
		transform: translate(-50%, -50%) rotate(-90deg);
	}

	.dims span.lead {
		transform: translate(0, -50%);
		white-space: nowrap;
	}

	.dims span.lead.left {
		transform: translate(-100%, -50%);
	}

	circle {
		fill: var(--mute);
		opacity: 0;
		transition: opacity 0.2s ease-out;
	}

	/* The dimensions draw in while the line ink sweeps across, and leave when it goes. */
	.lock path {
		stroke-dashoffset: 0;
		transition-duration: 0.9s;
	}

	.lock path:nth-child(2) {
		transition-delay: 0.15s;
	}

	.lock path:nth-child(3) {
		transition-delay: 0.3s;
	}

	/* The part names come after the dimensions: dot and leader, then the label. */
	.lock path.lead {
		transition-delay: 0.45s;
	}

	.lock circle {
		opacity: 1;
		transition-delay: 0.45s;
	}

	.lock .dims span {
		opacity: 1;
		transition-delay: 0.8s;
	}

	.lock .dims span.lead {
		transition-delay: 1.2s;
	}

	/* The phone's band: the tile is a small box beside the time (+page.svelte), in line ink only, because ASCII is
	   too coarse at this size. */
	@media (max-width: 700px) {
		.stage {
			--dim: 0;
			--line: 1;
			inset: 0;
		}

		.dims {
			display: none;
		}
	}
</style>
