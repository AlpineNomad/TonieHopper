(function () {
  'use strict';
  var root = document.getElementById('toniehopper-demo'), screen = document.getElementById('th-screen');
  var api = window.TonieHopperAPI, configAPI = window.TonieHopperConfig, catalog = window.TonieHopperCatalog, figures = window.TonieHopperFigures;
  var profileForm = null;
  var config = configAPI.empty(), draft = null, boxes = [], boxesError = '', tags = [], tagsByOverlay = Object.create(null), boxContentSources = Object.create(null), contents = [], library = [], libraryExcludedSources = [], libraryError = '', loadToken = 0, profileTagLoadToken = 0;
  var state = {page:'loading', child:0, selected:null, shelf:'tonies', maxAge:'', phase:0, tab:'profiles', edit:-1, query:'', busy:false, uncertain:false, error:'', loaded:false, dirty:false, preview:false};
  var collator=null;
  try { if(window.Intl && window.Intl.Collator){collator=new window.Intl.Collator('de',{sensitivity:'base',numeric:true});} } catch(ignore) {}
  var paths = {
    'arrow-left':'M19 12H5m7-7-7 7 7 7', 'arrow-right':'M5 12h14m-7-7 7 7-7 7',
    'home':'m3 10 9-7 9 7v10H3V10m6 10v-7h6v7', 'book':'M3 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-2H3V3m18 0h-6a3 3 0 0 0-3 3m0 15a4 4 0 0 1 4-2h5V3',
    'shapes':'m12 3 5 8H7l5-8M3 15h7v7H3v-7m17 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
    'check':'m5 12 4 4L19 6', 'plus':'M12 5v14M5 12h14', 'music':'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 0s6-4 6 0m11-2c0 4-6 4-6 0s6-4 6 0',
    'sparkles':'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3', 'reload':'M20 11a8 8 0 1 0-2 7m2-15v8h-8',
    'download':'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', 'users':'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 10v-3c0-6 14-6 14 0v3m1-17c6 0 6 7 0 7m1 3c4 0 5 2 5 6',
    'hand':'M9 21 4 13c-1-2 1-3 2-1l2 2V4c0-2 3-2 3 0v6-8c0-2 3-2 3 0v8-6c0-2 3-2 3 0v7-4c0-2 3-2 3 0v8c0 3-2 6-4 6H9'
  };
  function icon(name) { return '<svg class="th-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name] || paths.book)+'"/></svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function compareText(a,b) {
    a=String(a || '');b=String(b || '');
    if(collator){return collator.compare(a,b);}
    function plain(s){return s.toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss');}
    a=plain(a);b=plain(b);return a<b ? -1 : a>b ? 1 : 0;
  }
  function ordered(list,label) { return list.map(function(value,index){return {value:value,index:index};}).sort(function(a,b){return compareText(label(a.value),label(b.value)) || a.index-b.index;}); }
  function contentName(c) {
    return catalog.displayName(c);
  }
  function knownAge(age) {
    return typeof age==='number' && isFinite(age) && age>=0 && age<=99 && Math.floor(age)===age;
  }
  function ageBadge(c) {
    var age=c && c.ageMin,known=knownAge(age);
    var label=known ? 'Empfohlen ab '+age+(age===1 ? ' Jahr' : ' Jahren') : 'Keine Altersangabe';
    return '<span class="th-age-badge'+(known ? '' : ' th-age-unknown')+'" role="img" aria-label="'+esc(label)+'" title="'+esc(label)+'"><span aria-hidden="true">'+(known ? age : '?')+'</span></span>';
  }
  function ageOptions() {
    var maximum=12,html='<option value=""'+(state.maxAge==='' ? ' selected' : '')+'>Alle Altersstufen</option>',i;
    contents.forEach(function(c){var age=c.ageMin;if(knownAge(age) && age>maximum){maximum=age;}});
    for(i=0;i<=maximum;i++){html+='<option value="'+i+'"'+(state.maxAge===String(i) ? ' selected' : '')+'>'+i+(i===1 ? ' Jahr' : ' Jahre')+'</option>';}
    return html;
  }
  function searchText(value) { return String(value || '').toLowerCase().replace(/[–—-]/g,' ').replace(/\s+/g,' ').replace(/^\s+|\s+$/g,''); }
  function compareContent(a,b) { return compareText(contentName(a),contentName(b)) || compareText(contentKey(a),contentKey(b)); }
  function contentMetadata(c,cfg) { var result=clone(c),sources=catalog.sources(c);cfg.library.entries.forEach(function(e){if(sources.indexOf(e.source)>=0){result.title=e.title;result.series=e.series;result.cover=e.cover;}});return result; }
  function draftContent(c) { return contentMetadata(c,draft); }
  function contentHidden(c,cfg) { return catalog.sources(c).some(function(source){return cfg.library.hiddenSources.indexOf(source)>=0;}); }
  function contentAllowed(c,cfg,p) { var sources=catalog.sources(c);return sources.length>0 && sources.every(function(source){return configAPI.allowed(cfg,p,source);}); }
  function contentKey(c) { return c.source+(c.source.indexOf('content://')===0 ? ':'+(c.overlay||'') : ''); }
  function overlayName(value) { return String(value == null ? '' : value).replace(/^\s+|\s+$/g,''); }
  function overlayKey(value) { return '$'+overlayName(value); }
  function validOverlay(value) { value=overlayName(value);return value==='' || /^[a-z0-9_-]{1,15}$/i.test(value); }
  function boxOptions() {
    var selected=overlayName(profileForm && profileForm.overlay),available=false,html='<option value=""'+(selected==='' ? ' selected' : '')+'>Nicht zugeordnet</option>',list=boxes.slice();
    list.forEach(function(box){if(box.id.toLowerCase()===selected.toLowerCase()){available=true;}});
    if(selected && !available){list.push({id:selected,name:'',missing:true});}
    ordered(list,function(box){return box.name || box.id;}).forEach(function(row){var box=row.value,label=box.name ? box.name+' · '+box.id : 'ID: '+box.id;if(box.missing){label+=' (nicht mehr gefunden)';}html+='<option value="'+esc(box.id)+'"'+(box.id.toLowerCase()===selected.toLowerCase() ? ' selected' : '')+'>'+esc(label)+'</option>';});
    return html;
  }
  function rebuildTags() {
    var key;tags=[];
    for(key in tagsByOverlay){if(Object.prototype.hasOwnProperty.call(tagsByOverlay,key)){tags=tags.concat(tagsByOverlay[key]);}}
  }
  function setOverlayTags(overlay,list) { tagsByOverlay[overlayKey(overlay)]=list;rebuildTags(); }
  function figurePool() { return profileForm ? (tagsByOverlay[overlayKey(profileForm.overlay)] || []) : []; }
  function announce(s) { document.getElementById('th-announcer').textContent = s; }
  function cover(url) { return typeof url === 'string' && /^\/(?!\/)/.test(url) && !/[\\\x00-\x1f]/.test(url) ? url : ''; }
  function profileTag(p) { for (var i=0;i<tags.length;i++) { if (tags[i].ruid.toLowerCase() === p.ruid.toLowerCase() && (tags[i].overlay || null) === (p.overlay || null)) { return tags[i]; } } return null; }
  function assignedContent(tag) { var c=tag && tag.content;if(c && c.source){for(var i=0;i<contents.length;i++){if(catalog.sources(contents[i]).indexOf(c.source)>=0 && (c.source.indexOf('content://')!==0 || (contents[i].overlay||null)===(c.overlay||null))){return contents[i];}}}return c; }
  function figure(p, cls) { var t = profileTag(p), url = t && cover(t.figure.cover); return url ? '<img class="'+(cls || '')+'" src="'+esc(url)+'" alt="">' : '<span class="th-figure-placeholder" aria-hidden="true">'+icon('shapes')+'</span>'; }
  function figureKey(t) { return figures.getTagKey(t); }
  function selectedFigure() { var pool=figurePool();if(!profileForm){return null;}for(var i=0;i<pool.length;i++){if(figureKey(pool[i])===profileForm.selectedKey){return pool[i];}}return null; }
  function figureThumbnail(t) { var url=cover(t.figure.cover);return '<span class="th-picker-image">'+(url ? '<img src="'+esc(url)+'" alt="">' : icon('shapes'))+'</span>'; }
  function figureSelection() { var t=selectedFigure();return t ? '<span class="th-picker-check" aria-hidden="true">'+icon('check')+'</span><span>Ausgewählt: <strong>'+esc(contentName(t.figure))+'</strong><small>'+esc(t.ruid)+'</small></span>' : '<span>Noch keine Figur ausgewählt. Tippe auf einen Treffer.</span>'; }
  function figureResults(list) {
    var html='';
    list.forEach(function(row){var t=row.tag,selected=figureKey(t)===profileForm.selectedKey;html+=button('pickFigure',figureThumbnail(t)+'<span class="th-picker-name"><strong>'+esc(contentName(t.figure))+'</strong><small>'+esc(t.ruid)+(t.overlay ? ' · Box '+esc(t.overlay) : '')+'</small></span>'+(selected ? '<span class="th-picker-check" aria-hidden="true">'+icon('check')+'</span>' : ''),'th-figure-choice'+(selected ? ' th-figure-chosen' : ''),'id="th-figure-choice-'+row.index+'" data-index="'+row.index+'" aria-pressed="'+selected+'"');});
    if(html){return html;}
    if(profileForm && profileForm.overlayLoading){return '<p class="th-picker-empty">Die Tonies dieser Box werden geladen …</p>';}
    if(profileForm && profileForm.overlayError){return '<p class="th-picker-empty">'+esc(profileForm.overlayError)+'</p>';}
    return '<p class="th-picker-empty">Keine Figur gefunden. Versuche einen anderen Namen oder eine Kennung.</p>';
  }
  function updateFigureResults() {
    var list=document.getElementById('th-figure-results');if(!list || !profileForm){return;}
    var matches=figures.search(figurePool(),profileForm.query),count=matches.length;
    list.innerHTML=figureResults(matches);
    document.getElementById('th-figure-count').textContent=count+(count===1 ? ' Figur' : ' Figuren');
    document.getElementById('th-figure-selection').innerHTML=figureSelection();
  }
  function loadProfileOverlay() {
    var overlay,token,key;
    if(!profileForm){return;}
    overlay=overlayName(profileForm.overlay);token=++profileTagLoadToken;key=overlayKey(overlay);
    profileForm.overlayError='';
    if(!validOverlay(overlay)){profileForm.overlayLoading=false;profileForm.overlayError='Die Box-Kennung darf höchstens 15 Buchstaben, Zahlen, Bindestriche oder Unterstriche enthalten.';updateFigureResults();return;}
    if(Object.prototype.hasOwnProperty.call(tagsByOverlay,key)){profileForm.overlayLoading=false;updateFigureResults();return;}
    profileForm.overlayLoading=true;updateFigureResults();
    api.listTags(function(error,result){
      if(!profileForm || token!==profileTagLoadToken || overlayName(profileForm.overlay)!==overlay){return;}
      profileForm.overlayLoading=false;
      if(error){profileForm.overlayError='Die Tonies dieser Box konnten nicht geladen werden: '+error.message;updateFigureResults();return;}
      setOverlayTags(overlay,result);rebuildContents();updateFigureResults();
    },overlay);
  }
  function closeProfileEdit() { profileTagLoadToken++;profileForm=null;state.edit=-1; }
  function changeProfileOverlay(value) { var previous;if(!profileForm){return;}previous=overlayName(profileForm.overlay);profileForm.overlay=value;profileForm.overlayError='';if(previous!==overlayName(value)){profileForm.selectedKey='';}profileForm.overlayLoading=validOverlay(value) && !Object.prototype.hasOwnProperty.call(tagsByOverlay,overlayKey(value));updateFigureResults();loadProfileOverlay(); }
  function beginProfileEdit(index) { var p=draft.profiles[index] || {name:'',ruid:'',overlay:null};closeProfileEdit();profileForm={name:p.name,overlay:p.overlay||'',selectedKey:p.ruid ? figureKey(p) : '',query:'',overlayLoading:false,overlayError:''};state.edit=index;state.error='';render();loadProfileOverlay(); }
  function art(c) { var url = cover(c.cover); return url ? '<img src="'+esc(url)+'" alt="">' : '<div class="th-library-example">'+icon('book')+'<span class="th-example-label">Hörgeschichte</span></div>'; }
  function child() { return config.profiles[state.child]; }
  function button(action, label, cls, extra) { return '<button type="button" class="'+(cls || 'th-secondary')+'" data-action="'+action+'" '+(extra || '')+'>'+label+'</button>'; }
  function pageTop(action, label, step) { return '<div class="th-page-top">'+button(action, icon('arrow-left')+esc(label), 'th-back')+'<span class="th-step">'+esc(step)+'</span></div>'; }
  function errorBox(message) { return message ? '<div class="th-error" role="alert">'+esc(message)+'</div>' : ''; }
  function empty(title, text, action, label) { return '<div class="th-empty th-center">'+icon('book')+'<h2>'+esc(title)+'</h2><p>'+esc(text)+'</p>'+(action ? '<div class="th-actions">'+button(action,esc(label),'th-primary')+'</div>' : '')+'</div>'; }
  function rebuildContents() {
    var seen = {}, all = [];
    boxContentSources=Object.create(null);
    libraryExcludedSources.forEach(function (source) { seen[source] = true; });
    // A library source describes the audio file itself, independently of the
    // figure it is currently assigned to. Prefer these metadata when available.
    library.forEach(function (c) { if (c.available && c.source && !seen[contentKey(c)]) { seen[contentKey(c)] = true; all.push(clone(c)); } });
    tags.forEach(function (tag) {
      var key=overlayKey(tag.overlay),available=tag.content && tag.content.available && tag.content.source;
      if(!boxContentSources[key]){boxContentSources[key]=Object.create(null);}
      if(available){catalog.sources(tag.content).forEach(function(source){boxContentSources[key][source]=true;});}
      if(available && !seen[contentKey(tag.content)]) { seen[contentKey(tag.content)] = true; all.push(clone(tag.content)); }
    });
    all.forEach(function (c) { c.kind=api.contentKind(c); });
    contents = catalog.groupContents(all).map(function(c){return contentMetadata(c,config);}).sort(compareContent);
  }
  function contentInProfileBox(c,p) {
    var available=boxContentSources[overlayKey(p && p.overlay)] || Object.create(null);
    return catalog.sources(c).some(function(source){return available[source]===true;});
  }
  function items() {
    var p=child(), query=searchText(state.query);
    return contents.filter(function (c) { return p && contentAllowed(c,config,p) && (c.source.indexOf('content://')!==0 || (c.overlay||null)===(p.overlay||null)) && (state.shelf==='own' ? c.kind==='taf' : c.kind!=='taf' && contentInProfileBox(c,p)) && catalog.matchesMaxAge(c,state.maxAge) && searchText(contentName(c)).indexOf(query)>=0; });
  }
  function home() {
    if (!config.profiles.length) { return empty('Hier beginnt eure Hörwelt.', 'Lege zuerst ein Kind an und wähle seine feste Tonie-Figur aus.', 'parents', 'Jetzt einrichten'); }
    var html='<div class="th-center"><h1 class="th-home-title">Hey! Wer bist du?</h1><p class="th-subtitle">Tippe auf deinen Tonie.</p></div><div class="th-profiles">';
    ordered(config.profiles,function(p){return p.name;}).forEach(function (row) { var p=row.value,i=row.index,t=profileTag(p), c=assignedContent(t);
      html += '<button class="th-profile" type="button" data-action="child" data-index="'+i+'" aria-label="'+esc(p.name)+': Geschichte auswählen"><div class="th-figure-field">'+figure(p,'th-figure-img')+'</div><div class="th-profile-line"><span class="th-profile-name">'+esc(p.name)+'</span><span class="th-arrow">'+icon('arrow-right')+'</span></div><div class="th-assigned">'+(c && cover(c.cover) ? '<img src="'+esc(cover(c.cover))+'" alt="">' : '')+'<div><small>Auf deinem Tonie</small><span>'+esc(c ? contentName(c) : 'Figur gerade nicht gefunden')+'</span></div></div></button>';
    });
    return html+'</div><p class="th-home-note">Deine Figur. Heute eine neue Geschichte!</p><div class="th-help">'+button('preview',icon('hand')+'Box-Trick ansehen','th-quiet')+'</div>';
  }
  function libraryResults() {
    var list=items(),html='<p class="th-results-count" role="status" aria-live="polite">'+list.length+(list.length===1 ? ' Geschichte' : ' Geschichten')+'</p><div class="th-grid">';
    list.forEach(function (c) { html+='<button type="button" class="th-content" data-action="select" data-source="'+esc(c.source)+'"><div class="th-cover">'+art(c)+ageBadge(c)+'</div><span class="th-content-title">'+esc(contentName(c))+'</span></button>'; });
    html+='</div>';
    if (!list.length) { html+=empty('Hier ist noch Platz für Abenteuer.',state.query || state.maxAge!=='' ? 'Für diese Auswahl wurde keine Geschichte gefunden. Ändere die Suche oder wähle alle Altersstufen.' : 'Hier sind gerade keine Geschichten sichtbar. Deine Eltern können die Auswahl prüfen.'); }
    return html;
  }
  function libraryPage() {
    var p=child();
    return pageTop('home','Meine Figur','1 / 3 · Aussuchen')+'<div class="th-library-heading"><h1>Was hörst du heute?</h1>'+button('home',figure(p)+'<span>'+esc(p.name)+'</span>','th-child-chip')+'</div><div class="th-shelves">'+button('shelf',icon('shapes')+'Tonies','th-shelf','data-shelf="tonies" aria-pressed="'+(state.shelf==='tonies')+'"')+button('shelf',icon('book')+'Eigene Hörwelt','th-shelf','data-shelf="own" aria-pressed="'+(state.shelf==='own')+'"')+'</div><div class="th-library-filters"><div class="th-search-field"><label class="th-label" for="th-search">Geschichte suchen</label><input type="search" class="th-input th-search" id="th-search" placeholder="Eine Geschichte suchen …" value="'+esc(state.query)+'"></div><div class="th-age-field"><label class="th-label" for="th-max-age">Alter bis</label><select class="th-input th-age-select" id="th-max-age" aria-describedby="th-age-hint">'+ageOptions()+'</select></div></div><p class="th-age-hint" id="th-age-hint">Zahl im Kreis: empfohlen ab diesem Alter. Ohne Altersangabe (?) nur unter „Alle Altersstufen“.</p><div id="th-results">'+libraryResults()+'</div>';
  }
  function updateLibraryResults() {
    var results=document.getElementById('th-results');
    if(state.page==='library' && results){results.innerHTML=libraryResults();}
  }
  function confirm() {
    var p=child(), c=state.selected;
    return pageTop('library','Andere Geschichte','2 / 3 · Zuordnen')+'<div class="th-center"><h1>Die kommt auf deinen Tonie!</h1></div><div class="th-transfer"><div class="th-transfer-tile"><div class="th-transfer-image">'+art(c)+'</div><strong>'+esc(contentName(c))+'</strong><small>Deine neue Geschichte</small></div><div class="th-transfer-arrow">'+icon('arrow-right')+'</div><div class="th-transfer-tile"><div class="th-transfer-image th-transfer-figure">'+figure(p,'th-figure-img')+'</div><strong>'+esc(p.name)+'s Tonie</strong><small>Deine eigene Figur</small></div></div><div class="th-hint">'+icon('sparkles')+'<span>Danach machen wir deine Box bereit.</span></div>'+errorBox(state.error)+'<div class="th-actions">'+button(state.uncertain ? 'reload' : 'assign',state.uncertain ? 'Aktuellen Stand neu laden' : state.busy ? 'Wird gespeichert …' : 'Ja! Die nehme ich! '+icon('arrow-right'),'th-primary',state.busy ? 'disabled' : '')+'</div>';
  }
  function refresh() {
    var steps=[
      {title:'Tonie runter!',text:'Schalte deine Box ein. Sie braucht eine WLAN-Verbindung. Nimm die Figur herunter.',tag:'Mach deine Box bereit',button:'Die Box ist bereit'},
      {title:'Drück das rechte Ohr.',text:'Greif das rechte Ohr mit Daumen und Zeigefinger. Drück es etwa 3 Sekunden zusammen, bis du den Ton hörst.',tag:'Mit den Fingerspitzen · 3 Sekunden',button:'Ton gehört!'},
      {title:'Warte auf Grün.',text:'Die Box leuchtet zuerst blau. Warte, bis sie dauerhaft grün leuchtet und der nächste Ton kommt.',tag:'Blau heißt: kurz warten',button:'Sie leuchtet grün!'},
      {title:'Tonie wieder drauf!',text:'Jetzt lädt die Box deine Geschichte. Lass die Figur stehen, bis die Box dauerhaft grün leuchtet und ein Ton erklingt.',tag:'Gleich geht’s los!',button:'Los geht’s!'}
    ], s=steps[state.phase];
    return pageTop(state.preview ? 'home' : 'library',state.preview ? 'Zum Start' : 'Zur Hörwelt','3 / 3 · Box-Trick')+'<h1>Mach die Box bereit!</h1><div class="th-refresh-layout"><div class="th-refresh-visual"><div id="th-animation" role="img" aria-label="'+esc(s.title)+'"></div></div><div class="th-refresh-copy"><span class="th-instruction-tag">'+esc(s.tag)+'</span><h2>'+esc(s.title)+'</h2><p>'+esc(s.text)+'</p></div></div><div class="th-dots">'+steps.map(function (s,i) { return button('phase',String(i+1),'th-dot','data-index="'+i+'" aria-label="'+esc(s.title)+'" '+(i===state.phase ? 'aria-current="step"' : '')); }).join('')+'</div><div class="th-actions">'+button('next',esc(s.button)+icon('arrow-right'),'th-primary')+'</div><p class="th-guide-note">Tippe weiter, sobald deine Box so weit ist.</p>';
  }
  function done() { var p=child(); return '<div class="th-center"><div class="th-success-mark">'+icon('music')+'</div><h1>Viel Spaß beim Hören'+(p ? ',<br>'+esc(p.name) : '')+'!</h1><p class="th-subtitle">'+esc(state.selected ? contentName(state.selected) : 'Deine nächste Geschichte wartet schon.')+'</p><div class="th-actions">'+button('home',icon('home')+'Zurück zum Start','th-primary')+'</div><div class="th-actions">'+button('preview','Box-Trick noch einmal ansehen','th-quiet')+'</div></div>'; }
  function parents() {
    var html=pageTop('home','Zur Kinderansicht','Elternbereich')+'<h1>Eure Figuren. Eure Geschichten.</h1><p class="th-subtitle">Verknüpfe jedes Kind mit seiner festen Figur.</p><div class="th-parent-nav">'+button('tab',icon('users')+'Kinder & Figuren','th-shelf','data-tab="profiles" aria-pressed="'+(state.tab==='profiles')+'"')+button('tab',icon('book')+'Geschichten','th-shelf','data-tab="library" aria-pressed="'+(state.tab==='library')+'"')+button('tab',icon('download')+'Konfiguration','th-shelf','data-tab="config" aria-pressed="'+(state.tab==='config')+'"')+'</div>';
    if (state.dirty) { html+='<p class="th-draft-note">Änderungen vorbereitet. Exportiere die Konfiguration, um sie zentral zu übernehmen.</p>'; }
    if (state.tab==='profiles') {
      if (state.edit>=0) {
        var figureMatches=figures.search(figurePool(),profileForm.query),activeOverlay=overlayName(profileForm.overlay);
        html+='<div class="th-form th-profile-form"><div><label class="th-label" for="th-name">Name des Kindes</label><input id="th-name" class="th-input" maxlength="40" placeholder="Zum Beispiel Mia" value="'+esc(profileForm.name)+'"></div><div><label class="th-label" for="th-overlay">Toniebox</label><select id="th-overlay" class="th-input">'+boxOptions()+'</select>'+(boxesError ? '<p class="th-picker-hint">Die Boxenliste konnte nicht geladen werden. Bereits gespeicherte Zuordnungen bleiben erhalten.</p>' : '')+'</div><div class="th-figure-picker"><label class="th-label" for="th-figure">Feste Tonie-Figur</label><input type="search" id="th-figure" class="th-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Name oder Kennung suchen …" value="'+esc(profileForm.query)+'" aria-describedby="th-figure-hint"><p id="th-figure-hint" class="th-picker-hint">'+(activeOverlay ? 'Es werden nur Figuren der Box '+esc(activeOverlay)+' angezeigt.' : 'Ohne Box-Zuordnung werden nur Figuren aus dem Standardbereich angezeigt.')+'</p><div id="th-figure-selection" class="th-figure-selection" role="status">'+figureSelection()+'</div><p id="th-figure-count" class="th-figure-count" role="status" aria-live="polite">'+figureMatches.length+' Figuren</p><div id="th-figure-results" class="th-figure-results" role="group" aria-label="Gefundene Figuren">'+figureResults(figureMatches)+'</div></div></div><div class="th-actions">'+button('saveProfile','Im Entwurf übernehmen','th-primary')+button('cancelEdit','Abbrechen','th-quiet')+'</div>';
      } else {
        if (!draft.profiles.length) { html+=empty('Wer hört mit?', 'Wähle die Figur aus, die dauerhaft zu deinem Kind gehört.'); }
        ordered(draft.profiles,function(p){return p.name;}).forEach(function (row) { var p=row.value,i=row.index,t=profileTag(p); html+='<div class="th-parent-row">'+figure(p)+'<div class="th-grow"><strong>'+esc(p.name)+'</strong><p>'+esc(t ? contentName(t.figure) : p.ruid)+'</p></div>'+button('editProfile','Bearbeiten','th-secondary','data-index="'+i+'"')+button('deleteProfile','Entfernen','th-quiet','data-index="'+i+'"')+'</div>'; });
        html+='<div class="th-actions">'+button('editProfile',icon('plus')+'Kind hinzufügen','th-primary','data-index="'+draft.profiles.length+'"')+'</div>';
      }
    }
    if (state.tab==='library') {
      html+='<p class="th-admin-note">Im Regal Tonies sieht jedes Kind nur Geschichten aus seiner Box beziehungsweise dem Standardbereich. Hier kannst du Geschichten zusätzlich für alle Kinder ausblenden; neue Geschichten sind zunächst sichtbar.</p>'+errorBox(libraryError)+'<div class="th-actions">'+button('reloadLibrary',icon('reload')+'Bibliothek neu einlesen','th-secondary')+'</div><div class="th-approval-list">';
      ordered(contents,function(c){return contentName(draftContent(c));}).forEach(function (row) { var i=row.index,c=draftContent(row.value),checked=contentHidden(c,draft); html+='<div class="th-approval-row'+(checked ? ' th-is-hidden' : '')+'"><label><input type="checkbox" data-hide="'+i+'" aria-label="Für alle Kinder ausblenden: '+esc(contentName(c))+'" '+(checked ? 'checked' : '')+'>'+art(c)+'<span class="th-story-info"><strong>'+esc(contentName(c))+'</strong>'+(c.kind==='taf' ? '<small>Eigene TAF-Bibliothek</small>' : '')+'</span><span class="th-visibility-label">'+(checked ? 'Ausgeblendet' : 'Sichtbar')+'</span></label>'+(c.kind==='taf' ? button('editContent','Titel & Cover','th-quiet','data-index="'+i+'"') : '')+'</div>'; });
      html+='</div>';
      if (!contents.length) { html+=empty('Keine Geschichten gefunden.', 'Prüfe deine TeddyCloud-Bibliothek und lade sie erneut.'); }
    }
    if (state.tab==='config') {
      html+='<div class="th-config-copy"><h2>Zentral gespeichert</h2><p>Kinder und ausgeblendete Geschichten werden in <code>toniehopper.json</code> im Config-Ordner deiner TeddyCloud verwaltet. Änderungen kannst du hier vorbereiten und als Datei exportieren.</p><p>TeddyCloud bietet für diesen Ordner keine Schreibschnittstelle für Plugins. Übernimm die exportierte Datei deshalb mit dem mitgelieferten Installationswerkzeug. Es stellt den neuen Stand für das Plugin bereit. Danach lädst du die Konfiguration hier neu.</p></div><div class="th-actions">'+button('export',icon('download')+'Konfiguration exportieren','th-primary')+button('reload',icon('reload')+'Zentral neu laden','th-secondary')+'</div><label class="th-label th-import-label" for="th-import">Vorhandene Konfiguration als Entwurf öffnen</label><input type="file" id="th-import" accept="application/json,.json"><div id="th-export-area"></div><p class="th-admin-note">Aktiv: '+config.profiles.length+' Kinder, '+contents.filter(function(c){return contentHidden(c,config);}).length+' für alle Kinder ausgeblendete Geschichten. Der Elternbereich hat in dieser ersten Version noch keine PIN-Sperre.</p>';
    }
    return html+errorBox(state.error);
  }
  function fitNames() {
    var names=screen.querySelectorAll('.th-profile-name');
    for (var i=0;i<names.length;i++) { var name=names[i], plate=name.parentNode, arrow=plate.querySelector('.th-arrow'); name.style.fontSize=''; var style=window.getComputedStyle(plate), size=parseFloat(window.getComputedStyle(name).fontSize), width=plate.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-arrow.offsetWidth-16; if (width>0 && name.scrollWidth>width) { name.style.fontSize=Math.floor(size*width/name.scrollWidth)+'px'; } }
  }
  function render(focus) {
    // Keep the search input alive when an asynchronous library read finishes.
    if(!focus && state.page==='library' && document.getElementById('th-results')){updateLibraryResults();return;}
    if (window.TonieHopperAnimation) { window.TonieHopperAnimation.unmount(); }
    var pages={home:home,library:libraryPage,confirm:confirm,refresh:refresh,done:done,parents:parents};
    screen.innerHTML=state.page==='loading' ? empty('Deine Tonies kommen …','Einen kleinen Moment.') : state.page==='error' ? empty('Die Hörwelt ist gerade nicht erreichbar.',state.error,'reload','Noch einmal versuchen') : (pages[state.page] || home)();
    var controls=root.querySelectorAll('.th-header button'); for (var i=0;i<controls.length;i++) { controls[i].disabled=state.busy || !state.loaded; }
    if (state.busy) { var buttons=screen.querySelectorAll('button'); for(i=0;i<buttons.length;i++) { buttons[i].disabled=true; } }
    fitNames();
    if (state.page==='refresh' && window.TonieHopperAnimation) { window.TonieHopperAnimation.mount(document.getElementById('th-animation'),state.phase); }
    if (focus) { screen.focus(); window.scrollTo(0,0); }
  }
  function loadLibrary(callback) {
    var token=loadToken;
    api.scanLibrary(config.library.path,function (error,result) {
      if(token!==loadToken){return;}
      libraryError=error ? 'Die TAF-Bibliothek konnte nicht vollständig gelesen werden: '+error.message : '';
      if(!error){library=result.items || result;libraryExcludedSources=result.excludedSources || [];rebuildContents();}
      if (callback) { callback(error); }
    });
  }
  function loadConfiguredTags(callback) {
    var overlays=[''],seen={'$':true},pending;
    config.profiles.forEach(function(p){var overlay=overlayName(p.overlay),key=overlayKey(overlay);if(!seen[key]){seen[key]=true;overlays.push(overlay);}});
    tagsByOverlay=Object.create(null);tags=[];pending=overlays.slice();
    function next() {
      var overlay;
      if(!pending.length){callback(null);return;}
      overlay=pending.shift();
      api.listTags(function(error,result){
        if(error){error.message=(overlay ? 'Box '+overlay+': ' : 'Standardbereich: ')+error.message;callback(error);return;}
        setOverlayTags(overlay,result);next();
      },overlay);
    }
    next();
  }
  function load() {
    var token=++loadToken;
    closeProfileEdit();
    state.page='loading'; state.loaded=false; state.uncertain=false; state.error=''; render();
    configAPI.load(function (error,c) {
      if(token!==loadToken){return;}
      if (error) { state.page='error';state.error=error.message;render();return; }
      config=c; draft=clone(config); library=[];libraryExcludedSources=[];libraryError='';state.dirty=false;
      boxes=[];boxesError='';
      api.listBoxes(function(boxError,result){
        if(token!==loadToken){return;}
        if(boxError){boxesError=boxError.message;}else{boxes=result;}
        api.loadCatalog(function (error) {
          if(token!==loadToken){return;}
          if (error) { state.page='error';state.error='Der Tonie-Katalog konnte nicht geladen werden. '+error.message;render();return; }
          loadConfiguredTags(function (error) {
            if(token!==loadToken){return;}
            if (error) { state.page='error';state.error=error.message;render();return; }
            loadLibrary(function(error){if(error){state.page='error';state.error=libraryError;}else{state.child=0;state.page='home';state.loaded=true;}render();});
          });
        });
      });
    });
  }
  function findAction(node) { while(node && node!==root) { if(node.getAttribute && node.getAttribute('data-action')) { return node; } node=node.parentNode; } return null; }
  function changePage(page) { state.page=page; state.error=''; render(true); }
  function exportConfig() {
    try {
      var text=JSON.stringify(configAPI.validate(draft),null,2)+'\n';
      var area=document.getElementById('th-export-area');
      area.innerHTML='<p class="th-admin-note">Diese Datei enthält den vorbereiteten Stand. Die aktive Konfiguration wird erst beim Übernehmen auf dem Server geändert.</p><label class="th-label" for="th-export-json">Konfiguration zum Kopieren</label><textarea id="th-export-json" class="th-input th-json" readonly></textarea><p><a class="th-download-link" id="th-download" download="toniehopper.json">toniehopper.json herunterladen</a></p>';
      document.getElementById('th-export-json').value=text;
      var url=window.URL || window.webkitURL;
      if (url && window.Blob && 'download' in document.createElement('a')) { var objectUrl=url.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})); var link=document.getElementById('th-download');link.href=objectUrl;link.onclick=function(){setTimeout(function(){url.revokeObjectURL(objectUrl);},60000);}; }
      else { document.getElementById('th-download').style.display='none'; }
      announce('Konfiguration ist zum Export bereit.');
    } catch(error) { state.error=error.message;render(); }
  }
  function assign() {
    var p=child(), c=state.selected;
    if (state.busy || state.uncertain || !p || !c || !contentAllowed(c,config,p)) { return; }
    state.busy=true;state.error='';render();
    // Re-read central permissions immediately before every real write.
    configAPI.load(function(error,fresh,meta) {
      var current=fresh && fresh.profiles.filter(function(x){return x.id===p.id;})[0];
      if (error || meta && meta.missing || !current || current.ruid!==p.ruid || current.overlay!==p.overlay || !contentAllowed(c,fresh,current)) { state.busy=false;state.error=error ? error.message : 'Die Konfiguration wurde geändert. Bitte lade die Startseite neu.';render();return; }
      api.assign(current,c,function(error,result) {
        state.busy=false;
        if(error) {state.uncertain=!!error.savedMayHaveChanged;state.error=state.uncertain ? 'Die Zuordnung wurde gesendet, aber noch nicht bestätigt. Bitte lade den aktuellen Stand neu, bevor du noch einmal speicherst.' : error.message;render();return;}
        var key=overlayKey(result.tag.overlay),overlayTags=tagsByOverlay[key] || [],found=false;
        overlayTags=overlayTags.map(function(t){if(t.ruid===result.tag.ruid){found=true;return result.tag;}return t;});if(!found){overlayTags.push(result.tag);}setOverlayTags(result.tag.overlay,overlayTags);
        rebuildContents();state.phase=0;state.preview=false;state.page='refresh';announce('Gespeichert. Jetzt machst du deine Box bereit.');render(true);
      });
    });
  }
  root.addEventListener('click',function(event) {
    var b=findAction(event.target);if(!b || b.disabled || state.busy){return;}var a=b.getAttribute('data-action'), i=Number(b.getAttribute('data-index'));
    if (a==='home') { changePage('home');return; }
    if (a==='reload') { if(state.dirty && !window.confirm('Vorbereitete Änderungen verwerfen und den zentralen Stand neu laden?')){return;}load();return; }
    if (!state.loaded) {return;}
    if (a==='parents') {closeProfileEdit();changePage('parents');return;}
    if (a==='tab') {state.tab=b.getAttribute('data-tab');closeProfileEdit();state.error='';render();return;}
    if (a==='child') {state.child=i;state.shelf='tonies';state.query='';state.maxAge='';changePage('library');return;}
    if (a==='library') {changePage('library');return;}
    if (a==='shelf') {state.shelf=b.getAttribute('data-shelf');state.query='';changePage('library');return;}
    if (a==='select') {var source=b.getAttribute('data-source');state.selected=items().filter(function(c){return c.source===source;})[0];if(state.selected){changePage('confirm');}return;}
    if (a==='assign') {assign();return;}
    if (a==='preview') {state.preview=true;state.phase=1;changePage('refresh');return;}
    if (a==='phase') {state.phase=i;render();return;}
    if (a==='next') {if(state.phase<3){state.phase++;render(true);}else{changePage(state.preview?'home':'done');}return;}
    if (a==='editProfile') {beginProfileEdit(i);return;}
    if (a==='pickFigure') {var chosen=figurePool()[i];if(!profileForm || !chosen){return;}profileForm.selectedKey=figureKey(chosen);updateFigureResults();var selectedButton=document.getElementById('th-figure-choice-'+i);if(selectedButton){selectedButton.focus();}return;}
    if (a==='cancelEdit') {closeProfileEdit();state.error='';render();return;}
    if (a==='deleteProfile') {if(window.confirm('Das Profil von '+draft.profiles[i].name+' entfernen? Die Figur und ihre Inhalte bleiben erhalten.')){draft.profiles.splice(i,1);state.dirty=true;render();}return;}
    if (a==='saveProfile') {
      profileForm.name=document.getElementById('th-name').value;profileForm.overlay=document.getElementById('th-overlay').value;
      var name=profileForm.name, overlay=profileForm.overlay.replace(/^\s+|\s+$/g,''), tag=selectedFigure();
      if(!tag){state.error='Bitte tippe eine feste Figur in den Suchergebnissen an.';render();return;}
      var updated=clone(draft), existing=updated.profiles[state.edit];
      updated.profiles[state.edit]={id:existing ? existing.id : 'kind-'+new Date().getTime(),name:name,ruid:tag.ruid,overlay:overlay || null};
      try {draft=configAPI.validate(updated);state.dirty=true;closeProfileEdit();state.error='';}catch(error){state.error=error.message;}render();return;
    }
    if (a==='reloadLibrary') {state.busy=true;render();loadLibrary(function(){state.busy=false;render();});return;}
    if (a==='editContent') {
      var c=draftContent(contents[i]), title=window.prompt('Titel für diese Geschichte',c.title);if(title===null){return;}
      var img=window.prompt('Cover-Pfad auf TeddyCloud (optional, zum Beispiel /cache/bild.png)',c.cover || '');if(img===null){return;}
      var updated=clone(draft), sources=catalog.sources(c);updated.library.entries=updated.library.entries.filter(function(e){return sources.indexOf(e.source)<0;});sources.forEach(function(source){updated.library.entries.push({source:source,title:title,series:c.series,cover:img,kind:'own'});});
      try{draft=configAPI.validate(updated);state.dirty=true;state.error='';}catch(error){state.error=error.message;}render();return;
    }
    if (a==='export') {exportConfig();}
  });
  root.addEventListener('change',function(event) {
    var el=event.target, index=el.getAttribute('data-hide');
    if(el.id==='th-max-age'){state.maxAge=el.value;updateLibraryResults();return;}
    if(el.id==='th-overlay'){changeProfileOverlay(el.value);return;}
    if(index!==null){catalog.sources(contents[Number(index)]).forEach(function(source){var pos=draft.library.hiddenSources.indexOf(source);if(el.checked && pos<0){draft.library.hiddenSources.push(source);}else if(!el.checked && pos>=0){draft.library.hiddenSources.splice(pos,1);}});state.dirty=true;render();}
    if(el.id==='th-import' && el.files && el.files[0]){if(el.files[0].size>1000000){state.error='Die Konfigurationsdatei ist zu groß.';render();return;}var reader=new FileReader();reader.onload=function(){try{draft=configAPI.validate(JSON.parse(reader.result));state.dirty=true;state.error='';}catch(error){state.error='Import fehlgeschlagen: '+error.message;}render();};reader.onerror=function(){state.error='Die Datei konnte nicht gelesen werden.';render();};reader.readAsText(el.files[0]);}
  });
  var searchTimer=null;
  root.addEventListener('input',function(event){var el=event.target;if(el.id==='th-search'){state.query=el.value;clearTimeout(searchTimer);searchTimer=setTimeout(updateLibraryResults,200);}if(profileForm){if(el.id==='th-name'){profileForm.name=el.value;}if(el.id==='th-figure'){profileForm.query=el.value;updateFigureResults();}}});
  root.addEventListener('error',function(event){if(event.target.tagName==='IMG'){var img=event.target;img.style.display='none';if(img.parentNode.className.indexOf('th-figure-field')>=0){var fallback=document.createElement('span');fallback.className='th-figure-placeholder';fallback.innerHTML=icon('shapes');img.parentNode.appendChild(fallback);}}},true);
  window.addEventListener('resize',fitNames);
  window.addEventListener('load',function(){fitNames();setTimeout(fitNames,500);setTimeout(fitNames,1800);});
  if(document.fonts && document.fonts.ready){document.fonts.ready.then(fitNames);}
  load();
}());
