"""
Procedural scene renderer for NVIDIA: THE FALL.

Draws the office, war-room, title and ending backdrops as clean 1920x1080 images
(NO labels, outlines or UI baked in) and writes the exact hotspot polygons used by
the game to static/data/hotspots.json, so hotspots always line up with the art.

Usage:  python tools/render_scenes.py
Everything here is original, generic artwork: no real logos, brands or people.
"""
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "img"
DATA = ROOT / "static" / "data"
OUT.mkdir(parents=True, exist_ok=True)
DATA.mkdir(parents=True, exist_ok=True)

W, H, S = 1920, 1080, 2
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
GREEN = (118, 185, 0)


def font(sz):
    try:
        return ImageFont.truetype(MONO, int(sz * S))
    except OSError:
        return ImageFont.load_default()


class Layer:
    def __init__(self):
        self.im = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def _p(self, pts):
        return [(x * S, y * S) for x, y in pts]

    def poly(self, pts, fill):
        self.d.polygon(self._p(pts), fill=fill)

    def rect(self, x0, y0, x1, y1, fill, r=0):
        if r:
            self.d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill)
        else:
            self.d.rectangle([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill)

    def ellipse(self, x0, y0, x1, y1, fill):
        self.d.ellipse([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill)

    def line(self, pts, fill, width=1):
        self.d.line(self._p(pts), fill=fill, width=max(1, int(width * S)))

    def text(self, xy, s, fill, sz=14):
        self.d.text((xy[0] * S, xy[1] * S), s, fill=fill, font=font(sz))

    def grad_poly(self, pts, c0, c1, vertical=True):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, y0, x1, y1 = int(min(xs) * S), int(min(ys) * S), int(max(xs) * S) + 1, int(max(ys) * S) + 1
        w, h = x1 - x0, y1 - y0
        t = np.linspace(0, 1, h if vertical else w, dtype=np.float32)
        t = t[:, None] if vertical else t[None, :]
        c0, c1 = np.array(c0, np.float32), np.array(c1, np.float32)
        arr = (c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None])
        arr = np.broadcast_to(arr, (h, w, 4)).astype(np.uint8)
        g = Image.fromarray(arr, "RGBA")
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).polygon([(x * S - x0, y * S - y0) for x, y in pts], fill=255)
        self.im.paste(g, (x0, y0), m)

    def blur(self, r):
        self.im = self.im.filter(ImageFilter.GaussianBlur(r * S))
        self.d = ImageDraw.Draw(self.im)
        return self


class Canvas:
    def __init__(self, base=(4, 8, 12)):
        self.im = Image.new("RGBA", (W * S, H * S), base + (255,))

    def add(self, layer):
        self.im = Image.alpha_composite(self.im, layer.im)

    def glow(self, layer, radius, strength=1.0):
        """additive bloom"""
        src = np.asarray(layer.im, np.float32).copy()
        bright = (src[..., :3].max(axis=2) > 110) & (src[..., 3] > 90)      # bloom only the bright pixels
        src[~bright] = 0
        b = Image.fromarray(src.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(radius * S))
        a = np.asarray(self.im, np.float32)
        g = np.asarray(b, np.float32)
        a[..., :3] = np.clip(a[..., :3] + g[..., :3] * (g[..., 3:4] / 255.0) * strength, 0, 255)
        self.im = Image.fromarray(a.astype(np.uint8), "RGBA")

    def finish(self, path, grade=(0.96, 1.0, 1.04), vignette=0.55, grain=3.2, seed=3):
        img = self.im.convert("RGB").resize((W, H), Image.LANCZOS)
        a = np.asarray(img, np.float32) / 255.0
        a *= np.array(grade, np.float32)[None, None, :]
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        a *= (1 - vignette * np.clip(d - 0.35, 0, 1) ** 1.5)[..., None]
        rng = np.random.default_rng(seed)
        a += rng.normal(0, grain / 255.0, a.shape).astype(np.float32)
        Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(path, quality=90, optimize=True)


