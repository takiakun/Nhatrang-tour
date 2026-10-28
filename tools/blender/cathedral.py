# Nhà thờ Núi (Nhà thờ Chánh tòa Kitô Vua, 1928–1933), theo ảnh thật: đá khối màu xám nâu, tháp chuông vuông ĐẦU BẰNG
# (có lan can, tháp nhỏ ở góc, mặt đồng hồ bốn phía, cửa chớp lầu chuông), mặt tiền có cửa sổ hoa hồng và ba cửa sổ vòm nhọn,
# thân nhà thờ dài mái dốc xám, hai bên là dãy hành lang vòm nhọn với trụ chống. Đặt trên đồi nhỏ.
# Chạy: blender --background --factory-startup --python tools/blender/cathedral.py -- assets/models/blender/cathedral.glb
# Đơn vị = đơn vị mô hình của buildCathedral cũ (place(..., 0.26)); trục thân nhà thờ theo X, tháp chuông ở đầu +X; mặt nền Z = 0.3.
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

STONE, STONE2, DARK, ROOF, GLASS, CLOCK, HILL, CROSS = '#877e70', '#958c7d', '#3a3d42', '#5a5e64', '#4f6d8a', '#efeadf', '#807a70', '#2f3236'
Z0 = 0.3
def disc(cx, cy, cz, r, color, axis='X', seg=16, t=0.06):   # đĩa phẳng dựng đứng, quay mặt theo trục axis
    R = Matrix.Rotation(math.pi / 2, 4, 'Y' if axis == 'X' else 'X')
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=t), color, Matrix.Translation((cx, cy, cz)) @ R)
def lancet(cx, cy, z0, w, h, color, axis='X'):               # cửa sổ vòm nhọn trên mặt tường vuông góc trục axis
    sx, sy = (0.06, w) if axis == 'X' else (w, 0.06)
    box(cx, cy, z0, sx, sy, h, color)
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=3, radius1=w * 0.58, radius2=0, depth=0.06), color,
        Matrix.Translation((cx, cy, z0 + h + w * 0.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y' if axis == 'X' else 'X') @ Matrix.Rotation(-math.pi / 2 if axis == 'X' else 0, 4, 'Z'))
def gable(x0, x1, cy, z0, w, h, color):                      # mái hai dốc dọc trục X
    faces([(x0, cy - w / 2, z0), (x1, cy - w / 2, z0), (x1, cy, z0 + h), (x0, cy, z0 + h), (x0, cy + w / 2, z0), (x1, cy + w / 2, z0)],
          [[0, 1, 2, 3], [3, 2, 5, 4], [0, 3, 4], [1, 5, 2]], color)

box(-0.3, 0, -2.3, 10.4, 5.2, Z0 + 2.3, HILL)                 # đồi đá
box(4.6, 0, Z0 - 0.5, 1.6, 2.2, 0.5, STONE2)                  # bậc lên cửa chính
# thân nhà thờ + mái
box(-0.9, 0, Z0, 7.4, 3.0, 2.6, STONE)
gable(-4.65, 2.85, 0, Z0 + 2.6, 3.3, 1.5, ROOF)
for k in range(6):                                            # cửa sổ cao trên tường thân (phía trên mái hành lang)
    x = -3.9 + k * 1.2
    for s in (-1, 1): lancet(x, s * 1.53, Z0 + 1.75, 0.34, 0.55, GLASS, 'Y')
# hành lang hai bên: tường thấp, vòm nhọn, trụ chống, mái nghiêng
for s in (-1, 1):
    box(-0.9, s * 1.85, Z0, 7.2, 0.7, 1.55, STONE2)
    faces([(-4.5, s * 1.5, Z0 + 1.95), (2.7, s * 1.5, Z0 + 1.95), (2.7, s * 2.3, Z0 + 1.5), (-4.5, s * 2.3, Z0 + 1.5)], [[0, 1, 2, 3] if s > 0 else [3, 2, 1, 0]], ROOF)
    for k in range(7):
        x = -4.1 + k * 1.1
        lancet(x, s * 2.21, Z0 + 0.1, 0.5, 0.75, DARK, 'Y')
        box(x + 0.55, s * 2.25, Z0, 0.18, 0.22, 1.35, STONE)  # trụ chống
# hậu cung (đầu −X): nửa bát giác
add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=8, radius1=1.5, radius2=1.5, depth=2.4), STONE, Matrix.Translation((-4.6, 0, Z0 + 1.2)))
add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=8, radius1=1.55, radius2=0, depth=1.2), ROOF, Matrix.Translation((-4.6, 0, Z0 + 3.0)))
# tháp chuông mặt tiền (đầu +X)
TX, TW, TH = 3.9, 2.3, 6.9
box(TX, 0, Z0, TW, TW, TH, STONE)
for (dx, dy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):          # trụ ốp góc thu nhỏ dần
    box(TX + dx * TW / 2, dy * TW / 2, Z0, 0.32, 0.32, TH - 0.4, STONE2)
