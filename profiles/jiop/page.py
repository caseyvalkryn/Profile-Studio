"""Build val-test-profiles.html, the customer page for the four JIOP profiles.

Reads JIOP-1.json to JIOP-4.json and gen.py, so every coordinate, path, band, camera and
measure on the page is the one in the profile files. Run from this folder:
    python3 page.py
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, HERE)
from gen import (P, U, S_CAM, timed, windows, posAt, FLY, RANCH, ORIGIN, B, cams_baseline, W_MAVIC, W_TANQ, PX,  # noqa: E402
                 HFOV, TILT, AIM_S, SENSOR, ASPECT, vfov, pixels, reach, lossAt, earliestAt, firstAt, camName, groundAt as gground)
# the planning cameras, as profiles.py built them: Mavic reach for the ladder and the repeat, Tanq reach for the attack and the swarm
CAMS_M = cams_baseline(W_MAVIC)
CAMS_T = cams_baseline(W_TANQ)
ZOOM_LABEL = {'1x': '80°', '2x': f'2× · {HFOV["2x"][0]:g}°', '5x': f'5× · {HFOV["5x"][0]:g}°'}

V = {i: json.load(open(f'JIOP-{i}.json')) for i in (1, 2, 3, 4)}
FT = 3.28084
LAT0, LON0 = ORIGIN
MEASURE_NAMES = {
    '1.1.1': 'Probability of Detection', '1.1.2': 'Detection Range (ground)',
    '1.1.3': 'Detection Range (slant)', '1.1.4': 'False Alarm Rate', '1.6': 'Detection Quantity',
    '1.8': 'Resolution', '2.1.3': 'Identification Range', '2.1.3t': 'Identification Time',
    '2.1.4': 'Mis-Identification Rate'}
OPS = {'>=': '≥', '<=': '≤'}


def latlon(x, y):
    phi = math.radians(LAT0)
    mN = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    mE = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    return LAT0 + y / mN, LON0 + x / mE


def S(x, y):
    return (x + 230, 250 - y)


def pt(p):
    x, y = S(p[0], p[1])
    return f'{x:.1f},{y:.1f}'


def pts(ps):
    return ' '.join(pt(p) for p in ps)


def sOf(p):
    from gen import CEN
    return (p[0] - CEN[0]) * U[0] + (p[1] - CEN[1]) * U[1]


def wedge(cx, cy, r, bearing, fov):
    half = fov / 2
    out = [f'{cx:.1f},{cy:.1f}']
    k = -half
    while k <= half + 1e-9:
        a = math.radians(bearing + k)
        out.append(f'{cx + r * math.sin(a):.1f},{cy - r * math.cos(a):.1f}')
        k += max(fov / 24, 0.5)
    return ' '.join(out)


def sector(sensor, cls):
    cx, cy = S(sensor['x'], sensor['y'])
    return f'<polygon points="{wedge(cx, cy, min(sensor["rangeM"], 480), sensor["bearingDeg"], sensor["fovDeg"])}" class="sec {cls}"/>'


def cam_marks(sensors):
    s = ''
    for i, c in enumerate(sensors):
        x, y = S(c['x'], c['y'])
        s += f'<rect x="{x - 4:.1f}" y="{y - 4:.1f}" width="8" height="8" class="cam"/>'
    x, y = S(sensors[0]['x'], sensors[0]['y'])
    s += f'<text x="{x - 10:.1f}" y="{y + 16:.1f}" class="lbl strong" text-anchor="end">CAM-1 to CAM-4</text>'
    return s


def node_marks(nodes):
    s = ''
    for n in nodes:
        if n['kind'] != 'c2':
            continue
        x, y = S(n['x'], n['y'])
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" class="node"/>'
        dx, anchor = (8, 'start') if n['id'] == 'GCS-1' else (-8, 'end')
        s += f'<text x="{x + dx:.1f}" y="{y - 6:.1f}" class="lbl mono" text-anchor="{anchor}">{n["id"]}</text>'
    return s


def base(v, extra='', title='', sectors=True):
    areas = {a['id']: a for a in v['areas']}
    s = f'<svg viewBox="0 0 460 500" class="map" role="img" aria-label="{title}">'
    s += '<rect x="0" y="0" width="460" height="500" class="mapbg"/>'
    s += f'<polygon points="{pts(areas["RNG-2"]["pts"])}" class="ranch"/>'
    s += f'<polygon points="{pts(areas["RNG-1"]["pts"])}" class="fly"/>'
    if sectors:
        for c, cls in zip(v['sensors'][:4], ('s80', 's80', 's40', 's18')):
            s += sector(c, cls)
    s += extra
    s += cam_marks(v['sensors'][:4]) + node_marks(v['nodes'])
    s += '<g transform="translate(30,40)"><polygon points="0,-18 6,6 0,0 -6,6" class="north"/><text x="0" y="22" class="lbl mono" text-anchor="middle">N</text></g>'
    s += '<g transform="translate(26,478)"><line x1="0" y1="0" x2="100" y2="0" class="scale"/><line x1="0" y1="-4" x2="0" y2="4" class="scale"/><line x1="100" y1="-4" x2="100" y2="4" class="scale"/><text x="50" y="-6" class="lbl mono" text-anchor="middle">100 m · 328 ft</text></g>'
    s += '</svg>'
    return s


def arrow(a, b, cls):
    sx, sy = S(a[0], a[1])
    bx, by = S(b[0], b[1])
    ang = math.degrees(math.atan2(bx - sx, -(by - sy)))
    return f'<polygon points="0,-7 5,4 -5,4" class="arrow {cls}" transform="translate({sx:.1f},{sy:.1f}) rotate({ang:.0f})"/>'


def arrows_along(path, cls, n=3):
    out = ''
    w = timed(path, 1)
    end = w[-1][4]
    for k in range(1, n + 1):
        t = end * k / (n + 1)
        a = posAt(w, t)
        b = posAt(w, min(t + 3, end))
        if (a[0], a[1]) != (b[0], b[1]):
            out += arrow(a, b, cls)
    return out


def legend(items, x=14, y=24):
    s = f'<g transform="translate({x},{y})">'
    for i, (cls, text) in enumerate(items):
        yy = i * 16
        s += f'<line x1="0" y1="{yy}" x2="22" y2="{yy}" class="track {cls}"/><text x="28" y="{yy + 4}" class="lbl">{text}</text>'
    return s + '</g>'


# ------------------------------------------------------------------ overview
v1 = V[1]
cams = v1['sensors'][:4]
launch = v1['threats'][0]['path'][0]
axis = pts([(launch['x'], launch['y']), P(S_CAM)])
lx, ly = S(launch['x'], launch['y'])
cx_, cy_ = S(*P(S_CAM))
ov = f'<line x1="{lx:.1f}" y1="{ly:.1f}" x2="{cx_:.1f}" y2="{cy_:.1f}" class="cl"/>'
ov += f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="5" class="entry"/><text x="{lx + 8:.1f}" y="{ly + 4:.1f}" class="lbl strong">Launch · 470 m</text>'
ov += legend([('s80l', f'CAM-1, CAM-2 · 80° · reach {CAMS_M[0]["rangeM"]} m'), ('s40l', f'CAM-3 · {ZOOM_LABEL["2x"]} · reach {CAMS_M[2]["rangeM"]} m'), ('s18l', f'CAM-4 · {ZOOM_LABEL["5x"]} · site-limited')], x=190, y=24)
MAP_OVERVIEW = base(v1, ov, 'Site overview with the four camera sectors')

# ------------------------------------------------------------------ ladder
areas1 = {a['id']: a for a in v1['areas']}
lad = ''
for i in range(1, 6):
    a = areas1[f'REF-{i}']
    lad += f'<polygon points="{pts(a["pts"])}" class="band b{i % 2}"/>'
T1 = v1['threats'][0]
holds = [w for w in T1['path'] if w['holdS'] == 30]
dists = [450, 350, 250, 150, 75]
for i, (w, d) in enumerate(zip(holds, dists)):
    x, y = S(w['x'], w['y'])
    lad += f'<g transform="translate({x:.1f},{y:.1f})"><circle r="9" class="station"/><text y="4" class="lbl mono white" text-anchor="middle">H{i + 1}</text><text x="14" y="-6" class="lbl mono">{d} m</text></g>'
lad += f'<polyline points="{pts([(w["x"], w["y"]) for w in T1["path"]])}" class="cl"/>'
MAP_LADDER = base(v1, lad, 'Range ladder hover points and bands')

w1 = timed(T1['path'], T1['speedMs'])
lad_first = {c['id']: firstAt(c, w1, PX['cue']) for c in CAMS_M}


def ground_at(c, w, t):
    p = posAt(w, t)
    return math.hypot(p[0] - c['x'], p[1] - c['y'])


# ------------------------------------------------------------------ one-way attack
v2 = V[2]
T2 = v2['threats'][0]
w2 = timed(T2['path'], T2['speedMs'])
areas2 = {a['id']: a for a in v2['areas']}
owa = f'<polyline points="{pts([(w["x"], w["y"]) for w in T2["path"][:3]])}" class="track acA"/>'
owa += f'<polyline points="{pts([(w["x"], w["y"]) for w in T2["path"][2:]])}" class="track acA dive"/>'
owa += arrows_along(T2['path'][:3], 'acA')
owa += f'<polygon points="{pts(areas2["REF-1"]["pts"])}" class="aim"/>'
ax, ay = S(T2['path'][3]['x'], T2['path'][3]['y'])
owa += f'<text x="{ax - 10:.1f}" y="{ay - 8:.1f}" class="lbl strong" text-anchor="end">Aim point · 60 m short</text>'
owa_events = []
for word, px, cls in (('E1 first cue', PX['cue'], 'e1'), ('E2 confirmed', PX['confirmed'], 'e2'), ('E3 identified', PX['identified'], 'e3')):
    hit = earliestAt(CAMS_T, w2, px)
    if not hit:
        owa_events.append((None, None, f'{word} · {px} px · no camera before the aim point', cls))
        continue
    t, c = hit
    p = posAt(w2, t)
    r = ground_at(c, w2, t)
    lab = f'{word} · {camName(c)} · {px} px'
    owa_events.append((t, r, lab, cls))
    x, y = S(p[0], p[1])
    dy = 22 if t <= w2[0][4] + 1 else 0   # at launch: under the launch label
    owa += f'<g transform="translate({x:.1f},{y:.1f})"><circle r="7" class="ev {cls}"/><text x="12" y="{4 + dy}" class="lbl strong">{lab}{" · at launch" if dy else ""}</text><text x="12" y="{16 + dy}" class="lbl mono">≈{r:.0f} m · planning value</text></g>'
# where each camera reaches each threshold on the Tanq, ground distance, or the limit that stops it
def ident_note_text():
    hits = [(c, firstAt(c, w2, PX['identified'])) for c in CAMS_T]
    yes = [f'{camName(c)} at about {ground_at(c, w2, t):.0f} m' for c, t in hits if t is not None]
    no = [camName(c) for c, t in hits if t is None]
    out = f"Identification ({PX['identified']} px) is expected in {', '.join(yes)}" if yes else f"No camera reaches {PX['identified']} px before the aim point"
    if no:
        out += f"; {', '.join(no)} hold the Tanq to the aim point but never reach it"
    return out + '. CAM-4 at 5× is site-limited for the cue.'


def tanq_rows():
    out = ''
    for c in CAMS_T:
        cells = ''
        for px in (PX['cue'], PX['confirmed'], PX['identified']):
            t = firstAt(c, w2, px)
            cells += f'<td class="src">{ground_at(c, w2, t):.0f} m</td>' if t is not None else '<td class="src">—</td>'
        out += f'<tr><td>{camName(c)}</td>{cells}<td class="src">{lossAt(c["elMaxDeg"]):.0f} m</td></tr>'
    return out
owa += f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="5" class="entry"/><text x="{lx + 8:.1f}" y="{ly + 4:.1f}" class="lbl strong">Launch</text>'
MAP_ATTACK = base(v2, owa, 'One-way attack run and expected events')

# elevation view along the axis for the attack
def elevation_svg():
    W, H = 520, 168
    x0, y0 = 50, 124
    sx = 440 / 470.0
    sy = 1.6
    def X(d): return x0 + (470 - d) * sx
    def Y(h): return y0 - h * sy
    s = f'<svg viewBox="0 0 {W} {H}" class="dot" role="img" aria-label="Side view of the attack run against the camera elevation limits">'
    s += f'<line x1="{x0}" y1="{y0}" x2="{x0 + 440}" y2="{y0}" class="axis"/>'
    for d in (0, 100, 200, 300, 400, 470):
        s += f'<line x1="{X(d):.0f}" y1="{y0}" x2="{X(d):.0f}" y2="{y0 + 5}" class="axis"/><text x="{X(d):.0f}" y="{y0 + 18}" class="lbl mono" text-anchor="middle">{d} m</text>'
    for h in (20, 40):
        s += f'<text x="{x0 - 6}" y="{Y(h) + 4:.0f}" class="lbl mono" text-anchor="end">{h} m</text><line x1="{x0}" y1="{Y(h):.0f}" x2="{x0 + 440}" y2="{Y(h):.0f}" class="grid"/>'
    lost = []
    for c, cls, name, dy in ((CAMS_T[3], 's18l', f'CAM-4 5× · {CAMS_T[3]["elMaxDeg"]:g}°', 12), (CAMS_T[2], 's40l', f'CAM-3 2× · {CAMS_T[2]["elMaxDeg"]:g}°', 26), (CAMS_T[0], 's80l', f'CAM-1, CAM-2 · {CAMS_T[0]["elMaxDeg"]:g}°', 36)):
        el = c['elMaxDeg']
        dmax = min(470, (60 - 2.5) / math.tan(math.radians(el)))
        s += f'<line x1="{X(0)}" y1="{Y(2.5):.0f}" x2="{X(dmax):.0f}" y2="{Y(2.5 + dmax * math.tan(math.radians(el))):.0f}" class="track {cls} thin"/>'
        dcross = (40 - 2.5) / math.tan(math.radians(el))
        lost.append(f'{name.split(" · ")[0].replace("CAM-1, CAM-2", "CAM-1, 2")} {dcross:.0f} m')
        s += f'<circle cx="{X(dcross):.0f}" cy="{Y(40)}" r="4" class="ev e2"/><line x1="{X(dcross):.0f}" y1="{Y(40) - 4}" x2="{X(dcross):.0f}" y2="{Y(40) - dy + 4}" class="grid"/><text x="{X(dcross):.0f}" y="{Y(40) - dy}" class="lbl mono" text-anchor="middle">{dcross:.0f} m</text>'
    s += f'<text x="{x0}" y="12" class="lbl mono">Lost inside: {" · ".join(lost)}</text>'
    # flight: level 40 m from 470 to 100, dive to 5 m at 60
    s += f'<polyline points="{X(470):.0f},{Y(40):.0f} {X(100):.0f},{Y(40):.0f} {X(60):.0f},{Y(5):.0f}" class="track acA"/>'
    s += f'<rect x="{X(0) - 3}" y="{Y(2.5) - 3}" width="6" height="6" class="cam"/>'
    s += f'<text x="{x0 + 440}" y="{H - 4}" class="lbl mono" text-anchor="end">Ground distance from the camera line · height exaggerated 1.6×</text>'
    return s + '</svg>'


ELEV = elevation_svg()
ident_note = ident_note_text()

# ------------------------------------------------------------------ controlled repeat (JIOP-4)
v4 = V[4]
T4 = v4['threats'][0]
w4 = timed(T4['path'], T4['speedMs'])
sens4 = {s['id']: s for s in v4['sensors']}
rep = sector(sens4['CAM-3 5x'], 's18') + sector(sens4['CAM-4 5x'], 's18')
rep += sector(sens4['CAM-3 1x'], 's80') + sector(sens4['CAM-4 1x'], 's80')
rep += f'<polyline points="{pts([(w["x"], w["y"]) for w in T4["path"]])}" class="track acB"/>' + arrows_along(T4['path'], 'acB')
rep += f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="5" class="entry"/><text x="{lx + 8:.1f}" y="{ly + 4:.1f}" class="lbl strong">Launch</text>'
rep += legend([('s80l', 'Level 1× · CAM-3, CAM-4 at 80°'), ('s18l', 'Level 5× · CAM-3, CAM-4 at 17.6°')], x=210, y=24)
MAP_REPEAT = base(v4, rep, 'Controlled repeat: the same run at two zoom levels', sectors=False)
r1x = ground_at(sens4['CAM-3 1x'], w4, windows(sens4['CAM-3 1x'], w4)[0][0])
r5x = ground_at(sens4['CAM-3 5x'], w4, windows(sens4['CAM-3 5x'], w4)[0][0])


def level_svg():
    s = '<svg viewBox="0 0 520 110" class="dot" role="img" aria-label="Planning first-cue range by zoom level">'
    s += '<line x1="60" y1="84" x2="460" y2="84" class="axis"/>'
    for m in (0, 100, 200, 300, 400):
        xx = 60 + m / 470 * 400
        s += f'<line x1="{xx:.0f}" y1="80" x2="{xx:.0f}" y2="88" class="axis"/><text x="{xx:.0f}" y="104" class="lbl mono" text-anchor="middle">{m} m</text>'
    for y, lab, r, cls in ((30, '1×', r1x, 's80l'), (58, '5×', r5x, 's18l')):
        xx = 60 + r / 470 * 400
        s += f'<text x="12" y="{y + 4}" class="lbl strong">{lab}</text><line x1="60" y1="{y}" x2="{xx:.0f}" y2="{y}" class="track {cls}"/><circle cx="{xx:.0f}" cy="{y}" r="6" class="dB"/><text x="{xx + 10:.0f}" y="{y + 4}" class="lbl mono">≈{r:.0f} m</text>'
    s += '<text x="500" y="14" class="lbl mono" text-anchor="end">CAM-3 first cue by level · planning values · measured distributions replace these</text>'
    return s + '</svg>'


LEVELS = level_svg()

# ------------------------------------------------------------------ swarm (JIOP-3)
v3 = V[3]
T3 = v3['threats']
sw = ''
cls_of = {'A': 'acA', 'B': 'acC'}
for t in T3:
    cls = cls_of[t['group']]
    sw += f'<polyline points="{pts([(w["x"], w["y"]) for w in t["path"][1:]])}" class="track {cls} thin"/>'
    sw += arrows_along(t['path'], cls, n=2)
for s_ in (-90, 30):
    x, y = S(*P(s_))
    sw += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16" class="stress"/>'
x, y = S(*P(-90))
sw += f'<text x="{x + 20:.1f}" y="{y + 4:.1f}" class="lbl strong">T3 × T4 cross</text>'
x, y = S(*P(30))
sw += f'<text x="{x + 20:.1f}" y="{y + 4:.1f}" class="lbl strong">second cross</text>'
sw += legend([('acA', 'T1, T2 · Mavic 3 · 50, 60 m · 6 m/s'), ('acC', 'T3 to T7 · Tanq · 20 to 35 m · 10 to 16 m/s')], x=215, y=24)
MAP_SWARM = base(v3, sw, 'Swarm lanes for seven aircraft')
W3 = {t['id']: timed(t['path'], t['speedMs']) for t in T3}


def s_dist(p):
    """Ground distance from the camera line along the axis, metres."""
    return S_CAM - sOf(p)


def lane_rows():
    """Per aircraft, where CAM-3 and CAM-4 hold it: the first window's start and end as distance from the camera line, and the count of breaks."""
    out = ''
    for t in T3:
        w = W3[t['id']]
        cams_ = CAMS_M if t['group'] == 'A' else CAMS_T
        cells = ''
        for c in (cams_[2], cams_[3]):
            ws = [(a, b) for a, b in windows(c, w) if b >= w[0][4]]
            if not ws:
                cells += '<td class="src">—</td>'
                continue
            a = max(ws[0][0], int(w[0][4]))
            b = ws[-1][1]
            gaps = len(ws) - 1
            cells += f'<td class="src">{s_dist(posAt(w, a)):.0f} → {s_dist(posAt(w, b)):.0f} m{f" · {gaps} break" + ("s" if gaps > 1 else "") if gaps else ""}</td>'
        out += f'<tr><td>{t["id"]}</td><td>{t["path"][1]["z"]:g} m</td>{cells}</tr>'
    return out

