"""Points High graphics at GJ_GameSheet-uhd.png for the main sheet's sprites.

sprites.js was first made with only GJ_GameSheet-hd for the main sheet, so High
used the Medium picture for blocks, spikes and saws. This rewrites the "high"
frames of every main-sheet sprite from GJ_GameSheet-uhd.plist (120 pixels a
square) and leaves everything else in sprites.js as it was.

GJ_GameSheet-uhd here is from Geometry Dash 2.1. It has every main-sheet sprite
the game uses, and they look the same as 2.2's (checked sprite by sprite).

Run from the repo folder:  python3 tools/use_uhd_main_sheet.py
"""
import json, plistlib, re

nums = lambda s: [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', s)]
js = open('sprites.js').read()
head, body = js[:js.index('{')], js[js.index('{'):js.rindex('}') + 1]
d = json.loads(body)
uhd = plistlib.load(open('GJ_GameSheet-uhd.plist', 'rb'))['frames']
d['sheets']['high']['main'] = ['GJ_GameSheet-uhd.png', 120]
missing = []
for name, f in d['frames']['medium'].items():
    if f[0] != 'main':
        continue
    u = uhd.get(name + '.png')
    if not u:
        missing.append(name)
        continue
    x, y, w, h = nums(u['textureRect'])
    sw, sh = nums(u['spriteSourceSize'])
    ox, oy = nums(u['spriteOffset'])
    d['frames']['high'][name] = ['main', int(x), int(y), int(w), int(h), 1 if u['textureRotated'] else 0, sw, sh, ox, oy]
if missing:
    raise SystemExit('Not on GJ_GameSheet-uhd: ' + ', '.join(missing))
open('sprites.js', 'w').write(head + json.dumps(d, separators=(',', ':')) + ';\n')
print('High now uses GJ_GameSheet-uhd.png for', sum(1 for f in d['frames']['high'].values() if f[0] == 'main'), 'sprites')
