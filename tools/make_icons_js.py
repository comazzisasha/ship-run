"""Makes icons.js and the icon sheets the icon kit uses.

Two sources of icons, used in this order:

1. The SSOH texture pack's cubes and ships (only the icons; nothing else from the
   pack is used). They were cut out of its GJ_GameSheet02-uhd and
   GJ_GameSheetGlow-uhd sheets into icons-ssoh-uhd.png, and made smaller for
   icons-ssoh-hd.png and icons-ssoh.png. To cut them again, pass the pack's
   two .plist files (their .png must be next to them):
       python3 tools/make_icons_js.py path/GJ_GameSheet02-uhd.plist path/GJ_GameSheetGlow-uhd.plist
   Without them, the icons-ssoh sheets already in the repo are kept and only
   icons.js is remade.
2. GJ_GameSheetIcons.png (Geometry Dash's low-quality icon sheet), for icons the
   pack doesn't have.

Run from the repo folder. Each frame is
[x, y, width, height, rotated, full width, full height, offset x, offset y],
the same layout as sprites.js.
"""
import json, os, plistlib, re, sys
from PIL import Image

ICON = re.compile(r'^(player|ship)_(\d+)_(?:2_|extra_|glow_)?001\.png$')
SSOH = {'low': ('icons-ssoh.png', 30, 4), 'medium': ('icons-ssoh-hd.png', 60, 2), 'high': ('icons-ssoh-uhd.png', 120, 1)}
SSOH_JSON = 'tools/icons-ssoh.json'      # the frames of the icons-ssoh sheets, kept for remaking icons.js
GD = {'low': ('GJ_GameSheetIcons.png', 30), 'medium': ('GJ_GameSheetIcons-hd.png', 60), 'high': ('GJ_GameSheetIcons-uhd.png', 120)}
nums = lambda s: [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', s)]


def read_frames(plist_path, keep):
    """{name without .png: (x, y, w, h, rotated, sw, sh, ox, oy)} for the frames keep() likes"""
    out = {}
    for k, f in plistlib.load(open(plist_path, 'rb'))['frames'].items():
        m = ICON.match(k)
        if not m or not keep(m):
            continue
        rect = nums(f['textureRect'])
        if len(rect) < 4 or rect[2] * rect[3] <= 9:      # empty placeholder frames
            continue
        x, y, w, h = rect
        sw, sh = nums(f['spriteSourceSize'])
        ox, oy = nums(f['spriteOffset'])
        out[k[:-4]] = (int(x), int(y), int(w), int(h), bool(f['textureRotated']), sw, sh, ox, oy)
    return out


def cut(sheet, f):
    x, y, w, h, rot = f[:5]
    im = sheet.crop((x, y, x + (h if rot else w), y + (w if rot else h)))
    return im.rotate(90, expand=True) if rot else im    # stored a quarter turn clockwise


def pack(images, max_w):
    """Shelf packing: tallest first. Returns {name: (x, y)} and the sheet size."""
    pos, x, y, shelf, pad = {}, 0, 0, 0, 2
    for name in sorted(images, key=lambda n: (-images[n].height, n)):
        im = images[name]
        if x + im.width > max_w:
            x, y, shelf = 0, y + shelf + pad, 0
        pos[name] = (x, y)
        x += im.width + pad
        shelf = max(shelf, im.height)
    return pos, (max_w, y + shelf)


def make_ssoh(sheet02_plist, glow_plist):
    keep = lambda m: int(m.group(2)) >= 1          # cube 0 isn't a real icon
    parts = []
    for pl in (sheet02_plist, glow_plist):
        sheet = Image.open(os.path.join(os.path.dirname(pl), plistlib.load(open(pl, 'rb'))['metadata']['textureFileName'])).convert('RGBA')
        for name, f in read_frames(pl, keep).items():
            if name.endswith('_glow_001') == (pl == glow_plist):
                parts.append((name, cut(sheet, f), f))
    data = {}
    for q, (png, ppb, div) in SSOH.items():
        images, meta = {}, {}
        for name, im, f in parts:
            w, h = max(1, round(im.width / div)), max(1, round(im.height / div))
            images[name] = im if div == 1 else im.resize((w, h), Image.LANCZOS)
            meta[name] = (f[5] / div, f[6] / div, f[7] / div, f[8] / div)
        pos, size = pack(images, 2048 // div)
        out = Image.new('RGBA', size)
        for name, (x, y) in pos.items():
            out.paste(images[name], (x, y))
        out.save(png, optimize=True)
        data[q] = {n: [pos[n][0], pos[n][1], images[n].width, images[n].height, 0, *meta[n]] for n in images}
        print(png, size, len(images), 'icons parts')
    json.dump({'sheets': {q: [v[0], v[1]] for q, v in SSOH.items()}, 'frames': data}, open(SSOH_JSON, 'w'), separators=(',', ':'))


def make_gd():
    out = {'sheets': {}, 'frames': {}}
    for q, (png, ppb) in GD.items():
        pl = png[:-4] + '.plist'
        if os.path.exists(png) and os.path.exists(pl):
            fr = read_frames(pl, lambda m: True)
            out['sheets'][q] = [png, ppb]
            out['frames'][q] = {n: [x, y, w, h, 1 if r else 0, sw, sh, ox, oy] for n, (x, y, w, h, r, sw, sh, ox, oy) in fr.items()}
    return out


if __name__ == '__main__':
    if len(sys.argv) == 3:
        make_ssoh(sys.argv[1], sys.argv[2])
    sources = []
    if os.path.exists(SSOH_JSON):
        sources.append({'name': 'SSOH texture pack', **json.load(open(SSOH_JSON))})
    sources.append({'name': 'Geometry Dash', **make_gd()})
    with open('icons.js', 'w') as f:
        f.write('// Ship Run icon map, made by tools/make_icons_js.py. Icon sheets in the order they are used:\n')
        f.write('// ' + ', '.join(s['name'] for s in sources) + '.\n')
        f.write('// [x, y, width, height, rotated, full width, full height, offset x, offset y]\n')
        f.write('window.GD_ICONS = ' + json.dumps({'sources': sources}, separators=(',', ':')) + ';\n')
    for s in sources:
        print(s['name'], {q: len(v) for q, v in s['frames'].items()})
