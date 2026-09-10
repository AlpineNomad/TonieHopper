/* Group verified copies of an audio file without changing their source records. */
(function (root) {
    'use strict';

    var api = root.TonieHopperAPI;
    var owns = Object.prototype.hasOwnProperty;

    function clone(value) {
        var copy, key;
        if (!value || typeof value !== 'object') { return value; }
        if (Array.isArray(value)) { return value.map(clone); }
        copy = {};
        for (key in value) {
            if (owns.call(value, key)) { copy[key] = clone(value[key]); }
        }
        return copy;
    }

    function trimmed(value) {
        return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function nameWords(value) {
        return trimmed(value).toLowerCase()
            .replace(/[.,;:!?'"„“”‚‘’«»‹›()\[\]{}<>\/\\|+*=~_^%$#@&\-\u2010-\u2015\u2026\u00b7\u2022]/g, ' ')
            .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function displayName(content) {
        var title = trimmed(content && content.title);
        var series = trimmed(content && content.series);
        var seriesWords;
        if (!title) { return series; }
        if (!series) { return title; }
        seriesWords = nameWords(series);
        // Match the whole series as consecutive words, including inside numbered
        // titles. Keep the title's original spelling and punctuation for display.
        if (!seriesWords || (' ' + nameWords(title) + ' ').indexOf(' ' + seriesWords + ' ') >= 0) {
            return title;
        }
        return series + ' – ' + title;
    }

    function validAge(value) {
        return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 99 && Math.floor(value) === value;
    }

    function matchesMaxAge(content, maxAge) {
        var age = content && content.ageMin;
        if (maxAge == null || maxAge === '') { return true; }
        // Select values are strings. Missing age metadata must never become 0.
        if (typeof maxAge === 'string' && /^\d{1,2}$/.test(maxAge)) { maxAge = Number(maxAge); }
        return validAge(maxAge) && validAge(age) && age <= maxAge;
    }

    function sources(content) {
        var fallback = api.normalizeSource(content && content.source);
        var aliases = content && content.sources;
        var found = Object.create(null), valid = [], i, source;
        if (Array.isArray(aliases) && aliases.length) {
            for (i = 0; i < aliases.length; i += 1) {
                source = api.normalizeSource(aliases[i]);
                if (!source) { return fallback ? [fallback] : []; }
                if (!found[source]) { found[source] = true; valid.push(source); }
            }
            return valid.sort();
        }
        return fallback ? [fallback] : [];
    }

    function scope(content, source) {
        // Library files are shared. Physical content belongs to one overlay.
        return source.indexOf('lib://') === 0 ? 'library' : 'content:' + (content.overlay || '');
    }

    function groupContents(items) {
        var groups = [], byKey = Object.create(null);
        if (!Array.isArray(items)) { return []; }
        items.forEach(function (content) {
            var source, identity, key, group, rank;
            if (!content || typeof content !== 'object') { return; }
            source = api.normalizeSource(content.source);
            if (!source) { return; }
            identity = api.contentIdentity(content);
            key = scope(content, source) + '|' +
                (typeof identity === 'string' && identity ? 'identity:' + identity : 'source:' + source);
            // An identified Tonie carries useful catalog metadata even when a
            // byte-identical copy has lost its model. This never changes grouping.
            rank = content.kind === 'tonie' ? 0 : 1;
            group = byKey[key];
            if (!group) {
                group = { representative: content, source: source, rank: rank, aliases: Object.create(null), ageMin: null, hasAge: false };
                byKey[key] = group;
                groups.push(group);
            } else if (rank < group.rank || (rank === group.rank && source < group.source)) {
                group.representative = content;
                group.source = source;
                group.rank = rank;
            }
            if (owns.call(content, 'ageMin') && content.ageMin !== undefined) { group.hasAge = true; }
            if (validAge(content.ageMin) && (group.ageMin === null || content.ageMin > group.ageMin)) {
                // Identical files may carry different catalog metadata. Retain
                // the stricter recommendation, even on an unchosen copy.
                group.ageMin = content.ageMin;
            }
            group.aliases[source] = true;
            sources(content).forEach(function (alias) { group.aliases[alias] = true; });
        });
        return groups.map(function (group) {
            var result = clone(group.representative);
            result.source = group.source;
            result.sources = Object.keys(group.aliases).sort();
            if (group.hasAge) { result.ageMin = group.ageMin; }
            return result;
        });
    }

    root.TonieHopperCatalog = { groupContents: groupContents, sources: sources, displayName: displayName, matchesMaxAge: matchesMaxAge };
}(window));