# ------------------------------------------------------------------ helpers
def skyline(c, x0, y0, x1, y1, seed=1, warm=0.55, density=1.0, haze=(20, 60, 90), beacon=True):
    """Night city seen through glass: layered buildings with lit windows."""
    rng = random.Random(seed)
    sky = Layer()
    sky.grad_poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], (4, 10, 26, 255), haze + (255,))
    c.add(sky)
    for depth, (shade, hmin, hmax, wmin, wmax) in enumerate([(0.30, 160, 460, 40, 90), (0.55, 110, 360, 50, 110), (0.9, 40, 250, 60, 130)]):
        lay = Layer()
        x = x0 - 30
        while x < x1:
            bw = rng.randint(wmin, wmax)
            bh = rng.randint(hmin, hmax)
            top = y1 - bh
            col = tuple(int(v * shade) for v in (14, 22, 36)) + (255,)
            lay.rect(x, top, x + bw, y1 + 4, col)
            lay.rect(x, top, x + bw, top + 2, tuple(int(v * shade) for v in (50, 80, 110)) + (255,))
            step = 11 if depth == 2 else 9
            for wy in range(int(top) + 8, int(y1) - 4, step + 5):
                for wx in range(int(x) + 6, int(x + bw) - 6, step + 3):
                    if rng.random() < 0.34 * density:
                        wc = (255, 206, 130) if rng.random() < warm else (150, 215, 255)
                        a = int(255 * (0.45 + 0.5 * shade) * rng.uniform(0.6, 1.0))
                        lay.rect(wx, wy, wx + step - 4, wy + 6 if depth == 2 else wy + 4, wc + (a,))
            if beacon and rng.random() < 0.12 and depth == 1:
                lay.ellipse(x + bw / 2 - 2, top - 5, x + bw / 2 + 2, top - 1, (255, 40, 40, 255))
            x += bw + rng.randint(-6, 10)
        if depth < 2:
            lay.blur(0.6 + 0.4 * (1 - depth))
        c.add(lay)
        g = Layer()
        g.im = lay.im.copy()
        c.glow(g, 6, 0.55)
    return c


def vlight_beam(c, pts, color=(190, 230, 255), a0=70, a1=0):
    lay = Layer()
    lay.grad_poly(pts, color + (a0,), color + (a1,))
    lay.blur(14)
    c.add(lay)


def dust(c, box, n=140, seed=5):
    rng = random.Random(seed)
    lay = Layer()
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        r = rng.uniform(0.8, 2.2)
        lay.ellipse(x - r, y - r, x + r, y + r, (230, 245, 255, rng.randint(60, 190)))
    c.add(lay)
    g = Layer()
    g.im = lay.im.copy()
    c.glow(g, 3, 0.8)


def leaf(L, sx, sy, ang, ln, wd, col, rim=(120, 190, 160, 90)):
    """curved pointed leaf blade"""
    mx, my = sx + math.sin(ang) * ln * 0.55, sy - math.cos(ang) * ln * 0.75
    ex, ey = sx + math.sin(ang) * ln * 0.95 + math.copysign(ln * 0.12, ang), sy - math.cos(ang) * ln * 0.80 + ln * 0.18
    left, right, mid = [], [], []
    for k in range(11):
        t = k / 10
        px = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t * t * ex
        py = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t * t * ey
        dx = 2 * (1 - t) * (mx - sx) + 2 * t * (ex - mx)
        dy = 2 * (1 - t) * (my - sy) + 2 * t * (ey - my)
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        w = wd * (math.sin(math.pi * min(1, t * 1.05)) ** 0.7) / 2
        left.append((px + nx * w, py + ny * w))
        right.append((px - nx * w, py - ny * w))
        mid.append((px, py))
    L.poly(left + right[::-1], col)
    L.line(mid, rim, 2)


def plant(c, cx, base_y, h=330, seed=1, scale=1.0, tint=(16, 64, 40)):
    rng = random.Random(seed)
    lay = Layer()
    pot_w = 62 * scale
    lay.grad_poly([(cx - pot_w, base_y - 96 * scale), (cx + pot_w, base_y - 96 * scale), (cx + pot_w * 0.72, base_y), (cx - pot_w * 0.72, base_y)],
                  (38, 44, 50, 255), (14, 18, 22, 255))
    lay.rect(cx - pot_w, base_y - 100 * scale, cx + pot_w, base_y - 90 * scale, (70, 82, 90, 255), 3)
    lay.rect(cx - pot_w * 0.95, base_y - 96 * scale, cx - pot_w * 0.80, base_y - 6 * scale, (130, 170, 190, 60))
    for i in range(22):
        ang = rng.uniform(-1.2, 1.2)
        ln = rng.uniform(0.5, 1.0) * h * scale
        shade = rng.uniform(0.65, 1.25)
        col = tuple(min(255, int(v * shade)) for v in tint) + (255,)
        leaf(lay, cx + rng.uniform(-10, 10), base_y - 96 * scale, ang, ln, rng.uniform(46, 74) * scale, col)
    c.add(lay)
    return lay


def screen_lines(lay, x0, y0, x1, y1, seed=1, color=(120, 255, 190), rows=14, skew=0.0):
    rng = random.Random(seed)
    h = (y1 - y0) / rows
    for r in range(rows):
        x = x0 + 10
        y = y0 + 8 + r * h
        while x < x1 - 16:
            w = rng.randint(14, 60)
            if x + w > x1 - 12:
                break
            lay.rect(x, y, x + w, y + h * 0.42, color + (rng.randint(60, 210),))
            x += w + rng.randint(6, 16)


