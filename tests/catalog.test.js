'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adapter = fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/api.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/catalog.js'), 'utf8');
const HASH = 'abcdef0123456789abcdef0123456789abcdef01';
const OTHER_HASH = '123456789abcdef0123456789abcdef0123456789a';

function harness() {
    let requests = 0;
    const window = {
        XMLHttpRequest: function () { requests += 1; throw new Error('Grouping must not use the network'); },
        setTimeout,
        location: { protocol: 'http:', host: 'teddy.local' }
    };
    vm.runInNewContext(adapter, { window });
    vm.runInNewContext(moduleSource, { window });
    return { catalog: window.TonieHopperCatalog, api: window.TonieHopperAPI, requests: () => requests };
}

function item(source, overrides) {
    return Object.assign({ source, audioId: 123, sha1Hash: HASH, title: 'Eine Geschichte', model: '10000120', available: true, overlay: null }, overrides);
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('loading and grouping content never request data or write anything', () => {
    const h = harness();
    assert.equal(h.requests(), 0);
    h.catalog.groupContents([item('lib://a.taf')]);
    assert.equal(h.requests(), 0);
});

test('verified copies merge across names and models and retain every source alias', () => {
    const { catalog } = harness();
    const result = catalog.groupContents([
        item('lib://by/copy.taf', { title: 'Meine Kopie', model: 'custom' }),
        item('lib://by/audioID.taf', { title: 'Das Original', model: '10000120', audioId: '00123', sha1Hash: HASH.toUpperCase() })
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'lib://by/audioID.taf');
    assert.equal(result[0].title, 'Das Original');
    assert.deepEqual(plain(result[0].sources), ['lib://by/audioID.taf', 'lib://by/copy.taf']);
});

test('equal titles and GEOlino models do not merge different audio records', () => {
    const { catalog } = harness();
    const input = [
        item('lib://geolino/episode-1.taf', { title: 'GEOlino', model: 'geolino', audioId: 123, sha1Hash: HASH }),
        item('lib://geolino/episode-2.taf', { title: 'GEOlino', model: 'geolino', audioId: 124, sha1Hash: OTHER_HASH })
    ];
    assert.equal(catalog.groupContents(input).length, 2);
});

test('an equal audio ID does not merge files with different SHA1 hashes', () => {
    const { catalog } = harness();
    assert.equal(catalog.groupContents([
        item('lib://first.taf'), item('lib://second.taf', { sha1Hash: OTHER_HASH })
    ]).length, 2);
});

test('an equal SHA1 hash does not merge files with different audio IDs', () => {
    const { catalog } = harness();
    assert.equal(catalog.groupContents([
        item('lib://first.taf'), item('lib://second.taf', { audioId: 124 })
    ]).length, 2);
});

test('missing or invalid identities keep different source paths separate', () => {
    const { catalog } = harness();
    const incomplete = [
        { audioId: undefined }, { audioId: 0 }, { audioId: -1 }, { audioId: 'unknown' },
        { audioId: 4294967296 }, { sha1Hash: undefined }, { sha1Hash: 'broken' }, { sha1Hash: '0'.repeat(40) }
    ];
    incomplete.forEach((overrides, i) => {
        const result = catalog.groupContents([
            item('lib://case-' + i + '-a.taf', overrides),
            item('lib://case-' + i + '-b.taf', overrides)
        ]);
        assert.equal(result.length, 2, 'Invalid identity case ' + i + ' must not merge by title or model');
    });
});

test('the same source path deduplicates even without an audio identity', () => {
    const { catalog } = harness();
    const copy = item('lib://same.taf', { audioId: undefined, sha1Hash: undefined });
    const result = catalog.groupContents([copy, Object.assign({}, copy)]);
    assert.equal(result.length, 1);
    assert.deepEqual(plain(result[0].sources), ['lib://same.taf']);
});

test('reversing discovery order preserves the representative and sorted aliases', () => {
    const { catalog } = harness();
    const input = [
        item('lib://z-copy.taf', { title: 'Kopie', cover: '/cache/copy.png' }),
        item('lib://a-original.taf', { title: 'Original', cover: '/cache/original.png' }),
        item('lib://m-another-copy.taf', { title: 'Noch eine Kopie' })
    ];
    assert.deepEqual(plain(catalog.groupContents(input)), plain(catalog.groupContents(input.slice().reverse())));
});

test('a recognized Tonie represents identical audio ahead of unmodeled copies in either discovery order', () => {
    const { catalog } = harness();
    const input = [
        item('lib://a-unmodeled-copy.taf', { kind: 'taf', model: '', title: 'Dateiname' }),
        item('lib://z-known-copy.taf', { kind: 'tonie', title: 'Weiteres Original' }),
        item('lib://m-known-original.taf', { kind: 'tonie', title: 'Erkanntes Original' })
    ];
    const grouped = catalog.groupContents(input);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].source, 'lib://m-known-original.taf');
    assert.equal(grouped[0].kind, 'tonie');
    assert.equal(grouped[0].title, 'Erkanntes Original');
    assert.deepEqual(plain(grouped[0].sources), ['lib://a-unmodeled-copy.taf', 'lib://m-known-original.taf', 'lib://z-known-copy.taf']);
    assert.deepEqual(plain(grouped), plain(catalog.groupContents(input.slice().reverse())));
});

