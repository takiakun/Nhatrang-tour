# Dựng Tháp Bà Ponagar (low-poly, màu theo vật liệu) rồi xuất GLB cho tools/convert-models.js.
# Chạy: blender --background --factory-startup --python tools/blender/ponagar.py -- assets/models/blender/ponagar.glb
# Toạ độ Blender: X đông, Y bắc, Z lên; đơn vị = "đơn vị mô hình" của scene.js (buildPonagar cũ), mặt sân trên ở Z = 0.35.
# Cấu trúc theo quần thể thật: ba tháp gạch xếp hàng bắc–nam trên nền cao, cửa quay về hướng đông,
# tháp chính (thờ Po Inư Nagar) lớn nhất ở phía bắc; phía đông, thấp hơn, là tiền đình Mandapa với hai hàng cột bát giác.
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

# màu theo ảnh thật: gạch nung vàng đất / nâu cam, sân lát đá xám nhạt
BRICK, BRICK2, CORN, DOOR, STONE, STEP, PILLAR, GILT, PAVE = '#c58c58', '#b57d4c', '#9e6a41', '#3a2a1f', '#b9a58a', '#b39d84', '#bb8556', '#c9a24a', '#cfc8ba'
G0 = 0.35   # mặt sân thấp (tiền đình); sân tháp cao hơn 0.6

# nền đồi + hai cấp sân
box(-0.3, 0, -2.65, 8.6, 12.8, 3.0, STONE)
box(-1.05, 0, G0, 4.9, 11.6, 0.6, STONE)                      # sân tháp
box(-1.05, 0, G0 + 0.6, 5.1, 11.8, 0.06, PAVE)                 # mặt sân lát đá
box(2.9, 0, G0, 3.4, 11.0, 0.04, PAVE)                         # sân tiền đình
for i in range(4):                                             # bậc thang lên sân tháp, giữa mặt đông
    box(1.6 + i * 0.22, 0.4, G0, 0.22, 1.6, 0.6 - i * 0.15, STEP)

def tower(x, y, s, roof='tiers'):
    z = G0 + 0.6
    box(x, y, z, s * 1.18, s * 1.18, 0.22 * s, CORN); z += 0.22 * s      # chân tháp
    bh = 1.3 * s; box(x, y, z, s, s, bh, BRICK)                           # thân
    for k in (-1, 1):                                                      # trụ áp tường (4 mặt × 2 trụ)
        o = k * s * 0.36
        for (dx, dy, sx, sy) in ((o, s / 2, 0.08 * s, 0.06 * s), (o, -s / 2, 0.08 * s, 0.06 * s), (s / 2, o, 0.06 * s, 0.08 * s), (-s / 2, o, 0.06 * s, 0.08 * s)):
            box(x + dx, y + dy, z, sx, sy, bh, BRICK2)
    for (dx, dy, rot) in ((0, s / 2, 0), (0, -s / 2, 0), (-s / 2, 0, math.pi / 2)):   # cửa giả ba mặt bắc, nam, tây
        box(x + dx, y + dy, z + 0.15 * s, 0.4 * s, 0.07 * s, 0.75 * s, CORN, rot)
        box(x + dx * 1.04, y + dy * 1.04, z + 0.22 * s, 0.22 * s, 0.05 * s, 0.5 * s, DOOR, rot)
        pyramid(x + dx * 1.02, y + dy * 1.02, z + 0.9 * s, 0.34 * s, 0.25 * s, CORN)
    # tiền sảnh cửa chính phía đông, mái hai dốc
    box(x + s * 0.68, y, z, 0.4 * s, 0.46 * s, 0.85 * s, BRICK)
    box(x + s * 0.89, y, z, 0.03 * s, 0.24 * s, 0.6 * s, DOOR)
    pyramid(x + s * 0.68, y, z + 0.85 * s, 0.5 * s, 0.32 * s, CORN)
    z += bh; box(x, y, z, s * 1.12, s * 1.12, 0.1 * s, CORN); z += 0.1 * s   # gờ mái
    if roof == 'pyramid':                                                  # mái chóp nhọn cao (tháp giữa trong ảnh)
        for (cx, cy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            pyramid(x + cx * s * 0.5, y + cy * s * 0.5, z, 0.18 * s, 0.3 * s, CORN)
        pyramid(x, y, z, s * 1.02, s * 1.45, BRICK2)
        add(lambda b: bmesh.ops.create_icosphere(b, subdivisions=1, radius=0.06 * s), GILT, Matrix.Translation((x, y, z + s * 1.47)))
        return
    for i in (1, 2, 3):                                                    # ba tầng mái thu nhỏ dần, mỗi góc một tháp nhỏ
        w = s * (1 - 0.2 * i); th = 0.48 * s * (1 - 0.1 * i)
        box(x, y, z, w, w, th, BRICK if i % 2 else BRICK2)
        for (cx, cy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):                # tháp nhỏ ở góc
            mx, my, ms = x + cx * w * 0.5, y + cy * w * 0.5, 0.16 * s * (1 - 0.15 * i)
            box(mx, my, z, ms, ms, th * 0.75, BRICK2); pyramid(mx, my, z + th * 0.75, ms * 1.1, ms * 1.2, CORN)
        for (cx, cy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):                  # khám vòm (kudu) giữa mỗi cạnh
            pyramid(x + cx * w * 0.52, y + cy * w * 0.52, z + th * 0.15, 0.18 * s * (1 - 0.15 * i), th * 0.9, CORN)
        z += th; box(x, y, z, w * 1.08, w * 1.08, 0.07 * s, CORN); z += 0.07 * s
    pyramid(x, y, z, s * 0.42, s * 0.7, CORN)                              # chóp
    add(lambda b: bmesh.ops.create_icosphere(b, subdivisions=1, radius=0.07 * s), GILT, Matrix.Translation((x, y, z + s * 0.72)))

tower(-1.1, 3.4, 2.7)    # tháp chính (bắc)
tower(-0.9, -0.4, 1.9, 'pyramid')   # tháp giữa, mái chóp
tower(-0.8, -3.4, 1.55)  # tháp nam

# tiền đình Mandapa: 2 hàng × 5 cột bát giác gạch, đầu cột vuông
for r in range(2):
    for c in range(5):
        x, y = 2.5 + r * 1.25, -2.9 + c * 1.45
        box(x, y, G0, 0.62, 0.62, 0.12, STONE)
        column(x, y, G0 + 0.12, 0.24, 1.9, PILLAR)
        box(x, y, G0 + 2.02, 0.52, 0.52, 0.12, CORN)

export('ponagar')