# ------------------------------------------------------------------ timeline of the day
runs = [('p1', 'Ladder L1 to L3', 3, w1[-1][4]), ('p2', 'Attack A1 to A3', 3, w2[-1][4]),
        ('p3', 'Repeat R1 to R6, levels alternated', 6, w4[-1][4]), ('p4', 'Swarm W1, W2', 2, max(w[-1][4] for w in W3.values()))]
blocks = []
for cls, name, n, dur in runs:
    for k in range(n):
        blocks.append(('ta', 120))
        blocks.append((cls, dur - 120, name if k == 0 else ''))
tot = sum(b[1] for b in blocks)
flight_min = sum(b[1] for b in blocks if b[0] != 'ta') / 60
ta_min = sum(b[1] for b in blocks if b[0] == 'ta') / 60
x = 0
tl = '<svg viewBox="0 0 1000 96" class="tl" role="img" aria-label="Order of the test day">'
for b in blocks:
    w = 1000 * b[1] / tot
    tl += f'<rect x="{x:.1f}" y="28" width="{max(w - 1.5, 1):.1f}" height="30" rx="2" class="tb {b[0]}"/>'
    if len(b) > 2 and b[2]:
        tl += f'<text x="{x:.1f}" y="18" class="lbl strong">{b[2]}</text>'
    x += w
