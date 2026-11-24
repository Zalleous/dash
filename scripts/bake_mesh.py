"""Bake a car model (GLB) into the compact mesh that the car tile draws (src/lib/art.ts).

Dev-time only. Run from the repo root, with Blender on the PATH:

  blender -b --factory-startup --python-exit-code 1 \
    -P scripts/bake_mesh.py -- <model.glb> src/lib/assets/supra.bin [--list] [--ratio 0.5]

The source model is "Toyota Supra 2.5 GT Twin Turbo (A70)" by Mona x Supercars on Sketchfab, CC BY 4.0 (the title
tile credits it):
https://sketchfab.com/3d-models/toyota-supra-25-gt-twin-turbo-a70-6d002956a62a4e1085c6aab41b088ab1
Its GLB is not in the repo, only the baked mesh. The GLB is untrusted input: keep it in its own folder outside the
repo and pass its path.

File layout, little-endian:
  u32 magic 'SUP3', vertexCount, indexCount, indexBytes (2 or 4)
  f32 half[3]   half extents: length (always 1), height, width
  f32 axles[2]  x of the front and the rear axle
  f32 pod[3]    headlamp pods: hinge x, hinge y, lift angle in radians
  per vertex    i16 position[3] (value / 32767), i8 normal[3] (value / 127), i8 part
  padding to 4 bytes, then the indices
The part is a tone (0 body, 1 glass, 2 dark, 3 light), plus 4 times the number (1 to 15) of a piece that is
drawn with an outline of its own, plus 64 on a vertex that turns with a headlamp pod.
The pods are baked retracted. To raise them, turn the marked vertices about the hinge (a line along z)
by the lift angle, nose side up.
Axes: x runs from the nose (-1) to the tail (+1), y is up, z points to the car's left.
"""
import argparse
import struct
import sys

import bpy
import numpy as np

MAGIC = 0x33505553  # 'SUP3'
MAX_TRIANGLES = 100_000
MAX_BYTES = 2_500_000
FACTORY = (4620, 1310, 1760)  # mm: length, height, width. Only used by the --list comparison.

BODY, GLASS, DARK, LIGHT = 0, 1, 2, 3
# A piece that is drawn with an outline of its own: 4 times its number, added to the tone.
DOOR, HOOD, LID, DECK, WING, MIRROR, HANDLE, PIPE, PLATE = (4 * i for i in range(1, 10))
POD = 64  # added to the part of every triangle that turns with a headlamp pod
# Material -> part. A material that is not listed here is not baked (interior, engine bay, hidden shells).
PARTS = {
    'Color1Mtl': BODY,  # paint, wing and mirrors
    'Rim1Mtl': BODY,
    'Cpillartrim1Mtl': DARK,  # black trim, window seals, the Sport Roof panel
    'Textured1Mtl': DARK,  # tyres
    'BrakeDisc1Mtl': DARK,
    'Frontgrille1Mtl': DARK,
    'Filler1Mtl': DARK,
    'Cpillarwindow1Mtl': GLASS,
    'Glass1Mtl': LIGHT,
    'Taillightglass1Mtl': LIGHT,
    'Taillightglass2Mtl': LIGHT,
    'TurnSignalGlass1Mtl': LIGHT,
    'TurnSignalGlass2Mtl': LIGHT,
    'FoglightGlass1Mtl': LIGHT,
    'GimbalineDualExhaust1Mtl': BODY + PIPE,
    'Lock1Mtl': LIGHT + HANDLE,  # door locks: as bright as a light, and a piece of the handle, so they do not blink
    'Lock2Mtl': LIGHT + HANDLE,
}
TAIL = 'Taillightglass1Mtl'  # tells the tail from the nose
TYRE = 'Textured1Mtl'  # gives the axle positions
# The model has a black Sport Roof panel. The drawing shows a hardtop, so the panel joins the body.
# Box in mm at factory length: x range from the car centre, lowest y from the ground, half width.
ROOF = ('Cpillartrim1Mtl', (-90, 680), 1100, 600)
# Pieces of a material that get a part of their own; a piece counts when it lies fully inside the box, and a
# later row wins. Box in mm at factory length, the same on both sides: x range from the car centre, y range
# from the ground, range of the distance from the centre line.
PANELS = (
    ('Color1Mtl', BODY + DOOR, (-670, 810), (250, 835), (700, 870)),
    ('Color1Mtl', DARK + HANDLE, (515, 705), (655, 755), (825, 855)),  # recess and flap, black on this car
    ('Color1Mtl', BODY + HOOD, (-2110, -680), (620, 870), (0, 712)),
    ('Color1Mtl', BODY + DECK, (1850, 2190), (755, 890), (0, 650)),
    ('Color1Mtl', BODY + WING, (1975, 2195), (810, 930), (0, 745)),
    ('Color1Mtl', BODY + MIRROR, (-535, -305), (820, 980), (670, 905)),
    ('Ln1Mtl', GLASS, (-535, -305), (820, 980), (670, 905)),  # the mirror glass
    ('Meshpart1Mtl', BODY + PLATE, (2100, 2200), (500, 800), (0, 200)),  # the rear plate
)
# The headlamp pods. Lid, painted skirt, housing and lens are separate pieces of the model, drawn retracted.
# Box in mm at factory length, the same on both sides: x range from the car centre, y range from the ground,
# range of the distance from the centre line. The well under each lid reaches below the box, so it stays put.
PODS = ((-2125, -1830), (455, 710), (410, 715))
HINGE = (-1855, 694)  # mm, x from the car centre and y from the ground: the rear edge of the lid
LIFT = 53.5  # degrees: turns the lens from facing the road to facing forward


