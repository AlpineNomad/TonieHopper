'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adapter = fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/api.js'), 'utf8');
const RUID = '1234567890abcde0';
const OTHER_RUID = '8765432190abcde0';

function makeTag(overrides) {
    return Object.assign({
        ruid: RUID, type: 'tag', source: 'lib://old.taf', nocloud: false,
        live: true, hide: true, claimed: true, exists: true, valid: true,
        tonieInfo: { model: 'pirate', series: 'Kreativ-Tonie', episode: 'Pirat', picture: '/cache/pirate.png' },
        sourceInfo: { model: 'dino', series: 'Dino Ranch', episode: 'Abenteuer', picture: '/cache/dino.png' },
        trackSeconds: [0, 60, 140]
    }, overrides);
}

function harness(handler, ageHandler) {
    const requests = [];
    function XHR() { this.headers = {}; }
    XHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
    XHR.prototype.setRequestHeader = function (name, value) { this.headers[name] = value; };
    XHR.prototype.send = function (body) {
        this.body = body;
        requests.push(this);
        setImmediate(() => {
            let response;
            try {
                response = new URL(this.url, 'http://test/').pathname === '/assets/ages.json'
                    ? (ageHandler ? ageHandler(this) : { status: 404, body: '' })
                    : handler(this, requests.length);
            }
            catch (error) { this.mockError = error; this.onerror(); return; }
            if (response.event) { this[response.event](); return; }
            this.status = response.status || 200;
            this.responseText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
            this.onload();
        });
    };
    const window = { XMLHttpRequest: XHR, setTimeout, location: { protocol: 'http:', host: 'teddy.local:8080' } };
    vm.runInNewContext(adapter, { window, console });
    return { api: window.TonieHopperAPI, requests };
}

function call(api, method, ...args) {
    return new Promise((resolve, reject) => api[method](...args, (error, result) => error ? reject(error) : resolve(result)));
}

function catalogHarness(handler, entries, ageHandler) {
    return harness(xhr => new URL(xhr.url, 'http://test').pathname === '/api/toniesJson'
        ? { body: entries }
        : handler(xhr), ageHandler);
}

function availableFile(name) {
    return { body: { files: [{ name: name || 'new.taf', tafHeader: { valid: true } }] } };
}

test('loading adapter does not request or write anything', () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    assert.equal(h.requests.length, 0);
});

test('content identity normalizes positive uint32 audio IDs and header hash case without requests or input mutation', () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    const hash = 'bf7de53ab340fc423e545d34c8e7939294193bec';
    for (const [audioId, expectedId] of [
        [1, 1], ['0001', 1], [1684838575, 1684838575], [' \t001684838575\n', 1684838575],
        [4294967295, 4294967295], ['4294967295', 4294967295]
    ]) {
        const content = { audioId, sha1Hash: ' \t' + hash.toUpperCase() + '\n' };
        const before = Object.assign({}, content);
        assert.equal(h.api.contentIdentity(content), 'audio:' + expectedId + ':' + hash);
        assert.deepEqual(content, before);
    }
    assert.equal(h.requests.length, 0, 'Identity calculation must not load a catalog or fetch a file');
});

test('content identity rejects missing, invalid and zero ID/hash values rather than guessing', () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    const validId = 1684838575, validHash = 'bf7de53ab340fc423e545d34c8e7939294193bec';
    for (const audioId of [undefined, null, false, true, {}, [], NaN, Infinity, -Infinity, 0, -0, -1, 1.5, 4294967296, '', ' ', '0', '000', '-1', '+1', '1.0', '1e3', '0x123', '1 23', '4294967296']) {
        assert.equal(h.api.contentIdentity({ audioId, sha1Hash: validHash }), null, 'Invalid audio ID: ' + String(audioId));
    }
    for (const sha1Hash of [undefined, null, false, 123, {}, [], Array(20).fill(1), '', ' ', '0'.repeat(40), 'A'.repeat(39), 'A'.repeat(41), 'G'.repeat(40), validHash.slice(0, 20) + ' ' + validHash.slice(20)]) {
        assert.equal(h.api.contentIdentity({ audioId: validId, sha1Hash }), null, 'Invalid header hash');
    }
    for (const content of [null, undefined, {}, { model: '11000796', title: 'GEOlino', source: 'lib://1684838575.taf' }, { audio_id: validId, hash: validHash }]) {
        assert.equal(h.api.contentIdentity(content), null, 'Do not infer identity from names, models, filenames or catalog fields');
    }
    assert.equal(h.requests.length, 0);
});

test('content identity keeps distinct audio IDs or hashes separate even when model and title match', () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    const hash = 'bf7de53ab340fc423e545d34c8e7939294193bec';
    const base = { audioId: 123, sha1Hash: hash, model: '11000796', title: 'GEOlino' };
    const sameFileElsewhere = Object.assign({}, base, { audioId: '00123', sha1Hash: hash.toUpperCase(), source: 'lib://copy/story.taf' });
    assert.equal(h.api.contentIdentity(base), h.api.contentIdentity(sameFileElsewhere));
    assert.notEqual(h.api.contentIdentity(base), h.api.contentIdentity(Object.assign({}, base, { audioId: 124 })));
    assert.notEqual(h.api.contentIdentity(base), h.api.contentIdentity(Object.assign({}, base, { sha1Hash: '6e663ca9d731140868c4dcb54f175c1fc696ca0a' })));
    assert.notEqual(h.api.contentIdentity(base), h.api.contentIdentity(Object.assign({}, base, { audioId: 123 + 0x50000000 })), 'Do not apply the TeddyBench catalog lookup offset to file identities');
});