# ------------------------------------------------------------------ OFFICE
def office():
    c = Canvas((6, 10, 14))
    # ---- shell
    sh = Layer()
    sh.grad_poly([(0, 0), (W, 0), (1660, 120), (260, 120)], (8, 12, 16, 255), (16, 22, 28, 255))                # ceiling
    sh.grad_poly([(0, 0), (260, 120), (260, 770), (0, H)], (14, 18, 20, 255), (26, 30, 32, 255), vertical=False)    # left wall
    sh.grad_poly([(W, 0), (1660, 120), (1660, 770), (W, H)], (14, 18, 20, 255), (26, 30, 32, 255), vertical=False)
    sh.grad_poly([(260, 120), (1660, 120), (1660, 770), (260, 770)], (20, 26, 30, 255), (24, 30, 32, 255))        # back wall
    sh.grad_poly([(0, H), (260, 770), (1660, 770), (W, H)], (14, 16, 20, 255), (6, 8, 10, 255))                    # floor
    c.add(sh)
    # wood slats on side walls
    sl = Layer()
    for i in range(0, 14):
        t = i / 14
        x = 260 * t
        sl.line([(x, 120 * t), (x, 1080 - 310 * t)], (46, 34, 24, 120), 3)
        xr = W - 260 * t
        sl.line([(xr, 120 * t), (xr, 1080 - 310 * t)], (46, 34, 24, 120), 3)
    c.add(sl)
    # ceiling LED strips (green accent) and spots
    led = Layer()
    led.poly([(310, 134), (1610, 134), (1620, 140), (300, 140)], GREEN + (255,))
    led.line([(200, 96), (60, 20)], GREEN + (200,), 3)
    led.line([(1720, 96), (1860, 20)], GREEN + (200,), 3)
    for x in (560, 960, 1360):
        led.ellipse(x - 24, 62, x + 24, 78, (255, 235, 200, 255))
    c.add(led)
    c.glow(led, 14, 1.2)
    # ---- window with city
    wx0, wy0, wx1, wy1 = 560, 170, 1400, 730
    skyline(c, wx0, wy0, wx1, wy1, seed=4, density=1.5, haze=(26, 70, 100))
    fr = Layer()
    for i in range(6):
        x = wx0 + (wx1 - wx0) * i / 5
        fr.rect(x - 5, wy0 - 8, x + 5, wy1 + 8, (8, 10, 12, 255))
    fr.rect(wx0 - 10, wy0 - 14, wx1 + 10, wy0 + 2, (8, 10, 12, 255))
    fr.rect(wx0 - 10, wy1 - 2, wx1 + 10, wy1 + 14, (8, 10, 12, 255))
    c.add(fr)
    refl = Layer()
    refl.poly([(wx0 + 60, wy0), (wx0 + 190, wy0), (wx0 + 40, wy1), (wx0 - 90, wy1)], (200, 230, 255, 22))
    refl.poly([(wx0 + 330, wy0), (wx0 + 400, wy0), (wx0 + 250, wy1), (wx0 + 180, wy1)], (200, 230, 255, 16))
    c.add(refl)
    # ---- light beams from window
    vlight_beam(c, [(wx0 + 40, wy1 - 20), (wx1 - 40, wy1 - 20), (1500, 1060), (420, 1060)], (150, 205, 255), 26, 0)
    # ---- left back wall: CCTV monitor on bracket
    cc = Layer()
    cc.rect(278, 318, 482, 458, (10, 12, 14, 255), 8)
    cc.grad_poly([(290, 330), (470, 330), (470, 446), (290, 446)], (18, 56, 44, 255), (8, 30, 24, 255))
    # corridor in screen
    cc.poly([(318, 440), (442, 440), (400, 352), (360, 352)], (26, 90, 68, 255))
    cc.poly([(360, 352), (400, 352), (392, 366), (368, 366)], (12, 40, 30, 255))
    cc.rect(374, 370, 386, 394, (4, 18, 14, 255))
    for yy in range(334, 446, 4):
        cc.line([(290, yy), (470, yy)], (0, 0, 0, 55), 1)
    cc.ellipse(296, 336, 304, 344, (255, 50, 50, 255))
    cc.text((310, 334), "CAM 04", (150, 255, 200, 230), 10)
    cc.rect(372, 458, 388, 480, (10, 12, 14, 255))
    cc.rect(340, 478, 420, 486, (10, 12, 14, 255))
    c.add(cc)
    g = Layer()
    g.rect(290, 330, 470, 446, (60, 255, 170, 120))
    c.glow(g, 22, 0.9)
    # ---- right back wall: framed statement + spot
    spot = Layer()
    spot.poly([(1540, 130), (1620, 130), (1690, 640), (1470, 640)], (255, 235, 200, 38))
    spot.blur(18)
    c.add(spot)
    fm = Layer()
    fm.rect(1488, 290, 1646, 526, (24, 18, 12, 255), 4)
    fm.rect(1498, 300, 1636, 516, (214, 210, 196, 255))
    for i in range(12):
        fm.rect(1514, 322 + i * 15, 1620 - (i % 4) * 14, 326 + i * 15, (90, 92, 90, 255))
    fm.rect(1514, 310, 1580, 316, (60, 62, 60, 255))
    c.add(fm)
    sw = Layer()
    sw.rect(1498, 300, 1636, 516, (255, 245, 220, 60))
    c.glow(sw, 16, 0.6)
    # ---- plants
    plant(c, 110, 790, 360, seed=2, scale=1.15)
    plant(c, 1760, 770, 300, seed=8, scale=1.0)
    # ---- floor reflection streaks
    fl = Layer()
    for x in (700, 860, 1030, 1210):
        fl.poly([(x - 14, 780), (x + 14, 780), (x + 60, 1080), (x - 60, 1080)], (130, 190, 255, 16))
    fl.blur(6)
    c.add(fl)
    # ---- rug
    rg = Layer()
    rg.poly([(300, 940), (1620, 940), (1830, 1080), (90, 1080)], (18, 26, 30, 255))
    rg.line([(300, 940), (1620, 940)], (60, 90, 80, 120), 2)
    c.add(rg)
    # ---- chair (behind desk), rim-lit
    ch = Layer()
    ch.rect(880, 470, 1100, 800, (16, 17, 20, 255), 84)
    ch.grad_poly([(900, 500), (1080, 500), (1080, 780), (900, 780)], (34, 36, 42, 255), (16, 17, 20, 255))
    ch.rect(908, 440, 1072, 520, (22, 23, 27, 255), 44)                 # headrest
    ch.line([(990, 530), (990, 770)], (8, 8, 10, 255), 3)               # centre seam
    ch.line([(944, 540), (944, 770)], (8, 8, 10, 160), 2)
    ch.line([(1036, 540), (1036, 770)], (8, 8, 10, 160), 2)
    ch.rect(850, 690, 896, 800, (12, 12, 14, 255), 10)                  # arms
    ch.rect(1084, 690, 1130, 800, (12, 12, 14, 255), 10)
    ch.rect(930, 470, 1050, 480, (110, 150, 175, 90), 5)                # top sheen
    ch.line([(886, 520), (884, 700)], (150, 210, 235, 170), 3)          # rim lights from window
    ch.line([(1094, 520), (1096, 700)], (150, 210, 235, 150), 3)
    ch.line([(856, 696), (894, 696)], (150, 210, 235, 150), 2)
    c.add(ch)
    # ---- desk
    dk = Layer()
    dk.grad_poly([(300, 906), (1670, 906), (1670, H), (300, H)], (32, 22, 16, 255), (14, 10, 8, 255))               # front face
    dk.rect(340, 940, 1000, 1040, (22, 15, 11, 255), 6)                                                               # modesty recess
    for k in range(3):                                                                                                # drawers right
        y = 930 + k * 50
        dk.rect(1260, y, 1630, y + 42, (36, 25, 18, 255), 4)
        dk.rect(1420, y + 17, 1470, y + 23, (150, 135, 110, 255), 2)
    dk.grad_poly([(430, 780), (1540, 780), (1680, 906), (300, 906)], (92, 62, 42, 255), (52, 34, 24, 255))            # top
    dk.line([(300, 906), (1680, 906)], (190, 140, 100, 230), 3)
    dk.line([(430, 780), (1540, 780)], (130, 96, 70, 200), 2)
    # blotter
    dk.poly([(820, 840), (1130, 840), (1170, 892), (780, 892)], (14, 16, 18, 255))
    dk.line([(820, 840), (1130, 840)], (60, 70, 76, 200), 2)
    c.add(dk)
    # lamp light pool on desk
    pool = Layer()
    pool.poly([(1100, 780), (1560, 780), (1650, 900), (1010, 900)], (255, 214, 150, 52))
    pool.blur(20)
    c.add(pool)
    # ---- monitor (large)
    mn = Layer()
    mn.poly([(536, 522), (888, 530), (884, 738), (532, 730)], (8, 10, 12, 255))                                      # bezel
    mn.poly([(548, 534), (876, 540), (872, 726), (544, 720)], (6, 20, 24, 255))                                      # screen
    c.add(mn)
    ms = Layer()
    ms.grad_poly([(548, 534), (876, 540), (872, 726), (544, 720)], (10, 52, 44, 255), (4, 24, 30, 255))
    screen_lines(ms, 560, 552, 860, 712, seed=11, rows=13)
    ms.rect(560, 548, 860, 564, (118, 185, 0, 150))
    ms.rect(560, 548, 640, 564, (190, 255, 60, 220))
    c.add(ms)
    mg = Layer()
    mg.poly([(548, 534), (876, 540), (872, 726), (544, 720)], (70, 255, 190, 110))
    c.glow(mg, 30, 1.0)
    st = Layer()
    st.poly([(690, 736), (730, 738), (736, 790), (684, 790)], (12, 14, 16, 255))
    st.poly([(640, 790), (780, 790), (800, 806), (620, 806)], (16, 18, 20, 255))
    st.line([(540, 524), (884, 532)], (120, 150, 160, 120), 2)
    c.add(st)
    # keyboard + mouse
    kb = Layer()
    kb.poly([(580, 830), (800, 830), (820, 862), (560, 862)], (14, 16, 18, 255))
    for r in range(3):
        kb.line([(588 - r * 6, 838 + r * 8), (792 + r * 6, 838 + r * 8)], (40, 60, 70, 170), 2)
    kb.ellipse(850, 838, 880, 858, (16, 18, 20, 255))
    c.add(kb)
    # ---- laptop (right)
    lp = Layer()
    lp.poly([(1170, 800), (1440, 800), (1470, 846), (1140, 846)], (22, 26, 30, 255))                                  # base
    lp.line([(1170, 800), (1440, 800)], (110, 130, 140, 200), 2)
    lp.poly([(1196, 648), (1414, 648), (1436, 800), (1176, 800)], (10, 12, 14, 255))                                  # lid
    lp.poly([(1206, 658), (1404, 658), (1422, 792), (1190, 792)], (230, 240, 250, 255))                               # screen
    c.add(lp)
    ls = Layer()
    ls.grad_poly([(1206, 658), (1404, 658), (1422, 792), (1190, 792)], (200, 230, 255, 255), (150, 190, 230, 255))
    ls.rect(1250, 700, 1360, 764, (255, 255, 255, 230), 4)                                                            # envelope
    ls.poly([(1250, 700), (1305, 740), (1360, 700)], (170, 190, 215, 255))
    ls.rect(1230, 674, 1380, 684, (110, 150, 200, 200), 3)
    c.add(ls)
    lg = Layer()
    lg.poly([(1206, 658), (1404, 658), (1422, 792), (1190, 792)], (170, 215, 255, 150))
    c.glow(lg, 30, 0.9)
    # ---- papers + pen cup + note (centre desk)
    pp = Layer()
    for i, (dx, dy, rot) in enumerate([(0, 0, 0), (12, -4, 2), (-8, -7, -3)]):
        pp.poly([(874 + dx, 806 + dy), (1030 + dx, 806 + dy + rot), (1060 + dx, 838 + dy + rot), (846 + dx, 838 + dy)],
                (214 - i * 12, 210 - i * 12, 198 - i * 12, 255))
    pp.poly([(1006, 800), (1052, 800), (1068, 826), (1018, 826)], (236, 224, 150, 255))                              # note
    pp.line([(880, 830), (1050, 830)], (110, 110, 100, 255), 1)
    c.add(pp)
    mug = Layer()
    mug.rect(1090, 744, 1136, 806, (10, 12, 14, 255), 6)
    mug.ellipse(1086, 738, 1140, 752, (28, 32, 34, 255))
    mug.rect(1132, 756, 1152, 786, (10, 12, 14, 255), 8)
    mug.rect(1098, 752, 1106, 800, (80, 110, 120, 140), 3)
    c.add(mug)
    # ---- desk lamp
    lm = Layer()
    lm.ellipse(1470, 790, 1560, 812, (12, 14, 16, 255))
    lm.line([(1514, 800), (1490, 700), (1440, 618)], (16, 18, 20, 255), 7)
    lm.line([(1440, 618), (1420, 586)], (16, 18, 20, 255), 6)
    lm.poly([(1384, 572), (1450, 548), (1466, 590), (1392, 610)], (12, 14, 16, 255))
    lm.line([(1392, 606), (1462, 586)], (255, 232, 180, 255), 5)
    c.add(lm)
    cone = Layer()
    cone.poly([(1392, 606), (1462, 588), (1650, 880), (1160, 880)], (255, 224, 170, 46))
    cone.blur(10)
    c.add(cone)
    lamp_g = Layer()
    lamp_g.line([(1392, 606), (1462, 586)], (255, 232, 180, 255), 8)
    c.glow(lamp_g, 24, 1.4)
    # ---- phone on desk edge
    ph = Layer()
    ph.poly([(1560, 832), (1630, 832), (1648, 862), (1548, 862)], (14, 16, 18, 255))
    ph.rect(1582, 840, 1612, 846, (118, 185, 0, 230), 2)
    c.add(ph)
    # ---- waste bin (left foreground)
    bn = Layer()
    bn.grad_poly([(116, 800), (346, 800), (316, 1048), (150, 1048)], (58, 68, 76, 255), (22, 26, 30, 255), vertical=False)
    for k in range(12):
        t = k / 11
        bn.line([(116 + 230 * t, 806), (150 + 166 * t, 1046)], (120, 140, 150, 170), 1.5)
    for k in range(10):
        y = 812 + k * 24
        t = (y - 800) / 248
        bn.line([(116 + 34 * t + 2, y), (346 - 30 * t - 2, y)], (120, 140, 150, 150), 1.5)
    bn.ellipse(108, 788, 354, 820, (96, 112, 122, 255))
    bn.ellipse(118, 793, 344, 815, (10, 12, 14, 255))
    bn.line([(116, 800), (150, 1048)], (190, 220, 235, 150), 3)
    c.add(bn)
    pap = Layer()
    rng = random.Random(4)
    for _ in range(30):
        x, y = rng.uniform(140, 322), rng.uniform(782, 806)
        r = rng.uniform(11, 24)
        v = rng.randint(200, 240)
        pap.ellipse(x - r, y - r * 0.8, x + r, y + r * 0.8, (v, v, v - 8, 255))
        pap.line([(x - r * 0.6, y - 2), (x + r * 0.4, y + 3)], (130, 130, 124, 255), 1.5)
        pap.line([(x - r * 0.2, y - r * 0.6), (x + r * 0.5, y - 2)], (150, 150, 144, 255), 1.5)
    c.add(pap)
    rim = Layer()
    rim.line([(112, 800), (346, 800)], (150, 255, 60, 150), 2)
    c.add(rim)
    # ---- door on right wall (perspective), keypad
    def wall(t, v):          # t: 0 near .. 1 far, v: 0 floor .. 1 ceiling
        x = W - 260 * t
        top, bot = 120 * t, H - 310 * t
        return (x, bot - v * (bot - top))
    d = Layer()
    door_t = (0.10, 0.62)
    outer = [wall(door_t[0], 0), wall(door_t[1], 0), wall(door_t[1], 0.82), wall(door_t[0], 0.82)]
    d.poly(outer, (8, 10, 12, 255))
    inner = [wall(door_t[0] + 0.03, 0.02), wall(door_t[1] - 0.03, 0.02), wall(door_t[1] - 0.03, 0.79), wall(door_t[0] + 0.03, 0.79)]
    d.grad_poly(inner, (40, 70, 80, 255), (14, 26, 32, 255), vertical=False)
    d.poly([wall(0.2, 0.2), wall(0.52, 0.2), wall(0.52, 0.72), wall(0.2, 0.72)], (90, 140, 150, 80))
    d.line([wall(door_t[0], 0.82), wall(door_t[1], 0.82)], GREEN + (200,), 3)
    kp = [wall(0.66, 0.42), wall(0.72, 0.42), wall(0.72, 0.52), wall(0.66, 0.52)]
    d.poly(kp, (10, 12, 14, 255))
    c.add(d)
    # door hotspot polygon is stored; the LED is drawn live in the browser (red -> green)
    # ---- dust + beam shafts
    dust(c, (330, 560, 1600, 1000), 70)
    # ---- final lighting wash (teal shadows)
    wash = Layer()
    wash.grad_poly([(0, 0), (W, 0), (W, H), (0, H)], (0, 40, 50, 36), (0, 0, 0, 80))
    c.add(wash)
    c.finish(OUT / "office.jpg", grade=(0.98, 1.0, 1.03), vignette=0.6)
    spots = {
        "monitor": [[(536, 522), (888, 530), (884, 738), (532, 730)]],
        "laptop": [[(1176, 648), (1436, 648), (1470, 846), (1140, 846)]],
        "desk": [[(780, 800), (1170, 800), (1180, 896), (770, 896)], [(1260, 930), (1630, 930), (1630, 1080), (1260, 1080)]],
        "bin": [[(110, 790), (350, 790), (318, 1050), (148, 1050)]],
        "cctv": [[(274, 314), (486, 314), (486, 490), (274, 490)]],
        "statement": [[(1484, 286), (1650, 286), (1650, 530), (1484, 530)]],
        "door": [outer],
    }
    return spots


