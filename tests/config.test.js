'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const apiCode = fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/api.js'), 'utf8');
const configCode = fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/config.js'), 'utf8');
const ONE = 'lib://one.taf';
const TWO = 'lib://two.taf';

function input() {
    return {
        version: 2,
        profiles: [{ id: 'tim', name: ' Tim ', ruid: '1234567890ABCDE0', overlay: null }],
        library: { path: '/', hiddenSources: [], entries: [] }
    };
}

function legacyInput() {
    const data = input();
    data.version = 1;
    data.profiles[0].allowedSources = [ONE];
    delete data.library.hiddenSources;
    data.library.approvedSources = [ONE, TWO];
    return data;
}

function harness(response) {
    const requests = [];
    function XHR() {}
    XHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
    XHR.prototype.send = function (body) {
        requests.push({ method: this.method, url: this.url, body });
        setImmediate(() => {
            if (response && response.event) { this[response.event](); return; }
            this.status = response && response.status || 200;
            this.responseText = response && typeof response.body === 'string' ? response.body : JSON.stringify(response ? response.body : input());
            this.onload();
        });
    };
    const window = { XMLHttpRequest: XHR, setTimeout, location: { protocol: 'http:', host: 'teddy.local' } };
    const context = { window, XMLHttpRequest: XHR, console };
    vm.runInNewContext(apiCode, context);
    vm.runInNewContext(configCode, context);
    return { config: window.TonieHopperConfig, requests };
}

function load(config) {
    return new Promise((resolve, reject) => config.load((error, result, meta) => error ? reject(error) : resolve({ result, meta })));
}

test('validation normalizes profiles without mutating the input or sharing the exclusion arrays', () => {
    const h = harness();
    const original = input();
    original.library.hiddenSources = [ONE];
    const validated = h.config.validate(original);
    assert.equal(validated.version, 2);
    assert.equal(validated.profiles[0].name, 'Tim');
    assert.equal(validated.profiles[0].ruid, '1234567890abcde0');
    assert.equal(original.profiles[0].name, ' Tim ');
    validated.library.hiddenSources.pop();
    assert.equal(original.library.hiddenSources.length, 1);
});

test('all eligible sources are visible by default, including newly discovered stories', () => {
    const h = harness();
    const validated = h.config.validate(input());
    assert.equal(h.config.allowed(validated, validated.profiles[0], ONE), true);
    assert.equal(h.config.allowed(validated, validated.profiles[0], TWO), true);
    assert.equal(h.config.allowed(validated, validated.profiles[0], 'lib://brand-new.taf'), true);
});

test('a global exclusion hides the same story for both children and leaves all other stories visible', () => {
    const h = harness();
    const data = input();
    data.profiles.push({ id: 'ben', name: 'Ben', ruid: '8765432190abcde0', overlay: null });
    data.library.hiddenSources = [ONE];
    const validated = h.config.validate(data);
    for (const child of validated.profiles) {
        assert.equal(h.config.allowed(validated, child, ONE), false);
        assert.equal(h.config.allowed(validated, child, TWO), true);
        assert.equal(h.config.allowed(validated, child, 'lib://brand-new.taf'), true);
    }
});

test('omitting the global exclusions list defaults to showing stories', () => {
    const h = harness();
    const data = input();
    delete data.library.hiddenSources;
    const validated = h.config.validate(data);
    assert.equal(validated.library.hiddenSources.length, 0);
    assert.equal(h.config.allowed(validated, validated.profiles[0], ONE), true);
});

test('malformed exclusions are rejected rather than silently showing hidden stories', () => {
    const h = harness();
    for (const value of [false, '', null, 0, {}, ONE]) {
        const data = input();
        data.library.hiddenSources = value;
        assert.throws(() => h.config.validate(data), undefined, 'must reject ' + JSON.stringify(value));
    }
});

test('v1 migration discards legacy allowlists without turning approved stories into exclusions', () => {
    const h = harness();
    const data = legacyInput();
    data.library.path = '/Eigene Hörspiele';
    data.library.entries = [{ source: ONE, title: 'Meine Geschichte', series: 'Eigene Hörwelt', cover: '/cache/cover.png', kind: 'own' }];
    data.profiles[0].overlay = 'box-1';
    const original = JSON.stringify(data);
    const migrated = h.config.validate(data);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.profiles[0].id, 'tim');
    assert.equal(migrated.profiles[0].name, 'Tim');
    assert.equal(migrated.profiles[0].ruid, '1234567890abcde0');
    assert.equal(migrated.profiles[0].overlay, 'box-1');
    assert.equal('allowedSources' in migrated.profiles[0], false);
    assert.equal('approvedSources' in migrated.library, false);
    assert.equal(migrated.library.hiddenSources.length, 0);
    assert.equal(migrated.library.path, data.library.path);
    assert.equal(JSON.stringify(migrated.library.entries), JSON.stringify(data.library.entries));
    assert.equal(h.config.allowed(migrated, migrated.profiles[0], ONE), true);
    assert.equal(h.config.allowed(migrated, migrated.profiles[0], TWO), true);
    assert.equal(h.config.allowed(migrated, migrated.profiles[0], 'lib://not-previously-approved.taf'), true);
    assert.equal(JSON.stringify(data), original);
});

