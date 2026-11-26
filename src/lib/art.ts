/* The car drawing. The car mesh turns as ASCII ink, then locks to one elevation after another, each drawn as
   line ink. Raw WebGL2 in three passes: the mesh into a G-buffer (normal, part, depth), one texel per character
   cell (which glyph), then the composite at device pixels. Everything before start() is pure and tested. */

/* Calibration, judged by eye. */
export const FPS = 12; // drawn steps per second
export const REV = 90; // seconds per turn
export const HOLD = 40; // seconds a lock holds, between the two wipes
const EASE = 4; // seconds to settle into a lock, and to leave it
export const WIPE = 2.5; // seconds for one ink to replace the other
const TILT = 0.26; // camera pitch while the car turns, radians
const CELL = 4; // character cell width in CSS px; a cell is twice as high
export const PAD = 8; // CSS px kept clear around the locked car
const BOOT = 1500; // ms after page start before the first frame, so the boot wave stays smooth
const PLOT = 1.2; // seconds for the first frame to plot in
const RAISE = 1.2; // seconds for the headlamps to come up after that

export const LENGTH = (4620 * 96) / 25.4; // the car's length in CSS px at 1:1
const SPEED = (2 * Math.PI) / REV; // radians per second while the car turns

/* The views, in the order they lock. quarter: the yaw in quarter turns. */
export const VIEWS = [
	{ name: 'side', title: 'side elevation', quarter: 0, pitch: 0 },
	{ name: 'front', title: 'front elevation', quarter: 1, pitch: 0 },
	{ name: 'top', title: 'plan view', quarter: 0, pitch: Math.PI / 2 },
	{ name: 'rear', title: 'rear elevation', quarter: 3, pitch: 0 }
] as const;
export const LOCKS: Pose[] = VIEWS.map((v, view) => ({ yaw: (v.quarter * Math.PI) / 2, pitch: v.pitch, k: 1, wipe: 1, view }));
/* Seconds the car turns before each lock: at least three quarters of a turn, and the settle. */
const TURN = VIEWS.map((to, i) => {
	const quarters = (VIEWS.at(i - 1)!.quarter - to.quarter + 4) % 4;
	return ((quarters < 3 ? quarters + 4 : quarters) * REV) / 4 + EASE;
});
/* When each view's part of the cycle starts: the turn, then the wipe to line ink, the hold and the wipe back. */
const AT = TURN.reduce((at, turn) => [...at, at[at.length - 1] + turn + 2 * WIPE + HOLD], [0]);
export const CYCLE = AT[VIEWS.length];
export const LOCKED = TURN.map((turn, i) => AT[i] + turn); // when each view locks
const START = LOCKED[0] - 12; // the page opens 12 s before the first lock

/* k: 0 turning, 1 locked. wipe: 0 ASCII, 1 line; from 1 to 2 the ASCII comes back. view: the view it is locked
   to, leaves or turns to. */
type Pose = { yaw: number; pitch: number; k: number; wipe: number; view: number };
/* Per view, n: the drawing scale is 1:n, s: CSS px per mesh unit at the lock. ring: CSS px per mesh unit of the
   turning car, at each step of the ring of extents. cloud: the mesh's points. w, h, dim: the stage and the room for
   the dimension lines. x, y: where the locked car's centre sits. */
export type View = { n: number[]; s: number[]; ring: number[]; cloud: Float32Array; w: number; h: number; dim: number; x: number; y: number };
type Mesh = {
	vertices: Uint8Array;
	indices: Uint16Array | Uint32Array;
	half: number[];
	axles: number[];
	pod: number[];
	ring: number[][];
	apex: number;
	cloud: Float32Array;
};
/* A locked view in CSS px from the tile's corner. m: its matrix. x0, x1, y0, y1: the box around the car. front,
   rear, apex: x of the axles and of the roof's top. */
type Box = { view: number; m: number[]; x0: number; x1: number; y0: number; y1: number; front: number; rear: number; apex: number };
/* n: the scale is 1:n now. yaw: in degrees while the car turns, null while it is locked. */
export type Art = { live: boolean; box: Box | null; n: number; yaw: number | null; lock: boolean };

/* Part names for each view. piece: the part's number in the mesh, see scripts/bake_mesh.py. at: a point on the
   part, in mm from the car's centre (x to the tail, y up, z to its left). to: where the leader bends, in mm right
   of the drawing's centre and above it. */
export const CALLOUTS: Record<(typeof VIEWS)[number]['name'], { label: string; piece: number; at: number[]; to: number[] }[]> = {
	side: [
		{ label: 'pop-up headlamp', piece: 64, at: [-2008, 113, 699], to: [-1915, 435] },
		{ label: 'hood', piece: 8, at: [-1362, 183, 602], to: [-1260, 535] },
		{ label: 'door mirror', piece: 24, at: [-398, 263, 882], to: [-565, 435] },
		{ label: 'rear wing', piece: 20, at: [2072, 258, 689], to: [2005, 435] }
	],
	front: [
		{ label: 'door mirror', piece: 24, at: [-377, 273, -810], to: [-1110, 440] },
		{ label: 'pop-up headlamp', piece: 64, at: [-2080, 103, -560], to: [-1110, -25] }
	],
	top: [
		{ label: 'pop-up headlamp', piece: 64, at: [-1972, 165, -562], to: [-2430, 680] },
		{ label: 'hood', piece: 8, at: [-1402, 189, 342], to: [-2430, -130] },
		{ label: 'rear wing', piece: 20, at: [2092, 303, -357], to: [2440, 480] },
		{ label: 'rear deck', piece: 16, at: [1968, 255, 352], to: [2440, -480] }
	],
	rear: [
		{ label: 'rear wing', piece: 20, at: [2179, 298, 360], to: [-1110, 545] },
		{ label: 'door mirror', piece: 24, at: [-341, 273, 782], to: [-1110, 440] },
		{ label: 'rear deck', piece: 16, at: [2164, 203, 315], to: [-1110, 95] },
		{ label: 'exhaust', piece: 32, at: [2167, -392, 562], to: [-1110, -310] }
	]
};