# ------------------------------------------------------------------ WAR ROOM (Room 3)
def warroom():
    c = Canvas((4, 8, 12))
    sh = Layer()
    sh.grad_poly([(0, 0), (W, 0), (1620, 150), (300, 150)], (6, 10, 14, 255), (14, 20, 26, 255))
    sh.grad_poly([(0, 0), (300, 150), (300, 740), (0, H)], (10, 14, 18, 255), (22, 28, 32, 255), vertical=False)
    sh.grad_poly([(W, 0), (1620, 150), (1620, 740), (W, H)], (10, 14, 18, 255), (22, 28, 32, 255), vertical=False)
    sh.grad_poly([(300, 150), (1620, 150), (1620, 740), (300, 740)], (12, 18, 22, 255), (18, 26, 30, 255))
    sh.grad_poly([(0, H), (300, 740), (1620, 740), (W, H)], (14, 20, 24, 255), (4, 6, 8, 255))
    c.add(sh)
    led = Layer()
    led.poly([(340, 164), (1580, 164), (1590, 170), (330, 170)], GREEN + (255,))
    for x in range(420, 1520, 220):
        led.rect(x, 90, x + 120, 100, (210, 235, 255, 255), 3)
    led.line([(0, 0), (300, 150)], GREEN + (190,), 3)
    led.line([(W, 0), (1620, 150)], GREEN + (190,), 3)
    c.add(led)
    c.glow(led, 14, 1.1)
    # three wall screens
    spots = {}
    def wscreen(x0, y0, x1, y1, seed, tint, name, content):
        L = Layer()
        L.rect(x0 - 10, y0 - 10, x1 + 10, y1 + 10, (6, 8, 10, 255), 8)
        L.grad_poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], tint[0] + (255,), tint[1] + (255,))
        content(L, x0, y0, x1, y1, seed)
        c.add(L)
        g = Layer()
        g.rect(x0, y0, x1, y1, tint[2] + (130,))
        c.glow(g, 34, 1.0)
        spots[name] = [[(x0 - 10, y0 - 10), (x1 + 10, y0 - 10), (x1 + 10, y1 + 10), (x0 - 10, y1 + 10)]]

    def board(L, x0, y0, x1, y1, seed):
        rng = random.Random(seed)
        nodes = [(rng.uniform(x0 + 40, x1 - 40), rng.uniform(y0 + 40, y1 - 40)) for _ in range(9)]
        for i, a in enumerate(nodes):
            for b in nodes[i + 1:i + 3]:
                L.line([a, b], (120, 255, 190, 150), 2)
        for (x, y) in nodes:
            L.rect(x - 26, y - 16, x + 26, y + 16, (14, 40, 34, 255), 3)
            L.rect(x - 26, y - 16, x + 26, y - 12, GREEN + (255,), 1)
            L.rect(x - 18, y - 4, x + 18, y, (150, 220, 190, 200))
            L.rect(x - 18, y + 4, x + 8, y + 8, (150, 220, 190, 150))

    def timeline(L, x0, y0, x1, y1, seed):
        ym = (y0 + y1) / 2
        L.line([(x0 + 24, ym), (x1 - 24, ym)], (170, 255, 210, 220), 4)
        rng = random.Random(seed)
        for k in range(7):
            x = x0 + 60 + k * (x1 - x0 - 120) / 6
            up = k % 2 == 0
            L.line([(x, ym), (x, ym - 50 if up else ym + 50)], (120, 255, 190, 190), 2)
            L.ellipse(x - 8, ym - 8, x + 8, ym + 8, (255, 255, 255, 255))
            yy = ym - 86 if up else ym + 56
            L.rect(x - 38, yy, x + 38, yy + 30, (14, 40, 34, 255), 3)
            L.rect(x - 30, yy + 9, x + 30, yy + 13, (150, 220, 190, 200))
            L.rect(x - 30, yy + 18, x + 12, yy + 21, (150, 220, 190, 140))

    def status(L, x0, y0, x1, y1, seed):
        for i in range(5):
            y = y0 + 34 + i * ((y1 - y0 - 60) / 5)
            L.rect(x0 + 24, y, x1 - 24, y + 22, (12, 34, 30, 255), 3)
            w = (x1 - x0 - 48) * [0.9, 0.35, 0.7, 0.55, 0.2][i]
            L.rect(x0 + 24, y, x0 + 24 + w, y + 22, (118, 185, 0, 255) if i != 1 else (230, 70, 60, 255), 3)

    wscreen(350, 230, 740, 560, 3, ((8, 44, 40), (4, 24, 30), (60, 255, 190)), "board", board)
    wscreen(790, 210, 1130, 480, 5, ((10, 50, 62), (6, 26, 40), (70, 200, 255)), "timeline", timeline)
    wscreen(1180, 230, 1570, 560, 7, ((24, 30, 14), (10, 16, 10), (170, 255, 60)), "response", status)
    # central holographic table
    tb = Layer()
    tb.poly([(560, 800), (1360, 800), (1500, 960), (420, 960)], (16, 24, 28, 255))
    tb.poly([(560, 800), (1360, 800), (1500, 960), (420, 960)], (30, 46, 52, 255))
    tb.grad_poly([(560, 800), (1360, 800), (1500, 960), (420, 960)], (36, 58, 64, 255), (14, 24, 28, 255))
    tb.line([(420, 960), (1500, 960)], (150, 220, 200, 220), 3)
    tb.grad_poly([(420, 960), (1500, 960), (1500, H), (420, H)], (14, 20, 22, 255), (6, 8, 10, 255))
    c.add(tb)
    hol = Layer()
    hol.poly([(640, 820), (1280, 820), (1390, 940), (530, 940)], (70, 255, 200, 70))
    for k in range(6):
        y = 826 + k * 20
        t = (y - 820) / 120
        hol.line([(640 - 110 * t, y), (1280 + 110 * t, y)], (160, 255, 220, 120), 1)
    hol.ellipse(880, 700, 1040, 780, (120, 255, 210, 90))
    hol.line([(960, 700), (960, 820)], (160, 255, 220, 140), 2)
    for k in range(8):
        hol.ellipse(880 + k * 21, 740 - (k % 3) * 18, 890 + k * 21, 750 - (k % 3) * 18, (200, 255, 235, 220))
    c.add(hol)
    c.glow(hol, 20, 1.0)
    spots["findings"] = [[(520, 690), (1400, 690), (1500, 962), (420, 962)]]
    # chairs silhouettes
    ch = Layer()
    for x in (360, 1560):
        ch.rect(x - 70, 760, x + 70, 960, (8, 10, 12, 255), 50)
        ch.line([(x - 68, 790), (x - 66, 900)], (120, 180, 200, 90), 3)
    c.add(ch)
    # door back
    dr = Layer()
    dr.rect(880, 560, 1040, 740, (6, 8, 10, 255), 4)
    dr.rect(890, 570, 1030, 740, (10, 22, 26, 255))
    dr.line([(960, 570), (960, 740)], GREEN + (180,), 2)
    c.add(dr)
    # floor reflection
    fl = Layer()
    for x in (420, 760, 1100, 1440):
        fl.poly([(x - 30, 745), (x + 30, 745), (x + 90, H), (x - 90, H)], (90, 230, 190, 14))
    fl.blur(8)
    c.add(fl)
    dust(c, (300, 200, 1650, 900), 120, seed=9)
    c.finish(OUT / "warroom.jpg", grade=(0.96, 1.02, 1.0), vignette=0.6, seed=6)
    return spots


