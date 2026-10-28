# Hàm dùng chung cho các script Blender trong thư mục này: gom mọi khối vào MỘT lưới, mỗi màu một vật liệu,
# rồi xuất GLB (+Y lên) cho tools/convert-models.js. Toạ độ Blender: X đông, Y bắc, Z lên.
import bpy, bmesh, sys, math
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'out.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)

def srgb(h):  # màu hex sRGB -> RGBA tuyến tính cho Principled BSDF
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]
MATS = {}
def mat(h):
    if h not in MATS:
        m = bpy.data.materials.new(h); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = srgb(h); b.inputs['Roughness'].default_value = 0.9
        MATS[h] = m
    return MATS[h]

BM = bmesh.new(); MI = []   # gom tất cả vào một lưới; MI = danh sách vật liệu theo chỉ số
def mi(h):
    if h not in MI: MI.append(h)
    return MI.index(h)
def add(geom_fn, color, M):
    tmp = bmesh.new(); geom_fn(tmp); bmesh.ops.transform(tmp, matrix=M, verts=tmp.verts)
    idx = mi(color)
    for f in tmp.faces: f.material_index = idx
    me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free(); BM.from_mesh(me); bpy.data.meshes.remove(me)
def box(cx, cy, z0, sx, sy, sz, color, rot=0):  # hộp: tâm (cx, cy), đáy z0, kích thước sx × sy × sz
    add(lambda b: bmesh.ops.create_cube(b, size=1), color,
        Matrix.Translation((cx, cy, z0 + sz / 2)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((sx, sy, sz, 1)))
def pyramid(cx, cy, z0, w, h, color, sides=4):
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=sides, radius1=w / math.sqrt(2) if sides == 4 else w / 2, radius2=0, depth=h), color,
        Matrix.Translation((cx, cy, z0 + h / 2)) @ Matrix.Rotation(math.pi / 4 if sides == 4 else 0, 4, 'Z'))
def column(cx, cy, z0, r, h, color, sides=8):
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=sides, radius1=r, radius2=r * 0.9, depth=h), color, Matrix.Translation((cx, cy, z0 + h / 2)))

# màu theo ảnh thật: gạch nung vàng đất / nâu cam, sân lát đá xám nhạt
def drum(cx, cy, z0, r, h, color, seg=32, r_top=None):   # trụ tròn đặc (r_top khác r thì thành nón cụt)
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=seg, radius1=r, radius2=r if r_top is None else r_top, depth=h), color, Matrix.Translation((cx, cy, z0 + h / 2)))
def faces(verts, quads, color):                     # lưới tự do: verts [(x,y,z)], quads [[i,...]]
    def f(b):
        vs = [b.verts.new(v) for v in verts]
        for q in quads: b.faces.new([vs[i] for i in q])
    add(f, color, Matrix.Identity(4))
def export(name):
    me = bpy.data.meshes.new(name); BM.to_mesh(me); BM.free()
    for h in MI: me.materials.append(mat(h))
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = False
    print('%s: %d tam giác' % (name, sum(len(p.vertices) - 2 for p in me.polygons)))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT', export_normals=True, export_texcoords=False)
