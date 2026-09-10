# TonieHopper animation assets

These local PNG atlases are rendered from the accepted `tools/animation/scene.js` and
`tools/animation/hand.js`. The original camera, box geometry, material, light, ear
squeeze and illustrated fingertip pinch are retained. The teaching figure is the
accepted stylized pirate. The player does not load Three.js, SVGs or remote assets.

The player uses `manifest.json` at 10 fps. Four 480 × 360 phases are provided:
lift (4.7 s, loop), right-ear pinch (6.4 s, loop with 3 s hold), wait (6 s, final
green frame), place (6.5 s, final green frame). PNG payload is approximately
0.47 MiB. Exact duplicate frames share one atlas cell. Atlases are at most
1920 × 1440, below 3 MP. The player retains at most two atlas image references;
its 2D canvas is 480 × 360 regardless of screen pixel density.

Load `js/animation.js`, then call
`window.TonieHopperAnimation.mount(holderElement, phaseNumber)` for phases 0–3.
Call `.unmount()` when closing or replacing the view. The holder supplies its
own size and background; the PNGs are transparent. The player automatically
centers and scales the illustration without changing its aspect ratio. The base
asset path is derived from the script URL; set `.basePath` before mounting only
when the files are hosted in a different local directory.

Rebuild from the project root with `tools/render-animation.cjs`. Build-only
dependencies: Node.js, Playwright, Sharp, a local Three.js r160 CommonJS source
and Chrome. Pass `--three /path/to/three.cjs --browser /path/to/chrome` as needed.
The renderer instruments an in-memory copy for deterministic poses; it does not
edit the animation sources. `tools/render-animation.test.cjs` exercises
the player with WebGL disabled.

## Hand illustration source

“Pinch Hand Skin 3”, uploaded by SVG Repo, CC0:
https://www.svgrepo.com/svg/434198/pinch-hand-skin-3

The accepted build splits this illustration into a rear hand layer and a front
thumb layer around the original right ear. The PNG atlases preserve that
composition.