tl += f'<text x="0" y="84" class="lbl mono">Grey = target-absent interval, 120 s before every launch, 14 runs, {ta_min:.0f} min in all</text>'
tl += f'<text x="1000" y="84" class="lbl mono" text-anchor="end">≈ {flight_min:.0f} min airborne across 14 runs, turnarounds excluded</text></svg>'


def measures(v):
    rows = ''.join(f'<tr><td class="src">{m["id"]}</td><td>{MEASURE_NAMES.get(m["id"], "")}</td><td>{OPS.get(m["op"], m["op"])} {m["threshold"]} {m["unit"]}</td></tr>' for m in v['measures'])
    return f'<div class="card"><h3>Measures · DroneScore</h3><div class="tbl"><table><tr><th>ID</th><th>Measure</th><th>Planning threshold</th></tr>{rows}</table></div></div>'


def points_table():
    rows = []
    for c in cams:
        rows.append((c['id'], c['x'], c['y']))
    for n in v1['nodes']:
        if n['kind'] == 'c2':
            rows.append((n['id'], n['x'], n['y']))
    rows.append(('Launch (NW)', launch['x'], launch['y']))
    rows.append(('Aim point (attack)', T2['path'][3]['x'], T2['path'][3]['y']))
    for i, (w, d) in enumerate(zip(holds, dists)):
        rows.append((f'Hover H{i + 1} · {d} m', w['x'], w['y']))
    out = ''
    for name, x_, y_ in rows:
        la, lo = latlon(x_, y_)
        out += f'<tr><td>{name}</td><td class="src">{la:.6f}</td><td class="src">{lo:.6f}</td><td class="src">{x_:.0f}, {y_:.0f}</td></tr>'
    return out