test('physical content remains separate across overlays and from shared library files', () => {
    const { catalog } = harness();
    const result = catalog.groupContents([
        item('content://E0123456/7890AB01'),
        item('content://E0123456/7890AB01', { overlay: 'box1' }),
        item('content://E0123456/7890AB01', { overlay: 'box2' }),
        item('content://E0123456/7890AB02', { overlay: 'box1' }),
        item('lib://shared.taf')
    ]);
    assert.equal(result.length, 4);
    assert.deepEqual(plain(result.find(content => content.overlay === 'box1').sources), [
        'content://E0123456/7890AB01', 'content://E0123456/7890AB02'
    ]);
    assert.equal(result.filter(content => content.source.indexOf('lib://') === 0).length, 1);
});

test('without identity, physical paths still remain separate across overlays', () => {
    const { catalog } = harness();
    const result = catalog.groupContents([
        item('content://E0123456/7890AB01', { audioId: undefined, sha1Hash: undefined }),
        item('content://E0123456/7890AB01', { audioId: undefined, sha1Hash: undefined, overlay: 'box1' })
    ]);
    assert.equal(result.length, 2);
    assert.deepEqual(plain(result.map(content => content.overlay)), [null, 'box1']);
});

test('library copies share a scope regardless of the assigning figure overlay', () => {
    const { catalog } = harness();
    const result = catalog.groupContents([
        item('lib://a.taf', { overlay: 'box1' }), item('lib://b.taf', { overlay: 'box2' })
    ]);
    assert.equal(result.length, 1);
    assert.deepEqual(plain(result[0].sources), ['lib://a.taf', 'lib://b.taf']);
});

test('grouping and returned source lists do not mutate their input records', () => {
    const { catalog } = harness();
    const input = [
        item('lib://a.taf', { detail: { chapters: ['Kapitel 1'] }, sources: ['lib://a.taf', 'lib://older-copy.taf'] }),
        item('lib://b.taf')
    ];
    const before = plain(input);
    const result = catalog.groupContents(input);
    result[0].detail.chapters.push('Neu');
    result[0].sources.push('lib://new.taf');
    catalog.sources(input[0]).push('lib://another.taf');
    assert.deepEqual(input, before);
});

test('grouping preserves existing aliases and is idempotent', () => {
    const { catalog } = harness();
    const first = catalog.groupContents([
        item('lib://b.taf', { sources: ['lib://z.taf', 'lib://b.taf', 'lib://z.taf'] }),
        item('lib://a.taf')
    ]);
    assert.deepEqual(plain(first[0].sources), ['lib://a.taf', 'lib://b.taf', 'lib://z.taf']);
    assert.deepEqual(plain(catalog.groupContents(first)), plain(first));
});

