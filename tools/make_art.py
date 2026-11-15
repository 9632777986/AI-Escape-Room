"""
Generates the original scene art (SVG) for the game. No third-party imagery,
no real logos, no real people. Run:  python tools/make_art.py
"""
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web" / "assets"
W, H = 1600, 900

DEFS = """
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b16"/><stop offset=".55" stop-color="#0d1f33"/><stop offset="1" stop-color="#27465f"/></linearGradient>
  <linearGradient id="wallL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070c0e"/><stop offset="1" stop-color="#0d1a1c"/></linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a1e"/><stop offset=".4" stop-color="#091013"/><stop offset="1" stop-color="#040709"/></linearGradient>
  <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3424"/><stop offset=".5" stop-color="#2e2016"/><stop offset="1" stop-color="#1c130d"/></linearGradient>
  <linearGradient id="deskEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#201710"/><stop offset="1" stop-color="#0d0906"/></linearGradient>
  <linearGradient id="drawer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d14"/><stop offset="1" stop-color="#18100b"/></linearGradient>
  <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e3d34"/><stop offset=".6" stop-color="#0a2a30"/><stop offset="1" stop-color="#071a26"/></linearGradient>
  <linearGradient id="lap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ad4ff"/><stop offset="1" stop-color="#2b5d80"/></linearGradient>
  <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffc27a" stop-opacity="0"/></linearGradient>
  <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cd7ff" stop-opacity=".13"/><stop offset="1" stop-color="#9cd7ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="refl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="chair" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2a33"/><stop offset=".25" stop-color="#0d1317"/><stop offset="1" stop-color="#080b0d"/></linearGradient>
  <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cd7ff" stop-opacity=".16"/><stop offset="1" stop-color="#9cd7ff" stop-opacity="0"/></linearGradient>
  <radialGradient id="mglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#5dffb0" stop-opacity=".5"/><stop offset="1" stop-color="#5dffb0" stop-opacity="0"/></radialGradient>
  <radialGradient id="wglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb866" stop-opacity=".5"/><stop offset="1" stop-color="#ffb866" stop-opacity="0"/></radialGradient>
  <radialGradient id="cglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9ad4ff" stop-opacity=".4"/><stop offset="1" stop-color="#9ad4ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx=".5" cy=".48" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></radialGradient>
  <filter id="b3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="b8" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="b40" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="40"/></filter>
</defs>"""


def svg(body, w=W, h=H):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">{DEFS}{body}</svg>'


def skyline(x0, x1, ybase, R, layers=2, lit=0.35):
    o = []
    for layer in range(layers):
        x = x0 - 20
        col = ["#0f2234", "#09151f"][layer]
        while x < x1:
            w = R.randint(36, 86)
            hgt = R.randint(70, 250) + layer * 60
            o.append(f'<rect x="{x}" y="{ybase - hgt}" width="{w}" height="{hgt + 40}" fill="{col}"/>')
            if layer == 1 or R.random() < .8:
                for wy in range(ybase - hgt + 8, ybase, 11):
                    for wx in range(x + 5, x + w - 5, 9):
                        if R.random() < lit * (0.6 if layer == 0 else 0.35):
                            c = R.choice(["#ffd98a", "#ffd98a", "#8fd7ff", "#fff3c4"])
                            o.append(f'<rect x="{wx}" y="{wy}" width="4" height="6" fill="{c}" opacity="{R.uniform(.35, .9):.2f}"/>')
            if layer == 1 and R.random() < .25:
                o.append(f'<circle cx="{x + w // 2}" cy="{ybase - hgt - 4}" r="2.6" fill="#ff3b3b"><animate attributeName="opacity" values="1;.1;1" dur="{R.uniform(1.6, 3):.1f}s" repeatCount="indefinite"/></circle>')
            x += w + R.randint(0, 6)
    return "".join(o)


