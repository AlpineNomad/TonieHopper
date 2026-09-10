(function (root) {
  'use strict';
  function cleanString(value, max) { return typeof value === 'string' && value.length <= max; }
  function defaultList(value) { return typeof value === 'undefined' ? [] : value; }
  function utf8Length(value) { try { return encodeURIComponent(value).replace(/%[0-9A-F]{2}|[^%]/g,'x').length; } catch(error) { return Infinity; } }
  function validSource(value) {
    return typeof value === 'string' && !!root.TonieHopperAPI &&
      typeof root.TonieHopperAPI.normalizeSource === 'function' && root.TonieHopperAPI.normalizeSource(value) === value;
  }
  function sources(list) {
    if (!Array.isArray(list)) { throw new Error('Die Inhaltsauswahl muss eine Liste sein.'); }
    var seen = {};
    return list.map(function (value) {
      if (!validSource(value) || seen[value]) { throw new Error('Eine Inhaltsquelle ist ungültig oder doppelt.'); }
      seen[value] = true; return value;
    });
  }
  function validate(input) {
    if (!input || (input.version !== 1 && input.version !== 2) || !Array.isArray(input.profiles) || !input.library || typeof input.library !== 'object' || Array.isArray(input.library)) {
      throw new Error('Die Konfigurationsdatei hat nicht das erwartete Format (Version 1 oder 2).');
    }
    var ids = {}, tags = {};
    if (input.profiles.length > 50) { throw new Error('Es sind höchstens 50 Kinderprofile möglich.'); }
    var profiles = input.profiles.map(function (p) {
      if (!p || !cleanString(p.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(p.id) || ids[p.id]) { throw new Error('Jedes Kind benötigt eine eigene Kennung.'); }
      if (!cleanString(p.name, 40) || !p.name.replace(/\s/g, '')) { throw new Error('Bitte einen Namen mit höchstens 40 Zeichen angeben.'); }
      if (!cleanString(p.ruid, 16) || !/^[a-fA-F0-9]{16}$/.test(p.ruid) || /^0000000/.test(p.ruid)) { throw new Error('Eine Figur hat keine gültige rUID.'); }
      var overlay = p.overlay == null || p.overlay === '' ? null : p.overlay;
      if (overlay !== null && (!cleanString(overlay, 15) || !/^[a-zA-Z0-9_-]+$/.test(overlay))) { throw new Error('Die Box-Zuordnung ist ungültig (höchstens 15 Zeichen).'); }
      var key = (overlay || '') + ':' + p.ruid.toLowerCase();
      if (tags[key]) { throw new Error('Diese Figur ist bereits mit einem anderen Kind verknüpft.'); }
      ids[p.id] = true; tags[key] = true;
      // V1 permissions were allowlists. Validate them before migrating, but do
      // not reinterpret them as exclusions or retain per-child restrictions.
      if (input.version === 1) { sources(defaultList(p.allowedSources)); }
      return { id: p.id, name: p.name.replace(/^\s+|\s+$/g, ''), ruid: p.ruid.toLowerCase(), overlay: overlay };
    });
    var lib = input.library, path = typeof lib.path === 'undefined' ? '/' : lib.path;
    if (!cleanString(path, 127) || utf8Length(path)>=128 || path.charAt(0) !== '/' || /(^|\/)\.{1,2}(\/|$)|[\x00-\x1f\\]/.test(path)) { throw new Error('Der Bibliothekspfad ist ungültig.'); }
    var entries = defaultList(lib.entries);
    if (!Array.isArray(entries)) { throw new Error('Die eigenen Inhalte müssen eine Liste sein.'); }
    entries = entries.map(function (e) {
      if (!e || !validSource(e.source) || !cleanString(e.title, 200) || !e.title) { throw new Error('Ein eigener Inhalt benötigt eine gültige Quelle und einen Titel.'); }
      if (e.cover && (!cleanString(e.cover, 1024) || !/^\/(?!\/)/.test(e.cover) || /[\x00-\x1f\\]/.test(e.cover))) { throw new Error('Cover müssen von diesem TeddyCloud-Host stammen.'); }
      return {source:e.source, title:e.title, series:cleanString(e.series, 200) ? e.series : '', cover:e.cover || '', kind:'own'};
    });
    if (input.version === 1) { sources(defaultList(lib.approvedSources)); }
    var hidden = input.version === 1 ? [] : sources(defaultList(lib.hiddenSources));
    return {version:2, profiles:profiles, library:{path:path, hiddenSources:hidden, entries:entries}};
  }
  function empty() { return {version:2, profiles:[], library:{path:'/', hiddenSources:[], entries:[]}}; }
  function load(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'config.json?_=' + new Date().getTime(), true); xhr.timeout = 15000;
    xhr.onload = function () {
      if (xhr.status === 404) { callback(null, empty(), {missing:true}); return; }
      if (xhr.status < 200 || xhr.status >= 300) { callback(new Error('Die zentrale Konfiguration konnte nicht geladen werden.')); return; }
      var data;
      try { data=validate(JSON.parse(xhr.responseText)); } catch (error) { callback(error);return; }
      callback(null,data,{missing:false});
    };
    xhr.onerror = xhr.ontimeout = function () { callback(new Error('Die zentrale Konfiguration ist gerade nicht erreichbar.')); };
    xhr.send(null);
  }
  function allowed(config, profile, source) {
    if (!config || config.version !== 2 || !Array.isArray(config.profiles) || !config.library ||
      !Array.isArray(config.library.hiddenSources) || !profile || !validSource(source)) { return false; }
    if (!cleanString(profile.id,64) || !/^[a-zA-Z0-9_-]+$/.test(profile.id) ||
      !cleanString(profile.ruid,16) || !/^[a-fA-F0-9]{16}$/.test(profile.ruid) || /^0000000/.test(profile.ruid)) { return false; }
    var registered = config.profiles.some(function (p) {
      return p && p.id === profile.id && p.ruid === profile.ruid && (p.overlay || null) === (profile.overlay || null);
    });
    return registered && config.library.hiddenSources.every(validSource) && config.library.hiddenSources.indexOf(source) < 0;
  }
  root.TonieHopperConfig = {validate:validate, load:load, empty:empty, allowed:allowed};
}(typeof window !== 'undefined' ? window : this));