test('tag catalog keeps the physical figure separate from the assigned content and excludes system records', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({ hide: false }), makeTag({ ruid: '0000000000000001', type: 'system' }), { ruid: 'invalid' }] } }), [{ model: 'dino' }]);
    await call(h.api, 'loadCatalog');
    const tags = await call(h.api, 'listTags');
    assert.equal(tags.length, 1);
    assert.equal(tags[0].figure.model, 'pirate');
    assert.equal(tags[0].figure.cover, '/cache/pirate.png');
    assert.equal(tags[0].content.model, 'dino');
    assert.equal(tags[0].content.kind, 'tonie');
    assert.equal(tags[0].content.source, 'lib://old.taf');
    assert.equal(tags[0].content.available, true);
    assert.equal(tags[0].content.trackCount, 3);
    assert.equal(tags[0].content.durationSeconds, null);
    assert.equal(h.requests[0].method, 'GET');
});

test('content kind requires a normalized model present in the separately loaded standard catalog', async () => {
    const h = harness(xhr => {
        assert.equal(xhr.method, 'GET');
        assert.equal(new URL(xhr.url, 'http://test').pathname, '/api/toniesJson', 'Custom models must not establish standard catalog membership');
        return { body: [{ model: '10000284' }, { model: ' 01-0011 ' }, { model: 0 }, { model: '123' }] };
    });
    assert.equal(h.api.contentKind({ model: '10000284' }), 'taf', 'No guessed Tonie category before the catalog has loaded');
    assert.equal(h.requests.length, 0);
    const loaded = await call(h.api, 'loadCatalog');
    assert.equal(loaded.modelCount, 4);
    for (const model of ['10000284', ' 10000284 ', '01-0011', '0', 0, 123]) {
        assert.equal(h.api.contentKind({ model }), 'tonie', 'known model: ' + String(model));
    }
    for (const model of ['custom-bedtime', '99999999', -1, 1.5, undefined, null, '', ' \t\r\n ', '\u00a0', false, true, {}, [], NaN, Infinity, -Infinity]) {
        assert.equal(h.api.contentKind({ model, title: 'A complete title', series: 'Known series', cover: '/cache/cover.png' }), 'taf');
    }
    assert.equal(h.api.contentKind(null), 'taf');
    assert.equal(h.api.contentKind(undefined), 'taf');
    assert.equal(h.requests.length, 2, 'Only the catalog and local age map are loaded; classification itself makes no requests');
});

test('same-host age map enriches physical figures and assigned content by their own exact models', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({ hide: false })] } }), [{ model: 'dino' }], xhr => {
        assert.equal(xhr.method, 'GET');
        assert.match(xhr.url, /^assets\/ages\.json\?/);
        return { body: { version: 1, models: { pirate: 3, dino: 6 } } };
    });
    const loaded = await call(h.api, 'loadCatalog');
    const [tag] = await call(h.api, 'listTags');
    assert.equal(loaded.ageDataAvailable, true);
    assert.equal(tag.figure.ageMin, 3);
    assert.equal(tag.content.ageMin, 6, 'The age belongs to the assigned story, not its physical carrier');
    assert.equal(tag.content.kind, 'tonie');
    assert.equal(h.requests.every(xhr => !/^https?:\/\//.test(xhr.url)), true, 'No browser call to an external metadata provider');
});

test('age normalization accepts integer zero and trims decimal strings, but never invents missing or invalid ages', async () => {
    const valid = [[0, 0], ['0', 0], [1, 1], [4, 4], [' 04 ', 4], [18, 18]];
    const invalid = [undefined, null, false, true, {}, [], '', ' ', '4+', '3-5', -1, 1.5, 19, 45, 99, '99', NaN, Infinity, '-1', '+4', '4.0', '0x4', '1e1'];
    const values = valid.map(entry => entry[0]).concat(invalid);
    const h = harness(() => ({ body: { files: values.map((age, i) => ({
        name: 'age-' + i + '.taf', tafHeader: { valid: true }, tonieInfo: { age }
    })) } }));
    const result = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(result.items, item => item.ageMin), valid.map(entry => entry[1]).concat(invalid.map(() => null)));
});