def office():
    R = random.Random(11)
    o = [f'<rect width="{W}" height="{H}" fill="#04070a"/>']
    # window
    o.append('<rect x="150" y="60" width="970" height="500" fill="url(#sky)"/>')
    o.append('<circle cx="930" cy="150" r="60" fill="#cfe3f5" opacity=".18" filter="url(#b20)"/><circle cx="930" cy="150" r="22" fill="#e4f0fb" opacity=".9"/>')
    o.append('<ellipse cx="635" cy="560" rx="520" ry="90" fill="#3e6a8a" opacity=".45" filter="url(#b40)"/>')
    o.append(skyline(150, 1120, 560, R))
    o.append('<g clip-path="url(#winclip)"></g>')
    # mullions + sill
    for k in range(6):
        o.append(f'<rect x="{146 + k * 195}" y="56" width="10" height="510" fill="#070b0d"/>')
    o.append('<rect x="146" y="318" width="980" height="8" fill="#070b0d"/><rect x="140" y="556" width="990" height="34" fill="#080d10"/>')
    o.append('<polygon points="190,60 330,60 120,560 20,560" fill="url(#refl)"/><polygon points="700,60 790,60 600,560 520,560" fill="url(#refl)" opacity=".7"/>')
    # ceiling
    o.append('<rect width="1600" height="60" fill="#05090c"/><rect x="200" y="30" width="360" height="5" fill="#cfe7ff" opacity=".35" filter="url(#b3)"/><rect x="760" y="30" width="360" height="5" fill="#cfe7ff" opacity=".3" filter="url(#b3)"/>')
    # right wall wood slats
    o.append('<rect x="1120" y="0" width="480" height="620" fill="#120d09"/>')
    for i in range(20):
        c = "#1d140e" if i % 2 else "#241912"
        o.append(f'<rect x="{1124 + i * 24}" y="0" width="21" height="620" fill="{c}"/>')
    o.append('<rect x="1120" y="0" width="480" height="620" fill="#000" opacity=".35"/>')
    o.append('<rect x="1120" y="568" width="480" height="5" fill="#76b900" opacity=".9"/><rect x="1120" y="562" width="480" height="18" fill="#76b900" opacity=".35" filter="url(#b8)"/>')
    # left wall + door
    o.append('<rect x="0" y="0" width="150" height="620" fill="url(#wallL)"/>')
    o.append('<rect x="8" y="150" width="126" height="500" fill="#0b1114" stroke="#1d2b2f" stroke-width="3"/>')
    o.append('<rect x="22" y="170" width="98" height="210" fill="#0e171a" stroke="#18262a"/><rect x="22" y="400" width="98" height="230" fill="#0e171a" stroke="#18262a"/>')
    o.append('<rect x="96" y="392" width="30" height="6" fill="#2c3b40"/><rect x="100" y="410" width="22" height="34" rx="3" fill="#080c0e" stroke="#26363a"/>')
    for r in range(3):
        for c in range(2):
            o.append(f'<rect x="{104 + c * 9}" y="{416 + r * 9}" width="6" height="6" fill="#26363a"/>')
    o.append('<rect x="8" y="648" width="126" height="3" fill="#76b900" opacity=".55"/><rect x="8" y="640" width="126" height="22" fill="#76b900" opacity=".15" filter="url(#b8)"/>')
    # floor
    o.append('<rect x="0" y="620" width="1600" height="280" fill="url(#floor)"/>')
    for x in range(200, 1100, 90):
        o.append(f'<rect x="{x}" y="620" width="{R.randint(18, 50)}" height="280" fill="url(#fl)" opacity=".55" filter="url(#b8)"/>')
    o.append('<polygon points="250,716 1350,716 1500,900 100,900" fill="#091316" stroke="#12262a" stroke-width="2"/>')
    o.append('<polygon points="300,740 1300,740 1420,900 180,900" fill="none" stroke="#183036" stroke-width="1.5" opacity=".7"/>')
    # light shafts
    for pts in ("260,560 420,560 560,900 330,900", "540,560 640,560 820,900 640,900", "820,560 940,560 1120,900 940,900"):
        o.append(f'<polygon points="{pts}" fill="url(#shaft)" filter="url(#b8)"/>')
    # plant
    o.append('<g transform="translate(205,500)"><rect x="-22" y="86" width="44" height="52" rx="4" fill="#0c1417" stroke="#1a2a2e"/>')
    for a in (-52, -30, -10, 12, 34, 56):
        o.append(f'<ellipse cx="{math.sin(math.radians(a)) * 40:.0f}" cy="{20 - abs(a) * .4:.0f}" rx="13" ry="62" transform="rotate({a} {math.sin(math.radians(a)) * 40:.0f} 86)" fill="{R.choice(["#0e2a1d", "#123826", "#0b2218"])}" stroke="#1a5a3a" stroke-opacity=".3"/>')
    o.append('</g>')
    # chair
    o.append('<g><ellipse cx="770" cy="470" rx="140" ry="170" fill="#4a90b8" opacity=".10" filter="url(#b40)"/>'
             '<path d="M668,330 Q640,330 640,362 L640,520 Q640,606 710,612 L830,612 Q900,606 900,520 L900,362 Q900,330 872,330 Z" fill="url(#chair)"/>'
             '<path d="M652,350 Q648,340 668,338" stroke="#8fd0ff" stroke-opacity=".55" stroke-width="3" fill="none"/>'
             '<path d="M642,380 L642,520" stroke="#8fd0ff" stroke-opacity=".25" stroke-width="3"/>'
             '<ellipse cx="770" cy="360" rx="80" ry="26" fill="#0f1a20"/>'
             '<path d="M680,420 Q770,400 860,420" stroke="#1d2e38" stroke-width="2" fill="none"/>'
             '<path d="M680,480 Q770,462 860,480" stroke="#1d2e38" stroke-width="2" fill="none"/>'
             '<rect x="610" y="520" width="42" height="14" rx="6" fill="#0c1216"/><rect x="888" y="520" width="42" height="14" rx="6" fill="#0c1216"/></g>')
    # monitor glow + monitor
    o.append('<ellipse cx="435" cy="480" rx="300" ry="190" fill="url(#mglow)" opacity=".7" filter="url(#b20)"/>')
    o.append('<polygon points="270,625 600,625 640,680 230,680" fill="#5dffb0" opacity=".1" filter="url(#b8)"/>')
    o.append('<polygon points="400,566 470,566 478,612 392,612" fill="#0a0d0f"/><ellipse cx="435" cy="618" rx="76" ry="9" fill="#0a0d0f" stroke="#1d282c"/>')
    o.append('<rect x="250" y="360" width="370" height="212" rx="9" fill="#07090a" stroke="#1d282c" stroke-width="2"/>')
    o.append('<rect x="260" y="370" width="350" height="190" fill="url(#scr)"/>')
    o.append('<rect x="260" y="370" width="350" height="20" fill="#06161a"/><circle cx="272" cy="380" r="3" fill="#ff5f56"/><circle cx="283" cy="380" r="3" fill="#ffbd2e"/><circle cx="294" cy="380" r="3" fill="#27c93f"/>')
    for i in range(11):
        ww = R.randint(70, 250)
        o.append(f'<rect x="276" y="{402 + i * 14}" width="{ww}" height="4" rx="1" fill="{"#7dffb6" if i % 3 else "#46c3ff"}" opacity="{R.uniform(.35, .85):.2f}"/>')
    o.append('<rect x="530" y="402" width="64" height="64" rx="5" fill="#0b2a2a" stroke="#4dffb0" stroke-opacity=".5"/><rect x="550" y="436" width="24" height="20" rx="3" fill="#7dffb6" opacity=".85"/><path d="M555,436 v-7 a7,7 0 0 1 14,0 v7" stroke="#7dffb6" stroke-width="4" fill="none" opacity=".85"/>')
    o.append('<rect x="260" y="370" width="350" height="190" fill="url(#refl)" opacity=".6"/>')
    # desk
    o.append('<polygon points="190,600 1410,600 1490,684 110,684" fill="url(#desk)"/>')
    o.append('<polygon points="190,600 1410,600 1420,610 180,610" fill="#fff" opacity=".05"/>')
    o.append('<polygon points="110,684 1490,684 1490,714 110,714" fill="url(#deskEdge)"/><line x1="110" y1="684" x2="1490" y2="684" stroke="#ffd29a" stroke-opacity=".35" stroke-width="2"/>')
    o.append('<rect x="150" y="714" width="1030" height="186" fill="#0b0806"/><rect x="190" y="730" width="940" height="160" fill="#100b08" stroke="#1a120c"/>')
    o.append('<rect x="1190" y="714" width="300" height="186" fill="#130d09" stroke="#22170f" stroke-width="2"/>')
    for k, y in enumerate((722, 786, 850)):
        o.append(f'<rect x="1204" y="{y}" width="272" height="56" rx="3" fill="url(#drawer)" stroke="#2f2015"/>'
                 f'<rect x="1310" y="{y + 22}" width="60" height="7" rx="3" fill="#8a8f8a" opacity=".75"/>'
                 f'<rect x="1310" y="{y + 22}" width="60" height="2" fill="#fff" opacity=".35"/>')
    o.append('<ellipse cx="800" cy="900" rx="700" ry="30" fill="#000" opacity=".5" filter="url(#b8)"/>')
    # lamp light
    o.append('<polygon points="1022,420 1176,414 1330,650 880,664" fill="url(#cone)" filter="url(#b8)"/>')
    o.append('<ellipse cx="1100" cy="645" rx="240" ry="34" fill="url(#wglow)" opacity=".7" filter="url(#b8)"/>')
    # keyboard
    o.append('<polygon points="318,632 572,632 596,662 292,662" fill="#0d1215" stroke="#212d31"/>')
    for r in range(3):
        o.append(f'<line x1="{326 - r * 8}" y1="{640 + r * 8}" x2="{566 + r * 8}" y2="{640 + r * 8}" stroke="#2a393e" stroke-width="3" stroke-dasharray="6 3"/>')
    # papers + note
    o.append('<polygon points="590,628 790,626 806,668 574,670" fill="#cbc5b3" opacity=".92"/><polygon points="596,634 786,632 798,664 586,666" fill="#e2dccb" opacity=".6"/>')
    o.append('<polygon points="640,630 728,631 733,660 635,659" fill="#ecdf9f" transform="rotate(-2 680 645)"/>'
             '<text x="650" y="652" font-family="Caveat,Segoe Script,cursive" font-size="17" fill="#2c2c2c" transform="rotate(-2 680 645)">19 _ _ 4</text>')
    o.append('<line x1="744" y1="648" x2="786" y2="640" stroke="#122" stroke-width="3" stroke-linecap="round"/><line x1="744" y1="648" x2="758" y2="646" stroke="#76b900" stroke-width="3" stroke-linecap="round"/>')
    # laptop
    o.append('<ellipse cx="945" cy="560" rx="170" ry="110" fill="url(#cglow)" opacity=".6" filter="url(#b20)"/>')
    o.append('<polygon points="838,505 1048,505 1058,612 826,612" fill="#07090b" stroke="#232e32" stroke-width="2"/>'
             '<polygon points="847,514 1040,514 1048,603 837,603" fill="url(#lap)" opacity=".92"/>'
             '<rect x="900" y="540" width="92" height="38" rx="3" fill="#eaf6ff" opacity=".92"/><path d="M900,540 L946,566 L992,540" stroke="#7aa6c4" stroke-width="3" fill="none"/>'
             '<polygon points="847,514 940,514 880,603 837,603" fill="#fff" opacity=".12"/>')
    o.append('<polygon points="792,612 1092,612 1118,654 766,654" fill="#10171a" stroke="#26343a"/><polygon points="900,630 990,630 994,646 896,646" fill="#0a0f11" stroke="#1e2b30"/>')
    # mug
    o.append('<g><ellipse cx="1148" cy="632" rx="24" ry="7" fill="#000" opacity=".5"/><rect x="1126" y="598" width="44" height="36" rx="4" fill="#161d1f" stroke="#2a393c"/><ellipse cx="1148" cy="598" rx="22" ry="6" fill="#0a0e0f" stroke="#2a393c"/><path d="M1170,606 q18,6 0,20" stroke="#2a393c" stroke-width="5" fill="none"/></g>')
    # lamp
    o.append('<ellipse cx="1226" cy="640" rx="44" ry="10" fill="#0a0c0d" stroke="#232b2d"/>'
             '<path d="M1226,636 L1214,540 L1160,440" stroke="#14181a" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M1160,440 L1100,380" stroke="#14181a" stroke-width="9" fill="none" stroke-linecap="round"/>'
             '<polygon points="1040,352 1154,344 1182,410 1012,420" fill="#101517" stroke="#2a3338"/><ellipse cx="1097" cy="414" rx="82" ry="9" fill="#ffd9a0" opacity=".95"/>'
             '<ellipse cx="1097" cy="414" rx="120" ry="30" fill="url(#wglow)" filter="url(#b8)"/>')
    # CCTV wall monitor
    o.append('<ellipse cx="1245" cy="210" rx="190" ry="130" fill="url(#cglow)" opacity=".45" filter="url(#b20)"/>')
    o.append('<rect x="1136" y="122" width="222" height="172" rx="7" fill="#060809" stroke="#26343a" stroke-width="3"/>')
    for r in range(2):
        for c in range(2):
            x, y = 1146 + c * 104, 132 + r * 78
            o.append(f'<rect x="{x}" y="{y}" width="100" height="74" fill="#07151a"/>'
                     f'<polygon points="{x},{y + 74} {x + 38},{y + 30} {x + 62},{y + 30} {x + 100},{y + 74}" fill="#0d2a31"/>'
                     f'<polygon points="{x + 38},{y + 30} {x + 62},{y + 30} {x + 62},{y + 74 * .55:.0f} {x + 38},{y + 74 * .55:.0f}" fill="#0a1d22"/>'
                     f'<circle cx="{x + 8}" cy="{y + 8}" r="2.5" fill="#ff3b3b"><animate attributeName="opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/></circle>'
                     f'<rect x="{x + 56}" y="{y + 5}" width="38" height="5" fill="#9fe7ff" opacity=".55"/>')
            if (r, c) == (0, 1):
                o.append(f'<rect x="{x + 46}" y="{y + 34}" width="8" height="22" fill="#02080a" opacity=".85"/><circle cx="{x + 50}" cy="{y + 31}" r="4" fill="#02080a" opacity=".85"/>')
    o.append('<rect x="1136" y="122" width="222" height="172" fill="url(#refl)" opacity=".7"/>')
    # framed notice
    o.append('<polygon points="1465,0 1385,118 1545,118" fill="#fff" opacity=".07" filter="url(#b8)"/>')
    o.append('<rect x="1386" y="116" width="158" height="240" rx="3" fill="#150f0b" stroke="#3d2f22" stroke-width="3"/><rect x="1396" y="126" width="138" height="220" fill="#e4e1d6"/>')
    o.append('<rect x="1406" y="140" width="80" height="6" fill="#1f2a2c"/><rect x="1406" y="154" width="118" height="3" fill="#6b7476"/>')
    for i in range(10):
        o.append(f'<rect x="1406" y="{174 + i * 14}" width="{R.randint(72, 118)}" height="3" fill="#8a9396"/>')
    o.append('<circle cx="1498" cy="318" r="12" fill="none" stroke="#76b900" stroke-width="2.5"/><path d="M1493,318 l4,4 l8,-9" stroke="#76b900" stroke-width="2.5" fill="none"/>')
    o.append('<rect x="1396" y="126" width="138" height="220" fill="url(#refl)"/>')
    # bin
    o.append('<ellipse cx="212" cy="870" rx="70" ry="10" fill="#000" opacity=".6" filter="url(#b3)"/>')
    o.append('<polygon points="150,702 276,702 262,866 164,866" fill="#0b0f11" stroke="#2a3b40" stroke-width="2"/>')
    for k in range(9):
        o.append(f'<line x1="{156 + k * 14}" y1="706" x2="{168 + k * 12}" y2="862" stroke="#1d2b2f" stroke-width="1.5"/>')
    for k in range(7):
        o.append(f'<line x1="156" y1="{720 + k * 22}" x2="270" y2="{720 + k * 22}" stroke="#1d2b2f" stroke-width="1.5"/>')
    o.append('<ellipse cx="213" cy="702" rx="64" ry="11" fill="#12181b" stroke="#33474d" stroke-width="2"/>')
    for (x, y, rr) in [(180, 692, 12), (205, 686, 15), (232, 692, 13), (250, 698, 10), (194, 698, 11), (222, 700, 12)]:
        pts = " ".join(f"{x + math.cos(a) * rr * R.uniform(.7, 1.15):.0f},{y + math.sin(a) * rr * .8 * R.uniform(.7, 1.15):.0f}" for a in [i * math.pi / 3 for i in range(6)])
        o.append(f'<polygon points="{pts}" fill="#d3d8d8" opacity=".92" stroke="#8a9496"/>')
    # ambient green rim + vignette
    o.append('<rect width="1600" height="900" fill="url(#vig)"/>')
    return svg("".join(o))


