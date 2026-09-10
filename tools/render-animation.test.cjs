'use strict';
// Exercise the shipped ES5 PNG player in a browser with WebGL disabled.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../plugin/toniehopper');
const artifacts = path.resolve(__dirname, '../tests/artifacts');
const requests = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#d9ebf8}#holder{width:600px;height:450px;max-width:100vw;position:relative}</style><div id="holder"></div><script src="/js/animation.js"></script>');
    return;
  }
  const file = path.resolve(root, '.' + url.pathname);
  if (file.indexOf(root + path.sep) !== 0 || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : (file.endsWith('.json') ? 'application/json' : 'image/png'));
  response.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 450 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => requests.push(request.url()));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.waitForFunction(() => !!window.TonieHopperAnimation);
    const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
    assert.strictEqual(hasWebGL, false);
    await page.evaluate(() => TonieHopperAnimation.mount(document.getElementById('holder'), 0));
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c && c.width === 480 && c.getContext('2d').getImageData(200, 250, 1, 1).data[3] > 0;
    });
    const first = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    await page.waitForTimeout(1500);
    const lifted = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    assert.notStrictEqual(first, lifted, 'lift phase must animate');
    await page.evaluate(() => TonieHopperAnimation.mount(document.getElementById('holder'), 1));
    await page.waitForTimeout(2200);
    const holdStart = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, 'animation-pinch.png') });
    await page.waitForTimeout(1500);
    const holdEnd = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    assert.strictEqual(holdStart, holdEnd, 'ear pinch must hold steadily');
    await page.evaluate(() => TonieHopperAnimation.mount(document.getElementById('holder'), 2));
    await page.waitForTimeout(800);
    const blue = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    await page.waitForTimeout(5500);
    const green = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    assert.notStrictEqual(blue, green, 'blue blinking must finish green');
    await page.waitForTimeout(500);
    assert.strictEqual(green, await page.evaluate(() => document.querySelector('canvas').toDataURL()), 'green end state stays stable');
    await page.evaluate(() => { TonieHopperAnimation.mount(document.getElementById('holder'), 3); TonieHopperAnimation.unmount(); });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('canvas').count(), 0, 'unmount removes player');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => TonieHopperAnimation.mount(document.getElementById('holder'), 1));
    await page.waitForTimeout(400);
    const still = await page.evaluate(() => document.querySelector('canvas').toDataURL());
    await page.waitForTimeout(400);
    assert.strictEqual(still, await page.evaluate(() => document.querySelector('canvas').toDataURL()), 'reduced-motion state is still');
    await page.setViewportSize({ width: 320, height: 450 });
    await page.waitForTimeout(100);
    const bounds = await page.locator('canvas').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'canvas must fit narrow holder');
    assert.deepStrictEqual(errors, []);
    assert(requests.every(url => url.indexOf('http://127.0.0.1:') === 0), 'all requests remain local');
    console.log('PASS: local PNG playback without WebGL, moving lift, steady pinch hold, blue→green, stable final frame, unmount, reduced motion and 320px fit.');
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
