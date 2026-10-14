# Ship Run

A Geometry Dash–style ship game. Open `index.html` in a browser to play.

## Stats (GoatCounter)

Visitor numbers are collected with [GoatCounter](https://www.goatcounter.com),
a privacy-friendly analytics service: no cookies, and no personal data such as
names, IP addresses or level contents is stored.

See the stats at **https://thesashanator.goatcounter.com**.

Besides normal page views, the game sends these events:

| Event | Sent when |
| --- | --- |
| `play-start` | A Random Mix is started with the RANDOM MIX button on the main menu (not when it restarts after a crash, or with "new mix"). |
| `level-start` | A level is started from the level path (PLAY on the main menu), or with NEXT after beating a level. |
| `level-complete:<levelId>` | The ship gets past the end of a level in a Random Mix or on the level path. `<levelId>` is the level's id from `levels.js`, e.g. `level-complete:crack`. |
| `mix-unlocked` | Beating the last level unlocks the Random Mix. |
| `editor-open` | The level editor is opened with Level Editor in the dev menu (dev mode only). |
| `test-level` | A level is tested from inside the editor. |

Nothing else is tracked while the editor is in use. Nothing is sent when the
game runs on `localhost` or from a file (`file://`), so testing on your own
computer does not affect the numbers. If GoatCounter is blocked or offline the
game works exactly the same.

The analytics code is the `track()` helper near the top of section 8 of
`game.js`, plus the GoatCounter `<script>` tag at the end of `<head>` in
`index.html`.

## Icon kit

The ICONS button on the main menu opens an icon kit for picking your cube, ship
and colors. It is based on [GDBrowser's Online Icon Kit](https://gdbrowser.com/iconkit/)
by GD Colon. Your choice is saved in your browser. The default is like Geometry
Dash's: cube 1 and ship 1 in lime green and cyan.

The icons come from, in this order:

- An `icons/` folder (optional): Geometry Dash's own per-icon files from its
  `Resources/icons` folder, e.g. `ship_05-uhd.png` + `ship_05-uhd.plist`. These are
  used automatically if present.
- Geometry Dash's original cubes (1-142) and ships (1-51) with glow, cut out of
  Geometry Dash 2.1's `GJ_GameSheet02-uhd` and `GJ_GameSheetGlow-uhd` into
  `icons-gd-uhd.png` (High graphics), `icons-gd-hd.png` (Medium) and
  `icons-gd.png` (Low).
- `GJ_GameSheetIcons.png`, Geometry Dash's low-quality icon sheet, for the icons
  2.1 doesn't have (ships 52-79, cubes 143-248).

`icons.js` says where every icon is on these sheets. Remake it with
`python3 tools/make_icons_js.py` (see the top of that file for how to cut the
icons again from the 2.1 sheets).