def incident_room():
    R = random.Random(5)
    o = ['<rect width="1600" height="900" fill="#04070a"/>']
    o.append('<rect width="1600" height="640" fill="#060c10"/>')
    for x in range(0, 1600, 160):
        o.append(f'<rect x="{x + 20}" y="24" width="120" height="5" fill="#cfe7ff" opacity=".28" filter="url(#b3)"/>')
    o.append('<rect x="0" y="640" width="1600" height="260" fill="url(#floor)"/>')
    o.append('<rect x="0" y="632" width="1600" height="5" fill="#76b900" opacity=".8"/><rect x="0" y="626" width="1600" height="18" fill="#76b900" opacity=".3" filter="url(#b8)"/>')
    # evidence board
    o.append('<ellipse cx="465" cy="330" rx="380" ry="250" fill="url(#cglow)" opacity=".35" filter="url(#b40)"/>')
    o.append('<rect x="146" y="106" width="640" height="460" rx="6" fill="#0a1114" stroke="#2c3d43" stroke-width="5"/>')
    o.append('<rect x="160" y="120" width="612" height="432" fill="#0b1b21"/>')
    for gx in range(160, 772, 34):
        o.append(f'<line x1="{gx}" y1="120" x2="{gx}" y2="552" stroke="#12303a" stroke-width="1"/>')
    for gy in range(120, 552, 34):
        o.append(f'<line x1="160" y1="{gy}" x2="772" y2="{gy}" stroke="#12303a" stroke-width="1"/>')
    cards = []
    for i in range(11):
        x, y = 190 + (i % 4) * 150 + R.randint(-12, 12), 150 + (i // 4) * 130 + R.randint(-10, 10)
        cards.append((x + 52, y + 8))
        col = R.choice(["#dfe5e6", "#e8e0b0", "#cfe0e6"])
        o.append(f'<g transform="rotate({R.uniform(-4, 4):.1f} {x + 50} {y + 40})"><rect x="{x}" y="{y}" width="104" height="80" fill="{col}"/>'
                 + "".join(f'<rect x="{x + 8}" y="{y + 16 + k * 11}" width="{R.randint(40, 86)}" height="3" fill="#56666a"/>' for k in range(4))
                 + f'<rect x="{x + 8}" y="{y + 7}" width="38" height="5" fill="#2c3a3d"/></g>')
    for a, b in [(0, 3), (1, 5), (2, 6), (4, 9), (5, 8), (7, 10), (3, 7), (0, 5)]:
        o.append(f'<path d="M{cards[a][0]},{cards[a][1]} Q{(cards[a][0] + cards[b][0]) / 2 + R.randint(-20, 20)},{(cards[a][1] + cards[b][1]) / 2 + 30} {cards[b][0]},{cards[b][1]}" stroke="#d63c3c" stroke-width="2" fill="none" opacity=".85"/>')
    for (cx, cy) in cards:
        o.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="#e33" stroke="#600"/>')
    # summary display
    o.append('<ellipse cx="1070" cy="250" rx="300" ry="190" fill="url(#mglow)" opacity=".4" filter="url(#b40)"/>')
    o.append('<rect x="846" y="96" width="450" height="310" rx="8" fill="#050809" stroke="#2c3d43" stroke-width="4"/>')
    o.append('<rect x="858" y="108" width="426" height="286" fill="#06161a"/>')
    o.append('<rect x="858" y="108" width="426" height="26" fill="#0a2a2c"/><rect x="872" y="116" width="110" height="9" fill="#76b900" opacity=".9"/>')
    pts = " ".join(f"{880 + i * 22},{330 - R.randint(0, 110) * (0.5 + i / 28):.0f}" for i in range(19))
    o.append(f'<polyline points="{pts}" fill="none" stroke="#7dffb6" stroke-width="3"/><polyline points="{pts}" fill="none" stroke="#7dffb6" stroke-width="9" opacity=".25" filter="url(#b3)"/>')
    for i in range(7):
        o.append(f'<rect x="{880 + i * 52}" y="{350 - R.randint(8, 40)}" width="28" height="{R.randint(8, 40)}" fill="#46c3ff" opacity=".6"/>')
    for i, c in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
        o.append(f'<circle cx="{1180 + i * 24}" cy="121" r="5" fill="{c}"/>')
    for i in range(5):
        o.append(f'<rect x="878" y="{148 + i * 12}" width="{R.randint(60, 190)}" height="4" fill="#9fe7ff" opacity=".5"/>')
    o.append('<rect x="858" y="108" width="426" height="286" fill="url(#refl)" opacity=".5"/>')
    # response console desk
    o.append('<ellipse cx="1210" cy="600" rx="340" ry="130" fill="url(#cglow)" opacity=".35" filter="url(#b40)"/>')
    for (x, y, w, h) in [(900, 520, 190, 116), (1105, 500, 250, 136), (1370, 520, 150, 116)]:
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#06090b" stroke="#26343a" stroke-width="3"/><rect x="{x + 7}" y="{y + 7}" width="{w - 14}" height="{h - 14}" fill="#071d22"/>')
        for k in range(6):
            o.append(f'<rect x="{x + 16}" y="{y + 18 + k * 15}" width="{R.randint(30, w - 50)}" height="4" fill="{R.choice(["#7dffb6", "#46c3ff", "#ffbd2e"])}" opacity=".65"/>')
    o.append('<polygon points="860,640 1560,640 1600,720 820,720" fill="url(#desk)"/><polygon points="820,720 1600,720 1600,750 820,750" fill="url(#deskEdge)"/>')
    o.append('<polygon points="1060,664 1360,664 1390,700 1030,700" fill="#0d1215" stroke="#212d31"/>')
    for i, c in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
        o.append(f'<circle cx="{930 + i * 26}" cy="680" r="7" fill="{c}"/><circle cx="{930 + i * 26}" cy="680" r="14" fill="{c}" opacity=".3" filter="url(#b3)"/>')
    # conference table + chairs
    o.append('<polygon points="60,770 900,770 980,900 0,900" fill="#0f1a1d" stroke="#1b2f35" stroke-width="2"/><polygon points="60,770 900,770 910,782 50,782" fill="#fff" opacity=".05"/>')
    for x in (160, 420, 680):
        o.append(f'<path d="M{x},742 Q{x + 60},700 {x + 120},742 L{x + 112},770 L{x + 8},770 Z" fill="#090e11" stroke="#1c2b30"/>')
    o.append('<rect x="0" y="880" width="1600" height="30" fill="#000" opacity=".6" filter="url(#b8)"/>')
    o.append('<rect width="1600" height="900" fill="url(#vig)"/>')
    return svg("".join(o))


def exterior(mode="night"):
    R = random.Random(21)
    top, mid, bot = {"night": ("#03060b", "#0a1626", "#1a3047"),
                     "dawn": ("#14233a", "#8a5a6a", "#f0b27a"),
                     "alert": ("#12060a", "#2a0d14", "#4a1a22")}[mode]
    o = [f'<defs><linearGradient id="xs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset=".6" stop-color="{mid}"/><stop offset="1" stop-color="{bot}"/></linearGradient></defs>',
         '<rect width="1600" height="900" fill="url(#xs)"/>']
    if mode == "dawn":
        o.append('<circle cx="1180" cy="640" r="150" fill="#ffd9a0" opacity=".35" filter="url(#b40)"/>')
    o.append(skyline(0, 1600, 700, R, layers=2, lit=0.5 if mode != "dawn" else 0.15))
    # tower
    tx, tw, ty = 560, 480, 120
    o.append(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{720 - ty}" fill="#08121b" stroke="#16303f" stroke-width="3"/>')
    o.append(f'<rect x="{tx + 20}" y="{ty - 28}" width="{tw - 40}" height="30" fill="#07101a"/><rect x="{tx + 200}" y="{ty - 70}" width="6" height="44" fill="#07101a"/>'
             f'<circle cx="{tx + 203}" cy="{ty - 74}" r="4" fill="#ff3b3b"><animate attributeName="opacity" values="1;.1;1" dur="1.8s" repeatCount="indefinite"/></circle>')
    for wy in range(ty + 14, 710, 22):
        for wx in range(tx + 14, tx + tw - 14, 24):
            if R.random() < (.12 if mode != "alert" else .2):
                c = R.choice(["#ffd98a", "#bfe6ff", "#fff2c6"]) if mode != "alert" else R.choice(["#ff7a7a", "#ffb0a0"])
                o.append(f'<rect x="{wx}" y="{wy}" width="16" height="12" fill="{c}" opacity="{R.uniform(.5, .95):.2f}"/>')
            else:
                o.append(f'<rect x="{wx}" y="{wy}" width="16" height="12" fill="#0b1a26"/>')
    # one lit executive floor band
    o.append(f'<rect x="{tx + 14}" y="{ty + 14 + 22 * 14}" width="{tw - 28}" height="12" fill="#ffd98a" opacity=".85"/><rect x="{tx}" y="{ty + 22 * 14 - 6}" width="{tw}" height="40" fill="#ffd98a" opacity=".2" filter="url(#b8)"/>')
    o.append(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{720 - ty}" fill="url(#refl)" opacity=".5"/>')
    # fog + road
    o.append('<rect x="0" y="640" width="1600" height="260" fill="#04070a"/><rect x="0" y="640" width="1600" height="120" fill="#9cd7ff" opacity=".05" filter="url(#b20)"/>')
    for x in range(100, 1600, 260):
        o.append(f'<rect x="{x}" y="800" width="130" height="8" fill="#cfe7ff" opacity=".12"/>')
    o.append('<rect width="1600" height="900" fill="url(#vig)"/>')
    return svg("".join(o))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "office.svg").write_text(office())
    (OUT / "incident_room.svg").write_text(incident_room())
    for m in ("night", "dawn", "alert"):
        (OUT / f"exterior_{m}.svg").write_text(exterior(m))
    # forensics room: your original clean photo, re-encoded for the web
    from PIL import Image
    src = OUT / "forensics_room_src.jpg"
    if src.exists():
        Image.open(src).convert("RGB").save(OUT / "forensics_room.jpg", quality=84, optimize=True)
        src.unlink()
    print("art written to", OUT)