test('migration validates legacy permission lists before discarding them', () => {
    const h = harness();
    for (const value of [false, '', null, 0, {}, ONE, [ONE, ONE], ['https://outside/stream']]) {
        const badGlobal = legacyInput();
        badGlobal.library.approvedSources = value;
        assert.throws(() => h.config.validate(badGlobal));
        const badChild = legacyInput();
        badChild.profiles[0].allowedSources = value;
        assert.throws(() => h.config.validate(badChild));
    }
    const withoutLists = legacyInput();
    delete withoutLists.library.approvedSources;
    delete withoutLists.profiles[0].allowedSources;
    assert.equal(h.config.validate(withoutLists).library.hiddenSources.length, 0);
});

test('deprecated per-child permission fields never restrict v2 children', () => {
    const h = harness();
    const data = input();
    data.profiles[0].allowedSources = [ONE];
    const validated = h.config.validate(data);
    assert.equal('allowedSources' in validated.profiles[0], false);
    assert.equal(h.config.allowed(validated, validated.profiles[0], TWO), true);
});

test('duplicate profile IDs and duplicate target figures within one overlay are rejected', () => {
    const h = harness();
    const duplicateId = input();
    duplicateId.profiles.push({ id: 'tim', name: 'Peter', ruid: '8765432190abcde0' });
    assert.throws(() => h.config.validate(duplicateId));
    const duplicateTag = input();
    duplicateTag.profiles.push({ id: 'peter', name: 'Peter', ruid: duplicateTag.profiles[0].ruid.toLowerCase() });
    assert.throws(() => h.config.validate(duplicateTag));
});

test('the same RUID in a distinct overlay is an explicit separate target', () => {
    const h = harness();
    const data = input();
    data.profiles.push({ id: 'peter', name: 'Peter', ruid: data.profiles[0].ruid, overlay: 'box-2' });
    const validated = h.config.validate(data);
    assert.equal(validated.profiles[1].overlay, 'box-2');
    assert.equal(validated.profiles.length, 2);
});

test('system records cannot be configured as children’s figures', () => {
    const h = harness();
    const data = input();
    data.profiles[0].ruid = '0000000000000001';
    assert.throws(() => h.config.validate(data));
});

test('invalid and ambiguous source values are rejected before being used as permissions', () => {
    const h = harness();
    for (const source of ['https://outside/stream', 'lib://../one.taf', 'lib://a/../one.taf', 'lib://wrong.mp3', 'lib:///one.taf', 'content://12345678/90abcde0']) {
        const data = input();
        data.library.hiddenSources = [source];
        assert.throws(() => h.config.validate(data), undefined, source);
    }
    const duplicate = input();
    duplicate.library.hiddenSources = [ONE, ONE];
    assert.throws(() => h.config.validate(duplicate));
});

test('library paths are limited to directories the TeddyCloud API can actually address', () => {
    const h = harness();
    for (const folder of ['/../private', '/a/./b', '/a\\b', '/' + 'ü'.repeat(64)]) {
        const data = input();
        data.library.path = folder;
        assert.throws(() => h.config.validate(data), undefined, folder);
    }
});

test('own content metadata cannot silently supply external or executable covers', () => {
    const h = harness();
    for (const cover of ['https://external/cover.png', '//external/cover.png', 'javascript:alert(1)', '/\\external/cover.png']) {
        const data = input();
        data.library.entries = [{ source: ONE, title: 'Maus', cover }];
        assert.throws(() => h.config.validate(data));
    }
    const data = input();
    data.library.entries = [{ source: ONE, title: 'Maus', cover: '/cache/maus.png' }];
    assert.equal(h.config.validate(data).library.entries[0].cover, '/cache/maus.png');
});

test('missing central config returns an empty setup and cannot authorize a fallback child', async () => {
    const h = harness({ status: 404, body: 'not found' });
    const { result, meta } = await load(h.config);
    assert.equal(meta.missing, true);
    assert.equal(result.profiles.length, 0);
    assert.equal(result.version, 2);
    assert.equal(result.library.hiddenSources.length, 0);
    assert.equal(h.config.allowed(result, input().profiles[0], ONE), false);
    assert.equal(h.requests[0].method, 'GET');
    assert.match(h.requests[0].url, /^config\.json\?_=/);
});

test('central errors or malformed config never fall back to previously configured children', async () => {
    for (const response of [{ status: 500, body: 'error' }, { body: '<html>error</html>' }, { event: 'ontimeout' }, { body: { version: 999 } }]) {
        const h = harness(response);
        await assert.rejects(load(h.config));
        assert.equal(h.requests.length, 1);
    }
});

test('a freshly hidden story is denied even if the earlier config showed it', () => {
    const h = harness();
    const before = h.config.validate(input());
    const updated = input();
    updated.library.hiddenSources = [ONE];
    const after = h.config.validate(updated);
    assert.equal(h.config.allowed(before, before.profiles[0], ONE), true);
    assert.equal(h.config.allowed(after, after.profiles[0], ONE), false);
});

test('invalid source, missing configuration or an unregistered target cannot be authorized', () => {
    const h = harness();
    const validated = h.config.validate(input());
    const current = validated.profiles[0];
    assert.equal(h.config.allowed(null, current, ONE), false);
    assert.equal(h.config.allowed({}, current, ONE), false);
    assert.equal(h.config.allowed(validated, null, ONE), false);
    assert.equal(h.config.allowed(validated, { id: 'other', ruid: current.ruid, overlay: null }, ONE), false);
    assert.equal(h.config.allowed(validated, { id: current.id, ruid: current.ruid, overlay: 'another-box' }, ONE), false);
    for (const source of [undefined, null, 'https://outside/stream', 'lib://../secret.taf', 'content://invalid']) {
        assert.equal(h.config.allowed(validated, current, source), false);
    }
});