def load(path, ratio=1.0):
    """Triangles of every mesh in world space: positions (T,3,3), normals (T,3,3), material id (T,), names."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if ratio < 1:
        for ob in objects:
            ob.modifiers.new('decimate', 'DECIMATE').ratio = ratio
    graph = bpy.context.evaluated_depsgraph_get()
    names, pos, nor, mat = [], [], [], []
    for ob in objects:
        ev = ob.evaluated_get(graph)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        if n:
            vi = np.empty(n * 3, np.int32)
            li = np.empty(n * 3, np.int32)
            mi = np.empty(n, np.int32)
            co = np.empty(len(me.vertices) * 3, np.float32)
            cn = np.empty(len(me.loops) * 3, np.float32)
            me.loop_triangles.foreach_get('vertices', vi)
            me.loop_triangles.foreach_get('loops', li)
            me.loop_triangles.foreach_get('material_index', mi)
            me.vertices.foreach_get('co', co)
            me.corner_normals.foreach_get('vector', cn)
            world = np.array(ob.matrix_world, dtype=np.float64)
            slots = []
            for slot in ob.material_slots:
                name = slot.material.name if slot.material else ''
                if name not in names:
                    names.append(name)
                slots.append(names.index(name))
            pos.append((co.reshape(-1, 3)[vi] @ world[:3, :3].T + world[:3, 3]).reshape(n, 3, 3))
            nor.append((cn.reshape(-1, 3)[li] @ np.linalg.inv(world[:3, :3])).reshape(n, 3, 3))
            mat.append(np.array(slots or [names.index('') if '' in names else 0], np.int32)[mi])
        ev.to_mesh_clear()
    return np.concatenate(pos), np.concatenate(nor), np.concatenate(mat), names


def frame(pos, nor, mat, names):
    """Move the kept triangles into the drawing's axes (centred, x to the tail, y up, length 2). Returns positions, normals, half extents, axles."""
    kept = np.isin(mat, [i for i, n in enumerate(names) if n in PARTS])
    pts = pos[kept].reshape(-1, 3)
    lo, hi = pts.min(0), pts.max(0)
    size = hi - lo
    length, width, height = np.argsort(-size)
    assert height == 2, f'expected Z up after the import, sizes are {size}'
    x = np.zeros(3)
    x[length] = 1
    tail = pos[mat == names.index(TAIL)].reshape(-1, 3)[:, length].mean()
    if tail < (lo[length] + hi[length]) / 2:
        x = -x
    y = np.array([0.0, 0.0, 1.0])
    axes = np.stack([x, y, np.cross(x, y)])
    p = (pos - (lo + hi) / 2) @ axes.T * (2 / size[length])
    n = nor @ axes.T
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    half = (1.0, size[height] / size[length], size[width] / size[length])
    tyre = p[mat == names.index(TYRE)].reshape(-1, 3)[:, 0]
    front, rear = tyre[tyre < 0], tyre[tyre >= 0]
    axles = ((front.min() + front.max()) / 2, (rear.min() + rear.max()) / 2)
    return p, n, half, axles


def pieces(p, n, mat):
    """Connected piece of every triangle. Corners join when material, position (0.2 mm) and normal match."""
    key = np.concatenate([np.round(p * (FACTORY[0] / 2) * 5), np.round(n * 20),
                          np.broadcast_to(mat[:, None, None], p.shape[:2] + (1,))], -1)
    _, corner = np.unique(key.reshape(-1, 7), axis=0, return_inverse=True)
    corner = corner.reshape(-1, 3)
    label = np.arange(corner.max() + 1)
    while True:
        new = label.copy()
        np.minimum.at(new, corner.ravel(), np.repeat(label[corner].min(1), 3))
        if (new == label).all():
            return label[corner[:, 0]]
        label = new


def within(p, piece, half, box):
    """True for the triangles of every piece that lies fully inside the box."""
    mm = FACTORY[0] / 2
    (x0, x1), (y0, y1), (z0, z1) = box
    x, y, z = p[..., 0] * mm, (p[..., 1] + half[1]) * mm, np.abs(p[..., 2]) * mm
    inside = ((x > x0) & (x < x1) & (y > y0) & (y < y1) & (z >= z0) & (z < z1)).all(1)
    return ~np.isin(piece, piece[~inside])


