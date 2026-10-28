# Ga Nha Trang, theo ảnh thật: nhà ga kiểu Pháp tường vàng, mái ngói cam bốn mái; gian giữa cao hơn với đầu hồi và đồng hồ,
# hàng cột trắng và cửa vòm phía trước (hướng phố); phía sau là sân ga có mái che dọc đường ray.
# Chạy: blender --background --factory-startup --python tools/blender/station.py -- assets/models/blender/station.glb
# Đơn vị = đơn vị mô hình của buildStation cũ (place(..., 0.3), quay theo hướng đường ray): nhà dài theo Y (bắc–nam),
# mặt tiền quay +X, sân ga ở phía −X. Mặt đất Z = 0.
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

WALL, TRIM, ROOF, ROOF2, WIN, COL, PLAT, CANOPY, POST, CLOCK = '#f0c75e', '#fbf3df', '#cf6a3b', '#b85a33', '#4a5560', '#fbf8f0', '#cfc8b8', '#8a8e93', '#6e6a62', '#f8f5ee'
def hip(cx, cy, z0, sx, sy, h, color):                        # mái bốn dốc (mái hông), sống mái dọc cạnh dài
    long_y = sy >= sx; r = abs(sy - sx) / 2
    if long_y: ridge = [(cx, cy - r, z0 + h), (cx, cy + r, z0 + h)]
    else: ridge = [(cx - r, cy, z0 + h), (cx + r, cy, z0 + h)]
    c = [(cx - sx / 2, cy - sy / 2, z0), (cx + sx / 2, cy - sy / 2, z0), (cx + sx / 2, cy + sy / 2, z0), (cx - sx / 2, cy + sy / 2, z0)]
    if long_y: faces(c + ridge, [[0, 1, 4], [1, 2, 5, 4], [2, 3, 5], [3, 0, 4, 5]], color)
    else: faces(c + ridge, [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]], color)
def arch_win(x, y, z0, w, h, color=WIN):                     # cửa vòm trên mặt +X / −X
    box(x, y, z0, 0.06, w, h, color); disc_y = Matrix.Rotation(math.pi / 2, 4, 'Y')
    add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=10, radius1=w / 2, radius2=w / 2, depth=0.06), color, Matrix.Translation((x, y, z0 + h)) @ disc_y)

# cánh nhà hai bên
for s in (-1, 1):
    box(0, s * 2.85, 0, 2.4, 3.3, 1.25, WALL); box(0, s * 2.85, 1.2, 2.5, 3.4, 0.08, TRIM)
    hip(0, s * 2.85, 1.28, 2.75, 3.65, 0.85, ROOF)
    for k in range(3): arch_win(1.22, s * (1.7 + k * 0.95), 0.2, 0.4, 0.62)
# gian giữa cao, có đầu hồi và đồng hồ ở mặt trước
box(0, 0, 0, 3.0, 2.5, 1.85, WALL); box(0, 0, 1.8, 3.1, 2.6, 0.1, TRIM)
hip(0, 0, 1.9, 3.35, 2.9, 1.25, ROOF2)
faces([(1.55, -0.75, 1.9), (1.55, 0.75, 1.9), (1.55, 0, 2.75)], [[0, 1, 2]], WALL)          # đầu hồi
add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=12, radius1=0.28, radius2=0.28, depth=0.05), CLOCK, Matrix.Translation((1.57, 0, 2.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
for k in range(3): arch_win(1.52, -0.75 + k * 0.75, 0.25, 0.42, 0.95)
# sảnh cột trắng phía trước
box(1.9, 0, 0, 0.8, 2.3, 0.08, TRIM)
for k in range(5): drum(2.15, -0.9 + k * 0.45, 0.08, 0.07, 1.05, COL, 8)
box(1.95, 0, 1.13, 0.95, 2.45, 0.14, TRIM)
box(1.95, 0, 1.27, 0.95, 2.45, 0.06, ROOF)
# sân ga và mái che phía sau (−X, dọc đường ray)
box(-1.75, 0, 0, 1.2, 11.0, 0.12, PLAT)
for k in range(6): box(-2.1, -5 + k * 2, 0.12, 0.08, 0.08, 0.85, POST)
faces([(-1.25, -5.5, 1.05), (-1.25, 5.5, 1.05), (-2.45, 5.5, 0.92), (-2.45, -5.5, 0.92)], [[0, 1, 2, 3]], CANOPY)
export('station')
