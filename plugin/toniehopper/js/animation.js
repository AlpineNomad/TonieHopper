/* TonieHopper local animation player. ES5, PNG + Canvas 2D; no WebGL or CDN.
 * Public API: TonieHopperAnimation.mount(holder, phase); .unmount();
 * Optional: set .basePath to an absolute/local URL ending in assets/animation/.
 */
(function (window, document) {
  'use strict';
  var scripts = document.getElementsByTagName('script');
  var source = '';
  var index;
  for (index = scripts.length - 1; index >= 0; index -= 1) {
    if (/(?:^|\/)animation\.js(?:[?#]|$)/.test(scripts[index].src)) {
      source = scripts[index].src.replace(/[?#].*$/, '');
      break;
    }
  }
  var defaultBase = source ? source.replace(/js\/animation\.js$/, 'assets/animation/') : 'assets/animation/';
  var manifest = null;
  var manifestBase = '';
  var pending = null;
  var active = null;
  var serial = 0;
  var labels = [
    'Nimm die Figur von der Toniebox.',
    'Drücke das rechte Ohr zwischen Daumen und Zeigefinger etwa drei Sekunden zusammen.',
    'Die Toniebox blinkt blau. Warte, bis sie grün leuchtet.',
    'Stelle die Figur zurück auf die Toniebox. Warte, bis sie grün leuchtet.'
  ];

  function basePath() {
    var value = api.basePath || defaultBase;
    return value.charAt(value.length - 1) === '/' ? value : value + '/';
  }

  function loadManifest(base, done) {
    if (manifest && manifestBase === base) { done(null, manifest); return; }
    if (pending && pending.base === base) { pending.callbacks.push(done); return; }
    var request = new window.XMLHttpRequest();
    var job = { base: base, callbacks: [done] };
    pending = job;
    function finish(error, result) {
      if (pending === job) { pending = null; }
      var callbacks = job.callbacks;
      job.callbacks = [];
      var i;
      for (i = 0; i < callbacks.length; i += 1) { callbacks[i](error, result); }
    }
    request.open('GET', base + 'manifest.json', true);
    request.onreadystatechange = function () {
      if (request.readyState !== 4) { return; }
      if (request.status < 200 || request.status >= 300) { finish(new Error('Animation manifest unavailable')); return; }
      try {
        var result = JSON.parse(request.responseText);
        if (!result.phases || !result.width || !result.height || !result.fps) { throw new Error('Invalid animation manifest'); }
        manifest = result;
        manifestBase = base;
        finish(null, result);
      } catch (error) { finish(error); }
    };
    request.onerror = function () { finish(new Error('Animation manifest unavailable')); };
    request.send(null);
  }

  function unmount() {
    serial += 1;
    if (!active) { return; }
    window.clearTimeout(active.timer);
    window.removeEventListener('resize', active.resize, false);
    document.removeEventListener('visibilitychange', active.visibility, false);
    var name;
    for (name in active.images) {
      if (Object.prototype.hasOwnProperty.call(active.images, name)) {
        active.images[name].image.onload = null;
        active.images[name].image.onerror = null;
      }
    }
    if (active.canvas.parentNode) { active.canvas.parentNode.removeChild(active.canvas); }
    if (active.message && active.message.parentNode) { active.message.parentNode.removeChild(active.message); }
    active.holder.style.position = active.originalPosition;
    active = null;
  }

  function mount(holder, phase) {
    unmount();
    if (!holder || !holder.appendChild) { return; }
    phase = Math.max(0, Math.min(3, Math.floor(Number(phase) || 0)));
    var token = serial;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', labels[phase]);
    canvas.style.position = 'absolute';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    var originalPosition = holder.style.position;
    if (window.getComputedStyle(holder).position === 'static') { holder.style.position = 'relative'; }
    holder.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var state = { holder: holder, canvas: canvas, originalPosition: originalPosition, images: {}, timer: null, message: null, resize: function () {}, visibility: function () {} };
    active = state;
    var base = basePath();

    function current() { return serial === token && active === state; }
    function fail() {
      if (!current() || state.message) { return; }
      window.clearTimeout(state.timer);
      var message = document.createElement('p');
      message.appendChild(document.createTextNode('Die Animation konnte nicht geladen werden. Folge der Anleitung unter dem Bild.'));
      message.style.padding = '24px';
      message.style.textAlign = 'center';
      message.setAttribute('role', 'status');
      state.message = message;
      holder.appendChild(message);
    }

    if (!ctx) { fail(); return; }
    loadManifest(base, function (error, data) {
      if (!current()) { return; }
      if (error) { fail(); return; }
      var config = data.phases[phase];
      var started = null;
      var pausedAt = null;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      canvas.width = data.width;
      canvas.height = data.height;
      state.resize = function () {
        if (!current()) { return; }
        var w = holder.clientWidth || data.width;
        var h = holder.clientHeight || data.height;
        var scale = Math.min(w / data.width, h / data.height);
        canvas.style.width = Math.round(data.width * scale) + 'px';
        canvas.style.height = Math.round(data.height * scale) + 'px';
        canvas.style.left = Math.round((w - data.width * scale) / 2) + 'px';
        canvas.style.top = Math.round((h - data.height * scale) / 2) + 'px';
      };
      state.resize();
      window.addEventListener('resize', state.resize, false);

      function loadImage(name) {
        if (state.images[name]) { return state.images[name]; }
        var item = { image: new window.Image(), loaded: false };
        state.images[name] = item;
        item.image.onload = function () { if (current()) { item.loaded = true; } };
        item.image.onerror = fail;
        item.image.src = base + name;
        return item;
      }

      function pruneImages(keep, next) {
        var name;
        for (name in state.images) {
          if (Object.prototype.hasOwnProperty.call(state.images, name) && name !== keep && name !== next) {
            state.images[name].image.onload = null;
            state.images[name].image.onerror = null;
            delete state.images[name];
          }
        }
      }

      function schedule() {
        window.clearTimeout(state.timer);
        if (current() && !state.message) { state.timer = window.setTimeout(tick, Math.round(1000 / data.fps)); }
      }

      function tick() {
        if (!current() || state.message) { return; }
        if (document.hidden) { schedule(); return; }
        var now = Date.now();
        var elapsed = started === null ? 0 : (now - started) / 1000;
        var frameIndex;
        var image;
        if (reduced) {
          image = loadImage(config.still);
          if (!image.loaded) { schedule(); return; }
          ctx.clearRect(0, 0, data.width, data.height);
          ctx.drawImage(image.image, 0, 0, data.width, data.height);
          return;
        }
        if (config.loop) { elapsed = elapsed % config.duration; }
        frameIndex = Math.min(config.frames.length - 1, Math.floor(elapsed * data.fps));
        var tile = config.frames[frameIndex];
        var sheet = Math.floor(tile / data.perSheet);
        var sheetName = config.sheets[sheet];
        image = loadImage(sheetName);
        // Retain only current + next atlas, keeping decoded bitmap memory bounded
        // on the original iPad mini. Each sheet is below the legacy 3 MP limit.
        var nextSheet = sheet + 1 < config.sheets.length ? sheet + 1 : (config.loop ? 0 : sheet);
        var nextName = config.sheets[nextSheet];
        if (nextName !== sheetName) { loadImage(nextName); }
        pruneImages(sheetName, nextName);
        if (!image.loaded) { schedule(); return; }
        if (started === null) { started = now; }
        var within = tile % data.perSheet;
        ctx.clearRect(0, 0, data.width, data.height);
        ctx.drawImage(image.image, (within % data.columns) * data.width, Math.floor(within / data.columns) * data.height, data.width, data.height, 0, 0, data.width, data.height);
        if (config.loop || frameIndex < config.frames.length - 1) { schedule(); }
      }

      state.visibility = function () {
        if (!current()) { return; }
        if (document.hidden) { pausedAt = Date.now(); }
        else {
          if (pausedAt !== null && started !== null) { started += Date.now() - pausedAt; }
          pausedAt = null;
          schedule();
        }
      };
      document.addEventListener('visibilitychange', state.visibility, false);
      tick();
    });
  }

  var api = { mount: mount, unmount: unmount, basePath: '' };
  window.TonieHopperAnimation = api;
}(window, document));
