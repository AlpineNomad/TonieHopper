/* Search physical figures without filtering or grouping them by their audio. */
(function (root) {
    'use strict';

    var catalog = root.TonieHopperCatalog, collator = null;
    try {
        if (root.Intl && root.Intl.Collator) {
            collator = new root.Intl.Collator('de', { sensitivity: 'base', numeric: true });
        }
    } catch (ignore) {}

    function text(value) { return String(value == null ? '' : value); }
    function normalized(value) {
        return text(value).toLowerCase()
            .replace(/[.,;:!?'"„“”‚‘’«»‹›()\[\]{}<>\/\\|+*=~_^%$#@&\-\u2010-\u2015\u2026\u00b7\u2022]/g, ' ')
            .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    function compact(value) { return normalized(value).replace(/ /g, ''); }
    function physicalFigure(tag) {
        return tag && tag.figure && typeof tag.figure === 'object' ? tag.figure : {};
    }
    function getTagKey(tag) {
        return text(tag && tag.ruid).toLowerCase() + ':' + text(tag && tag.overlay);
    }
    function comparePlain(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    function compareName(a, b) {
        var left, right, i, result;
        if (collator) { return collator.compare(a, b); }
        function parts(value) {
            return value.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').match(/\d+|\D+/g) || [];
        }
        left = parts(a); right = parts(b);
        for (i = 0; i < Math.min(left.length, right.length); i += 1) {
            if (/^\d+$/.test(left[i]) && /^\d+$/.test(right[i])) {
                var first = left[i].replace(/^0+/, '') || '0';
                var second = right[i].replace(/^0+/, '') || '0';
                result = first.length - second.length || comparePlain(first, second);
            } else { result = comparePlain(left[i], right[i]); }
            if (result) { return result; }
        }
        return left.length - right.length;
    }

    function search(tags, query) {
        var words = normalized(query), tokens = words ? words.split(' ').map(function (token) {
            if (token === 'kreativtonies') { return 'kreativtonie'; }
            return token === 'tonies' ? 'tonie' : token;
        }) : [];
        // Keep separated RUID/model digits in their original order. Matching
        // individual hex bytes independently could select a different figure.
        var separatedIdentifier = tokens.length > 1 && /^[0-9a-f ]+$/.test(words) && words.replace(/ /g, '').length >= 6;
        var identifier = words.replace(/ /g, '');
        if (!Array.isArray(tags)) { return []; }
        return tags.map(function (tag, index) { return { tag: tag, index: index }; })
            .filter(function (row) {
                var tag = row.tag, figure, fields, normalFields, compactFields;
                if (!tag || typeof tag !== 'object') { return false; }
                if (!tokens.length) { return true; }
                figure = physicalFigure(tag);
                fields = [figure.title, figure.series, figure.model, catalog.displayName(figure), tag.ruid];
                normalFields = fields.map(normalized);
                compactFields = fields.map(compact);
                if (separatedIdentifier) {
                    return compactFields.some(function (value) { return value.indexOf(identifier) >= 0; });
                }
                return tokens.every(function (token) {
                    return normalFields.some(function (value) { return value.indexOf(token) >= 0; }) ||
                        compactFields.some(function (value) { return value.indexOf(token) >= 0; });
                });
            })
            .sort(function (a, b) {
                return compareName(catalog.displayName(physicalFigure(a.tag)), catalog.displayName(physicalFigure(b.tag))) ||
                    comparePlain(getTagKey(a.tag), getTagKey(b.tag)) || a.index - b.index;
            });
    }

    root.TonieHopperFigures = { search: search, getTagKey: getTagKey };
}(window));
