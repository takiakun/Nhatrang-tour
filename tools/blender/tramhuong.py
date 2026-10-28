# Tháp Trầm Hương (Quảng trường 2/4), theo ảnh thật: búp sen gồm 4 cánh lớn màu hồng cam bao quanh lõi kính xanh,
# trên đỉnh là búp sen nhỏ 4 cánh và mũi nhọn; bệ vuông nhiều bậc, bốn tượng sóng trắng cách điệu quanh chân tháp.
# Chạy: blender --background --factory-startup --python tools/blender/tramhuong.py -- assets/models/blender/tramhuong.glb
# Đơn vị = đơn vị mô hình của buildTramHuong cũ (place(..., 0.22)); cao ~13.4 như bản cũ để nhãn neo đỉnh không đổi. Mặt đất Z = 0.
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

PETAL, PETAL2, GLASS, TIP, PLINTH, STEP, WAVE = '#eaa68b', '#df9a80', '#3f7d86', '#f1c79b', '#e6e1d7', '#d8d2c6', '#f5f2ec'

def petal(ang, z0, h, r0, rmax, w, th, color):
    # cánh sen: mặt cong khép kín (mặt ngoài + mặt trong + viền), quay về hướng ang
    NU, NV = 7, 9; verts = []; quads = []
    for side, dr in ((0, 0), (1, -th)):
        for j in range(NV):
            # dáng vòm nhọn: rộng gần như đều ở nửa dưới rồi thu về mũi nhọn; hơi phình ra ở giữa, mũi chụm vào trong
            t = j / (NV - 1); r = r0 + (rmax - r0) * math.sin(math.pi * min(1.0, t * 0.85)) + dr - (rmax - r0) * 0.6 * max(0.0, t - 0.7) / 0.3
            half = (w / 2) * (1.0 if t < 0.45 else math.cos((t - 0.45) / 0.55 * math.pi / 2)) + 0.01
            for i in range(NU):
                a = ang + (i / (NU - 1) - 0.5) * 2 * half
                verts.append((math.cos(a) * max(r, 0.05), math.sin(a) * max(r, 0.05), z0 + h * t))
    V = lambda s, j, i: s * NU * NV + j * NU + i
    for j in range(NV - 1):
        for i in range(NU - 1):
            quads.append([V(0, j, i), V(0, j, i + 1), V(0, j + 1, i + 1), V(0, j + 1, i)])
            quads.append([V(1, j, i + 1), V(1, j, i), V(1, j + 1, i), V(1, j + 1, i + 1)])
        quads.append([V(0, j, 0), V(0, j + 1, 0), V(1, j + 1, 0), V(1, j, 0)])
        quads.append([V(0, j + 1, NU - 1), V(0, j, NU - 1), V(1, j, NU - 1), V(1, j + 1, NU - 1)])
    faces(verts, quads, color)

# bệ: ba bậc vuông
for k, (s, h) in enumerate(((6.4, 0.25), (5.4, 0.25), (4.4, 0.3))):
    box(0, 0, k * 0.25, s, s, h, STEP if k % 2 else PLINTH)
Z = 0.8
# tượng sóng trắng: khối tròn chồng nhau, cuộn ra ngoài, ở 4 hướng chéo
for q in range(4):
    a = math.pi / 4 + q * math.pi / 2; cx, cy = math.cos(a) * 2.55, math.sin(a) * 2.55
    for (dr, dz, r) in ((0, 0.45, 0.5), (0.35, 0.95, 0.38), (0.1, 1.3, 0.3), (-0.3, 0.9, 0.34)):
        add(lambda b, r=r: bmesh.ops.create_icosphere(b, subdivisions=1, radius=r), WAVE, Matrix.Translation((cx + math.cos(a) * dr, cy + math.sin(a) * dr, Z + dz)))
    box(cx, cy, Z, 0.9, 0.9, 0.35, WAVE)
# lõi kính và 4 cánh lớn
drum(0, 0, Z, 1.25, 8.4, GLASS, 12, 0.7)
for q in range(4): petal(q * math.pi / 2, Z, 9.4, 1.3, 1.75, 1.1, 0.18, PETAL if q % 2 else PETAL2)
# búp sen nhỏ trên đỉnh và mũi
drum(0, 0, Z + 8.2, 0.75, 1.2, GLASS, 8, 0.5)
for q in range(4): petal(math.pi / 4 + q * math.pi / 2, Z + 8.4, 3.2, 0.6, 0.85, 1.15, 0.12, PETAL2 if q % 2 else PETAL)
add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=8, radius1=0.42, radius2=0, depth=2.4), TIP, Matrix.Translation((0, 0, Z + 11.4)))
export('tramhuong')