for z in (Z0 + 2.4, Z0 + 4.4, Z0 + TH - 0.15):                 # gờ ngang
    box(TX, 0, z, TW + 0.2, TW + 0.2, 0.15, STONE2)
FX = TX + TW / 2 + 0.02                                        # mặt tiền hướng +X
lancet(FX, 0, Z0, 0.8, 0.95, DARK); box(FX + 0.05, 0, Z0 + 1.1, 0.06, 1.0, 0.18, STONE2)   # cửa chính
for y in (-0.42, 0, 0.42): lancet(FX, y, Z0 + 1.45, 0.26, 0.75 if y else 0.9, GLASS)       # ba cửa sổ vòm nhọn
disc(FX, 0, Z0 + 3.35, 0.55, STONE2); disc(FX + 0.02, 0, Z0 + 3.35, 0.42, GLASS, seg=12)   # cửa sổ hoa hồng
for (cx, cy, ax) in ((TX + TW / 2 + 0.02, 0, 'X'), (TX - TW / 2 - 0.02, 0, 'X'), (TX, TW / 2 + 0.02, 'Y'), (TX, -TW / 2 - 0.02, 'Y')):
    lancet(cx, cy, Z0 + 4.85, 0.3, 0.95, DARK, ax)           # cửa chớp lầu chuông
    lancet(cx + (0 if ax == 'X' else 0.38), cy + (0.38 if ax == 'X' else 0), Z0 + 4.85, 0.22, 0.95, DARK, ax)
    lancet(cx - (0 if ax == 'X' else 0.38), cy - (0.38 if ax == 'X' else 0), Z0 + 4.85, 0.22, 0.95, DARK, ax)
    disc(cx, cy, Z0 + 6.35, 0.3, CLOCK, ax, 12); disc(cx * 1.0 + (0.02 if ax == 'X' and cx > TX else (-0.02 if ax == 'X' else 0)), cy + (0.02 if ax == 'Y' and cy > 0 else (-0.02 if ax == 'Y' else 0)), Z0 + 6.35, 0.06, DARK, ax, 6)
# đầu tháp bằng: lan can răng cưa, tháp nhỏ bốn góc, thánh giá
box(TX, 0, Z0 + TH, TW + 0.1, TW + 0.1, 0.12, STONE2)
for i in range(5):
    t = -TW / 2 + i * TW / 4
    for (cx, cy) in ((TX + t, TW / 2), (TX + t, -TW / 2), (TX + TW / 2, t), (TX - TW / 2, t)):
        box(cx, cy, Z0 + TH + 0.12, 0.2, 0.2, 0.28, STONE)
for (dx, dy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
    box(TX + dx * TW / 2, dy * TW / 2, Z0 + TH, 0.36, 0.36, 0.55, STONE2); pyramid(TX + dx * TW / 2, dy * TW / 2, Z0 + TH + 0.55, 0.4, 0.45, ROOF)
box(TX, 0, Z0 + TH + 0.12, 0.12, 0.12, 1.1, CROSS); box(TX, 0, Z0 + TH + 0.85, 0.12, 0.6, 0.12, CROSS)
export('cathedral')