test('library and getTag receive ages from the catalog model without matching titles or inheriting the physical age', async () => {
    const h = catalogHarness(xhr => {
        if (new URL(xhr.url, 'http://test').pathname === '/api/getTagInfo') {
            return { body: { tagInfo: makeTag({ hide: false, sourceInfo: { model: '', episode: 'Dino Ranch' } }) } };
        }
        return { body: { files: [
            { name: 'dino.taf', tafHeader: { valid: true }, tonieInfo: { model: ' dino ' } },
            { name: 'same-title.taf', tafHeader: { valid: true }, tonieInfo: { episode: 'Dino Ranch' } },
            { name: 'custom.taf', tafHeader: { valid: true }, tonieInfo: { model: 'dino-copy' } }
        ] } };
    }, [{ model: 'dino' }], () => ({ body: { version: 1, models: { dino: 4, pirate: 3 } } }));
    await call(h.api, 'loadCatalog');
    const library = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(library.items, item => item.ageMin), [4, null, null]);
    const tag = await call(h.api, 'getTag', RUID);
    assert.equal(tag.figure.ageMin, 3);
    assert.equal(tag.content.ageMin, null, 'Mapped content without its own age/model stays unknown');
});

test('API-provided ages take precedence and conflicting catalog editions remain unknown', async () => {
    const h = catalogHarness(() => ({ body: { files: ['direct', 'ambiguous', 'missing-edition', 'unknown', 'zero', 'bundle'].map(model => ({
        name: model + '.taf', tafHeader: { valid: true }, tonieInfo: { model }
    })).concat([{ name: 'override.taf', tafHeader: { valid: true }, tonieInfo: { model: 'direct', age: 7 } }]) } }), [
        { model: 'direct', age: 6 }, { model: 'ambiguous', age: 3 }, { model: 'ambiguous', age: 4 },
        { model: 'missing-edition', age: 3 }, { model: 'missing-edition' }, { model: 'unknown', age: 99 },
        { model: 'zero', age: 0 }, { model: 'bundle' }
    ], () => ({ body: { version: 1, models: { direct: 3, ambiguous: 3, 'missing-edition': 3, unknown: 3, zero: 3, bundle: 4 } } }));
    await call(h.api, 'loadCatalog');
    const { items } = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(items, item => item.ageMin), [6, null, null, null, 0, 4, 7]);
});

test('missing or malformed optional age data does not block the library and never reuses stale ages', async () => {
    let ageResponse = { body: { version: 1, models: { dino: 4 } } };
    const h = catalogHarness(() => ({ body: { tags: [makeTag({ hide: false })] } }), [{ model: 'dino' }], () => ageResponse);
    await call(h.api, 'loadCatalog');
    assert.equal((await call(h.api, 'listTags'))[0].content.ageMin, 4);
    for (const response of [
        { status: 404, body: '' }, { event: 'onerror' }, { event: 'ontimeout' }, { body: '{broken' },
        { body: null }, { body: [] }, { body: { version: 2, models: { dino: 4 } } }, { body: { version: 1, models: [] } }
    ]) {
        ageResponse = response;
        const loaded = await call(h.api, 'loadCatalog');
        assert.equal(loaded.ageDataAvailable, false);
        const [tag] = await call(h.api, 'listTags');
        assert.equal(tag.content.ageMin, null);
        assert.equal(tag.content.available, true);
        assert.equal(tag.content.kind, 'tonie');
    }
});

test('age map keys and values are validated without object prototype inheritance', async () => {
    const models = JSON.parse('{"__proto__":4,"constructor":0,"toString":99,"bad":45,"dino":false}');
    const h = catalogHarness(() => ({ body: { files: ['__proto__', 'constructor', 'toString', 'bad', 'dino', 'missing'].map(model => ({
        name: model + '.taf', tafHeader: { valid: true }, tonieInfo: { model }
    })) } }), [{ model: 'dino' }], () => ({ body: { version: 1, models } }));
    await call(h.api, 'loadCatalog');
    const { items } = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(items, item => item.ageMin), [4, 0, null, null, null, null]);
});