# pixel footprint (Appendix A.1) for both aircraft at the three lens settings
pix_rows = ''
for d in [470] + dists:
    cells = ''
    for wdt in (W_MAVIC, W_TANQ):
        for z in ('1x', '2x', '5x'):
            cells += f'<td class="src">{pixels(wdt, HFOV[z][0], d):.1f}</td>'
    pix_rows += f'<tr><td>{d} m</td>{cells}</tr>'
reach_rows = ''
for z, name in (('1x', 'CAM-1, CAM-2 · 80°'), ('2x', f'CAM-3 · {ZOOM_LABEL["2x"]}'), ('5x', f'CAM-4 · {ZOOM_LABEL["5x"]}')):
    cells = ''
    for wdt in (W_MAVIC, W_TANQ):
        for k in ('cue', 'confirmed', 'identified'):
            r = wdt * 2560 / (2 * math.tan(math.radians(HFOV[z][0] / 2)) * PX[k])
            cells += f'<td class="src">{"site" if r > 470 else f"{r:.0f} m"}</td>'
    reach_rows += f'<tr><td>{name}</td>{cells}</tr>'


def camera_rows():
    out = ''
    for c, a in zip(CAMS_M, (-15, -5, 5, 15)):
        h = c['fovDeg']
        v43, v169 = vfov(h, '4:3'), vfov(h, '16:9')
        up43 = c['tiltDeg'] + v43 / 2
        up169 = c['tiltDeg'] + v169 / 2
        aim = math.degrees(math.atan(abs(a) / AIM_S))
        lat = abs(a) / math.tan(math.radians(h / 2 + aim))
        out += (f'<tr><td>{c["id"]}</td><td class="src">{a:+d} m</td><td>{ZOOM_LABEL[c["zoom"]]}</td><td class="src">{c["tiltDeg"]:g}°</td>'
                f'<td class="src">{c["bearingDeg"]:g}°</td><td class="src">{v43:.1f}°</td><td class="src">{up43:.1f}°</td>'
                f'<td class="src">{lossAt(up43):.0f} m</td><td class="src">{lat:.0f} m</td></tr>')
    return out


def wide_note():
    parts = []
    for c in CAMS_M:
        v = vfov(c['fovDeg'], '16:9')
        up = c['tiltDeg'] + v / 2
        parts.append(f'{c["id"]} {v:.1f}°, limit {up:.1f}°, loss {lossAt(up):.0f} m')
    return '; '.join(parts)

