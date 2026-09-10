'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(intl = Intl) {
    let requests = 0;
    const window = {
        Intl: intl, setTimeout, location: { protocol: 'http:', host: 'fixture.local' },
        XMLHttpRequest: function () { requests += 1; throw new Error('Figure search must not access the network'); }
    };
    for (const module of ['api', 'catalog', 'figures']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugin/toniehopper/js/' + module + '.js'), 'utf8'), { window });
    }
    return { figures: window.TonieHopperFigures, requests: () => requests };
}

function tag(ruid, title, overrides) {
    return Object.assign({
        ruid, overlay: null,
        figure: { title, series: 'Kreativ-Tonie', model: '10000284' },
        content: { title: 'Dino Ranch', series: 'Disney', model: 'story-model', source: 'lib://same-story.taf', available: true },
        hide: false, nocloud: true, claimed: true, valid: true, exists: true
    }, overrides);
}
function indices(rows) { return Array.from(rows, row => row.index); }

test('empty searches retain every physical figure regardless of content and status flags', () => {
    const { figures } = harness();
    const tags = [
        tag('e01234567890ab01', 'Detektiv', { hide: true, content: { available: false } }),
        tag('e01234567890ab02', 'Pirat', { nocloud: false, claimed: false, valid: false, exists: false }),
        tag('e01234567890ab03', 'Fee', { figure: { title: 'Fee', series: 'Kreativ-Tonie' } }),
        tag('e01234567890ab04', 'Mein Tonie', { figure: { title: 'Mein Tonie', model: 'custom-figure' }, content: null })
    ];
    assert.deepEqual(indices(figures.search(tags, '   ')).sort(), [0, 1, 2, 3]);
    assert.deepEqual(indices(figures.search(tags, 'detektiv')), [0]);
    assert.deepEqual(indices(figures.search(tags, 'customfigure')), [3]);
});

test('equal figure models, names and assigned audio never combine physical figures', () => {
    const { figures } = harness();
    const tags = [tag('e01234567890ab02', 'Detektiv'), tag('e01234567890ab01', 'Detektiv')];
    const result = figures.search(tags, 'Detektiv');
    assert.equal(result.length, 2);
    assert.deepEqual(indices(result), [1, 0]);
    assert.equal(result[0].tag, tags[1]);
    assert.equal(result[1].tag, tags[0]);
});

test('all query words match physical fields with normalized punctuation and compact Kreativtonie spelling', () => {
    const { figures } = harness();
    const tags = [tag('e01234567890ab01', 'Detektiv'), tag('e01234567890ab02', 'Pirat')];
    for (const query of ['kreativ detektiv', '  KREATIV—TONIE  DETEKTIV  ', 'kreativtonie det', 'Kreativtonies Detektiv', 'Kreativ-Tonies Detektiv', 'detektiv 10000284']) {
        assert.deepEqual(indices(figures.search(tags, query)), [0], query);
    }
    assert.deepEqual(indices(figures.search(tags, 'kreativtonie')), [0, 1]);
    assert.deepEqual(indices(figures.search(tags, 'Kreativtonies')), [0, 1]);
    assert.deepEqual(indices(figures.search(tags, 'Kreativ-Tonies')), [0, 1]);
    assert.deepEqual(indices(figures.search(tags, 'Tonies')), [0, 1]);
    assert.deepEqual(indices(figures.search(tags, 'detektiv pirat')), []);
    assert.deepEqual(indices(figures.search(tags, 'Piraten')), [], 'Only the Tonie vocabulary receives explicit singular/plural aliases');
});

test('search uses raw physical series and the visible combined name, never assigned stories or overlays', () => {
    const { figures } = harness();
    const tags = [tag('e01234567890ab01', 'Detektiv', { overlay: 'kinderzimmer' })];
    assert.deepEqual(indices(figures.search(tags, 'Kreativ-Tonie – Detektiv')), [0]);
    assert.deepEqual(indices(figures.search(tags, 'Dino Ranch')), []);
    assert.deepEqual(indices(figures.search(tags, 'Disney')), []);
    assert.deepEqual(indices(figures.search(tags, 'story-model')), []);
    assert.deepEqual(indices(figures.search(tags, 'kinderzimmer')), []);
});