test('bundled age data records its exact source and preserves real zero while omitting unknown or ambiguous models', () => {
    const ageData = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/assets/ages.json'), 'utf8'));
    assert.equal(ageData.version, 1);
    assert.match(ageData.sourceRevision, /^[a-f0-9]{40}$/);
    assert.match(ageData.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(ageData.sourceFile, 'https://raw.githubusercontent.com/toniebox-reverse-engineering/tonies-json/' + ageData.sourceRevision + '/toniesV2.json');
    assert.equal(ageData.models['10000119'], 3, 'Aladdin');
    assert.equal(ageData.models['11000796'], 5, 'GEOlino set');
    assert.equal(ageData.models['10000284'], undefined, 'Creative Tonie catalog sentinel 99 stays unknown');
    assert.equal(ageData.models['10001306'], undefined, 'Invalid upstream age 45 stays unknown');
    assert.equal(ageData.models['01-0193'], undefined, 'Model with a known and an unknown edition stays unknown');
    assert.equal(Object.values(ageData.models).every(age => Number.isInteger(age) && age >= 0 && age <= 18), true);
    assert.equal(Object.values(ageData.models).some(age => age === 0), true);
});

test('catalog rejects malformed, empty and entirely unusable model lists instead of classifying everything as own content', async () => {
    for (const body of [{ models: ['10000284'] }, null, [], [null, {}, [], '10000284', { model: '   ' }, { model: false }, { model: {} }]]) {
        const h = harness(() => ({ body }));
        await assert.rejects(call(h.api, 'loadCatalog'), error => error.code === 'INVALID_CATALOG');
        assert.equal(h.api.contentKind({ model: '10000284' }), 'taf');
    }
    for (const response of [{ event: 'onerror' }, { event: 'ontimeout' }, { status: 503, body: [] }, { body: '{broken' }]) {
        const h = harness(() => response);
        await assert.rejects(call(h.api, 'loadCatalog'));
    }
});

test('catalog replacement is atomic and model keys cannot inherit prototype entries', async () => {
    let body = [{ model: '10000284' }, {}, null];
    const h = harness(() => ({ body }));
    assert.equal(h.api.contentKind({ model: 'toString' }), 'taf');
    await call(h.api, 'loadCatalog');
    for (const model of ['__proto__', 'constructor', 'toString']) { assert.equal(h.api.contentKind({ model }), 'taf'); }
    body = [];
    await assert.rejects(call(h.api, 'loadCatalog'), error => error.code === 'INVALID_CATALOG');
    assert.equal(h.api.contentKind({ model: '10000284' }), 'tonie', 'A failed read cannot partially replace the last successful catalog');
    body = [{ model: '__proto__' }, { model: 'constructor' }];
    await call(h.api, 'loadCatalog');
    assert.equal(h.api.contentKind({ model: '10000284' }), 'taf', 'Successful reload replaces the previous index');
    assert.equal(h.api.contentKind({ model: '__proto__' }), 'tonie');
    assert.equal(h.api.contentKind({ model: 'constructor' }), 'tonie');
    assert.equal(h.api.contentKind({ model: 'toString' }), 'taf');
});

test('system recognition is restricted to box model prefix or exact system category', () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    for (const content of [
        { model: 'box-de-de-01-00000000' }, { model: ' BOX-en-gb-00-00000001 ' },
        { model: '10000123', category: 'system' }, { model: '', category: ' system ' }
    ]) {
        assert.equal(h.api.isSystemContent(content), true);
    }
    for (const content of [
        { model: '10000123', title: 'System sounds de-de', series: 'Jingle' },
        { model: 'custom-box-story', category: 'audio-play' },
        { model: 'box', category: 'systematic' }, { model: '10000123', category: 'custom-system' },
        { model: '', title: 'box-de-de-01-00000000' }, {}, null
    ]) {
        assert.equal(h.api.isSystemContent(content), false);
    }
    assert.equal(h.api.contentKind({ model: 'box-de-de-01-00000000' }), 'taf');
    assert.equal(h.api.contentKind({ model: 'custom-family-model' }), 'taf');
    assert.equal(h.requests.length, 0);
});

test('system models in the standard catalog remain system without category metadata on the content', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({
        hide: false, sourceInfo: { model: ' sound-123 ', episode: 'Jingle' }
    })] } }), [
        { model: '10000123' }, { model: 'sound-123', category: 'system' },
        { model: 'sound-123', category: 'audio-play' }, { model: 'box-de-de-01-00000000' }
    ]);
    const loaded = await call(h.api, 'loadCatalog');
    assert.equal(loaded.modelCount, 3);
    assert.equal(loaded.systemModelCount, 2);
    assert.equal(h.api.isSystemContent({ model: 'sound-123' }), true);
    assert.equal(h.api.contentKind({ model: 'sound-123' }), 'taf');
    assert.equal(h.api.contentKind({ model: 'box-de-de-01-00000000' }), 'taf');
    assert.equal(h.api.contentKind({ model: '10000123', category: 'system' }), 'taf');
    const [tag] = await call(h.api, 'listTags');
    assert.equal(tag.content.available, false);
    assert.equal(tag.figure.model, 'pirate', 'Physical figure is retained');
});

test('a figure stays configurable when its assigned content is a box system sound', async () => {
    const h = harness(() => ({ body: { tags: [makeTag({
        hide: false, source: 'lib://jingle.taf',
        sourceInfo: { model: 'box-de-de-01-00000000', episode: 'Jingle', series: 'System sounds de-de' }
    })] } }));
    const tags = await call(h.api, 'listTags');
    assert.equal(tags.length, 1, 'Keep the real figure in the parent setup');
    assert.equal(tags[0].figure.model, 'pirate');
    assert.equal(tags[0].content.model, 'box-de-de-01-00000000');
    assert.equal(tags[0].content.available, false, 'Never offer the system sound as a selectable story');
});

test('system category is retained and blocks content even without a box-prefixed model', async () => {
    const h = harness(() => ({ body: { tags: [makeTag({
        hide: false, sourceInfo: { model: 'sound-123', category: 'system', episode: 'Jingle' }
    })] } }));
    const [tag] = await call(h.api, 'listTags');
    assert.equal(tag.content.category, 'system');
    assert.equal(tag.content.available, false);
    assert.equal(tag.figure.model, 'pirate');
});

