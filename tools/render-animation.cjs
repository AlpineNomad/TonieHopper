#!/usr/bin/env node
'use strict';
/* Build-time renderer only. The shipped player needs neither Three.js nor WebGL.
 * NODE_PATH=/path/to/node_modules node tools/render-animation.cjs \
 *   --three /path/to/three.cjs --browser /path/to/chrome
 * Uses the animation source files without changing them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; }
const width = Number(option('width', '480'));
const height = Number(option('height', '360'));
const fps = Number(option('fps', '10'));
const columns = 4;
const rows = 4;
const perSheet = columns * rows;
const output = path.resolve(option('out', path.join(root, 'plugin/toniehopper/assets/animation')));
const threePath = option('three', process.env.THREE_SOURCE);
if (!threePath) throw new Error('Pass --three /path/to/three.cjs or set THREE_SOURCE.');
const browserPath = option('browser', process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
if (width * height * perSheet > 3000000) throw new Error('Atlas exceeds the 3 MP legacy iOS image budget. Reduce width/height.');
let sceneSource = fs.readFileSync(path.join(root, 'tools/animation/scene.js'), 'utf8');
const handSource = fs.readFileSync(path.join(root, 'tools/animation/hand.js'), 'utf8');
const handMask = JSON.parse(fs.readFileSync(path.join(root, 'tools/animation/hand-mask.json'), 'utf8'));
let svg = fs.readFileSync(path.join(root, 'tools/animation/pinch-hand-skin-3.svg'), 'utf8');
svg = svg.slice(svg.indexOf('<svg')).replace('width="800px" height="800px"', 'width="800" height="800"');
const thumbOutline = handMask.thumbOutline;
const thumb = svg.replace('>', '><clipPath id="th-thumb-mask"><path d="' + thumbOutline + '"/></clipPath><g clip-path="url(#th-thumb-mask)">').replace('</svg>', '</g></svg>');
function dataUri(value) { return 'data:image/svg+xml;base64,' + Buffer.from(value).toString('base64'); }
const handArt = { back: dataUri(svg), thumb: dataUri(thumb) };
// Expose deterministic pose rendering in a build-only copy. Camera, hand/ear
// geometry, lights, materials, shading and accepted timing stay untouched.
sceneSource = sceneSource.replace("alpha:true, antialias:true,", "alpha:true, antialias:true, preserveDrawingBuffer:true,");
sceneSource = sceneSource.replace('renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));', 'renderer.setPixelRatio(1);');
sceneSource = sceneSource.replace('return {\n    mount:function', 'return {\n    renderAt:function(seconds){pose(seconds);renderer.render(scene,camera);return renderer.domElement.toDataURL("image/png");},\n    mount:function');
if (sceneSource.indexOf('renderAt:function') < 0) throw new Error('Accepted scene return shape changed; update renderer instrumentation.');
const phases = [
  { name: 'lift', seconds: 4.7, loop: true, posterTime: 2.0 },
  { name: 'pinch', seconds: 6.4, loop: true, posterTime: 2.0 },
  { name: 'wait', seconds: 6.0, loop: false, posterTime: 5.9 },
  { name: 'place', seconds: 6.5, loop: false, posterTime: 6.4 }
];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;background:transparent}#stage{width:' + width + 'px;height:' + height + 'px}canvas{display:block}</style></head><body><div id="stage"></div><script type="application/json" id="th-hand-art">' + JSON.stringify(handArt) + '</script></body></html>');
    await page.addScriptTag({ content: 'window.exports={};\n' + fs.readFileSync(threePath, 'utf8') + '\nwindow.THREE=window.exports;' });
    await page.addScriptTag({ content: 'window.requestAnimationFrame=function(){return 0;};\n' + handSource + '\n' + sceneSource + '\nwindow.animationScene=createTonieScene(THREE);' });
    // Load both accepted hand layers before capturing any pose.
    await page.evaluate(async art => { await Promise.all(Object.keys(art).map(key => new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = art[key]; }))); }, handArt);
    await page.waitForTimeout(200);
    const manifest = { version: 1, source: 'TonieHopper animation sources', width, height, fps, columns, perSheet, phases: [] };
    let totalBytes = 0;
    for (let phase = 0; phase < phases.length; phase++) {
      const config = phases[phase];
      await page.evaluate(p => animationScene.mount(document.getElementById('stage'), p, 1), phase);
      const unique = [];
      const hashes = new Map();
      const timeline = [];
      const count = Math.round(config.seconds * fps);
      for (let frame = 0; frame < count; frame++) {
        const data = await page.evaluate(t => animationScene.renderAt(t), frame / fps);
        const buffer = Buffer.from(data.split(',')[1], 'base64');
        const digest = crypto.createHash('sha256').update(buffer).digest('hex');
        if (!hashes.has(digest)) { hashes.set(digest, unique.length); unique.push(buffer); }
        timeline.push(hashes.get(digest));
      }
      const sheets = [];
      for (let first = 0; first < unique.length; first += perSheet) {
        const batch = unique.slice(first, first + perSheet);
        const sheetRows = Math.ceil(batch.length / columns);
        const name = config.name + '-' + String(sheets.length + 1).padStart(2, '0') + '.png';
        const file = path.join(output, name);
        await sharp({ create: { width: width * columns, height: height * sheetRows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite(batch.map((input, n) => ({ input, left: (n % columns) * width, top: Math.floor(n / columns) * height })))
          .png({ palette: true, quality: 100, colours: 256, dither: 0, effort: 10 }).toFile(file);
        sheets.push(name);
        totalBytes += fs.statSync(file).size;
      }
      const poster = unique[timeline[Math.min(timeline.length - 1, Math.round(config.posterTime * fps))]];
      const posterName = config.name + '-still.png';
      await sharp(poster).png({ palette: true, quality: 100, colours: 256, dither: 0, effort: 10 }).toFile(path.join(output, posterName));
      totalBytes += fs.statSync(path.join(output, posterName)).size;
      manifest.phases.push({ name: config.name, duration: config.seconds, loop: config.loop, frames: timeline, sheets, still: posterName });
      process.stdout.write(config.name + ': ' + timeline.length + ' timeline frames, ' + unique.length + ' unique, ' + sheets.length + ' sheets\n');
    }
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));
    if (errors.length) throw new Error(errors.join('\n'));
    process.stdout.write('Rendered ' + width + '×' + height + ' at ' + fps + ' fps: ' + (totalBytes / 1048576).toFixed(2) + ' MiB PNG payload\n');
  } finally { await browser.close(); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