test('source helpers validate, normalize, deduplicate and safely fall back', () => {
    const { catalog } = harness();
    assert.deepEqual(plain(catalog.sources({ source: 'lib://a.taf', sources: ['lib://b.taf', 'lib://a.taf', 'lib://b.taf'] })), ['lib://a.taf', 'lib://b.taf']);
    assert.deepEqual(plain(catalog.sources({ source: 'lib://a.taf', sources: ['lib://b.taf', 'https://example.test/file.taf'] })), ['lib://a.taf']);
    assert.deepEqual(plain(catalog.sources({ source: 'content://e0123456/7890ab01', sources: [] })), ['content://E0123456/7890AB01']);
    assert.deepEqual(plain(catalog.sources(null)), []);
    assert.deepEqual(plain(catalog.groupContents([null, {}, { source: 'lib://../bad.taf' } ])), []);
});

test('display names do not repeat a complete series already present in the title', () => {
    const { catalog } = harness();
    const examples = [
        { series: '100% Wolf', title: '100% Wolf - Das Original-Hörspiel zum Kinofilm' },
        { series: 'Asterix', title: 'Asterix der Gallier' },
        { series: 'Beethoven', title: 'Beethoven für Kinder' },
        { series: 'Benjamin Blümchen', title: 'Benjamin Blümchen als Ritter' },
        { series: 'Arielle, die Meerjungfrau', title: 'Arielle die Meerjungfrau' },
        { series: 'Leo Lausemaus', title: '06 - Leo Lausemaus geht in den Kindergarten' },
        { series: 'Beethoven', title: 'Die Geschichte von Beethoven für Kinder' }
    ];
    examples.forEach(content => assert.equal(catalog.displayName(content), content.title));
});

test('display-name matching ignores case, spacing and common punctuation but preserves the visible title', () => {
    const { catalog } = harness();
    assert.equal(catalog.displayName({ series: '  Arielle, die Meerjungfrau  ', title: '  ARIELLE – die   Meerjungfrau: Das Hörspiel  ' }), 'ARIELLE – die   Meerjungfrau: Das Hörspiel');
    assert.equal(catalog.displayName({ series: '100% Wolf', title: '100%Wolf – Das Abenteuer' }), '100%Wolf – Das Abenteuer');
    assert.equal(catalog.displayName({ series: 'Leo Lausemaus', title: '06: „Leo-Lausemaus“ – Gute Nacht!' }), '06: „Leo-Lausemaus“ – Gute Nacht!');
    assert.equal(catalog.displayName({ series: 'Bibi & Tina', title: 'Bibi / Tina: Abenteuer' }), 'Bibi / Tina: Abenteuer');
});

test('display-name matching requires the complete series as consecutive whole words', () => {
    const { catalog } = harness();
    assert.equal(catalog.displayName({ series: 'Maus', title: 'Leo Lausemaus' }), 'Maus – Leo Lausemaus');
    assert.equal(catalog.displayName({ series: 'Asterix', title: 'Asterixwelt' }), 'Asterix – Asterixwelt');
    assert.equal(catalog.displayName({ series: 'Leo Lausemaus', title: 'Leo und Lausemaus' }), 'Leo Lausemaus – Leo und Lausemaus');
    assert.equal(catalog.displayName({ series: 'Disney', title: 'Cars' }), 'Disney – Cars');
    assert.equal(catalog.displayName({ series: '  Maus  ', title: '  Schlaf schön!  ' }), 'Maus – Schlaf schön!');
});