test('library omits box models and system-category files without guessing from names or titles', async () => {
    const h = catalogHarness(() => ({ body: { files: [
        { name: 'jingle.taf', tafHeader: { valid: true }, tonieInfo: { model: 'box-de-de-01-00000000', episode: 'Jingle' } },
        { name: 'system.taf', tafHeader: { valid: true }, tonieInfo: { model: 'sound-123', category: 'system' } },
        { name: 'box-de-de-01-00000000.taf', tafHeader: { valid: true }, tonieInfo: { model: '10000123', episode: 'System sounds', series: 'Jingle', category: 'audio-play' } },
        { name: 'my-jingle.taf', tafHeader: { valid: true }, tonieInfo: { model: '', episode: 'Jingle' } },
        { name: 'custom.taf', tafHeader: { valid: true }, tonieInfo: { model: 'custom-family-model', category: 'custom' } }
    ] } }), [{ model: '10000123' }]);
    await call(h.api, 'loadCatalog');
    const result = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(result.items, item => item.filename), ['box-de-de-01-00000000.taf', 'my-jingle.taf', 'custom.taf']);
    assert.deepEqual(Array.from(result.items, item => item.kind), ['tonie', 'taf', 'taf']);
    assert.deepEqual(Array.from(result.excludedSources), ['lib://jingle.taf', 'lib://system.taf']);
});

test('an assigned own file with no source metadata never inherits the physical figure model, title or cover', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({ source: 'lib://own.taf', sourceInfo: undefined, hide: false })] } }), [{ model: 'pirate' }]);
    await call(h.api, 'loadCatalog');
    const [tag] = await call(h.api, 'listTags');
    assert.equal(tag.figure.model, 'pirate');
    assert.equal(tag.figure.title, 'Pirat');
    assert.equal(tag.figure.cover, '/cache/pirate.png');
    assert.equal(tag.content.model, '');
    assert.equal(tag.content.kind, 'taf');
    assert.equal(tag.content.title, 'Unbekannter Inhalt');
    assert.equal(tag.content.cover, '');
    assert.equal(tag.content.available, true);
});

test('system classification uses assigned content metadata rather than the physical figure', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({
        hide: false, tonieInfo: { model: 'system-figure', category: 'system', episode: 'Physical tag' },
        sourceInfo: { model: '10000284', episode: 'A story' }
    })] } }), [{ model: 'system-figure', category: 'system' }, { model: '10000284' }]);
    await call(h.api, 'loadCatalog');
    const [tag] = await call(h.api, 'listTags');
    assert.equal(tag.content.available, true);
    assert.equal(tag.content.kind, 'tonie');
    assert.equal(tag.figure.model, 'system-figure');
});

test('source metadata takes precedence, including an empty source model on a model-bearing figure', async () => {
    const h = harness(() => ({ body: { tags: [
        makeTag({ hide: false, sourceInfo: { model: '   ', episode: 'Eigene Geschichte', series: 'Familie', picture: '/cache/own.png' } }),
        makeTag({ ruid: OTHER_RUID, hide: false, sourceInfo: { model: ' custom-story ', episode: 'Mit Modell', picture: '/cache/custom.png' } })
    ] } }));
    const tags = await call(h.api, 'listTags');
    assert.equal(tags[0].content.model, '');
    assert.equal(tags[0].content.kind, 'taf');
    assert.equal(tags[0].content.title, 'Eigene Geschichte');
    assert.equal(tags[0].content.cover, '/cache/own.png');
    assert.equal(tags[1].content.model, 'custom-story');
    assert.equal(tags[1].content.kind, 'taf');
    assert.equal(tags[1].figure.model, 'pirate');
});

test('without a mapped source the original figure metadata can describe its original content', async () => {
    const h = catalogHarness(() => ({ body: { tags: [makeTag({ source: '', sourceInfo: undefined, hide: false, tonieInfo: { model: ' 10000284 ', episode: 'Original', picture: '/cache/original.png' } })] } }), [{ model: '10000284' }]);
    await call(h.api, 'loadCatalog');
    const [tag] = await call(h.api, 'listTags');
    assert.equal(tag.figure.model, '10000284');
    assert.equal(tag.content.model, '10000284');
    assert.equal(tag.content.kind, 'tonie');
    assert.equal(tag.content.title, 'Original');
    assert.equal(tag.content.source, 'content://12345678/90ABCDE0');
});

test('library classification follows standard catalog membership regardless of filename, storage or available title and cover', async () => {
    const models = [' 10000123 ', 'private-family-model', '', ' \t ', 123, 0, null, false];
    const h = catalogHarness(() => ({ body: { files: models.map((model, i) => ({
        name: 'story-' + i + '.taf', size: 1000 + i,
        tafHeader: { valid: true, audioId: i + 1 },
        tonieInfo: { model, episode: 'Aladdin', series: 'Disney', picture: '/cache/aladdin.png' }
    })) } }), [{ model: '10000123' }, { model: 123 }, { model: '0' }]);
    await call(h.api, 'loadCatalog');
    const result = await call(h.api, 'listLibrary', '/Eigene Hörspiele');
    assert.deepEqual(Array.from(result.items, item => item.model), ['10000123', 'private-family-model', '', '', '123', '0', '', '']);
    assert.deepEqual(Array.from(result.items, item => item.kind), ['tonie', 'taf', 'taf', 'taf', 'tonie', 'tonie', 'taf', 'taf']);
    assert.equal(result.items[0].source, 'lib://Eigene Hörspiele/story-0.taf');
    assert.equal(result.items[0].filename, 'story-0.taf');
    assert.equal(result.items[0].path, '/Eigene Hörspiele/story-0.taf');
    assert.equal(result.items[0].sizeBytes, 1000);
    assert.equal(result.items[2].title, 'Aladdin');
    assert.equal(result.items[2].cover, '/cache/aladdin.png');
});