# ------------------------------------------------------------------ TITLE / ENDINGS
def tower(L, cx, base, w, h, windows=True, seed=2, lit=(160, 255, 90)):
    rng = random.Random(seed)
    L.poly([(cx - w / 2, base), (cx - w / 2 + 14, base - h), (cx + w / 2 - 14, base - h), (cx + w / 2, base)], (8, 14, 18, 255))
    L.rect(cx - w / 2 + 14, base - h - 10, cx + w / 2 - 14, base - h, (20, 40, 50, 255))
    if windows:
        for y in range(int(base - h + 18), int(base - 24), 20):
            for x in range(int(cx - w / 2 + 24), int(cx + w / 2 - 28), 16):
                if rng.random() < 0.55:
                    L.rect(x, y, x + 8, y + 11, lit + (rng.randint(70, 230),))


def title_bg(path, palette="night", seed=2):
    c = Canvas((3, 6, 10))
    haze = {"night": (16, 50, 70), "dawn": (110, 80, 70), "red": (80, 20, 24)}[palette]
    skyline(c, 0, 0, W, 900, seed=seed, warm=0.35, density=0.7, haze=haze)
    lay = Layer()
    tower(lay, 1330, 940, 330, 760, seed=seed + 3,
          lit={"night": (160, 255, 90), "dawn": (255, 210, 150), "red": (255, 90, 80)}[palette])
    tower(lay, 520, 960, 240, 520, seed=seed + 5, lit=(190, 230, 255))
    c.add(lay)
    g = Layer()
    g.im = lay.im.copy()
    c.glow(g, 12, 0.7)
    # ground + haze
    gr = Layer()
    gr.grad_poly([(0, 880), (W, 880), (W, H), (0, H)], (6, 12, 14, 255), (0, 0, 0, 255))
    gr.grad_poly([(0, 700), (W, 700), (W, 900), (0, 900)], haze + (0,), haze + (90,))
    c.add(gr)
    # lone silhouette
    fg = Layer()
    fx, fy = 1560, 1000
    fg.ellipse(fx - 20, fy - 190, fx + 20, fy - 150, (2, 4, 6, 255))
    fg.poly([(fx - 34, fy - 148), (fx + 34, fy - 148), (fx + 44, fy - 40), (fx + 24, fy), (fx - 24, fy), (fx - 44, fy - 40)], (2, 4, 6, 255))
    fg.rect(fx + 30, fy - 120, fx + 70, fy - 60, (2, 4, 6, 255), 6)
    c.add(fg)
    dust(c, (0, 200, W, 900), 120, seed=seed)
    c.finish(OUT / path, grade={"night": (0.95, 1.02, 1.04), "dawn": (1.04, 1.0, 0.94), "red": (1.06, 0.92, 0.92)}[palette], vignette=0.55, seed=seed)


