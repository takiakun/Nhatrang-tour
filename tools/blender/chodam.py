# Chợ Đầm tròn (KTS Lê Quý Phong, xây 1969–1974): khối tròn đường kính ~66 m, mái giữa là "đoá sen" gồm các tấm mái gấp nếp
# hình chữ V xếp quanh tâm, màu gạch nung; vành ngoài là mái bằng màu xanh xám nhạt; tường trắng có cửa vòm. Theo ảnh chụp từ trên cao.
# Chạy: blender --background --factory-startup --python tools/blender/chodam.py -- assets/models/blender/chodam.glb
# Đơn vị = đơn vị mô hình của buildChoDam cũ (place(..., 0.3)): bán kính ngoài ~4.4 ⇒ ~66 m. Mặt đất ở Z = 0.
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

WALL, WALL2, ARCH, FLAT, RIM, PETAL, PETAL2, CORE, STEP = '#f2efe6', '#e2ddd0', '#5d6670', '#9fbdb0', '#e8e4da', '#9d4f2e', '#86402a', '#55504a', '#cfc8ba'
R = 4.4

box(0, 0, -0.6, 10.2, 10.2, 0.6, STEP)                      # nền sân chợ (lấp chỗ dốc)
drum(0, 0, 0, R, 1.75, WALL, 40)                             # thân tròn hai tầng
drum(0, 0, 0.82, R + 0.08, 0.1, WALL2, 40)                   # gờ giữa hai tầng
for i in range(28):                                          # cửa vòm tầng trệt và cửa sổ tầng lầu
    a = i / 28 * math.tau; x, y = math.cos(a) * (R + 0.01), math.sin(a) * (R + 0.01)
    box(x, y, 0.0, 0.08, 0.5, 0.62, ARCH, a); pyramid(x, y, 0.62, 0.36, 0.16, ARCH)
    box(x, y, 1.02, 0.08, 0.42, 0.5, ARCH, a)
for i in range(4):                                           # bốn cổng lớn, có mái hiên
    a = i / 4 * math.tau + math.pi / 4; x, y = math.cos(a) * (R + 0.25), math.sin(a) * (R + 0.25)
    box(x, y, 0, 0.6, 1.5, 1.2, WALL2, a); box(x * 1.04, y * 1.04, 0, 0.1, 0.9, 0.95, ARCH, a); box(x, y, 1.2, 0.85, 1.8, 0.1, RIM, a)
drum(0, 0, 1.75, R + 0.15, 0.14, FLAT, 40)                   # mái bằng vành ngoài
drum(0, 0, 1.89, R + 0.15, 0.1, RIM, 40, R + 0.1)            # lan can mái
drum(0, 0, 1.89, R - 0.1, 0.13, FLAT, 40)                    # mặt mái bằng (cao hơn lan can một chút để thấy màu)
drum(0, 0, 1.75, 2.65, 0.65, WALL, 32)                       # trống tròn đỡ đoá sen
# đoá sen: 24 tấm mái gấp nếp chữ V từ mép ngoài (r 3.0, thấp) lên lõi (r 0.8, cao); sống và rãnh xen kẽ
N = 24; verts = []; quads = []
for k in range(N * 2):
    a = k / (N * 2) * math.tau; ridge = k % 2 == 0
    ro, zo = (3.05, 2.55) if ridge else (2.75, 2.35)
    ri, zi = (0.85, 3.55) if ridge else (0.8, 3.4)
    verts += [(math.cos(a) * ro, math.sin(a) * ro, zo), (math.cos(a) * ri, math.sin(a) * ri, zi)]
for k in range(N * 2):
    j = (k + 1) % (N * 2)
    quads.append(([2 * k, 2 * j, 2 * j + 1, 2 * k + 1], PETAL if k % 2 == 0 else PETAL2))
for color in (PETAL, PETAL2): faces(verts, [q for q, c in quads if c == color], color)
# mặt dưới cánh sen (để nhìn từ thấp không bị thủng)
faces([(math.cos(k / 48 * math.tau) * 3.0, math.sin(k / 48 * math.tau) * 3.0, 2.35) for k in range(48)], [list(range(47, -1, -1))], WALL2)
drum(0, 0, 3.35, 0.82, 0.45, CORE, 24, 0.55)                 # lõi giữa, giếng trời
pyramid(0, 0, 3.8, 0.75, 0.35, CORE, 12)
export('chodam')