test('library file size is reported only when the actual API size field is a valid byte count', async () => {
    const sizes = [4096, 0, undefined, null, -1, 1.5, '4096'];
    const h = harness(() => ({ body: { files: sizes.map((size, i) => ({
        name: 'story-' + i + '.taf', size,
        tafHeader: { valid: true, audioId: i + 1, size: 999999 }
    })) } }));
    const { items } = await call(h.api, 'listLibrary', '/');
    assert.equal(items[0].sizeBytes, 4096);
    assert.equal(items[1].sizeBytes, 0);
    for (const item of items.slice(2)) {
        assert.equal(Object.hasOwn(item, 'sizeBytes'), false, 'Unknown size must not be inferred from TAF header data');
    }
});

test('library exposes normalized audio identity fields only from the actual TAF header', async () => {
    const hash = 'bf7de53ab340fc423e545d34c8e7939294193bec';
    const headers = [
        { audioId: ' 001684838575 ', sha1Hash: ' ' + hash.toUpperCase() + '\n' },
        { audioId: 1684838575, sha1Hash: hash },
        { audioId: '1e3', sha1Hash: '0'.repeat(40) },
        { audioId: 0, sha1Hash: 'not-a-sha1' },
        {}
    ];
    const h = harness(() => ({ body: { files: headers.map((header, i) => ({
        name: 'story-' + i + '.taf', tafHeader: Object.assign({ valid: true }, header),
        audioId: 1684838575, sha1Hash: hash,
        tonieInfo: { model: '11000796', episode: 'Same title', audioId: 1684838575, sha1Hash: hash }
    })) } }));
    const { items } = await call(h.api, 'listLibrary', '/');
    assert.deepEqual(Array.from(items, item => item.audioId), [1684838575, 1684838575, null, null, null]);
    assert.deepEqual(Array.from(items, item => item.sha1Hash), [hash, hash, '', '', '']);
    assert.equal(h.api.contentIdentity(items[0]), h.api.contentIdentity(items[1]));
    assert.notEqual(items[0].source, items[1].source, 'Expose actual file paths so grouping can retain every alias');
    for (const item of items.slice(2)) { assert.equal(h.api.contentIdentity(item), null); }
    assert.equal(items.length, 5, 'Unknown identity does not make a valid TAF disappear');
});

test('tag content never borrows audio identity from figure, source model or catalog metadata', async () => {
    const hash = 'bf7de53ab340fc423e545d34c8e7939294193bec';
    const misleadingInfo = { model: 'dino', audioId: 1684838575, sha1Hash: hash, audio_id: [1684838575], hash: [hash] };
    const h = catalogHarness(() => ({ body: { tags: [
        makeTag({ hide: false, tonieInfo: misleadingInfo, sourceInfo: misleadingInfo }),
        makeTag({ hide: false, ruid: OTHER_RUID, source: '', tonieInfo: misleadingInfo, sourceInfo: undefined })
    ] } }), [misleadingInfo]);
    await call(h.api, 'loadCatalog');
    const tags = await call(h.api, 'listTags');
    for (const tag of tags) {
        assert.equal(tag.content.kind, 'tonie');
        assert.equal(h.api.contentIdentity(tag.content), null);
        assert.equal(Object.hasOwn(tag.content, 'audioId'), false);
        assert.equal(Object.hasOwn(tag.content, 'sha1Hash'), false);
    }
});

test('missing or hidden content cannot be advertised as playable, but its physical figure remains available to configure', async () => {
    const h = harness(() => ({ body: { tags: [makeTag({ exists: false }), makeTag({ hide: true }), makeTag({ source: 'https://radio.example/stream', hide: false })] } }));
    const tags = await call(h.api, 'listTags');
    assert.equal(tags.length, 3);
    assert.ok(tags.every(tag => !tag.content.available));
});

test('library traversal includes valid coverless TAFs, preserves actual nested file paths, and ignores parent directories', async () => {
    const h = harness(xhr => {
        const directory = new URL(xhr.url, 'http://test').searchParams.get('path');
        const valid = { valid: true, audioId: 123, trackSeconds: [0, 10] };
        if (directory === '/') {
            return { body: { files: [
                { name: '..', isDir: true }, { name: 'Eigene Hörspiele', isDir: true },
                { name: 'conni.taf', tafHeader: valid }, { name: 'broken.taf' },
                { name: 'readme.txt', tafHeader: valid }
            ] } };
        }
        assert.equal(directory, '/Eigene Hörspiele');
        return { body: { files: [
            { name: '..', isDir: true }, { name: 'Die Maus & Freunde.TAF', tafHeader: valid },
            { name: '../outside.taf', tafHeader: valid }, { name: '.hidden', isDir: true }
        ] } };
    });
    const { items, excludedSources } = await call(h.api, 'scanLibrary', '/');
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'conni');
    assert.equal(items[0].cover, '');
    assert.equal(items[1].source, 'lib://Eigene Hörspiele/Die Maus & Freunde.TAF');
    assert.equal(items[1].trackCount, 2);
    assert.deepEqual(Array.from(excludedSources), ['lib://broken.taf']);
    assert.equal(h.requests.length, 2);
});