CSS = r'''
/* Layout: one column of profile sections; each pairs a to-scale site map with short cards. */
:root{
  --bg:#eceef1; --surface:#ffffff; --ink:#15202b; --muted:#5b6774; --line:#d3d8df;
  --fly:#d9a700; --fly-fill:rgba(217,167,0,.14); --ranch:#8a94a0; --sensor:#0b7a9e;
  --s80:rgba(11,122,158,.10); --s40:rgba(11,122,158,.14); --s18:rgba(11,122,158,.20);
  --track:#e4531b; --acb:#6a3fc9; --acc:#0b8f85; --e1:#9aa5b1; --e2:#f0a500; --e3:#1d8a5a;
  --ta:#c9ced5; --p1:#0b7a9e; --p2:#e4531b; --p3:#6a3fc9; --p4:#0b8f85; --mapbg:#f7f8f9; --stress:rgba(228,83,27,.14);
  --band0:rgba(11,122,158,.05); --band1:rgba(11,122,158,.11);
  --display:"Barlow Semi Condensed","Barlow",system-ui,sans-serif; --body:"Barlow",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#121820; --surface:#1a222c; --ink:#e8edf2; --muted:#9aa7b5; --line:#2c3845;
  --fly:#f2c230; --fly-fill:rgba(242,194,48,.12); --ranch:#5d6b7a; --sensor:#4cc3e8;
  --s80:rgba(76,195,232,.10); --s40:rgba(76,195,232,.15); --s18:rgba(76,195,232,.22);
  --track:#ff7a45; --acb:#a688ff; --acc:#3fd0c4; --e1:#8e9aa8; --e2:#ffc23d; --e3:#3fcf8a;
  --ta:#2f3a47; --p1:#2f9ec4; --p2:#ff7a45; --p3:#a688ff; --p4:#3fd0c4; --mapbg:#141b24; --stress:rgba(255,122,69,.18);
  --band0:rgba(76,195,232,.05); --band1:rgba(76,195,232,.11);
  color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#121820; --surface:#1a222c; --ink:#e8edf2; --muted:#9aa7b5; --line:#2c3845;
  --fly:#f2c230; --fly-fill:rgba(242,194,48,.12); --ranch:#5d6b7a; --sensor:#4cc3e8;
  --s80:rgba(76,195,232,.10); --s40:rgba(76,195,232,.15); --s18:rgba(76,195,232,.22);
  --track:#ff7a45; --acb:#a688ff; --acc:#3fd0c4; --e1:#8e9aa8; --e2:#ffc23d; --e3:#3fcf8a;
  --ta:#2f3a47; --p1:#2f9ec4; --p2:#ff7a45; --p3:#a688ff; --p4:#3fd0c4; --mapbg:#141b24; --stress:rgba(255,122,69,.18);
  --band0:rgba(76,195,232,.05); --band1:rgba(76,195,232,.11);
  color-scheme:dark }
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.45;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 56px}
.wrap{max-width:1120px;margin:0 auto;display:grid;gap:28px}
h1,h2,h3{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.1}
h1{font-size:2.4rem;font-weight:700} h2{font-size:1.7rem;font-weight:700} h3{font-size:1.05rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
p{margin:0}
.eyebrow{font-family:var(--mono);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.lead{max-width:68ch;font-size:1.05rem}
header{display:grid;gap:10px}
nav{display:flex;flex-wrap:wrap;gap:8px}
nav a{font-family:var(--mono);font-size:.8rem;text-decoration:none;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--surface)}
nav a:focus-visible,a:focus-visible{outline:2px solid var(--sensor);outline-offset:2px}
nav a:hover{border-color:var(--sensor)}
.band{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-1px}
section.profile{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:22px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:22px}
section.plain{display:grid;gap:14px}
@media (max-width:880px){section.profile{grid-template-columns:1fr}}
.cards{display:grid;gap:14px;min-width:0}
.card{display:grid;gap:6px;min-width:0}
.card ul{margin:0;padding-left:18px;display:grid;gap:3px}
.phead{grid-column:1/-1;display:grid;gap:6px;border-bottom:1px solid var(--line);padding-bottom:12px}
.phead .num{font-family:var(--mono);font-size:.8rem;color:var(--muted)}
.map{width:100%;max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;display:block}
.mapbg{fill:var(--mapbg)} .fly{fill:var(--fly-fill);stroke:var(--fly);stroke-width:2.2;stroke-linejoin:round}
.ranch{fill:none;stroke:var(--ranch);stroke-width:1;stroke-dasharray:4 4}
.sec{stroke:var(--sensor);stroke-width:.6} .s80{fill:var(--s80)} .s40{fill:var(--s40)} .s18{fill:var(--s18)}
.s80l{stroke:var(--sensor);stroke-width:3;opacity:.45} .s40l{stroke:var(--sensor);stroke-width:3;opacity:.7} .s18l{stroke:var(--sensor);stroke-width:3}
.cl{fill:none;stroke:var(--muted);stroke-width:1.2;stroke-dasharray:5 4}
.cam{fill:var(--sensor);stroke:var(--surface);stroke-width:1.5} .node{fill:var(--ink)} .north{fill:var(--ink)} .scale{stroke:var(--ink);stroke-width:1.5}
.lbl{font-family:var(--body);font-size:11px;fill:var(--ink)} .lbl.strong{font-weight:600} .lbl.mono{font-family:var(--mono);font-size:10px;fill:var(--muted)} .lbl.white{fill:#fff}
.entry{fill:var(--ink)} .station{fill:var(--p1);stroke:var(--surface);stroke-width:2}
.band{} .b0{fill:var(--band0);stroke:var(--sensor);stroke-width:.5} .b1{fill:var(--band1);stroke:var(--sensor);stroke-width:.5}
.track{fill:none;stroke:var(--track);stroke-width:3;stroke-linecap:round;stroke-linejoin:round} .track.thin{stroke-width:2} .arrow{fill:var(--track)}
.track.s80l,.track.s40l,.track.s18l{stroke:var(--sensor)}
.dive{stroke-dasharray:6 4}
.acA{stroke:var(--track)} .acB{stroke:var(--acb)} .acC{stroke:var(--acc)}
polygon.acA{fill:var(--track)} polygon.acB{fill:var(--acb)} polygon.acC{fill:var(--acc)}
.aim{fill:none;stroke:var(--track);stroke-width:1.5}
.ev{stroke:var(--surface);stroke-width:2} .e1{fill:var(--e1)} .e2{fill:var(--e2)} .e3{fill:var(--e3)}
.stress{fill:var(--stress);stroke:var(--track);stroke-width:1;stroke-dasharray:4 3}
.tl,.dot{width:100%;height:auto;display:block} .tb{fill:var(--line)} .ta{fill:var(--ta)} .p1{fill:var(--p1)} .p2{fill:var(--p2)} .p3{fill:var(--p3)} .p4{fill:var(--p4)}
.tlt{font-family:var(--display);font-weight:600;font-size:15px;fill:#fff}
.axis{stroke:var(--muted);stroke-width:1} .grid{stroke:var(--line);stroke-width:1} .dB{fill:var(--acb)}
table{border-collapse:collapse;width:100%;font-size:.9rem;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-family:var(--mono);font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:500}
.tbl{overflow-x:auto}
td.src{font-family:var(--mono);font-size:.78rem;color:var(--muted);white-space:nowrap}
.matrix td.c{text-align:center;font-size:1.05rem} .matrix th{white-space:nowrap}
.matrix td.p1c{color:var(--p1)} .matrix td.p2c{color:var(--p2)} .matrix td.p3c{color:var(--p3)} .matrix td.p4c{color:var(--p4)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.fact{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:2px}
.fact b{font-family:var(--display);font-size:1.45rem;font-weight:700;font-variant-numeric:tabular-nums}
.fact span{font-size:.8rem;color:var(--muted)}
.result{border-left:3px solid var(--e3);padding-left:12px}
.note{font-size:.88rem;color:var(--muted);max-width:70ch}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
.chk{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.chk div{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:4px}
.chk div b{font-family:var(--display);font-size:1.05rem}
.chk div span{font-size:.85rem;color:var(--muted)}
'''

matrix_rows = [
    ('All four feeds record continuously under one test ID, time base, and settings', '§9 · C.3-1', '●', '●', '●', '●', '●'),
    ('Telemetry aligns to video with a documented correction and uncertainty', '§9 · C.3-2', '●', '●', '●', '●', ''),
    ('Each confirmed first-detection frame yields a still, position, slant and ground range', '§9 · C.3-3', '●', '●', '●', '●', ''),
    ('Detection probability across fixed distance bins', 'C.2', '●', '', '', '', ''),
    ('First confirmed range distributions, median and percentiles', 'C.2', '○', '●', '●', '', ''),
    ('Per-camera range results by tested FOV, zoom, and background', '§9 · Phase 4', '●', '', '●', '', ''),
    ('Repeat after one controlled change to lens, FOV, exposure, or approach', 'C.3-4', '', '', '●', '', ''),
    ('False detections per unit time', 'C.2', '', '', '', '●', '●'),
    ('FOV-limited versus optical-limited runs flagged', '§6 · C.2', '●', '●', '●', '', ''),
    ('Missing frames and frame-time synchronization error', 'C.2', '●', '●', '●', '●', '●'),
    ('Raw MP4, configuration snapshots, telemetry, annotations, CSVs preserved', '§9', '●', '●', '●', '●', '●'),
    ('Report separates illustrative from measured data and states uncertainty', 'C.3-5', '●', '●', '●', '●', '●'),
    ('Multi-aircraft association, beyond the paper', 'extension', '', '', '', '●', '')]