test('display names handle missing metadata without changing the input or audio grouping', () => {
    const { catalog } = harness();
    assert.equal(catalog.displayName({ title: '  Ohne Reihe  ' }), 'Ohne Reihe');
    assert.equal(catalog.displayName({ series: '  Eine Reihe  ', title: '   ' }), 'Eine Reihe');
    assert.equal(catalog.displayName({ series: '  Hörzeit ', title: ' Hörzeit  ' }), 'Hörzeit');
    assert.equal(catalog.displayName(null), '');
    const input = [
        item('lib://first.taf', { series: 'Asterix', title: '  Asterix der Gallier  ' }),
        item('lib://second.taf', { series: 'Asterix', title: '  Asterix der Gallier  ', audioId: 124, sha1Hash: OTHER_HASH })
    ];
    const before = plain(input);
    input.forEach(content => catalog.displayName(content));
    assert.deepEqual(input, before);
    assert.equal(catalog.groupContents(input).length, 2, 'Display-name cleanup cannot collapse distinct stories');
});

test('maximum age includes younger recommendations and the selected age itself', () => {
    const { catalog } = harness();
    [0, 3, 4].forEach(ageMin => {
        assert.equal(catalog.matchesMaxAge({ ageMin }, 4), true);
        assert.equal(catalog.matchesMaxAge({ ageMin }, '4'), true);
    });
    assert.equal(catalog.matchesMaxAge({ ageMin: 5 }, 4), false);
    assert.equal(catalog.matchesMaxAge({ ageMin: 0 }, 0), true);
    assert.equal(catalog.matchesMaxAge({ ageMin: 1 }, 0), false);
    assert.equal(catalog.matchesMaxAge({ ageMin: 99 }, 99), true);
});

test('unknown recommendations only appear when no maximum age is selected', () => {
    const { catalog } = harness();
    [undefined, null, '', '4', false, NaN, Infinity, -1, 4.5, 100].forEach(ageMin => {
        const content = { ageMin };
        assert.equal(catalog.matchesMaxAge(content, 4), false, 'Unknown or malformed ages are not a recommendation for age 0');
        [undefined, null, ''].forEach(maxAge => assert.equal(catalog.matchesMaxAge(content, maxAge), true));
    });
    assert.equal(catalog.matchesMaxAge(null, 4), false);
    assert.equal(catalog.matchesMaxAge({}, 4), false);
    assert.equal(catalog.matchesMaxAge(null, ''), true);
});

test('malformed maximum ages cannot loosen the age filter', () => {
    const { catalog } = harness();
    [-1, 100, 4.5, NaN, Infinity, true, false, {}, [], ' ', '4 years', '4.0', '1e1', '+4', '-4'].forEach(maxAge => {
        assert.equal(catalog.matchesMaxAge({ ageMin: 0 }, maxAge), false);
    });
});

test('verified copies retain the strictest known age independently of their representative', () => {
    const { catalog } = harness();
    const input = [
        item('lib://a-original.taf', { kind: 'tonie', ageMin: null }),
        item('lib://b-copy.taf', { kind: 'taf', ageMin: 3 }),
        item('lib://c-copy.taf', { kind: 'taf', ageMin: 5 }),
        item('lib://d-copy.taf', { kind: 'taf', ageMin: '99' })
    ];
    const before = plain(input);
    const grouped = catalog.groupContents(input);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].source, 'lib://a-original.taf');
    assert.equal(grouped[0].kind, 'tonie');
    assert.equal(grouped[0].ageMin, 5);
    assert.equal(catalog.matchesMaxAge(grouped[0], 4), false);
    assert.deepEqual(plain(grouped), plain(catalog.groupContents(input.slice().reverse())));
    assert.deepEqual(plain(grouped), plain(catalog.groupContents(grouped)));
    assert.deepEqual(input, before);
});

test('grouping preserves a known zero age and keeps unknown ages distinct from zero', () => {
    const { catalog } = harness();
    const withZero = catalog.groupContents([
        item('lib://a.taf'), item('lib://b.taf', { ageMin: 0 })
    ]);
    assert.equal(withZero[0].ageMin, 0);
    const unknown = catalog.groupContents([
        item('lib://a.taf'), item('lib://b.taf', { ageMin: null })
    ]);
    assert.equal(unknown[0].ageMin, null);
    const noMetadata = catalog.groupContents([item('lib://a.taf'), item('lib://b.taf')]);
    assert.equal(Object.prototype.hasOwnProperty.call(noMetadata[0], 'ageMin'), false);
});
