"""Makes icons.js: where every cube (player_XX) and ship (ship_XX) sprite sits on
GJ_GameSheetIcons.png, so the icon kit can cut them out without reading the big .plist.

Run from the repo folder:  python3 tools/make_icons_js.py
Each frame is [x, y, width, height, rotated, full width, full height, offset x, offset y],
the same layout as sprites.js. Sheets for other qualities (-hd, -uhd) are added if present.
"""
import json, os, plistlib, re

SHEETS = {'low': ('GJ_GameSheetIcons.png', 30), 'medium': ('GJ_GameSheetIcons-hd.png', 60), 'high': ('GJ_GameSheetIcons-uhd.png', 120)}
NAME = re.compile(r'^(player|ship)_\d+_(?:2_|extra_|glow_)?001\.png$')
nums = lambda s: [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', s)]

out = {'sheets': {}, 'frames': {}}
for q, (png, ppb) in SHEETS.items():
    pl = png[:-4] + '.plist'
    if not (os.path.exists(png) and os.path.exists(pl)):
        continue
    frames = plistlib.load(open(pl, 'rb'))['frames']
    fr = {}
    for k, f in frames.items():
        if not NAME.match(k):
            continue
        x, y, w, h = nums(f['textureRect'])
        sw, sh = nums(f['spriteSourceSize'])
        ox, oy = nums(f['spriteOffset'])
        fr[k[:-4]] = [int(x), int(y), int(w), int(h), 1 if f['textureRotated'] else 0, sw, sh, ox, oy]
    out['sheets'][q] = [png, ppb]
    out['frames'][q] = fr

with open('icons.js', 'w') as f:
    f.write('// Ship Run icon map, made from GJ_GameSheetIcons.plist by tools/make_icons_js.py.\n')
    f.write('// [x, y, width, height, rotated, full width, full height, offset x, offset y]\n')
    f.write('window.GD_ICONS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print({q: len(v) for q, v in out['frames'].items()})