const MAGIC = 0x33505553; // 'SUP3', see scripts/bake_mesh.py for the layout
const HEAD = 48;
const STRIDE = 10;
const ATLAS = ' .,:;+*#%@' + '_-¯/|\\'; // tone ramp (dots, so that no fill looks like a stroke), then edge strokes

const smooth = (u: number) => u * u * (3 - 2 * u);

/* The pose at t seconds into the cycle. For each view in turn: leave the last lock, turn, settle, wipe to line
   ink, hold, wipe back. */
export function pose(t: number): Pose {
	let c = ((t % CYCLE) + CYCLE) % CYCLE;
	let view = VIEWS.length - 1;
	while (c < AT[view]) view--;
	c -= AT[view];
	const turn = TURN[view];
	const half = (SPEED * EASE) / 2; // the angle that the settle covers
	let yaw = LOCKS[view].yaw;
	let k = 1;
	let wipe = 0;
	if (c < EASE) {
		const u = c / EASE;
		yaw += SPEED * (turn - EASE) - half * u * u;
		k = 1 - smooth(u);
		view = (view || VIEWS.length) - 1;
	} else if (c < turn - EASE) {
		yaw += SPEED * (turn - EASE / 2 - c);
		k = 0;
	} else if (c < turn) {
		const u = (c - turn) / EASE + 1;
		yaw += half * (1 - u) * (1 - u);
		k = smooth(u);
	} else wipe = Math.min(1, (c - turn) / WIPE) + Math.max(0, (c - turn - WIPE - HOLD) / WIPE);
	return { yaw, pitch: TILT * (1 - k) + LOCKS[view].pitch * k, k, wipe, view };
}

export function parse(buffer: ArrayBuffer): Mesh {
	const data = new DataView(buffer);
	if (buffer.byteLength < HEAD || data.getUint32(0, true) !== MAGIC) throw new Error('mesh: not a SUP3 file');
	const count = data.getUint32(4, true);
	const indexCount = data.getUint32(8, true);
	const indexBytes = data.getUint32(12, true);
	const at = HEAD + Math.ceil((count * STRIDE) / 4) * 4;
	if ((indexBytes !== 2 && indexBytes !== 4) || indexCount % 3 || at + indexCount * indexBytes !== buffer.byteLength)
		throw new Error('mesh: header and size disagree');
	const f = Array.from({ length: 8 }, (_, i) => data.getFloat32(16 + i * 4, true));
	const pod = f.slice(5);
	const c = Math.cos(pod[2]);
	const s = Math.sin(pod[2]);
	/* Every position; a headlamp pod vertex is listed retracted and raised. */
	const cloud: number[] = [];
	let top = -Infinity;
	let apex = 0;
	for (let o = HEAD; o < HEAD + count * STRIDE; o += STRIDE) {
		const x = data.getInt16(o, true) / 32767;
		const y = data.getInt16(o + 2, true) / 32767;
		const z = data.getInt16(o + 4, true) / 32767;
		if (y > top) (top = y), (apex = x);
		cloud.push(x, y, z);
		if (data.getInt8(o + 9) >= 64) cloud.push(pod[0] + c * (x - pod[0]) + s * (y - pod[1]), pod[1] - s * (x - pod[0]) + c * (y - pod[1]), z);
	}
	const points = Float32Array.from(cloud);
	return {
		vertices: new Uint8Array(buffer, HEAD, count * STRIDE),
		indices: indexBytes === 2 ? new Uint16Array(buffer, at, indexCount) : new Uint32Array(buffer, at, indexCount),
		half: f.slice(0, 3),
		axles: f.slice(3, 5),
		pod,
		/* The extent of the turning car at every 2 degrees of yaw. */
		ring: Array.from({ length: 180 }, (_, i) => extent(rotation({ yaw: (i * Math.PI) / 90, pitch: TILT }), points)),
		apex,
		cloud: points
	};
}

/* Fit each locked view into a stage of w by h CSS px, at a whole scale 1:n. dim is the room kept right of the car
   and under it for the dimension lines. The turning car fills the whole stage, at each yaw as large as the yaws
   around it allow: a running min, so that it stays inside, then a running mean, so that its size does not pump. */
