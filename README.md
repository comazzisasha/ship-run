# Ship Run

A Geometry Dash–style ship game. Open `index.html` in a browser to play.

## Stats (GoatCounter)

Visitor numbers are collected with [GoatCounter](https://www.goatcounter.com),
a privacy-friendly analytics service: no cookies, and no personal data such as
names, IP addresses or level contents is stored.

See the stats at **https://YOUR_CODE.goatcounter.com**.

Besides normal page views, the game sends these events:

| Event | Sent when |
| --- | --- |
| `play-start` | A random run is started with the PLAY button on the main menu (not when it restarts after a crash, or with "play again"). |
| `level-complete:<levelId>` | The ship gets past the end of a level in a random run or in Practice. `<levelId>` is the level's id from `levels.js`, e.g. `level-complete:crack`. |
| `practice-start` | A level is started from the Practice screen. |
| `editor-open` | The level editor is opened with the EDITOR button on the main menu (dev mode only). |
| `test-level` | A level is tested from inside the editor. |

Nothing else is tracked while the editor is in use. Nothing is sent when the
game runs on `localhost` or from a file (`file://`), so testing on your own
computer does not affect the numbers. If GoatCounter is blocked or offline the
game works exactly the same.

The analytics code is the `track()` helper near the top of section 8 of
`game.js`, plus the GoatCounter `<script>` tag at the end of `<head>` in
`index.html`.