test('recursive library scan reports hidden, invalid and system TAF sources so tag fallback cannot restore them', async () => {
    const h = catalogHarness(xhr => {
        const directory = new URL(xhr.url, 'http://test').searchParams.get('path');
        if (directory === '/') {
            return { body: { files: [
                { name: 'Hörwelt', isDir: true },
                { name: 'hidden.taf', hide: true, tafHeader: { valid: true } },
                { name: 'broken.taf', tafHeader: { valid: false } },
                { name: 'no-header.taf' },
                { name: 'visible.taf', tafHeader: { valid: true } },
                { name: 'unrelated.txt' }, { name: '../outside.taf', hide: true }
            ] } };
        }
        assert.equal(directory, '/Hörwelt');
        return { body: { files: [
            { name: 'jingle.taf', tafHeader: { valid: true }, tonieInfo: { model: 'known-system' } },
            { name: 'jingle.taf', tafHeader: { valid: true }, tonieInfo: { model: 'known-system' } },
            { name: 'box.taf', tafHeader: { valid: true }, tonieInfo: { model: 'box-de-de-01-00000000' } },
            { name: 'private.taf', tafHeader: { valid: true }, tonieInfo: { model: 'custom-story' } }
        ] } };
    }, [{ model: '10000284' }, { model: 'known-system', category: 'system' }]);
    await call(h.api, 'loadCatalog');
    const result = await call(h.api, 'scanLibrary', '/');
    assert.deepEqual(Array.from(result.items, item => item.source), ['lib://visible.taf', 'lib://Hörwelt/private.taf']);
    assert.deepEqual(Array.from(result.excludedSources), [
        'lib://hidden.taf', 'lib://broken.taf', 'lib://no-header.taf',
        'lib://Hörwelt/jingle.taf', 'lib://Hörwelt/box.taf'
    ]);
});

test('assignment patches only source/nocloud/live in the selected overlay and verifies without replacing physical metadata or other settings', async () => {
    const state = makeTag();
    state.auth = 'sensitive-existing-field';
    state.cloud_override = true;
    state.custom_setting = { keep: true };
    const h = harness(xhr => {
        if (xhr.url.indexOf('/api/fileIndexV2') === 0) {
            const params = new URL(xhr.url, 'http://test').searchParams;
            assert.equal(params.get('special'), 'library');
            assert.equal(params.get('overlay'), null);
            assert.equal(params.get('path'), '/Eigene Hörspiele');
            return availableFile('Maus & Co.taf');
        }
        assert.equal(new URL(xhr.url, 'http://test').searchParams.get('overlay'), 'box-1');
        if (xhr.method === 'GET') { return { body: { tagInfo: state } }; }
        assert.equal(xhr.url, '/content/json/set/' + RUID + '?overlay=box-1');
        assert.equal(xhr.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
        const patch = new URLSearchParams(xhr.body);
        assert.deepEqual(Array.from(patch.keys()).sort(), ['live', 'nocloud', 'source']);
        state.source = patch.get('source');
        state.live = patch.get('live') === 'true';
        state.nocloud = patch.get('nocloud') === 'true';
        return { body: 'OK' };
    });
    const result = await call(h.api, 'assign', { ruid: RUID, overlay: 'box-1' }, { source: 'lib://Eigene Hörspiele/Maus & Co.taf', available: true });
    assert.equal(result.verified, true);
    assert.equal(result.tag.source, 'lib://Eigene Hörspiele/Maus & Co.taf');
    assert.equal(result.tag.figure.model, 'pirate');
    assert.equal(state.hide, true);
    assert.equal(state.claimed, true);
    assert.equal(state.auth, 'sensitive-existing-field');
    assert.equal(state.cloud_override, true);
    assert.deepEqual(state.custom_setting, { keep: true });
    assert.deepEqual(h.requests.map(xhr => xhr.method), ['GET', 'GET', 'POST', 'GET']);
});

test('a failed initial lookup never creates or mutates a tag', async () => {
    const h = harness(() => ({ status: 404, body: 'not found' }));
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'HTTP', status: 404 });
    assert.deepEqual(h.requests.map(xhr => xhr.method), ['GET']);
});

test('a mismatched RUID response is rejected before any POST', async () => {
    const h = harness(() => ({ body: { tagInfo: makeTag({ ruid: OTHER_RUID }) } }));
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'INVALID_RESPONSE' });
    assert.equal(h.requests.length, 1);
});

