/* TeddyCloud adapter. ES5/XHR for Safari on the first-generation iPad mini.
 * Every callback has the form callback(error, result). Loading this file never
 * writes. Only an explicit assign(profile, content, callback) call can write.
 * Endpoints/partial update semantics: TeddyCloud src/handler_api.c.
 */
(function (root) {
    'use strict';

    var activeAssignments = {};
    var catalogModels = Object.create(null);
    var catalogSystemModels = Object.create(null);
    var catalogAudioKinds = Object.create(null);
    var catalogAges = Object.create(null);
    var TIMEOUT = 15000;
    var MAX_DIRECTORIES = 500;

    function problem(code, message) {
        var error = new Error(message);
        error.code = code;
        return error;
    }

    function fail(callback, code, message) {
        root.setTimeout(function () { callback(problem(code, message)); }, 0);
    }

    function utf8Length(value) {
        try { return encodeURIComponent(value).replace(/%[0-9A-F]{2}|[^%]/g, 'x').length; }
        catch (error) { return Infinity; }
    }

    function cleanPath(value) {
        var parts, i;
        if (typeof value !== 'string' || /[\\\x00-\x1f\x7f]/.test(value)) { return null; }
        parts = value.split('/');
        for (i = 0; i < parts.length; i += 1) {
            if (parts[i] === '.' || parts[i] === '..') { return null; }
        }
        return parts.filter(function (part) { return part !== ''; }).join('/');
    }

    function normalizeSource(value) {
        var match, path, source;
        if (typeof value !== 'string') { return null; }
        match = /^(lib|content):\/\/(.*)$/.exec(value);
        if (!match) { return null; }
        path = cleanPath(match[2]);
        if (!path) { return null; }
        if (match[1] === 'lib' && !/\.taf$/i.test(path)) { return null; }
        if (match[1] === 'content' && !/^[0-9a-f]{8}\/[0-9a-f]{8}$/i.test(path)) { return null; }
        source = match[1] + '://' + (match[1] === 'content' ? path.toUpperCase() : path);
        return utf8Length(source) < 256 ? source : null;
    }

    function validRuid(value) {
        return typeof value === 'string' && /^[0-9a-f]{16}$/i.test(value) && !/^0000000/.test(value);
    }

    function normalizeOverlay(value) {
        if (value === null || typeof value === 'undefined' || value === '') { return ''; }
        return typeof value === 'string' && /^[a-z0-9_-]{1,15}$/i.test(value) ? value : null;
    }

    function withQuery(path, values) {
        var pairs = [], key;
        for (key in values) {
            if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== '') {
                pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(values[key]));
            }
        }
        pairs.push('_t=' + new Date().getTime());
        return path + (path.indexOf('?') < 0 ? '?' : '&') + pairs.join('&');
    }

    function request(method, path, body, parseJson, callback) {
        var xhr = new root.XMLHttpRequest();
        var completed = false;
        function finish(error, result) {
            if (completed) { return; }
            completed = true;
            callback(error, result);
        }
        xhr.open(method, path, true);
        xhr.timeout = TIMEOUT;
        xhr.setRequestHeader('Accept', parseJson ? 'application/json' : 'text/plain');
        if (body !== null) { xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8'); }
        xhr.onload = function () {
            var result = xhr.responseText;
            if (xhr.status < 200 || xhr.status >= 300) {
                var error = problem('HTTP', 'TeddyCloud meldet einen Fehler (' + xhr.status + ').');
                error.status = xhr.status;
                finish(error);
                return;
            }
            if (parseJson) {
                try { result = JSON.parse(result); }
                catch (error) { finish(problem('INVALID_JSON', 'Die Antwort von TeddyCloud konnte nicht gelesen werden.')); return; }
            }
            finish(null, result);
        };
        xhr.onerror = function () { finish(problem('NETWORK', 'TeddyCloud ist gerade nicht erreichbar.')); };
        xhr.ontimeout = function () { finish(problem('TIMEOUT', 'TeddyCloud antwortet nicht. Bitte die Verbindung prüfen.')); };
        xhr.onabort = function () { finish(problem('ABORTED', 'Die Anfrage wurde abgebrochen.')); };
        try { xhr.send(body); }
        catch (error) { finish(problem('NETWORK', 'Die Anfrage an TeddyCloud konnte nicht gesendet werden.')); }
        return xhr;
    }

    function localCover(value) {
        var origin, path;
        if (typeof value !== 'string' || /[\\\x00-\x1f\x7f]/.test(value)) { return ''; }
        origin = root.location ? root.location.protocol + '//' + root.location.host : '';
        path = value;
        if (origin && path.indexOf(origin + '/') === 0) { path = path.slice(origin.length); }
        return /^\/(?!\/)/.test(path) ? path : '';
    }

    function normalizeModel(value) {
        if (typeof value === 'string') { return value.replace(/^\s+|\s+$/g, ''); }
        if (typeof value === 'number' && isFinite(value)) { return String(value); }
        return '';
    }

    function normalizeCategory(value) {
        return typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '').toLowerCase() : '';
    }

    function normalizeAge(value) {
        if (typeof value === 'string') {
            value = value.replace(/^\s+|\s+$/g, '');
            if (!/^[0-9]+$/.test(value)) { return null; }
            value = Number(value);
        }
        // The source catalog uses 99 for unknown. Other out-of-range values
        // cannot be treated as children's age recommendations either.
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 18 ? value : null;
    }

    function metadataAge(info) {
        var age = normalizeAge(info.age);
        var key = '$' + normalizeModel(info.model);
        if (Object.prototype.hasOwnProperty.call(info, 'age')) { return age; }
        return Object.prototype.hasOwnProperty.call(catalogAges, key) ? catalogAges[key] : null;
    }

    function normalizeAudioId(value) {
        if (typeof value === 'string') {
            value = value.replace(/^\s+|\s+$/g, '');
            if (!/^[0-9]+$/.test(value)) { return null; }
            value = Number(value);
        }
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 1 && value <= 4294967295 ? value : null;
    }

    function normalizeSha1Hash(value) {
        if (typeof value !== 'string') { return ''; }
        value = value.replace(/^\s+|\s+$/g, '').toLowerCase();
        return /^[0-9a-f]{40}$/.test(value) && !/^0{40}$/.test(value) ? value : '';
    }

    function contentIdentity(content) {
        var audioId = normalizeAudioId(content && content.audioId);
        var hash = normalizeSha1Hash(content && content.sha1Hash);
        return audioId !== null && hash ? 'audio:' + audioId + ':' + hash : null;
    }

    function contentKind(content) {
        var model = normalizeModel(content && content.model);
        var identity = contentIdentity(content);
        var recognized = model && catalogModels['$' + model] === true;
        return (recognized || identity && catalogAudioKinds['$' + identity] === 'tonie') && !isSystemContent(content) ? 'tonie' : 'taf';
    }

    function isSystemContent(content) {
        content = content || {};
        var model = normalizeModel(content.model);
        var identity = contentIdentity(content);
        var audioKind = identity && catalogAudioKinds['$' + identity];
        return /^box-/i.test(model) || catalogSystemModels['$' + model] === true || normalizeCategory(content.category) === 'system' || audioKind === 'system' || audioKind === 'ambiguous';
    }

    function loadCatalog(callback) {
        request('GET', withQuery('/api/toniesJson', {}), null, true, function (error, data) {
            var models = Object.create(null), systemModels = Object.create(null), audioKinds = Object.create(null), ages = Object.create(null), suppliedAges = Object.create(null), modelCount = 0, systemModelCount = 0, audioIdentityCount = 0;
            if (error) { callback(error); return; }
            if (!Array.isArray(data)) { callback(problem('INVALID_CATALOG', 'TeddyCloud liefert keinen gültigen Tonie-Katalog.')); return; }
            data.forEach(function (entry) {
                var model, key, age, system, audioIds, hashes, pairCount, i, identity, identityKey, kind;
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { return; }
                model = normalizeModel(entry.model);
                if (!model) { return; }
                key = '$' + model;
                age = normalizeAge(entry.age);
                if (Object.prototype.hasOwnProperty.call(entry, 'age')) { suppliedAges[key] = true; }
                // Multiple editions can share a model. A disagreement or an
                // unknown edition must not become a guessed minimum age.
                if (!Object.prototype.hasOwnProperty.call(ages, key)) { ages[key] = age; }
                else if (ages[key] !== age) { ages[key] = null; }
                if (models[key] !== true) { models[key] = true; modelCount += 1; }
                system = /^box-/i.test(model) || normalizeCategory(entry.category) === 'system';
                if (system && systemModels[key] !== true) {
                    systemModels[key] = true;
                    systemModelCount += 1;
                }
                audioIds = Array.isArray(entry.audio_id) ? entry.audio_id : entry.audio_id == null ? [] : [entry.audio_id];
                hashes = Array.isArray(entry.hash) ? entry.hash : entry.hash == null ? [] : [entry.hash];
                pairCount = Math.min(audioIds.length, hashes.length);
                kind = system ? 'system' : 'tonie';
                for (i = 0; i < pairCount; i += 1) {
                    identity = contentIdentity({ audioId: audioIds[i], sha1Hash: hashes[i] });
                    if (!identity) { continue; }
                    identityKey = '$' + identity;
                    if (!audioKinds[identityKey]) { audioKinds[identityKey] = kind; audioIdentityCount += 1; }
                    else if (audioKinds[identityKey] !== kind) { audioKinds[identityKey] = 'ambiguous'; }
                }
            });
            if (!modelCount) { callback(problem('INVALID_CATALOG', 'Der Tonie-Katalog enthält keine verwendbaren Modelle.')); return; }
            // Replace the index only after a complete, successful read. This
            // describes catalog membership, not the authenticity of an audio file.
            // TeddyCloud's current compact catalog omits age. Ship the factual
            // model/age mapping locally so children's browsers remain offline
            // from third-party services. An unavailable map leaves ages unknown.
            request('GET', withQuery('assets/ages.json', {}), null, true, function (ageError, ageData) {
                var bundled = ageData && ageData.version === 1 && ageData.models;
                var ageDataAvailable = !ageError && bundled && typeof bundled === 'object' && !Array.isArray(bundled);
                var model, key;
                if (ageDataAvailable) {
                    for (model in bundled) {
                        if (Object.prototype.hasOwnProperty.call(bundled, model)) {
                            key = '$' + normalizeModel(model);
                            if (suppliedAges[key] !== true) {
                                ages[key] = normalizeAge(bundled[model]);
                            }
                        }
                    }
                }
                catalogModels = models;
                catalogSystemModels = systemModels;
                catalogAudioKinds = audioKinds;
                catalogAges = ages;
                callback(null, { modelCount: modelCount, systemModelCount: systemModelCount, audioIdentityCount: audioIdentityCount, ageDataAvailable: !!ageDataAvailable });
            });
        });
    }

    function metadata(info, fallback) {
        info = info || {};
        return {
            title: info.episode || info.title || info.series || fallback,
            series: info.series || '',
            cover: localCover(info.picture || info.pic),
            model: normalizeModel(info.model),
            ageMin: metadataAge(info),
            category: typeof info.category === 'string' ? info.category.replace(/^\s+|\s+$/g, '') : '',
            language: info.language || ''
        };
    }

    function tagContent(tag, overlay) {
        var source = tag.source || '';
        // A mapped file is separate from the physical figure. Missing source
        // metadata must not turn that file into the figure's original content.
        var result = metadata(tag.sourceInfo || (source ? null : tag.tonieInfo), 'Unbekannter Inhalt');
        if (!source) {
            source = 'content://' + tag.ruid.slice(0, 8).toUpperCase() + '/' + tag.ruid.slice(8).toUpperCase();
        }
        source = normalizeSource(source);
        result.id = source || 'unavailable:' + tag.ruid;
        result.kind = contentKind(result);
        result.source = source;
        result.overlay = overlay || null;
        result.available = !!source && tag.exists === true && tag.valid === true && tag.hide !== true && !isSystemContent(result);
        result.trackCount = Array.isArray(tag.trackSeconds) ? tag.trackSeconds.length : null;
        result.durationSeconds = null;
        return result;
    }

    function normalizeTag(tag, overlay) {
        return {
            ruid: tag.ruid.toLowerCase(),
            overlay: overlay || null,
            figure: metadata(tag.tonieInfo, 'Unbekannte Figur'),
            content: tagContent(tag, overlay),
            source: tag.source || '',
            nocloud: tag.nocloud === true,
            live: tag.live === true,
            hide: tag.hide === true,
            claimed: tag.claimed === true,
            exists: tag.exists === true,
            valid: tag.valid === true
        };
    }

    function listTags(callback, overlay) {
        overlay = normalizeOverlay(overlay);
        if (overlay === null) { fail(callback, 'INVALID_OVERLAY', 'Die Box-Zuordnung ist ungültig.'); return; }
        request('GET', withQuery('/api/getTagIndex', { overlay: overlay }), null, true, function (error, data) {
            if (error) { callback(error); return; }
            if (!data || !Array.isArray(data.tags)) { callback(problem('INVALID_RESPONSE', 'TeddyCloud liefert keine Figurenliste.')); return; }
            callback(null, data.tags.filter(function (tag) {
                return tag && validRuid(tag.ruid) && tag.type !== 'system';
            }).map(function (tag) { return normalizeTag(tag, overlay); }));
        });
    }

    function listBoxes(callback) {
        request('GET', withQuery('/api/getBoxes', {}), null, true, function (error, data) {
            var seen = Object.create(null), boxes = [];
            if (error) { callback(error); return; }
            if (!data || !Array.isArray(data.boxes)) { callback(problem('INVALID_RESPONSE', 'TeddyCloud liefert keine Boxenliste.')); return; }
            data.boxes.forEach(function (box) {
                var id, key, name;
                if (!box || typeof box.ID !== 'string') { return; }
                id = normalizeOverlay(box.ID);
                if (!id) { return; }
                key = '$' + id.toLowerCase();
                if (seen[key]) { return; }
                seen[key] = true;
                name = typeof box.boxName === 'string' ? box.boxName.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 80) : '';
                boxes.push({ id: id, name: name });
            });
            callback(null, boxes);
        });
    }

    function getTag(ruid, overlay, callback) {
        if (typeof overlay === 'function') { callback = overlay; overlay = null; }
        overlay = normalizeOverlay(overlay);
        if (!validRuid(ruid) || overlay === null) { fail(callback, 'INVALID_PROFILE', 'Die Figur oder Box-Zuordnung ist ungültig.'); return; }
        request('GET', withQuery('/api/getTagInfo', { ruid: ruid.toLowerCase(), overlay: overlay }), null, true, function (error, data) {
            var tag = data && data.tagInfo;
            if (error) { callback(error); return; }
            if (!tag || !validRuid(tag.ruid) || tag.ruid.toLowerCase() !== ruid.toLowerCase() || tag.type === 'system' || typeof tag.source !== 'string' || typeof tag.live !== 'boolean' || typeof tag.nocloud !== 'boolean') {
                callback(problem('INVALID_RESPONSE', 'Die Figur konnte nicht eindeutig aus TeddyCloud gelesen werden.'));
                return;
            }
            callback(null, normalizeTag(tag, overlay));
        });
    }

    function listLibrary(path, callback) {
        var directory = cleanPath(typeof path === 'string' ? path : '');
        if (typeof path === 'function') { callback = path; }
        if (directory === null || utf8Length('/' + directory) >= 128) { fail(callback, 'INVALID_PATH', 'Der Bibliothekspfad ist ungültig oder zu lang.'); return; }
        request('GET', withQuery('/api/fileIndexV2', { special: 'library', path: '/' + directory }), null, true, function (error, data) {
            var result = { path: '/' + directory, items: [], directories: [], excludedSources: [] };
            if (error) { callback(error); return; }
            if (!data || !Array.isArray(data.files)) { callback(problem('INVALID_RESPONSE', 'TeddyCloud liefert keine Bibliotheksliste.')); return; }
            data.files.forEach(function (file) {
                var name, fullPath, item, source;
                if (!file || typeof file.name !== 'string') { return; }
                name = file.name;
                if (!name || name.charAt(0) === '.' || /[\/\\\x00-\x1f\x7f]/.test(name)) { return; }
                fullPath = (directory ? directory + '/' : '') + name;
                if (file.isDir) {
                    result.directories.push({ name: name, path: '/' + fullPath });
                    return;
                }
                if (!/\.taf$/i.test(name)) { return; }
                source = normalizeSource('lib://' + fullPath);
                if (!source) { return; }
                if (!file.tafHeader || file.tafHeader.valid !== true || file.hide === true) { result.excludedSources.push(source); return; }
                item = metadata(file.tonieInfo, name.replace(/\.taf$/i, ''));
                if (isSystemContent(item)) { result.excludedSources.push(source); return; }
                item.id = source;
                item.kind = contentKind(item);
                item.source = source;
                item.path = '/' + fullPath;
                item.filename = name;
                if (typeof file.size === 'number' && isFinite(file.size) && file.size >= 0 && Math.floor(file.size) === file.size) {
                    item.sizeBytes = file.size;
                }
                item.available = true;
                item.audioId = normalizeAudioId(file.tafHeader.audioId);
                item.sha1Hash = normalizeSha1Hash(file.tafHeader.sha1Hash);
                item.trackCount = Array.isArray(file.tafHeader.trackSeconds) ? file.tafHeader.trackSeconds.length : null;
                item.durationSeconds = null;
                result.items.push(item);
            });
            callback(null, result);
        });
    }

    function scanLibrary(path, callback) {
        var queue, visited = {}, items = [], seenSources = {}, excludedSources = [], seenExcludedSources = {}, count = 0;
        if (typeof path === 'function') { callback = path; path = '/'; }
        queue = [path || '/'];
        function next() {
            var directory;
            if (!queue.length) { callback(null, { items: items, excludedSources: excludedSources }); return; }
            directory = queue.shift();
            if (visited[directory]) { next(); return; }
            visited[directory] = true;
            count += 1;
            if (count > MAX_DIRECTORIES) { callback(problem('LIBRARY_LIMIT', 'Die Bibliothek enthält zu viele Ordner. Bitte einen kleineren Startordner auswählen.')); return; }
            listLibrary(directory, function (error, result) {
                if (error) { callback(error); return; }
                result.items.forEach(function (item) {
                    if (!seenSources[item.source]) { seenSources[item.source] = true; items.push(item); }
                });
                result.excludedSources.forEach(function (source) {
                    if (!seenExcludedSources[source]) { seenExcludedSources[source] = true; excludedSources.push(source); }
                });
                result.directories.forEach(function (entry) { if (!visited[entry.path]) { queue.push(entry.path); } });
                next();
            });
        }
        next();
    }

    function verifySourceAvailable(source, overlay, callback) {
        var isLibrary = source.indexOf('lib://') === 0;
        var path = source.slice(isLibrary ? 6 : 10);
        var slash = path.lastIndexOf('/');
        var directory = slash < 0 ? '/' : '/' + path.slice(0, slash);
        var filename = path.slice(slash + 1);
        var params = { path: directory };
        if (utf8Length(directory) >= 128) { fail(callback, 'INVALID_PATH', 'Der Bibliotheksordner ist für diese TeddyCloud-Version zu lang.'); return; }
        if (isLibrary) { params.special = 'library'; }
        else { params.overlay = overlay; }
        request('GET', withQuery('/api/fileIndexV2', params), null, true, function (error, result) {
            var found = false;
            if (error) { callback(error); return; }
            if (!result || !Array.isArray(result.files)) { callback(problem('INVALID_RESPONSE', 'Die ausgewählte Audiodatei konnte nicht geprüft werden.')); return; }
            result.files.forEach(function (file) {
                if (file && file.name === filename && !file.isDir && file.hide !== true && file.tafHeader && file.tafHeader.valid === true) { found = true; }
            });
            callback(found ? null : problem('SOURCE_MISSING', 'Diese Geschichte ist nicht mehr verfügbar. Bitte lade die Hörwelt neu.'));
        });
    }

    function assign(profile, content, callback) {
        var overlay = normalizeOverlay(profile && profile.overlay);
        var source = normalizeSource(content && content.source);
        var key;
        if (!profile || !validRuid(profile.ruid) || overlay === null) { fail(callback, 'INVALID_PROFILE', 'Bitte zuerst eine gültige Figur zuordnen.'); return; }
        if (!source || !content || content.available !== true) { fail(callback, 'INVALID_CONTENT', 'Dieser Inhalt ist nicht als lokale TAF verfügbar.'); return; }
        if (source.indexOf('content://') === 0 && normalizeOverlay(content.overlay) !== overlay) { fail(callback, 'OVERLAY_MISMATCH', 'Dieser Inhalt liegt bei einer anderen Box. Bitte eine Datei aus der TAF-Bibliothek auswählen.'); return; }
        key = overlay + ':' + profile.ruid.toLowerCase();
        if (activeAssignments[key]) { fail(callback, 'BUSY', 'Diese Figur wird gerade gespeichert.'); return; }
        activeAssignments[key] = true;
        function finish(error, result) {
            delete activeAssignments[key];
            callback(error, result);
        }
        getTag(profile.ruid, overlay, function (error, before) {
            var body, writePath;
            if (error) { finish(error); return; }
            if (normalizeSource(before.source) === source && before.nocloud && !before.live && before.valid && before.exists) {
                finish(null, { tag: before, source: source, verified: true, unchanged: true });
                return;
            }
            // The backend merges these three fields into its latest content.json.
            // Never send a complete JSON document, model, auth, hide or claimed.
            body = 'source=' + encodeURIComponent(source) + '&nocloud=true&live=false';
            writePath = '/content/json/set/' + profile.ruid.toLowerCase();
            if (overlay) { writePath += '?overlay=' + encodeURIComponent(overlay); }
            // Recheck the actual TAF immediately before writing: the selection
            // may have been open while an adult removed a library file.
            verifySourceAvailable(source, overlay, function (sourceError) {
                if (sourceError) { finish(sourceError); return; }
                request('POST', writePath, body, false, function (writeError) {
                    if (writeError) { writeError.savedMayHaveChanged = true; finish(writeError); return; }
                    getTag(profile.ruid, overlay, function (readError, after) {
                        if (readError) {
                            readError.savedMayHaveChanged = true;
                            readError.message = 'Die Zuordnung wurde gesendet, konnte aber noch nicht bestätigt werden. Bitte die Figur neu laden.';
                            finish(readError);
                            return;
                        }
                        if (normalizeSource(after.source) !== source || !after.nocloud || after.live || !after.valid || !after.exists || (before.figure.model && before.figure.model !== after.figure.model) || before.hide !== after.hide || before.claimed !== after.claimed) {
                            error = problem('VERIFY_FAILED', 'Die gespeicherte Zuordnung stimmt nicht mit der Auswahl überein. Bitte die Figur neu laden.');
                            error.savedMayHaveChanged = true;
                            finish(error);
                            return;
                        }
                        finish(null, { tag: after, source: source, verified: true, unchanged: false });
                    });
                });
            });
        });
    }

    root.TonieHopperAPI = {
        loadCatalog: loadCatalog,
        listBoxes: listBoxes,
        listTags: listTags,
        listLibrary: listLibrary,
        scanLibrary: scanLibrary,
        getTag: getTag,
        assign: assign,
        contentKind: contentKind,
        contentIdentity: contentIdentity,
        isSystemContent: isSystemContent,
        normalizeSource: normalizeSource,
        localCover: localCover
    };
}(window));