export function fit(w: number, h: number, mesh: Pick<Mesh, 'half' | 'ring' | 'cloud'>, dim: number): View {
	const n = LOCKS.map((lock) => {
		const r = rotation(lock).map(Math.abs);
		const [across, up] = [0, 3].map((row) => r[row] * mesh.half[0] + r[row + 1] * mesh.half[1] + r[row + 2] * mesh.half[2]);
		return Math.max(1, Math.ceil(Math.max((LENGTH * across) / Math.max(1, w - dim - 2 * PAD), (LENGTH * up) / Math.max(1, h - dim - 2 * PAD))));
	});
	const s = n.map((n) => LENGTH / n / 2);
	const fits = mesh.ring.map(([x0, x1, y0, y1]) => Math.min(Math.max(1, w - 2 * PAD) / (x1 - x0), Math.max(1, h - 2 * PAD) / (y1 - y0)));
	const around = (list: number[], i: number, r: number) => Array.from({ length: 2 * r + 1 }, (_, d) => list.at((i + d - r) % list.length)!);
	const low = fits.map((_, i) => Math.min(...around(fits, i, 1)));
	const ring = low.map((_, i) => around(low, i, 2).reduce((a, b) => a + b) / 5);
	return { n, s, ring, cloud: mesh.cloud, w, h, dim, x: (w - dim) / 2, y: (h - dim) / 2 };
}

/* Rows of the view rotation: screen right, up, and toward the viewer. */
function rotation(p: Pick<Pose, 'yaw' | 'pitch'>) {
	const cy = Math.cos(p.yaw);
	const sy = Math.sin(p.yaw);
	const cp = Math.cos(p.pitch);
	const sp = Math.sin(p.pitch);
	return [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
}

/* The car's extent at unit scale under rotation r: left, right, bottom, top (y up). */
export function extent(r: number[], cloud: Float32Array) {
	const [a, b, c, d, e, f] = r;
	let x0 = Infinity;
	let x1 = -Infinity;
	let y0 = Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < cloud.length; i += 3) {
		const x = a * cloud[i] + b * cloud[i + 1] + c * cloud[i + 2];
		const y = d * cloud[i] + e * cloud[i + 1] + f * cloud[i + 2];
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	}
	return [x0, x1, y0, y1];
}

/* 3x4, row-major: mesh units to CSS px (x right, y down) and to depth (larger is nearer). Locked, the car is at
   the view's scale and in its place. On the way it is centred on its extent, as large as the ring allows, moving
   to the locked size and place as it settles; the room for the dimension lines is given up only as far as it has
   settled, and its own extent keeps it inside, also while it pitches into the plan view. */
export function matrix(p: Pose, v: View): number[] {
	const r = rotation(p);
	let s = v.s[p.view];
	let x = v.x;
	let y = v.y;
	if (p.k < 1) {
		const [x0, x1, y0, y1] = extent(r, v.cloud);
		const fits = Math.min((v.w - 2 * PAD - v.dim * p.k) / (x1 - x0), (v.h - 2 * PAD - v.dim * p.k) / (y1 - y0));
		const j = ((((p.yaw / (2 * Math.PI)) % 1) + 1) % 1) * v.ring.length;
		const i = Math.floor(j) % v.ring.length;
		const turning = v.ring[i] + (v.ring[(i + 1) % v.ring.length] - v.ring[i]) * (j - i);
		s = Math.min(fits, turning + (s - turning) * p.k);
		x = v.x + (v.dim / 2) * (1 - p.k) - (s * (x0 + x1)) / 2;
		y = v.y + (v.dim / 2) * (1 - p.k) + (s * (y0 + y1)) / 2;
	}
	return [s * r[0], s * r[1], s * r[2], x, -s * r[3], -s * r[4], -s * r[5], y, r[6], r[7], r[8], 0];
}

export const project = (p: number[], m: number[]) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7]];