def classify(p, n, mat, names, half):
    """Part of every triangle; -1 means the triangle is not baked."""
    part = np.array([PARTS.get(name, -1) for name in names])[mat]
    mm = FACTORY[0] / 2
    c = p.mean(1) * mm
    name, (x0, x1), y0, z1 = ROOF
    roof = (mat == names.index(name)) & (c[:, 0] > x0) & (c[:, 0] < x1) & (c[:, 1] + half[1] * mm > y0) & (np.abs(c[:, 2]) < z1)
    part[roof] = BODY
    piece = pieces(p, n, mat)
    for name, value, *box in PANELS:
        part[(mat == names.index(name)) & within(p, piece, half, box)] = value
    pod = (part >= 0) & within(p, piece, half, PODS)
    assert pod.any(), 'no headlamp pod found, check PODS'
    part[pod & (part == BODY)] += LID
    part[pod] += POD
    return part


def report(p, part, mat, names, half, axles):
    mm = FACTORY[0] / 2
    print(f'model ratios  height/length {half[1]:.4f}  width/length {half[2]:.4f}')
    print(f'factory       height/length {FACTORY[1] / FACTORY[0]:.4f}  width/length {FACTORY[2] / FACTORY[0]:.4f}')
    print(f'at length {FACTORY[0]} mm: height {half[1] * 2 * mm:.0f}, width {half[2] * 2 * mm:.0f}, '
          f'wheelbase {(axles[1] - axles[0]) * mm:.0f}, axles at {axles[0] * mm:.0f} and {axles[1] * mm:.0f}')
    tyre = p[mat == names.index(TYRE)].reshape(-1, 3)
    front = tyre[tyre[:, 0] < 0]
    print(f'front tyre diameter {(front[:, 1].max() - front[:, 1].min()) * mm:.0f} mm, '
          f'outer track {(tyre[:, 2].max() - tyre[:, 2].min()) * mm:.0f} mm')
    pod = part >= POD
    for side, sel in (('left', pod & (p[..., 2].mean(1) > 0)), ('right', pod & (p[..., 2].mean(1) < 0))):
        print(f'{side} headlamp pod: {int(sel.sum())} triangles, tones {np.bincount(part[sel] % 4, minlength=4).tolist()}')

    def box(q):
        lo, hi = q.min(0) * mm, q.max(0) * mm
        return (f'x[{lo[0]:6.0f} {hi[0]:6.0f}] y[{lo[1] + half[1] * mm:5.0f} {hi[1] + half[1] * mm:5.0f}] '
                f'z[{lo[2]:5.0f} {hi[2]:5.0f}]')

    print('mm from the car centre (x, z) and from the ground (y):')
    for value in np.unique(part[part >= 0]):
        print(f'{(part == value).sum():6d} tone {value % 4} piece {value % POD // 4:2d} {"pod" if value >= POD else "   "} '
              f'{box(p[part == value].reshape(-1, 3))}')
    for i in sorted(range(len(names)), key=lambda i: -(mat == i).sum()):
        if (mat == i).any():
            print(f'{(mat == i).sum():6d} {names[i]:28s} {PARTS.get(names[i], "skip")!s:5s} {box(p[mat == i].reshape(-1, 3))}')


def bake(p, n, part, half, axles, out):
    keep = part >= 0
    dtype = np.dtype([('p', '<i2', 3), ('n', 'i1', 3), ('k', 'i1')])
    v = np.zeros(int(keep.sum()) * 3, dtype)
    v['p'] = np.round(np.clip(p[keep], -1, 1) * 32767).reshape(-1, 3)
    v['n'] = np.round(n[keep] * 127).reshape(-1, 3)
    v['k'] = np.repeat(part[keep], 3)
    # Weld: corners that quantize to the same bytes share one vertex.
    verts, index = np.unique(v.view(np.uint8).reshape(-1, dtype.itemsize), axis=0, return_inverse=True)
    tri = index.reshape(-1, 3)
    tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]
    wide = len(verts) > 65535
    mm = FACTORY[0] / 2
    pod = (HINGE[0] / mm, HINGE[1] / mm - half[1], np.radians(LIFT))
    data = struct.pack('<4I8f', MAGIC, len(verts), tri.size, 4 if wide else 2, *half, *axles, *pod) + verts.tobytes()
    data += b'\0' * (-len(data) % 4) + tri.astype('<u4' if wide else '<u2').tobytes()
    assert len(tri) <= MAX_TRIANGLES, f'{len(tri)} triangles, lower --ratio'
    assert len(data) <= MAX_BYTES, f'{len(data)} bytes, lower --ratio'
    with open(out, 'wb') as f:
        f.write(data)
    print(f'{out}: {len(verts)} vertices, {len(tri)} triangles, {len(data)} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('src')
    parser.add_argument('out', nargs='?')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--ratio', type=float, default=1.0)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    pos, nor, mat, names = load(args.src, args.ratio)
    p, n, half, axles = frame(pos, nor, mat, names)
    part = classify(p, n, mat, names, half)
    if args.list or not args.out:
        report(p, part, mat, names, half, axles)
    else:
        bake(p, n, part, half, axles, args.out)