def forensics():
    src = Path("/home/claude/orig/nvidia_fall_reimagined/assets/digital_forensics_room.jpg")
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    im.save(OUT / "forensics.jpg", quality=90)
    sx, sy = W / 1672, H / 941
    def sc(pts):
        return [(x * sx, y * sy) for x, y in pts]
    return {
        "logs": [sc([(40, 380), (352, 380), (352, 580), (40, 580)])],
        "route": [sc([(900, 340), (1255, 340), (1255, 490), (900, 490)])],
        "fingerprint": [sc([(1290, 90), (1640, 90), (1640, 700), (1290, 700)])],
        "clock": [sc([(840, 475), (1215, 475), (1215, 615), (840, 615)])],
    }


if __name__ == "__main__":
    hs = {}
    hs["office"] = office()
    hs["warroom"] = warroom()
    hs["forensics"] = forensics()
    title_bg("title.jpg", "night", 2)
    title_bg("end_success.jpg", "dawn", 6)
    title_bg("end_fail.jpg", "red", 9)
    hs = {room: {k: [[[round(x, 1), round(y, 1)] for x, y in poly] for poly in polys] for k, polys in d.items()} for room, d in hs.items()}
    (DATA / "hotspots.json").write_text(json.dumps(hs))
    print("scenes rendered:", [p.name for p in sorted(OUT.glob("*.jpg"))])