mrows = ''.join(f"<tr><td>{a}</td><td class='src'>{b}</td><td class='c p1c'>{c}</td><td class='c p2c'>{d}</td><td class='c p3c'>{e}</td><td class='c p4c'>{f}</td><td class='c'>{g}</td></tr>" for a, b, c, d, e, f, g in matrix_rows)
data_rows = ''.join(f'<li>{d}</li>' for d in v1['report']['dataSources'][:10])

html = f'''<title>VAL Test Profiles</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>{CSS}</style>
<div class="wrap">
<header>
  <div class="eyebrow">VALKRYN · VAL demonstration · JIOPs four-camera drone detection test · TST Ranch, Carthage NC · 12 to 13 November 2026</div>
  <h1>VAL Test Profiles</h1>
  <p class="lead">Four flight profiles in the UAS Fly Area, built in Profile Studio as JIOP-1 to JIOP-4. Each profile answers one question from the test plan, and VAL records the evidence: aircraft truth track, detection events per camera, ranges, and linked video frames.</p>
  <nav><a href="#ladder"><span class="band" style="background:var(--p1)"></span>1 Range Ladder · JIOP-1</a><a href="#attack"><span class="band" style="background:var(--p2)"></span>2 One-Way Attack · JIOP-2</a><a href="#repeat"><span class="band" style="background:var(--p3)"></span>3 Controlled Repeat · JIOP-4</a><a href="#swarm"><span class="band" style="background:var(--p4)"></span>4 Swarm · JIOP-3</a><a href="#day">Test day</a></nav>
</header>

<section class="plain">
  <h2>Site</h2>
  <div class="facts">
    <div class="fact"><b>{LAT0:.6f}</b><span>{LON0:.6f} · origin, centre of the fly-area file (WGS84)</span></div>
    <div class="fact"><b>470 m</b><span>launch to camera line, 1,540 ft, straight</span></div>
    <div class="fact"><b>142°</b><span>run heading · cameras look 322°</span></div>
    <div class="fact"><b>40 m AGL</b><span>run altitude, 131 ft · ceiling 400 ft AGL</span></div>
    <div class="fact"><b>4 cameras</b><span>CAM-1 to CAM-4 across 30 m at the SE end</span></div>
    <div class="fact"><b>14 runs</b><span>3 + 3 + 6 + 2, in that order</span></div>
  </div>
  <section class="profile">
    {MAP_OVERVIEW}
    <div class="cards">
      <div class="card"><h3>Common geometry</h3>
        <ul>
          <li><b>Camera line.</b> CAM-1 and CAM-2 fixed at 80°, CAM-3 at {ZOOM_LABEL["2x"]}, CAM-4 at {ZOOM_LABEL["5x"]}, 10 m apart across the axis, lens height 2.5 m. Each camera is yawed to the axis point {AIM_S} m before the camera line and tilted up by the angle in the table; survey and record azimuth and tilt per camera. Each position is surveyed on its own and VAL computes range per camera from its own position (plan section 6). The sectors show planning reach from the Appendix A.1 estimate, not measured range. The ladder measures it.</li>
          <li><b>Axis.</b> One straight line from the launch point at the NW end to the camera line, heading 142°. Every approach flies it head-on, so heading and aspect hold as plan section 7 step 5 requires.</li>
          <li><b>Nodes.</b> GCS-1 behind the launch point logs the aircraft. REC-1 behind the cameras records the four streams. Both carry a truth station for VAL.</li>
        </ul></div>
      <div class="card"><h3>Camera settings and limits</h3>
        <div class="tbl"><table>
        <tr><th>Camera</th><th>Off axis</th><th>Lens</th><th>Tilt</th><th>Azimuth</th><th>Vertical FOV</th><th>Upper limit</th><th>Loses 40 m inside</th><th>Loses axis inside</th></tr>{camera_rows()}</table></div>
        <p class="note">Sensor assumed {SENSOR['4:3'][0]} × {SENSOR['4:3'][1]} (4:3, the Appendix B example). On a {SENSOR['16:9'][0]} × {SENSOR['16:9'][1]} (16:9) sensor the same lenses give: {wide_note()}. Confirm the sensor of the purchased model before the survey: a 16:9 sensor narrows the vertical FOV and every elevation limit moves out. The 2× value is derived from the 80° lens (2 atan(tan 40° / 2)); 17.6° at 5× is the spec value (a true 5× gives 19.0°). Use the lens spec at the zoom step set and record it in the configuration snapshot. The last column is where a target on the axis leaves the horizontal FOV of a camera yawed to the axis {AIM_S} m out; the elevation limit comes first on every camera.</p></div>
      <div class="card"><h3>Held constant unless the profile changes it</h3>
        <ul><li>40 m AGL. Head-on aspect. Camera settings as above, focus locked after preflight, one configuration snapshot per camera per run (Appendix B.1).</li>
            <li>Truth source: aircraft GCS telemetry log at the maximum rate, clock-synchronized with the recorders before the first run; ATOS tag track fused in VAL as the second source.</li>
            <li>Recorded, not controlled: sun position, sky background, cloud, visibility, wind, obstructions.</li></ul></div>
      <div class="card"><h3>Expected image size per band · Appendix A.1</h3>
        <div class="tbl"><table>
        <tr><th rowspan="2">Range</th><th colspan="3">Mavic 3 · {W_MAVIC:g} m</th><th colspan="3">Tanq · {W_TANQ:g} m</th></tr>
        <tr><th>80°</th><th>2×</th><th>5×</th><th>80°</th><th>2×</th><th>5×</th></tr>{pix_rows}</table></div>
        <p class="note">Pixels across the width, {SENSOR[ASPECT][0]} px across, on-axis pinhole estimate (P = W N / 2 D tan(θ/2)). Planning thresholds: first possible cue {PX['cue']} px, confirmed {PX['confirmed']} px, identified {PX['identified']} px (Johnson criteria: detection 2 px, recognition 8 px across the critical dimension). They are planning choices, set in gen.py; the ladder measures the real ones.</p>
        <div class="tbl"><table>
        <tr><th rowspan="2">Planning range</th><th colspan="3">Mavic 3</th><th colspan="3">Tanq</th></tr>
        <tr><th>cue</th><th>confirmed</th><th>identified</th><th>cue</th><th>confirmed</th><th>identified</th></tr>{reach_rows}</table></div>
        <p class="note">"site" means the aircraft is already that large at the launch point, 470 m out: the site limits the camera, not the optics, and VAL flags those runs site-limited (section 6). The 80° cameras identify a Tanq only inside {reach(W_TANQ, HFOV['1x'][0], PX['identified']):.0f} m, past the attack aim point.</p></div>
      <div class="card"><h3>Target-absent intervals</h3>
        <p>120 s of recording before every launch, 14 intervals in the day. They give false detections per unit time (C.2). Apparent but unconfirmed cues are logged separately (section 8).</p></div>
    </div>
  </section>
</section>

<section class="profile" id="ladder">
  <div class="phead"><div class="num">Profile 1 · JIOP-1 · flown first</div><h2>Range Ladder · Mavic 3 by distance band</h2>
    <p class="note"><b>Why first.</b> It sets the distance bands the other three profiles are read against. Five hovers of 30 s give every camera one equal observation interval per band, so detection probability per band comes from equal exposure.</p></div>
  {MAP_LADDER}
  <div class="cards">
    <div class="card"><h3>What is tested</h3>
      <ul><li><b>Factors:</b> distance band, five levels, one hover at each (450, 350, 250, 150, 75 m from the camera line); camera configuration, four levels, observed in parallel.</li>
          <li><b>Responses:</b> outcome per band, per camera, per run: possible, confirmed, identified, or none, with the FOV-limited flag. Range error between the VAL range and the GCS range.</li></ul></div>
    <div class="card"><h3>Run plan</h3>
      <div class="tbl"><table>
        <tr><th>Run</th><th>Path</th><th>Hover</th><th>Transit</th><th>Alt</th></tr>
        <tr><td>L1 to L3</td><td>Launch → H1 450 m → H2 → H3 → H4 → H5 75 m, inbound, head-on</td><td>30 s each</td><td>5 m/s</td><td>40 m AGL</td></tr>
      </table></div>
      <p class="note">Three replicates, about {w1[-1][4] / 60:.0f} min each. Inbound order on every run keeps the aspect head-on; the three replicates carry the light drift. Add a fourth run if two bands disagree between runs. Planning first cue: CAM-4 at ≈{ground_at(cams[3], w1, lad_first["CAM-4"]):.0f} m, CAM-3 at ≈{ground_at(cams[2], w1, lad_first["CAM-3"]):.0f} m, CAM-1 and CAM-2 at ≈{ground_at(cams[0], w1, lad_first["CAM-1"]):.0f} m.</p></div>
    <div class="card"><h3>VAL output</h3>
      <ul><li>Detection matrix: band × camera × run, each cell linked to the footage interval and the GCS position.</li>
          <li>Detection probability per band with its confidence interval. Missing frames and frame-time synchronization error per run (C.2).</li></ul></div>
    {measures(v1)}
    <div class="card result"><h3>Result</h3><p>A range-dependent performance picture per camera, including the band where observation fails. This fills C.2, detection probability across fixed distance bins, from replayable evidence. A camera that detects in every band on every run is limited by the site, not its optics.</p></div>
  </div>
</section>

<section class="profile" id="attack">
  <div class="phead"><div class="num">Profile 2 · JIOP-2 · flown second</div><h2>One-Way Attack · Tanq FPV direct run</h2>
    <p class="note"><b>Why.</b> This is the paper's core method. One aircraft, one controlled approach, three detection events per camera, each tied to a time, a range, and a frame. The terminal dive adds the warning-time measure and tests the elevation limit of the zoomed cameras.</p></div>
  {MAP_ATTACK}
  <div class="cards">
    <div class="card"><h3>What is tested</h3>
      <ul><li><b>Events:</b> E1 first possible visual cue, E2 first confirmed detection, E3 first identifiable frame (section 7, step 6). Confirmed means the reviewer locates the same moving airborne target across consecutive frames without cueing from the flight log (section 8).</li>
          <li><b>Responses:</b> ground and slant range at each event, per camera, from each camera's surveyed position. Warning time from first cue to the aim point. Timing uncertainty and recording gaps.</li></ul></div>
    <div class="card"><h3>Run plan</h3>
      <div class="tbl"><table>
        <tr><th>Run</th><th>Path</th><th>Speed</th><th>Alt</th><th>End</th></tr>
        <tr><td>A1 to A3</td><td>Launch → 100 m short of the camera line, then a 41° dive to the aim point 60 m short</td><td>15 m/s</td><td>40 m AGL → 5 m</td><td>Hold 5 s at the aim point</td></tr>
      </table></div>
      <p class="note">Three replicates, about {(w2[-1][4] - 120):.0f} s from launch to the aim point. No payload, no flight toward people. At 15 m/s, 1 s of clock offset is 15 m of range (section 8), so the clock record decides the range uncertainty here.</p></div>
    <div class="card"><h3>Expected events per camera · Tanq {W_TANQ:g} m</h3>
      <div class="tbl"><table>
      <tr><th>Camera</th><th>Cue {PX['cue']} px</th><th>Confirmed {PX['confirmed']} px</th><th>Identified {PX['identified']} px</th><th>Lost by elevation inside</th></tr>{tanq_rows()}</table></div>
      <p class="note">Ground range from the camera at each threshold on the run, from the pixel estimate and the camera's elevation and azimuth coverage; — means the threshold is not reached before the aim point. {ident_note}</p></div>
    <div class="card"><h3>Side view · elevation limits</h3>
      {ELEV}
      <p class="note">The run crosses each camera's upper elevation limit at the marked distance, with the tilt in the camera table and a {ASPECT} sensor. Inside it the camera cannot see the aircraft, so a loss there is FOV-limited, not an optical limit (section 6). On a 16:9 sensor the limits move out to {lossAt(TILT['CAM-4'] + vfov(HFOV['5x'][0], '16:9') / 2):.0f} m (CAM-4), {lossAt(TILT['CAM-3'] + vfov(HFOV['2x'][0], '16:9') / 2):.0f} m (CAM-3) and {lossAt(TILT['CAM-1'] + vfov(HFOV['1x'][0], '16:9') / 2):.0f} m (CAM-1, CAM-2). The 80° cameras hold the target to the aim point either way.</p></div>
    <div class="card"><h3>VAL output</h3>
      <ul><li>Aircraft track and detection timeline on one clock. Each event links to its video frame and its calculated range, with the clock-offset uncertainty as a ± value.</li>
          <li>Each event row carries the C.1 fields: run and camera ID, the three event times, frame index and still, drone and camera E/N/U, ground and slant range, time and range uncertainty, FOV-limited and occluded flags, reviewer.</li></ul></div>
    {measures(v2)}
    <div class="card result"><h3>Result</h3><p>A complete, replayable account of when the aircraft became visible, confirmed, and recognizable in each camera, with the range at each step and the warning time that remained.</p></div>
  </div>
</section>

<section class="profile" id="repeat">
  <div class="phead"><div class="num">Profile 3 · JIOP-4 · flown third</div><h2>Controlled Repeat · optical zoom 1× against 5×</h2>
    <p class="note"><b>Why.</b> One factor changes, nothing else. CAM-3 and CAM-4 fly the same Mavic 3 approach at 1× and then at 5×. CAM-1 and CAM-2 stay at 80° as the control, so a change in light shows in the control cameras and not in the factor.</p></div>
  {MAP_REPEAT}
  <div class="cards">
    <div class="card"><h3>What is tested</h3>
      <ul><li><b>Factor:</b> true optical zoom on the two varifocal cameras, two levels, 1× (80°) and 5× (17.6°). The paper names this change in C.3 item 4 and Phase 4. Defined background can replace zoom with the same profile.</li>
          <li><b>Responses:</b> first possible, confirmed, and identified range per camera per run. The difference between levels against the spread within a level. FOV loss at the near end at 5×.</li></ul></div>
    <div class="card"><h3>Run plan</h3>
      <div class="tbl"><table>
        <tr><th>Run</th><th>Level</th><th>Path</th><th>Speed</th><th>Alt</th></tr>
        <tr><td>R1, R3, R5</td><td>1×</td><td>Launch → 50 m short of the camera line, hold 10 s</td><td>8 m/s</td><td>40 m AGL</td></tr>
        <tr><td>R2, R4, R6</td><td>5×</td><td>Same path</td><td>8 m/s</td><td>40 m AGL</td></tr>
      </table></div>
      <p class="note">Six runs, levels alternated so sky and sun changes do not confound the factor. Re-zoom and re-snapshot CAM-3 and CAM-4 between runs. The spread between CAM-1 to CAM-4 at the 1× level is the repeatability floor.</p></div>
    <div class="card"><h3>VAL output</h3>
      {LEVELS}
      <ul><li>Side-by-side runs with their settings, conditions, detection events, and evidence.</li>
          <li>First confirmed range distribution per level and camera, median and percentiles (C.2), with the between-level difference and the within-level spread on one plot.</li></ul></div>
    {measures(v4)}
    <div class="card result"><h3>Result</h3><p>A defensible comparison. The measured difference is shown next to the variation between repeats, so the reader can see if the change exceeds the noise.</p></div>
  </div>
</section>

<section class="profile" id="swarm">
  <div class="phead"><div class="num">Profile 4 · JIOP-3 · flown last</div><h2>Swarm · seven aircraft with crossings</h2>
    <p class="note"><b>Why last.</b> It needs every aircraft in the inventory and the most coordination. The single-aircraft ranges from Profiles 1 to 3 say what each aircraft should produce alone, so missed and false observations in the multi-aircraft case stand out.</p></div>
  {MAP_SWARM}
  <div class="cards">
    <div class="card"><h3>What is tested</h3>
      <ul><li><b>Per aircraft:</b> E1, E2, E3 events and ranges as in Profile 2, with each aircraft's GCS log recorded separately.</li>
          <li><b>Multi-aircraft:</b> missed observations, false detections, and correct association of each observation with one aircraft by time and bearing against the logs. The two crossings of T3 and T4, 5 m apart in height, are the closest spacing and test resolution.</li></ul></div>
    <div class="card"><h3>Run plan</h3>
      <div class="tbl"><table>
        <tr><th>Aircraft</th><th>Lane</th><th>Alt</th><th>Speed</th><th>Note</th></tr>
        <tr><td>T1, T2 Mavic 3</td><td>Line abreast, 24 m apart at launch, 36 m at the end</td><td>50, 60 m</td><td>6 m/s</td><td>Slow pair</td></tr>
        <tr><td>T3, T4 Tanq</td><td>Cross the axis twice</td><td>25, 30 m</td><td>12 m/s</td><td>5 m vertical separation at the crossings</td></tr>
        <tr><td>T5 Tanq</td><td>Axis</td><td>20 m</td><td>16 m/s</td><td>Launches 20 s late</td></tr>
        <tr><td>T6, T7 Tanq</td><td>16 m apart</td><td>35 m</td><td>10 m/s</td><td>Close pair</td></tr>
      </table></div>
      <p class="note">Two replicates, W1 and W2, all from the NW end. Every aircraft holds its own altitude. If fewer aircraft are available, keep T3, T4 and T5 so both crossings and the late runner remain.</p></div>
    <div class="card"><h3>Lane coverage · the zoomed cameras</h3>
      <div class="tbl"><table>
      <tr><th>Aircraft</th><th>Alt</th><th>CAM-3 · {ZOOM_LABEL["2x"]}</th><th>CAM-4 · {ZOOM_LABEL["5x"]}</th></tr>{lane_rows()}</table></div>
      <p class="note">Distance from the camera line where each camera first holds the aircraft and where it loses it, from the lane's offset against the camera's azimuth and from its height against the elevation limit. CAM-4 sits 15 m off the axis and is yawed to the axis {AIM_S} m out, so the wide lanes (T1, T2 at ±18 m, the T3 and T4 crossings) leave its 17.6° view earlier than the axis does, and a break marks a crossing out of the view and back. Flag those observations FOV-limited, not missed.</p></div>
    <div class="card"><h3>VAL output</h3>
      <ul><li>Combined view with separate aircraft histories, each with its own evidence chain.</li>
          <li>Association table per camera: observation, aircraft assigned, bearing and time residual against the GCS log, wrong-association flag. Missed-observation list per aircraft per camera.</li></ul></div>
    {measures(v3)}
    <div class="card result"><h3>Result</h3><p>A clear account of which aircraft each camera observed, when, and where identification became ambiguous. Association extends the paper's single-aircraft method to several aircraft.</p></div>
  </div>
</section>

<section class="plain" id="day">
  <h2>Test day</h2>
  {tl}
  <div class="two">
    <div class="card"><h3>Planning points · WGS84</h3>
      <div class="tbl"><table><tr><th>Point</th><th>Latitude</th><th>Longitude</th><th>East, north m</th></tr>{points_table()}</table></div>
      <p class="note">East and north are metres from the origin, the frame the Profile Studio files use. Survey the camera positions; these are planning values.</p></div>
    <div class="card"><h3>Data preserved for every run</h3><ul>{data_rows}</ul></div>
  </div>
  <h3>Paper measures by profile</h3>
  <div class="tbl"><table class="matrix">
    <tr><th>Measure from the paper</th><th>Source</th><th><span class="band" style="background:var(--p1)"></span>1 Ladder</th><th><span class="band" style="background:var(--p2)"></span>2 Attack</th><th><span class="band" style="background:var(--p3)"></span>3 Repeat</th><th><span class="band" style="background:var(--p4)"></span>4 Swarm</th><th>Target absent</th></tr>
    {mrows}
  </table></div>
  <p class="note">● primary evidence · ○ supporting evidence. Section and item numbers refer to the Four-Camera Drone Visual Detection Test System plan of 31 October 2026. Every range on this page is a planning value until the ladder measures it; the report keeps the two apart (C.3 item 5).</p>
  <p class="note">Scope of inference: conclusions apply to this fly area, these aircraft, 20 to 60 m AGL, 5 to 16 m/s, and the light and weather recorded on the day. Abort call on every profile: the aircraft holds position, recording continues, the run is marked as a deviation.</p>
</section>
</div>
'''
out = os.path.join(HERE, 'val-test-profiles.html')
open(out, 'w').write(html)
print(out, len(html))