/* Row 0 of every texture is the top row: the mesh pass flips y, the composite flips it back. */
const MESH_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in float a_part;
uniform mat3 u_rot;
uniform vec4 u_view; // clip scale x, y and offset x, y
uniform vec3 u_pod; // hinge x, hinge y, angle now
out vec3 v_view;
out vec3 v_normal;
flat out float v_part;
void main() {
	vec3 p = a_position, n = a_normal;
	float part = a_part;
	if (part > 63.5) {
		part -= 64.0;
		float c = cos(u_pod.z), s = sin(u_pod.z);
		mat2 turn = mat2(c, -s, s, c);
		p.xy = u_pod.xy + turn * (p.xy - u_pod.xy);
		n.xy = turn * n.xy;
	}
	v_view = u_rot * p;
	v_normal = u_rot * n;
	v_part = part;
	gl_Position = vec4(v_view.x * u_view.x + u_view.z, u_view.w - v_view.y * u_view.y, -v_view.z / 1.25, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 v_view;
in vec3 v_normal;
flat in float v_part;
out vec4 o;
void main() {
	vec3 n = normalize(v_normal);
	// The face normal from the derivatives always points at the viewer; a normal that disagrees is a back face.
	vec3 face = cross(dFdy(v_view), dFdx(v_view));
	// A face seen edge-on (within half a degree) is a sliver of loose texels, which the line ink draws as dashes.
	if (face.z * face.z < 1e-4 * dot(face, face)) discard;
	if (dot(n, face) < 0.0) n = -n;
	o = vec4(n * 0.5 + 0.5, (v_part + 1.0) / 255.0);
}`;

const QUAD_VS = `#version 300 es
void main() {
	gl_Position = vec4(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0, 0.0, 1.0);
}`;

/* One texel per character cell. The cell is cut into 3x6 squares, with a sample on every corner. An edge cuts
   the sides of the squares it passes through: the two samples of a cut side lie on two parts (or one lies off
   the car). Each cut square adds its piece to a structure tensor, and belongs to one cell only, so an edge is
   one cell thick. A strong, one-directional tensor makes an edge stroke along the edge; any other cell is
   filled from the tone ramp. Steps in depth and creases inside one part are left to the tone: as edges they
   turn the wheels and the bumper into a tangle of strokes. The tone is the part's own, lit by the sky and by
   one lamp up and to the left, with a highlight that slides over paint and glass as the car turns. The far
   end of the car fades, and a cell that lies deeper than the cells around it is darker. Out: glyph, alpha,
   coverage, and the share of the cell that is a light, which blinks under an alert. */
const CELL_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_normal, u_depth;
uniform vec2 u_cell; // cell size in G-buffer texels
out vec4 o;
const vec3 LIGHT = normalize(vec3(-0.45, 0.75, 0.5));
const vec3 HALF = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
const vec4 BASE = vec4(0.1, 0.02, 0.0, 0.82); // body, glass, dark, light
const vec4 RANGE = vec4(0.66, 0.1, 0.16, 0.17);
const vec4 GLOSS = vec4(0.22, 0.45, 0.0, 0.0);
const float SHINE = 24.0, WRAP = 0.25, SKY = 0.3; // highlight width, light that wraps past the edge, share of sky light
const float FADE = 0.4, SHADE = 0.6; // light lost at the far end, and in the deepest hollow
const float STRENGTH = 4.0, COHERENCE = 0.3; // strength 6 is an edge across the whole cell
// Pairs of depth taps on opposite sides of the cell, in cell widths: a slope cancels out, a hollow does not.
const vec2 TAPS[8] = vec2[8](vec2(2.5, 0.0), vec2(0.0, 2.5), vec2(1.8, 1.8), vec2(1.8, -1.8), vec2(5.5, 2.3), vec2(-2.3, 5.5), vec2(2.3, 5.5), vec2(5.5, -2.3));
float I[28];
ivec2 last;
float cut(int a, int b) {
	return float(I[a] != I[b]);
}
float depth(vec2 q) {
	return (1.0 - 2.0 * texelFetch(u_depth, clamp(ivec2(q), ivec2(0), last), 0).r) * 1.25;
}
void main() {
	vec2 origin = floor(gl_FragCoord.xy) * u_cell;
	last = textureSize(u_normal, 0) - 1;
	float cover = 0.0, base = 0.0, lit = 0.0, z = 0.0, glow = 0.0;
	for (int j = 0; j < 7; j++) for (int i = 0; i < 4; i++) {
		vec2 q = origin + vec2(i, j) * u_cell / vec2(3, 6);
		vec4 g = texelFetch(u_normal, clamp(ivec2(q), ivec2(0), last), 0);
		I[j * 4 + i] = g.a;
		if (g.a > 0.0) {
			int part = int(g.a * 255.0 + 0.5) - 1, tone = part & 3;
			vec3 n = normalize(g.rgb * 2.0 - 1.0);
			cover += 1.0;
			glow += float(part == 3); // a light: the lens of a pop-up pod too, not its lid; a door lock (31) is as bright, and does not blink
			base += BASE[tone];
			lit += RANGE[tone] * (SKY * (0.5 + 0.5 * n.y) + (1.0 - SKY) * max((dot(n, LIGHT) + WRAP) / (1.0 + WRAP), 0.0)) + GLOSS[tone] * pow(max(dot(n, HALF), 0.0), SHINE);
			z += depth(q);
		}
	}
	float xx = 0.0, yy = 0.0, xy = 0.0, height = 0.0;
	for (int j = 0; j < 6; j++) for (int i = 0; i < 3; i++) {
		int k = j * 4 + i;
		float top = cut(k, k + 1), bottom = cut(k + 4, k + 5), left = cut(k, k + 4), right = cut(k + 1, k + 5);
		// An edge through top and bottom runs upright, so its gradient lies along x. Two sides that meet are a diagonal.
		float gx = top + bottom, gy = left + right, sum = gx * gx + gy * gy;
		if (sum == 0.0) continue;
		xx += gx * gx / sum;
		yy += gy * gy / sum;
		xy += (top - bottom) * (left - right) / sum;
		height += (float(j) + 0.5) / 6.0;
	}
	float glyph = 0.0, alpha = 0.0;
	// A level edge crosses 3 squares and an upright one 6, so y counts twice.
	if (xx + 2.0 * yy >= STRENGTH && sqrt((xx - yy) * (xx - yy) + 4.0 * xy * xy) >= COHERENCE * (xx + yy)) {
		// Angle of the edge, y up, 0 to 180. A cell is 1:2, so its diagonals stand at 63.4 and 116.6 degrees.
		float a = mod(degrees(0.5 * atan(-2.0 * xy, xx - yy)) + 90.0, 180.0);
		float h = height / (xx + yy);
		glyph = a < 31.7 || a >= 148.3 ? (h < 1.0 / 3.0 ? 12.0 : h < 2.0 / 3.0 ? 11.0 : 10.0) : a < 76.7 ? 13.0 : a < 103.3 ? 14.0 : 15.0;
		alpha = 1.0;
	} else if (cover > 0.0) {
		z /= cover;
		vec2 mid = origin + 0.5 * u_cell;
		float under = 0.0;
		for (int k = 0; k < 8; k++) {
			vec2 d = TAPS[k] * u_cell.x;
			// Off the car a tap reads far away, so an outline is never a hollow.
			under += clamp((0.5 * (depth(mid + d) + depth(mid - d)) - z - 0.004) / 0.03, 0.0, 1.0);
		}
		float tone = clamp((base + lit * (1.0 - FADE * max(-z, 0.0)) * (1.0 - SHADE * under / 8.0)) / cover * sqrt(cover / 28.0), 0.0, 0.999);
		glyph = floor(tone * 10.0);
		alpha = mix(0.45, 0.85, tone);
	}
	o = vec4(glyph / 255.0, alpha, cover / 28.0, glow / 28.0);
}`;

/* Device pixels. Left and right of the head each column is drawn in one ink: 0 nothing, 1 ASCII, 2 line.
   While u_flash is 1 the lights are drawn full, in the signal colour. */
const COMP_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_normal, u_depth, u_cells, u_atlas;
uniform vec2 u_size, u_cell, u_modes;
uniform float u_head, u_tick, u_flash;
uniform int u_ss; // G-buffer texels per device px
uniform vec3 u_ink, u_signal;
uniform vec4 u_box; // the locked car in device px (left, top, right, bottom): line ink is drawn nowhere else
out vec4 o;
float lit; // G-buffer texels of this pixel that blink
float depth(ivec2 q) {
	return (1.0 - 2.0 * texelFetch(u_depth, q, 0).r) * 1.25;
}
float glyph(int index, ivec2 at) {
	return texelFetch(u_atlas, ivec2(index * int(u_cell.x) + at.x, at.y), 0).a;
}
// Line ink of one G-buffer texel: outline 1, depth step 0.9, part change 0.7, crease up to 0.55.
float edge(ivec2 q, ivec2 last) {
	vec4 c = texelFetch(u_normal, q, 0);
	vec3 n = c.rgb * 2.0 - 1.0;
	int part = int(c.a * 255.0 + 0.5) - 1;
	if (part == 3) lit += 1.0; // a light
	float e = 0.0, z = depth(q);
	for (int k = 0; k < 2; k++) {
		ivec2 d = k == 0 ? ivec2(1, 0) : ivec2(0, 1);
		ivec2 a = clamp(q - d, ivec2(0), last), b = clamp(q + d, ivec2(0), last);
		vec4 ga = texelFetch(u_normal, a, 0), gb = texelFetch(u_normal, b, 0);
		if ((c.a > 0.0) != (ga.a > 0.0) || (c.a > 0.0) != (gb.a > 0.0)) e = 1.0;
		else if (c.a > 0.0) {
			e = max(e, 0.9 * smoothstep(0.003, 0.006, abs(depth(a) + depth(b) - 2.0 * z)));
			if (c.a != ga.a || c.a != gb.a) e = max(e, 0.7);
			// A soft crease fades in, so that a line on a curving panel thins out and does not break into dashes.
			e = max(e, 0.55 - 0.55 * smoothstep(0.84, 0.96, min(dot(n, ga.rgb * 2.0 - 1.0), dot(n, gb.rgb * 2.0 - 1.0))));
		}
	}
	return e;
}
void main() {
	ivec2 px = ivec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);
	ivec2 size = ivec2(u_cell), cell = px / size, at = px - cell * size;
	vec4 c = texelFetch(u_cells, cell, 0);
	float ink = 0.0, red = 0.0, column = float(cell.x), mode = column < u_head ? u_modes.x : u_modes.y;
	lit = 0.0;
	if (u_modes.x != u_modes.y && c.b > 0.0 && abs(column + 0.5 - u_head) < 1.0)
		ink = glyph(6 + int(fract(sin(dot(vec2(cell) + u_tick, vec2(12.9898, 78.233))) * 43758.5453) * 4.0), at);
	else if (mode == 1.0) {
		// A blinking cell is drawn full: #, % or @ by its share of light.
		red = u_flash * step(0.25, c.a);
		ink = red > 0.0 ? glyph(7 + int(min(c.a, 0.999) * 3.0), at) : c.g * glyph(int(c.r * 255.0 + 0.5), at);
	}
	else if (mode == 2.0 && all(greaterThanEqual(vec2(px), u_box.xy)) && all(lessThan(vec2(px), u_box.zw))) {
		ivec2 last = textureSize(u_normal, 0) - 1;
		for (int j = 0; j < u_ss; j++) for (int i = 0; i < u_ss; i++) ink += edge(px * u_ss + ivec2(i, j), last);
		ink /= float(u_ss * u_ss);
		red = u_flash * lit / float(u_ss * u_ss);
		ink = max(ink, red);
	}
	o = vec4((red > 0.0 ? u_signal : u_ink) * ink, ink);
}`;

/* While a red alert stands the car blinks its lights. The alerts panel (panels/alerts/Alerts.svelte) keeps this up to
   date, so the lights blink only while that panel is on the board. */
let hazard = false;
export const blink = (on: boolean) => void (hazard = on);

type Hooked = HTMLCanvasElement & { draw?: (t: number, flash?: boolean) => void };

/* Draws into the canvas, which covers the car's tile (root); the car lives in its .stage box. tell() reports what
   the DOM needs. Returns the stop function. Without WebGL2 nothing happens and the tile stays bare. */
export function start(canvas: Hooked, root: HTMLElement, url: string, tell: (art: Art) => void): () => void {
	const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
	if (!gl || gl.isContextLost()) return () => {};
	const stage = root.querySelector<HTMLElement>('.stage')!;
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const font = getComputedStyle(root).getPropertyValue('--font-data');
	const ac = new AbortController();

	/* The three programs compile while the mesh loads, off the main thread where the browser can do that. A
	   question to a program that is not done blocks the page until it is, so nothing is asked before then. The
	   extension must be on before the programs are linked, or its question blocks like every other. */
	const parallel = gl.getExtension('KHR_parallel_shader_compile');
	const programs = [
		[MESH_VS, MESH_FS],
		[QUAD_VS, CELL_FS],
		[QUAD_VS, COMP_FS]
	].map((sources) => {
		const p = gl.createProgram()!;
		sources.forEach((src, i) => {
			const shader = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER)!;
			gl.shaderSource(shader, src);
			gl.compileShader(shader);
			gl.attachShader(p, shader);
		});
		gl.linkProgram(p);
		return p;
	});
	const [solid, cells, comp] = programs;
	const compiled = new Promise<void>((done) => {
		(function poll() {
			if (!parallel || ac.signal.aborted || gl.isContextLost() || programs.every((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) done();
			else setTimeout(poll, 30);
		})();
	});

	/* Each texture keeps its own unit: 0 normal and part, 1 depth, 2 cells, 3 atlas. */
	const texture = (unit: number, format?: number, w = 0, h = 0) => {
		const t = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, t);
		for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, name, gl.NEAREST);
		for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
		if (format) gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
		return t;
	};
	const sized: (WebGLTexture | null)[] = [];
	const gbuffer = gl.createFramebuffer();
	const grid = gl.createFramebuffer();
	texture(3);
	const scratch = document.createElement('canvas').getContext('2d')!;

	let mesh: Mesh | undefined;
	let vao: WebGLVertexArrayObject | null = null;
	let view: View | undefined;
	let boxes: Box[] = [];
	let line = false; // line ink only, everywhere: the stage sets --line: 1 where it is too small for ASCII
	let device = [0, 0]; // canvas size in device px, when the browser reports it
	let W = 0;
	let H = 0;
	let cssW = 0;
	let cssH = 0;
	let cw = 0;
	let ch = 0;
	let cols = 0;
	let rows = 0;
	let ss = 1;
	let ink = [1, 1, 1];
	let alarm = [1, 0.3, 0.24];
	let stale = { size: true, atlas: true };
	let live = false;
	let visible = true;
	let raf = 0;
	let t0 = 0;
	let last = -1;
	let drawn = '';
	let told = '';
	let size = [0, 0]; // the stage in CSS px at the last layout
	let glide: number[][] | undefined; // the stage's size before and after a glide (motion.ts)
	let pinned = still ? LOCKS[0] : undefined; // a pose to stay on: reduced motion, and the test hook
	let lit: boolean | undefined; // the lights, once the test hook has set them

	function layout() {
		const r = canvas.getBoundingClientRect();
		const st = stage.getBoundingClientRect();
		const max = gl!.getParameter(gl!.MAX_TEXTURE_SIZE) as number;
		W = Math.min(max, device[0] || Math.round(r.width * devicePixelRatio));
		H = Math.min(max, device[1] || Math.round(r.height * devicePixelRatio));
		view = undefined;
		if (!W || !H || !mesh) return;
		cssW = r.width;
		cssH = r.height;
		canvas.width = W;
		canvas.height = H;
		cw = Math.max(1, Math.round((CELL * W) / cssW));
		ch = cw * 2;
		cols = Math.ceil(W / cw);
		rows = Math.ceil(H / ch);
		/* Two G-buffer texels per device px on a low-density screen, so that the line ink is smooth. */
		ss = W / cssW < 2 && W * 2 <= max && H * 2 <= max ? 2 : 1;
		sized.splice(0).forEach((t) => gl!.deleteTexture(t));
		sized.push(texture(0, gl!.RGBA8, W * ss, H * ss), texture(1, gl!.DEPTH_COMPONENT24, W * ss, H * ss), texture(2, gl!.RGBA8, cols, rows));
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, gbuffer);
		gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sized[0], 0);
		gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.DEPTH_ATTACHMENT, gl!.TEXTURE_2D, sized[1], 0);
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, grid);
		gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sized[2], 0);

		const style = getComputedStyle(stage);
		line = style.getPropertyValue('--line').trim() === '1';
		const dim = parseFloat(style.getPropertyValue('--dim')) || 0;
		let f = fit(st.width, st.height, mesh, dim);
		/* In a glide the scale eases from the old size's whole 1:n to the new size's, as far as the stage has gone,
		   instead of stepping through every whole 1:n between them. It stays inside: the room grows in a straight line. */
		if (glide) {
			const [[w0, h0], [w1, h1]] = glide;
			const p = Math.abs(w1 - w0) > Math.abs(h1 - h0) ? (st.width - w0) / (w1 - w0) : (st.height - h0) / (h1 - h0);
			if (p >= 0 && p < 1) {
				const [a, b] = [fit(w0, h0, mesh, dim), fit(w1, h1, mesh, dim)];
				const mix = (u: number, v: number) => u + (v - u) * p;
				f = { ...f, s: a.s.map((s, i) => mix(s, b.s[i])) };
			} else glide = undefined;
		}
		size = [st.width, st.height];
		const lens = { ...f, x: st.left - r.left + f.x, y: st.top - r.top + f.y };
		const { half, axles, apex } = mesh;
		view = lens;
		boxes = LOCKS.map((lock) => {
			const m = matrix(lock, lens);
			const [ax, ay] = project(half.map((v) => -v), m);
			const [bx, by] = project(half, m);
			const [front, rear, top] = [axles[0], axles[1], apex].map((x) => project([x, 0, 0], m)[0]);
			return { view: lock.view, m, x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by), front, rear, apex: top };
		});
		ink = (style.color.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map((v) => +v / 255);
		/* ponytail: --signal is read as #rrggbb only; in any other notation the lights keep the red above. */
		const hex = style.getPropertyValue('--signal').trim().match(/^#(..)(..)(..)$/);
		if (hex) alarm = hex.slice(1).map((v) => parseInt(v, 16) / 255);
	}

	/* One tile per glyph, exactly one cell of device pixels, so that the type stays sharp. */
	function atlas() {
		const g = scratch;
		g.canvas.width = ATLAS.length * cw;
		g.canvas.height = ch;
		g.font = `500 ${cw / 0.6}px ${font}`;
		g.textAlign = 'center';
		g.fillStyle = '#fff';
		const m = g.measureText('M');
		const base = Math.round((ch + m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2);
		[...ATLAS].forEach((glyph, i) => {
			g.save();
			g.beginPath();
			g.rect(i * cw, 0, cw, ch);
			g.clip();
			g.fillText(glyph, (i + 0.5) * cw, base);
			g.restore();
		});
		gl!.activeTexture(gl!.TEXTURE3);
		gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, g.canvas);
	}

	/* Bring sizes and atlas up to date. False while there is nothing to draw into. */
	function ready() {
		if (stale.size) layout();
		if (!view) return false;
		if (stale.size || stale.atlas) {
			atlas();
			drawn = told = '';
		}
		stale = { size: false, atlas: false };
		return true;
	}

	/* Called once the programs are done: whether they linked, and where their uniforms are. */
	const uniforms = () => {
		for (const p of programs)
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`shader: ${gl.getProgramInfoLog(p)} ${gl.getAttachedShaders(p)?.map((shader) => gl.getShaderInfoLog(shader)).join(' ')}`);
		const at = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
		gl.useProgram(cells);
		gl.uniform1i(at(cells, 'u_normal'), 0);
		gl.uniform1i(at(cells, 'u_depth'), 1);
		gl.useProgram(comp);
		['u_normal', 'u_depth', 'u_cells', 'u_atlas'].forEach((name, unit) => gl.uniform1i(at(comp, name), unit));
		return {
			rot: at(solid, 'u_rot'),
			view: at(solid, 'u_view'),
			pod: at(solid, 'u_pod'),
			texels: at(cells, 'u_cell'),
			size: at(comp, 'u_size'),
			cell: at(comp, 'u_cell'),
			modes: at(comp, 'u_modes'),
			head: at(comp, 'u_head'),
			tick: at(comp, 'u_tick'),
			ss: at(comp, 'u_ss'),
			ink: at(comp, 'u_ink'),
			signal: at(comp, 'u_signal'),
			flash: at(comp, 'u_flash'),
			box: at(comp, 'u_box')
		};
	};
	let U: ReturnType<typeof uniforms>;

	function render(p: Pose, m: number[], intro: number, lamps: number, tick: number, flash: boolean) {
		const box = boxes[p.view];
		if (!mesh || !view || !box) return;
		const r = rotation(p);
		const s = Math.hypot(m[0], m[2]);
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, gbuffer);
		gl!.viewport(0, 0, W * ss, H * ss);
		gl!.enable(gl!.DEPTH_TEST);
		gl!.clearColor(0.5, 0.5, 0.5, 0);
		gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
		gl!.useProgram(solid);
		gl!.uniformMatrix3fv(U.rot, false, [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]]);
		gl!.uniform4f(U.view, (2 * s) / cssW, (2 * s) / cssH, (2 * m[3]) / cssW - 1, (2 * m[7]) / cssH - 1);
		gl!.uniform3f(U.pod, mesh.pod[0], mesh.pod[1], mesh.pod[2] * lamps);
		gl!.bindVertexArray(vao);
		gl!.drawElements(gl!.TRIANGLES, mesh.indices.length, mesh.indices instanceof Uint16Array ? gl!.UNSIGNED_SHORT : gl!.UNSIGNED_INT, 0);
		gl!.bindVertexArray(null);
		gl!.disable(gl!.DEPTH_TEST);

		gl!.bindFramebuffer(gl!.FRAMEBUFFER, grid);
		gl!.viewport(0, 0, cols, rows);
		gl!.useProgram(cells);
		gl!.uniform2f(U.texels, cw * ss, ch * ss);
		gl!.drawArrays(gl!.TRIANGLES, 0, 3);

		/* The head sweeps the columns of the locked car. */
		const c0 = Math.floor((box.x0 * W) / cssW / cw) - 1;
		const c1 = Math.ceil((box.x1 * W) / cssW / cw) + 1;
		let head = 0;
		let modes = [1, 1];
		if (intro < 1) (head = c0 + intro * (c1 - c0)), (modes = [1, 0]);
		else if (p.wipe === 1) modes = [2, 2];
		else if (p.wipe > 1) (head = c0 + (p.wipe - 1) * (c1 - c0)), (modes = [1, 2]);
		else if (p.wipe > 0) (head = c0 + p.wipe * (c1 - c0)), (modes = [2, 1]);
		if (line) modes = modes.map((m) => m && 2);
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
		gl!.viewport(0, 0, W, H);
		gl!.useProgram(comp);
		gl!.uniform2f(U.size, W, H);
		gl!.uniform2f(U.cell, cw, ch);
		gl!.uniform2f(U.modes, modes[0], modes[1]);
		gl!.uniform1f(U.head, head);
		gl!.uniform1f(U.tick, tick % 64);
		gl!.uniform1i(U.ss, ss);
		gl!.uniform3f(U.ink, ink[0], ink[1], ink[2]);
		gl!.uniform3f(U.signal, alarm[0], alarm[1], alarm[2]);
		gl!.uniform1f(U.flash, +flash);
		if (line) gl!.uniform4f(U.box, 0, 0, W, H);
		else gl!.uniform4f(U.box, ((box.x0 - 2) * W) / cssW, ((box.y0 - 2) * H) / cssH, ((box.x1 + 2) * W) / cssW, ((box.y1 + 2) * H) / cssH);
		gl!.drawArrays(gl!.TRIANGLES, 0, 3);
	}

	/* Tell the page what is on the sheet, when that changes. */
	function report(p: Pose, m: number[]) {
		const n = Math.round(LENGTH / 2 / Math.hypot(m[0], m[2]));
		const yaw = p.k === 1 ? null : ((Math.round((p.yaw * 180) / Math.PI) % 360) + 360) % 360;
		const lock = p.wipe >= 0.4 && p.wipe <= 1;
		const key = [p.view, n, yaw, lock].join();
		if (key === told) return;
		told = key;
		tell({ live: true, box: boxes[p.view], n, yaw, lock });
	}

	function frame(now: number) {
		raf = 0;
		if (!live || !visible) return;
		raf = requestAnimationFrame(frame);
		const elapsed = (now - t0) / 1000;
		const tick = Math.floor(elapsed * FPS);
		if (elapsed < 0 || tick === last || !ready()) return;
		last = tick;
		const p = pinned ?? pose(START + tick / FPS);
		const intro = pinned ? 1 : Math.min(1, elapsed / PLOT);
		const lamps = pinned ? 1 : smooth(Math.min(1, Math.max(0, (elapsed - PLOT - 0.2) / RAISE)));
		/* The hazard blink: half a second on, half a second off. With reduced motion the lights stay on. */
		const flash = lit ?? (hazard && (still || tick % FPS < FPS / 2));
		/* Draw only when the picture changes: while a lock holds, nothing but the blink is drawn. */
		const key = [p.yaw, p.pitch, p.wipe, intro, lamps, flash].join();
		const m = matrix(p, view!);
		if (key !== drawn) render(p, m, intro, lamps, tick, flash);
		drawn = key;
		report(p, m);
	}

	/* For scripts/car.mjs: go to t seconds into the cycle, draw that frame now, and stay on it, with the
	   lights lit or not. */
	canvas.draw = (t, flash = false) => {
		if (!live || !ready()) return;
		pinned = pose(t);
		lit = flash;
		drawn = '';
		const m = matrix(pinned, view!);
		render(pinned, m, 1, 1, 0, flash);
		report(pinned, m);
	};

	const resized = new ResizeObserver((entries) => {
		for (const e of entries) {
			const d = e.target === canvas && e.devicePixelContentBoxSize?.[0];
			if (d) device = [d.inlineSize, d.blockSize];
		}
		stale.size = true;
		/* Draw at the new size before this paint, not at the next tick, so that a tile gliding to a new size
		   never shows the old drawing stretched under dimension lines that have moved on. */
		if (!raf) return;
		cancelAnimationFrame(raf);
		last = -1;
		frame(performance.now());
	});
	try {
		resized.observe(canvas, { box: 'device-pixel-content-box' });
	} catch {
		resized.observe(canvas);
	}
	resized.observe(stage);
	const seen = new IntersectionObserver(([e]) => {
		visible = e.isIntersecting;
		if (visible && live && !raf) raf = requestAnimationFrame(frame);
	});
	seen.observe(root);
	const signal = ac.signal;
	/* motion.ts says a glide starts, with the new layout in place: the stage is at its new size for this moment. */
	addEventListener(
		'glide',
		() => {
			const st = stage.getBoundingClientRect();
			glide = size[0] && st.width ? [size, [st.width, st.height]] : undefined;
		},
		{ signal }
	);
	document.fonts.addEventListener('loadingdone', () => (stale.atlas = true), { signal });
	/* ponytail: a lost context is not restored; the tile stays bare until the next load. */
	canvas.addEventListener(
		'webglcontextlost',
		() => {
			live = false;
				tell({ live: false, box: null, n: 0, yaw: null, lock: false });
		},
		{ signal }
	);

	Promise.all([fetch(url, { signal }).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`mesh: HTTP ${r.status}`)))), document.fonts.load(`500 10px ${font}`), compiled])
		.then(([buffer]) => {
			if (signal.aborted || gl.isContextLost()) return;
			U = uniforms();
			mesh = parse(buffer);
			vao = gl.createVertexArray();
			gl.bindVertexArray(vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
			[0, 1, 2].forEach((i) => gl.enableVertexAttribArray(i));
			gl.vertexAttribPointer(0, 3, gl.SHORT, true, STRIDE, 0);
			gl.vertexAttribPointer(1, 3, gl.BYTE, true, STRIDE, 6);
			gl.vertexAttribPointer(2, 1, gl.BYTE, false, STRIDE, 9);
			gl.bindVertexArray(null);
			live = true;
			t0 = still ? performance.now() : Math.max(performance.now(), BOOT);
			raf = requestAnimationFrame(frame);
		})
		.catch((e) => signal.aborted || console.error('car art:', e));

	return () => {
		live = false;
		ac.abort();
		cancelAnimationFrame(raf);
		resized.disconnect();
		seen.disconnect();
		delete canvas.draw;
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	};
}