test('server acceptance alone is not reported as success when readback differs', async () => {
    const h = harness(xhr => xhr.url.indexOf('/api/fileIndexV2') === 0 ? availableFile() : xhr.method === 'POST' ? { body: 'OK' } : { body: { tagInfo: makeTag() } });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'VERIFY_FAILED', savedMayHaveChanged: true });
    assert.equal(h.requests.length, 4);
});

test('write timeout is reported as uncertain and is never automatically retried', async () => {
    const h = harness(xhr => xhr.url.indexOf('/api/fileIndexV2') === 0 ? availableFile() : xhr.method === 'POST' ? { event: 'ontimeout' } : { body: { tagInfo: makeTag() } });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'TIMEOUT', savedMayHaveChanged: true });
    assert.deepEqual(h.requests.map(xhr => xhr.method), ['GET', 'GET', 'POST']);
});

test('a TAF removed since catalog loading causes no write', async () => {
    const h = harness(xhr => xhr.url.indexOf('/api/fileIndexV2') === 0 ? { body: { files: [] } } : { body: { tagInfo: makeTag() } });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'SOURCE_MISSING' });
    assert.deepEqual(h.requests.map(xhr => xhr.method), ['GET', 'GET']);
});

test('readback must confirm an existing valid local TAF, not just the requested source string', async () => {
    let written = false;
    const h = harness(xhr => {
        if (xhr.url.indexOf('/api/fileIndexV2') === 0) { return availableFile(); }
        if (xhr.method === 'POST') { written = true; return { body: 'OK' }; }
        return { body: { tagInfo: written ? makeTag({ source: 'lib://new.taf', nocloud: true, live: false, valid: false, exists: false }) : makeTag() } };
    });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: true }), { code: 'VERIFY_FAILED', savedMayHaveChanged: true });
});

test('content source preflight reads the selected overlay rather than the default content directory', async () => {
    let written = false;
    const selectedSource = 'content://87654321/90ABCDE0';
    const h = harness(xhr => {
        if (xhr.url.indexOf('/api/fileIndexV2') === 0) {
            const params = new URL(xhr.url, 'http://test').searchParams;
            assert.equal(params.get('overlay'), 'box-2');
            assert.equal(params.get('special'), null);
            assert.equal(params.get('path'), '/87654321');
            return availableFile('90ABCDE0');
        }
        if (xhr.method === 'POST') { written = true; return { body: 'OK' }; }
        return { body: { tagInfo: written ? makeTag({ source: selectedSource, nocloud: true, live: false }) : makeTag() } };
    });
    const result = await call(h.api, 'assign', { ruid: RUID, overlay: 'box-2' }, { source: selectedSource, available: true, overlay: 'box-2' });
    assert.equal(result.verified, true);
});

test('unchanged assignment performs only a fresh read', async () => {
    const h = harness(() => ({ body: { tagInfo: makeTag({ nocloud: true, live: false }) } }));
    const result = await call(h.api, 'assign', { ruid: RUID }, { source: 'lib://old.taf', available: true });
    assert.equal(result.verified, true);
    assert.equal(result.unchanged, true);
    assert.equal(h.requests.length, 1);
});

test('invalid source schemes, traversal, unavailable content and system tags are rejected without requests', async () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    for (const source of ['https://evil/stream', 'file:///etc/passwd', 'lib://../secret.taf', 'lib://a/../../secret.taf', 'lib://bad\\file.taf', 'lib://wrong.mp3', 'content://not-a-tag', 'lib://' + 'ü'.repeat(130) + '.taf']) {
        await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source, available: true }), { code: 'INVALID_CONTENT' });
    }
    await assert.rejects(call(h.api, 'assign', { ruid: '0000000000000001' }, { source: 'lib://new.taf', available: true }), { code: 'INVALID_PROFILE' });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID }, { source: 'lib://new.taf', available: false }), { code: 'INVALID_CONTENT' });
    assert.equal(h.requests.length, 0);
});

test('content-directory sources cannot silently point to a different overlay', async () => {
    const h = harness(() => { throw new Error('unexpected request'); });
    await assert.rejects(call(h.api, 'assign', { ruid: RUID, overlay: 'box-1' }, { source: 'content://87654321/90ABCDE0', available: true, overlay: null }), { code: 'OVERLAY_MISMATCH' });
    assert.equal(h.requests.length, 0);
});

test('covers stay on the current origin and cannot become script or external URLs', () => {
    const h = harness(() => ({}));
    assert.equal(h.api.localCover('http://teddy.local:8080/cache/cover.png'), '/cache/cover.png');
    assert.equal(h.api.localCover('/cache/cover.png'), '/cache/cover.png');
    for (const value of ['https://external.example/cover.png', 'http://teddy.local:8080.attacker/cache/cover.png', '//external/cover.png', 'javascript:alert(1)', '/\\external/cover.png']) {
        assert.equal(h.api.localCover(value), '');
    }
});

test('malformed successful responses fail clearly', async () => {
    const h = harness(() => ({ body: '<html>error</html>' }));
    await assert.rejects(call(h.api, 'listTags'), { code: 'INVALID_JSON' });
});