test('model numbers and RUID searches support separators while preserving byte order', () => {
    const { figures } = harness();
    const tags = [
        tag('e01234567890ab01', 'Pirat', { figure: { title: 'Pirat', series: 'Kreativ-Tonie', model: '02-0007' } }),
        tag('e03412567890ab01', 'Detektiv')
    ];
    for (const query of ['02-0007', '020007', '02 0007', 'E0:12:34:56:78:90:AB:01', 'e0 12 34 56', 'e0-12-34-56']) {
        assert.deepEqual(indices(figures.search(tags, query)), [0], query);
    }
    assert.deepEqual(indices(figures.search(tags, '90ab01')).sort(), [0, 1]);
});

test('German display-name sorting includes natural numbers and stable RUID/overlay ties', () => {
    const { figures } = harness();
    const tags = [
        tag('e01234567890ab05', 'Zebra', { figure: { title: 'Zebra' } }),
        tag('e01234567890ab04', 'Äpfel', { figure: { title: 'Äpfel' } }),
        tag('e01234567890ab03', '10 – Gute Nacht', { figure: { title: '10 – Gute Nacht', series: 'Leo Lausemaus' } }),
        tag('e01234567890ab02', '2 – Eine Überraschung', { figure: { title: '2 – Eine Überraschung', series: 'Leo Lausemaus' } }),
        tag('e01234567890ab01', 'Detektiv', { overlay: 'box2' }),
        tag('e01234567890ab01', 'Detektiv', { overlay: 'box1' }),
        tag('e01234567890ab01', 'Detektiv')
    ];
    assert.deepEqual(indices(figures.search(tags, '')), [1, 6, 5, 4, 3, 2, 0]);
});

test('the ES5 sorting fallback handles German umlauts and numbers when Intl is absent or unavailable', () => {
    const tags = [
        tag('e01234567890ab01', '10', { figure: { title: '10', series: 'Äpfel' } }),
        tag('e01234567890ab02', '2', { figure: { title: '2', series: 'Äpfel' } }),
        tag('e01234567890ab03', 'Auto', { figure: { title: 'Auto' } })
    ];
    for (const intl of [null, { Collator: function () { throw new Error('Unavailable'); } }]) {
        assert.deepEqual(indices(harness(intl).figures.search(tags, '')), [1, 0, 2]);
    }
});

test('missing figure metadata does not crash or filter valid tag objects', () => {
    const { figures } = harness();
    const tags = [null, undefined, 'invalid record', {}, { ruid: 'e01234567890ab01', figure: null }];
    assert.deepEqual(indices(figures.search(tags, '')), [3, 4]);
    assert.deepEqual(indices(figures.search(tags, 'ab01')), [4]);
    assert.deepEqual(indices(figures.search(tags, 'detektiv')), []);
    assert.deepEqual(indices(figures.search(null, '')), []);
});

test('search preserves input order and records while returning original indices and stable keys', () => {
    const h = harness();
    const tags = [tag('e01234567890ab02', 'Pirat'), tag('E01234567890AB01', 'Detektiv', { overlay: 'box1' })];
    const before = JSON.parse(JSON.stringify(tags));
    const result = h.figures.search(tags, '');
    assert.deepEqual(indices(result), [1, 0]);
    assert.deepEqual(tags, before);
    assert.equal(result[0].tag, tags[1]);
    assert.equal(h.figures.getTagKey(tags[1]), 'e01234567890ab01:box1');
    assert.equal(h.figures.getTagKey(tags[0]), 'e01234567890ab02:');
    assert.equal(h.requests(), 0);
});
