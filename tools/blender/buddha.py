# Tượng Kim Thân Phật Tổ trên đồi Trại Thủy (chùa Long Sơn), theo ảnh thật: tượng trắng ngồi kiết già, tay đặt trong lòng,
# trên toà sen hai lớp cánh, đặt trên bệ bát giác cao (quanh bệ có phù điêu bảy vị tăng, ở đây là dải màu hơi đậm).
# Chạy: blender --background --factory-startup --python tools/blender/buddha.py -- assets/models/blender/buddha.glb
# Đơn vị = đơn vị mô hình của buildBuddha cũ (place(..., 0.3)); đỉnh đầu ~6 như bản cũ. Mặt đất Z = 0 (bệ ăn xuống đồi).
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

WHITE, WHITE2, BASE, RELIEF, LOTUS, LOTUS2, STEP = '#f6f4ee', '#e9e5db', '#e2ddd0', '#cfc6b4', '#f1ebe0', '#e6ddcf', '#d6d0c3'
def blob(cx, cy, cz, sx, sy, sz, color, sub=2, rx=0):        # khối tròn bầu dục (thân, chân, đầu)
    add(lambda b: bmesh.ops.create_icosphere(b, subdivisions=sub, radius=1), color,
        Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((sx, sy, sz, 1)))
def petals(n, r, z, w, h, tilt, color, off=0):               # vòng cánh sen nhọn quanh trục
    for i in range(n):
        a = off + i / n * math.tau
        add(lambda b: bmesh.ops.create_cone(b, cap_ends=True, segments=4, radius1=w, radius2=0, depth=h), color,
            Matrix.Translation((math.cos(a) * r, math.sin(a) * r, z + h / 2)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Diagonal((0.35, 1, 1, 1)))

# bậc và bệ bát giác
box(0, 0, -1.8, 6.2, 6.2, 1.9, STEP)
drum(0, 0, 0.1, 2.75, 0.25, BASE, 8)
drum(0, 0, 0.35, 2.45, 0.85, RELIEF, 8)                       # dải phù điêu
drum(0, 0, 1.2, 2.6, 0.18, BASE, 8)
# toà sen: đế tròn + hai lớp cánh
drum(0, 0, 1.38, 2.2, 0.35, LOTUS2, 24, 2.35)
petals(16, 2.15, 1.45, 0.42, 0.75, 0.55, LOTUS)
petals(16, 1.85, 1.6, 0.4, 0.75, 0.4, LOTUS2, math.pi / 16)
# tượng ngồi, mặt quay hướng đông (+X, về phía thành phố): chân xếp, thân, vai, tay, tay trong lòng, cổ, đầu, tai, nhục kế
Z, K = 1.85, 1.4
def part(fx, sy, z, ax, ay, az, color, sub=2, rx=0): blob(fx * K, sy * K, Z + z * K, ax * K, ay * K, az * K, color, sub, rx)
part(0.1, 0, 0.32, 1.05, 1.45, 0.42, WHITE)                    # hai chân xếp bằng
part(-0.1, 0, 1.3, 0.72, 0.95, 1.05, WHITE)                    # thân (áo cà sa)
part(-0.12, 0, 1.98, 0.6, 0.98, 0.42, WHITE2)                  # vai
for s in (-1, 1): part(0.05, s * 0.88, 1.35, 0.34, 0.3, 0.68, WHITE)   # cánh tay
part(0.55, 0, 0.78, 0.3, 0.62, 0.2, WHITE2)                     # hai bàn tay trong lòng (thiền định)
drum(-0.1 * K, 0, Z + 2.25 * K, 0.26 * K, 0.28 * K, WHITE, 10)  # cổ
part(-0.08, 0, 2.85, 0.52, 0.5, 0.62, WHITE)                    # đầu
for s in (-1, 1): part(-0.12, s * 0.5, 2.75, 0.14, 0.09, 0.33, WHITE2, 1)   # tai dài
part(-0.1, 0, 3.38, 0.3, 0.3, 0.24, WHITE2, 1)                  # nhục kế
export('buddha')
