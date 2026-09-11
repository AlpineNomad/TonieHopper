/* Offline browser integration: every request is fulfilled locally, never sent to TeddyCloud. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const originalTags = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/tags.json'), 'utf8')).tags;
const expectedOriginalNames = {
  'lib://test/story-1.taf':'Dino Ranch – Mächtig Ärger für Jon & 3 weitere Abenteuer',
  'lib://test/story-2.taf':'Die Unglaublichen – The Incredibles',
  'lib://test/story-3.taf':'Conni auf dem Bauernhof / Conni und das neue Baby',
  'lib://test/story-4.taf':'Furzipups, der Knatterdrache – Furzipups - 3 Geschichten und 6 Songs',
  'lib://test/story-5.taf':'Disney – Dumbo',
  'lib://test/story-6.taf':'Janoschs Emil Grünbär und die Bande – Abenteuer im Wald',
  'lib://test/story-7.taf':'Die Unglaublichen – The Incredibles'
};
const fixtures = path.join(__dirname, 'fixtures');
const plugin = path.join(root, 'plugin/toniehopper');
const artifacts = path.join(root, 'tests/artifacts');
fs.mkdirSync(artifacts, {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ttf':'font/ttf'};
const goodConfig = {version:2,profiles:[
  {id:'tim',name:'Tim',ruid:originalTags[0].ruid,overlay:null},
  {id:'alexandra',name:'Alexandra',ruid:originalTags[1].ruid,overlay:null}
],library:{path:'/',hiddenSources:[],entries:[]}};
const germanTitles=['Äpfel','Auto','Biene','Clown','Dackel','Elefant','Frosch','Giraffe','Ölprinz','Pferd','Überraschung','Zebra'];
const scrambledTitles=['Zebra','Überraschung','Ölprinz','Pferd','Giraffe','Äpfel','Auto','Biene','Clown','Dackel','Elefant','Frosch'];
const extraTags=scrambledTitles.map((title,i)=>{
  const tag=JSON.parse(JSON.stringify(originalTags[2]));
  tag.ruid='e01234567890'+(0xac00+i).toString(16);
  tag.source='lib://test/extra-'+(i+1)+'.taf';
  tag.tonieInfo.episode=title+'-Figur';tag.tonieInfo.series='Testfiguren';tag.tonieInfo.model='figure-'+i;
  tag.sourceInfo=Object.assign({},tag.tonieInfo,{episode:title,series:'Sortiertest',model:'story-'+i});
  return tag;
});
const seriesCases=[
  {series:'Maus',title:'Schlaf schön!',name:'Maus – Schlaf schön!'},
  {series:'Leo Lausemaus',title:'10 – Ein Tag am Meer',name:'Leo Lausemaus – 10 – Ein Tag am Meer'},
  {series:'Bobo Siebenschläfer',title:'Schlaf schön!',name:'Bobo Siebenschläfer – Schlaf schön!'},
  {series:'Leo Lausemaus',title:'2 – Eine Überraschung',name:'Leo Lausemaus – 2 – Eine Überraschung'},
  {series:'Leo Lausemaus',title:'1 – Gute Nacht',name:'Leo Lausemaus – 1 – Gute Nacht'},
  {series:'  Hörzeit  ',title:'  Hörzeit  ',name:'Hörzeit'},
  {series:'',title:'Ohne Reihe',name:'Ohne Reihe'},
  {series:'100% Wolf',title:'100% Wolf',name:'100% Wolf'},
  {series:'Asterix',title:'Asterix der Gallier',name:'Asterix der Gallier'},
  {series:'BEETHOVEN   FÜR Kids',title:'Beethoven für Kids',name:'Beethoven für Kids'},
  {series:'Benjamin Blümchen',title:'Benjamin Blümchen als Ritter',name:'Benjamin Blümchen als Ritter'},
  {series:'Arielle, die Meerjungfrau',title:'Arielle die Meerjungfrau',name:'Arielle die Meerjungfrau'},
  {series:'Wolf',title:'Wolfsabenteuer',name:'Wolf – Wolfsabenteuer'}
];
const expectedSeriesNames=[
  '100% Wolf','Arielle die Meerjungfrau','Asterix der Gallier',
  'Beethoven für Kids','Benjamin Blümchen als Ritter',
  'Bobo Siebenschläfer – Schlaf schön!','Hörzeit',
  'Leo Lausemaus – 1 – Gute Nacht','Leo Lausemaus – 2 – Eine Überraschung','Leo Lausemaus – 10 – Ein Tag am Meer',
  'Maus – Schlaf schön!','Ohne Reihe','Wolf – Wolfsabenteuer'
];
const seriesTags=seriesCases.map((item,i)=>{
  const tag=JSON.parse(JSON.stringify(originalTags[2]));
  tag.ruid='e01234567890'+(0xad00+i).toString(16);tag.source='lib://test/series-'+(i+1)+'.taf';
  tag.tonieInfo.episode=item.title;tag.tonieInfo.series=item.series;tag.tonieInfo.model='series-figure-'+i;
  tag.sourceInfo=Object.assign({},tag.tonieInfo,{model:'series-story-'+i});
  return tag;
});
function storyTitle(tag) {const info=tag.sourceInfo || tag.tonieInfo;return info.episode || info.title || info.series;}
const unknownCatalogModel='custom-family-0001';
let tags, overlayTagSets, boxList, libraryTags, config, postCount, failPost, catalogFailure;
function reset() {tags=JSON.parse(JSON.stringify(originalTags));overlayTagSets=null;boxList=[];libraryTags=JSON.parse(JSON.stringify(originalTags));config=JSON.parse(JSON.stringify(goodConfig));postCount=0;failPost=false;catalogFailure='';}
async function main() {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-webgl']});
  const errors=[];
  const page=await browser.newPage({viewport:{width:768,height:1024},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*', async route => {
    const url=new URL(route.request().url()), p=url.pathname;
    const json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(url.host!=='toniehopper.test'){throw new Error('Unexpected external request: '+url);}
    if(p.endsWith('/config.json')) return json(config);
    if(p==='/api/getBoxes') return json({boxes:boxList});
    if(p==='/api/toniesJson') {
      if(catalogFailure==='http') return route.fulfill({status:503,body:'Unavailable'});
      if(catalogFailure==='invalid') return json({unexpected:'not a catalog array'});
      const models=new Map();
      const catalogTags=overlayTagSets ? Object.values(overlayTagSets).flat() : tags;
      libraryTags.concat(catalogTags).forEach(tag=>{
        [tag.sourceInfo,tag.tonieInfo].forEach(info=>{
          const model=info && String(info.model || '').trim();
          if(model && model!==unknownCatalogModel){models.set(model,Object.assign({},info,{model,category:model.indexOf('box-')===0 ? 'system' : 'tonie'}));}
        });
      });
      return json(Array.from(models.values()));
    }
    if(p==='/api/getTagIndex') {
      const overlay=url.searchParams.get('overlay') || '';
      return json({tags:overlayTagSets ? (overlayTagSets[overlay] || []) : tags});
    }
    if(p==='/api/getTagInfo') {
      const overlay=url.searchParams.get('overlay') || '';
      const availableTags=overlayTagSets ? (overlayTagSets[overlay] || []) : tags;
      return json({tagInfo:availableTags.find(t=>t.ruid===url.searchParams.get('ruid'))});
    }
    if(p==='/api/fileIndexV2') {
      let dir=url.searchParams.get('path');
      let files=dir==='/' ? [{name:'own.taf',isDir:false,tonieInfo:{},tafHeader:{valid:true,audioId:20,trackSeconds:[0,40]}},{name:'test',isDir:true}] : libraryTags.map((t,i)=>({name:t.source.split('/').pop(),isDir:false,tonieInfo:t.sourceInfo || t.tonieInfo,tafHeader:{valid:true,audioId:i+1,trackSeconds:[0,30]}}));
      return json({files});
    }
    if(p.startsWith('/content/json/set/')) {
      postCount++;
      if(failPost) return route.fulfill({status:503,body:'Unavailable'});
      const overlay=url.searchParams.get('overlay') || '';
      const availableTags=overlayTagSets ? (overlayTagSets[overlay] || []) : tags;
      const t=availableTags.find(t=>t.ruid===p.split('/').pop()), body=new URLSearchParams(route.request().postData());
      t.source=body.get('source');t.nocloud=body.get('nocloud')==='true';t.live=body.get('live')==='true';
      const selected=libraryTags.find(tag=>tag.source===t.source);
      if(selected){t.sourceInfo=JSON.parse(JSON.stringify(selected.sourceInfo || selected.tonieInfo));}
      return route.fulfill({status:200,body:'OK'});
    }
    let file=p.startsWith('/cache/') ? path.join(fixtures,path.basename(p)) : path.join(plugin,p.replace('/plugins/toniehopper/',''));
    if(fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    return route.fulfill({status:404,body:'Missing test asset'});
  });
  async function open(){await page.goto('http://toniehopper.test/plugins/toniehopper/index.html');await page.locator('[data-action="parents"]').first().waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action="parents"]').disabled);await page.waitForTimeout(100);}
  function child(name){return page.getByRole('button',{name:name+': Geschichte auswählen',exact:true});}
  function story(source){return page.locator('.th-content[data-source='+JSON.stringify(source)+']');}
  function figureChoice(ruid){return page.locator('#th-figure-results .th-figure-choice').filter({hasText:ruid.toLowerCase()});}
  async function selectFigure(ruid){
    await page.locator('#th-figure').fill(ruid);
    const choice=figureChoice(ruid);
    assert.equal(await choice.count(),1,'The complete physical identifier must identify the target independently of sorting or its model');
    await choice.click();
    assert.equal(await page.locator('#th-figure-selection small').textContent(),ruid.toLowerCase());
  }
  try {
    reset();await open();
    assert.equal(await page.locator('.th-profile').count(),2);
    assert.equal(await child('Tim').locator('.th-assigned span').textContent(),expectedOriginalNames[originalTags[0].source],'The home card shows the complete assigned content name');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#toniehopper-demo')).fontFamily.includes('Nunito')),true);
    await page.screenshot({path:path.join(artifacts,'home-ipad.png'),fullPage:true});
    await child('Alexandra').click();
    assert.equal(await page.locator('.th-content').count(),7,'All seven available Tonie stories are visible by default');
    for(const tag of originalTags){
      assert.equal(await story(tag.source).locator('.th-content-title').textContent(),expectedOriginalNames[tag.source],'The fixture story uses its explicit display name without repeating a series already contained in its title');
    }
    assert.equal(await page.locator('.th-content').evaluateAll(nodes=>nodes.some(node=>node.getAttribute('data-source')==='lib://test/story-7.taf')),true,'New stories need no explicit approval');
    await story(originalTags[2].source).click();
    await page.locator('[data-action="assign"]').click();
    await page.locator('#th-animation canvas').waitFor();
    assert.equal(postCount,1);
    await page.locator('[data-action="phase"][data-index="1"]').click();
    await page.waitForTimeout(1700);
    await page.screenshot({path:path.join(artifacts,'refresh-ipad.png'),fullPage:true});
    await page.locator('[data-action="phase"][data-index="3"]').click();
    await page.locator('[data-action="next"]').click();
    await page.getByRole('heading',{name:/Viel Spaß/}).waitFor();
    assert.equal(await page.locator('#th-screen .th-subtitle').textContent(),expectedOriginalNames[originalTags[2].source],'The completion screen uses the same content name');
    await page.getByRole('button',{name:'Zurück zum Start',exact:true}).click();
    assert.equal(await child('Alexandra').locator('.th-assigned span').textContent(),expectedOriginalNames[originalTags[2].source],'The saved content name is consistent on the home card');

    reset();config.library.hiddenSources=[originalTags[2].source];await open();
    await child('Tim').click();
    const firstChildSources=await page.locator('.th-content').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-source')).sort());
    assert.equal(firstChildSources.length,6);
    assert.equal(firstChildSources.includes(originalTags[2].source),false,'The global exclusion hides the story from Tim');
    await page.locator('[data-action="home"]').first().click();
    await child('Alexandra').click();
    const secondChildSources=await page.locator('.th-content').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-source')).sort());
    assert.deepEqual(secondChildSources,firstChildSources,'The same global exclusion applies to Alexandra');
    assert.equal(postCount,0);

    reset();
    const defaultBoxTags=JSON.parse(JSON.stringify(originalTags.slice(0,2)));
    const nurseryTags=JSON.parse(JSON.stringify(originalTags.slice(2,4)));
    const playroomTags=JSON.parse(JSON.stringify(originalTags.slice(4,6)));
    const freshBoxTags=JSON.parse(JSON.stringify(originalTags.slice(6,7)));
    overlayTagSets={'':defaultBoxTags,'VCU-4L-QNV':nurseryTags,'BOX-2':playroomTags,'FRESH-BOX':freshBoxTags};
    boxList=[{ID:'BOX-2',boxName:'Spielzimmer'},{ID:'VCU-4L-QNV',boxName:'Kinderzimmer'},{ID:'FRESH-BOX',boxName:''}];
    libraryTags=JSON.parse(JSON.stringify(originalTags));
    config={version:2,profiles:[
      {id:'standard',name:'Standardkind',ruid:defaultBoxTags[0].ruid,overlay:null},
      {id:'nursery',name:'Boxkind',ruid:nurseryTags[0].ruid,overlay:'VCU-4L-QNV'},
      {id:'playroom',name:'Spielkind',ruid:playroomTags[0].ruid,overlay:'BOX-2'}
    ],library:{path:'/',hiddenSources:[],entries:[]}};
    await open();
    await child('Boxkind').click();
    assert.deepEqual(await page.locator('.th-content').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-source')).sort()),nurseryTags.map(tag=>tag.source).sort(),'A child with a box ID sees only Tonies from that box overlay');
    await page.locator('[data-action="home"]').first().click();await child('Spielkind').click();
    assert.deepEqual(await page.locator('.th-content').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-source')).sort()),playroomTags.map(tag=>tag.source).sort(),'A different box ID selects its own Tonie inventory');
    await page.locator('[data-action="home"]').first().click();await child('Standardkind').click();
    assert.deepEqual(await page.locator('.th-content').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-source')).sort()),defaultBoxTags.map(tag=>tag.source).sort(),'A child without a box ID uses only the default content area');
    await page.locator('[data-action="parents"]').first().click();
    await page.getByRole('button',{name:'Bearbeiten',exact:true}).nth(0).click();
    assert.deepEqual(await page.locator('#th-overlay option').evaluateAll(options=>options.map(option=>({value:option.value,text:option.textContent}))),[
      {value:'',text:'Nicht zugeordnet'},
      {value:'FRESH-BOX',text:'ID: FRESH-BOX'},
      {value:'VCU-4L-QNV',text:'Kinderzimmer · VCU-4L-QNV'},
      {value:'BOX-2',text:'Spielzimmer · BOX-2'}
    ],'The profile editor lists the unassigned default followed by every TeddyCloud box');
    assert.equal(await page.locator('#th-overlay').inputValue(),'VCU-4L-QNV','The stored box remains selected');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),2,'The profile editor initially shows only figures from the configured box');
    assert.equal(await figureChoice(nurseryTags[0].ruid).count(),1);
    assert.equal(await figureChoice(defaultBoxTags[0].ruid).count(),0);
    await page.locator('#th-overlay').selectOption('FRESH-BOX');await page.waitForTimeout(500);
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),1,'Selecting a previously unconfigured box loads its Tonies on demand');
    assert.equal(await figureChoice(freshBoxTags[0].ruid).count(),1);
    await page.locator('#th-overlay').selectOption('BOX-2');await page.waitForTimeout(500);
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),2,'Changing the selected box switches the figure inventory');
    assert.equal(await figureChoice(playroomTags[0].ruid).count(),1);
    assert.equal(await figureChoice(nurseryTags[0].ruid).count(),0);
    await page.locator('#th-overlay').selectOption('');await page.waitForTimeout(500);
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),2,'Selecting Not assigned restores the default figure inventory');
    assert.equal(await figureChoice(defaultBoxTags[0].ruid).count(),1);
    await page.locator('[data-action="cancelEdit"]').click();
    assert.equal(postCount,0,'Switching box inventories is read-only');

    reset();await open();await child('Tim').click();
    const selectedSource=originalTags[2].source;
    await story(selectedSource).click();
    config.library.hiddenSources=[selectedSource];
    await page.locator('[data-action="assign"]').click();await page.locator('.th-error').waitFor();
    assert.equal(postCount,0,'A newly hidden story is rejected by the fresh config check before POST');
    assert.equal(await page.locator('#th-animation').count(),0);

    reset();failPost=true;await open();await child('Tim').click();await story(originalTags[2].source).click();
    await page.locator('[data-action="assign"]').click();await page.locator('.th-error').waitFor();
    assert.equal(postCount,1);assert.equal(await page.locator('[data-action="assign"]').count(),0,'Uncertain save requires reload');
    assert.equal(await page.locator('#th-animation').count(),0);

    reset();config={version:2,profiles:[],library:{path:'/',hiddenSources:[],entries:[]}};await open();
    await page.getByRole('button',{name:'Jetzt einrichten'}).click();
    await page.locator('[data-action="editProfile"]').click();await page.locator('#th-name').fill('Alexandra');await selectFigure(originalTags[1].ruid);
    await page.locator('[data-action="saveProfile"]').click();await page.getByText('Alexandra',{exact:true}).waitFor();
    await page.locator('[data-tab="library"]').click();
    await page.getByRole('checkbox',{name:'Für alle Kinder ausblenden: '+expectedOriginalNames[originalTags[2].source],exact:true}).check();
    await page.locator('[data-tab="config"]').click();await page.locator('[data-action="export"]').click();
    const exported=JSON.parse(await page.locator('#th-export-json').inputValue());
    assert.equal(exported.version,2);
    assert.equal(exported.profiles[0].name,'Alexandra');
    assert.equal(exported.profiles[0].ruid,originalTags[1].ruid,'Sorting figure options must not change the selected physical target');
    assert.deepEqual(exported.library.hiddenSources,[originalTags[2].source]);
    assert.equal('approvedSources' in exported.library,false);
    assert.equal('allowedSources' in exported.profiles[0],false);
    assert.equal(config.library.hiddenSources.length,0,'Draft exclusions must not become active without central import');
    assert.equal(config.profiles.length,0,'Draft must not become active without central import');assert.equal(postCount,0);
    await page.screenshot({path:path.join(artifacts,'parents-config.png'),fullPage:true});

    reset();
    const missingContentFigure=Object.assign(JSON.parse(JSON.stringify(originalTags[1])),{
      ruid:'e001aabbccdde001',exists:false,valid:false,hide:true,
      tonieInfo:{model:'02-0007',series:'Kreativ-Tonie',episode:'Pirat',picture:originalTags[1].tonieInfo.picture}
    });
    const secondPirate=Object.assign(JSON.parse(JSON.stringify(missingContentFigure)),{ruid:'e001aabbccdde002',exists:true,valid:true,hide:false});
    const noModelFigure=Object.assign(JSON.parse(JSON.stringify(missingContentFigure)),{
      ruid:'e001aabbccdde003',tonieInfo:{series:'Kreativ-Tonie',episode:'Sternchen'}
    });
    const unnamedFigure=Object.assign(JSON.parse(JSON.stringify(missingContentFigure)),{ruid:'e001aabbccdde004',tonieInfo:{}});
    tags=[missingContentFigure,secondPirate,noModelFigure,unnamedFigure];
    config={version:2,profiles:[],library:{path:'/',hiddenSources:[],entries:[]}};
    await open();await page.getByRole('button',{name:'Jetzt einrichten'}).click();
    await page.getByRole('button',{name:'Kind hinzufügen',exact:true}).click();
    const figureSearch=page.locator('#th-figure');
    assert.equal(await figureSearch.getAttribute('type'),'search','Figure selection is a plain search field');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),4,'Physical figures remain selectable regardless of missing, invalid or hidden content and absent models');
    await page.locator('#th-name').fill('Mila');
    const originalFigureSearch=await figureSearch.elementHandle();
    const originalNameInput=await page.locator('#th-name').elementHandle();
    await figureSearch.focus();await page.keyboard.type('Krat',{delay:250});await page.waitForTimeout(300);
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),0);
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-figure') && node===document.activeElement,originalFigureSearch),true,'A no-result search keeps the focused input node');
    await page.keyboard.type('iv',{delay:250});
    await figureSearch.evaluate(node=>node.setSelectionRange(2,2));await page.keyboard.type('e');
    const figureCaret=await page.evaluate(node=>({sameNode:node===document.querySelector('#th-figure'),focused:node===document.activeElement,value:node.value,start:node.selectionStart,end:node.selectionEnd}),originalFigureSearch);
    assert.deepEqual(figureCaret,{sameNode:true,focused:true,value:'Kreativ',start:3,end:3},'Typing after a pause and inserting into the middle preserves the figure search cursor');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),3);
    await figureSearch.fill('KREATIVTONIES');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),3,'The common plural and casing find Kreativ-Tonie figures');
    await figureSearch.fill('STERNCHEN');
    assert.equal(await figureChoice(noModelFigure.ruid).count(),1,'A figure without a model is searchable by its physical name');
    await figureSearch.fill(unnamedFigure.ruid.toUpperCase());
    assert.equal(await figureChoice(unnamedFigure.ruid).count(),1,'A figure without model or name is searchable by the complete identifier');
    await figureSearch.fill('02-0007');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),2,'Two different physical figures with the same model remain separate results');
    await figureSearch.fill('PiRaT');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),2,'Physical name search is case insensitive');
    await figureChoice(missingContentFigure.ruid).click();
    assert.equal(await page.locator('#th-figure-selection small').textContent(),missingContentFigure.ruid,'Unavailable audio does not prevent selecting its physical figure');
    await figureChoice(secondPirate.ruid).click();
    assert.equal(await page.locator('#th-figure-selection small').textContent(),secondPirate.ruid,'The other figure with the same name and model selects its own actual identifier');
    assert.equal(await figureSearch.inputValue(),'PiRaT','Picking a figure preserves the current search');
    assert.equal(await page.locator('#th-name').inputValue(),'Mila','Searching and picking figures preserves the entered child name');
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-name'),originalNameInput),true);
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-figure'),originalFigureSearch),true);
    await figureSearch.fill('Keine Treffer');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),0);
    assert.equal(await page.locator('#th-figure-selection small').textContent(),secondPirate.ruid,'Filtering the chosen figure out of the results retains the explicit selection');
    await originalNameInput.dispose();await originalFigureSearch.dispose();
    await page.locator('[data-action="saveProfile"]').click();await page.getByText('Mila',{exact:true}).waitFor();
    await page.locator('[data-tab="config"]').click();await page.locator('[data-action="export"]').click();
    const figureExport=JSON.parse(await page.locator('#th-export-json').inputValue());
    assert.equal(figureExport.profiles.length,1);
    assert.equal(figureExport.profiles[0].name,'Mila');
    assert.equal(figureExport.profiles[0].ruid,secondPirate.ruid,'Export stores the selected physical identifier, not the first duplicate model or a filtered result index');
    assert.equal(config.profiles.length,0,'The figure draft is not published without central import');
    assert.equal(postCount,0,'Figure search, selection and config export never write a content assignment');

    reset();tags=JSON.parse(JSON.stringify(originalTags.concat(extraTags)));libraryTags=JSON.parse(JSON.stringify(tags));await open();
    await child('Tim').click();
    assert.equal(await page.locator('.th-content').count(),19,'All stories beyond the old nine-card page are present together');
    assert.equal(await page.locator('[data-action="more"], [data-action="previous"]').count(),0,'Browsing uses scrolling, not next/previous pages');
    const childTitles=await page.locator('.th-content-title').allTextContents();
    const germanNames=germanTitles.map(title=>'Sortiertest – '+title);
    assert.deepEqual(childTitles.filter(title=>germanNames.includes(title)),germanNames,'Children see German alphabetical order for the displayed series/title names');
    const zebraSource=extraTags.find(tag=>storyTitle(tag)==='Zebra').source;
    await story(zebraSource).scrollIntoViewIfNeeded();
    assert.equal(await story(zebraSource).isVisible(),true,'The last story can be reached by scrolling');
    assert.ok(await page.evaluate(()=>window.scrollY)>0,'The full story list extends below the initial viewport');

    const search=page.locator('#th-search');
    await search.scrollIntoViewIfNeeded();await search.focus();
    const originalSearch=await search.elementHandle();
    await page.keyboard.type('Fur',{delay:350});await page.waitForTimeout(400);
    assert.equal(await search.inputValue(),'Fur');
    assert.equal(await page.locator('.th-content').count(),1);
    assert.equal(await story(originalTags[3].source).count(),1);
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-search') && node===document.activeElement,originalSearch),true,'Paused typing keeps the original focused input node');
    await page.keyboard.type('pups',{delay:350});await page.waitForTimeout(400);
    assert.equal(await search.inputValue(),'Furpups','Typing continues in the same field after results update');
    assert.equal(await page.locator('.th-content').count(),0);
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-search'),originalSearch),true,'An empty result state must not recreate the search input');
    await search.evaluate(node=>node.setSelectionRange(3,3));
    await page.keyboard.type('zi',{delay:350});await page.waitForTimeout(400);
    const edited=await page.evaluate(node=>({sameNode:node===document.querySelector('#th-search'),focused:node===document.activeElement,value:node.value,start:node.selectionStart,end:node.selectionEnd}),originalSearch);
    assert.deepEqual(edited,{sameNode:true,focused:true,value:'Furzipups',start:5,end:5},'Filtering preserves a caret in the middle while inserting one character at a time');
    assert.equal(await story(originalTags[3].source).count(),1);
    await search.fill('');await page.waitForTimeout(400);
    assert.equal(await page.locator('.th-content').count(),19,'Clearing search restores the complete scrollable list');
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-search'),originalSearch),true);
    await originalSearch.dispose();

    await page.locator('[data-action="parents"]').first().click();
    await page.locator('[data-tab="library"]').click();
    const parentTitles=await page.locator('.th-approval-row label strong').allTextContents();
    assert.deepEqual(parentTitles.filter(title=>germanNames.includes(title)),germanNames,'Parents see the same German alphabetical series/title names');
    assert.equal(await page.locator('[data-hide]').count(),20,'The parent list includes all 19 Tonies and the own TAF');
    await page.locator('[data-tab="profiles"]').click();
    await page.getByRole('button',{name:'Kind hinzufügen',exact:true}).click();
    const optionTitles=await page.locator('#th-figure-results .th-picker-name strong').allTextContents();
    const expectedFigureNames=germanTitles.map(title=>'Testfiguren – '+title+'-Figur');
    const generatedFigures=optionTitles.filter(title=>expectedFigureNames.includes(title));
    assert.deepEqual(generatedFigures,expectedFigureNames,'Figure search results combine series and title and use the same German order');
    await page.locator('[data-action="cancelEdit"]').click();
    assert.equal(postCount,0,'Search, sorting and scrolling never assign content');

    reset();tags=JSON.parse(JSON.stringify(originalTags.concat(seriesTags)));libraryTags=JSON.parse(JSON.stringify(tags));await open();
    await child('Tim').click();
    const combinedChildNames=await page.locator('.th-content-title').allTextContents();
    assert.deepEqual(combinedChildNames.filter(name=>expectedSeriesNames.includes(name)),expectedSeriesNames,'Stories sort by their actual display names; equal episode titles retain missing series and numbered Leo stories stay under L');
    for(let i=0;i<seriesTags.length;i++){
      assert.equal(await story(seriesTags[i].source).locator('.th-content-title').textContent(),seriesCases[i].name,'The full series phrase already in a title is not repeated despite case, whitespace or punctuation differences; partial words do not qualify');
    }
    await page.screenshot({path:path.join(artifacts,'series-names-ipad.png'),fullPage:true});
    await page.locator('#th-search').fill('Maus – Schlaf schön!');await page.waitForTimeout(400);
    assert.equal(await page.locator('.th-content').count(),1,'Search accepts the exact visible series/title name across the separator');
    await story(seriesTags[0].source).click();
    assert.equal(await page.locator('.th-transfer-tile').getByText('Maus – Schlaf schön!',{exact:true}).count(),1,'Confirmation repeats the same series/title name');
    await page.locator('[data-action="parents"]').first().click();await page.locator('[data-tab="library"]').click();
    const combinedParentNames=await page.locator('.th-approval-row label strong').allTextContents();
    assert.deepEqual(combinedParentNames.filter(name=>expectedSeriesNames.includes(name)),expectedSeriesNames,'Parents use the same visible names as their ordering key');
    await page.locator('[data-tab="profiles"]').click();await page.getByRole('button',{name:'Kind hinzufügen',exact:true}).click();
    const combinedFigureNames=await page.locator('#th-figure-results .th-picker-name strong').allTextContents();
    assert.deepEqual(combinedFigureNames.filter(name=>expectedSeriesNames.includes(name)),expectedSeriesNames,'Physical figures also sort by their full visible series/title name');
    await page.locator('[data-action="cancelEdit"]').click();assert.equal(postCount,0);

    reset();
    const aladdin={source:'lib://test/library-only-aladdin.taf',tonieInfo:{model:'10000120',series:'Disney',episode:'Aladdin',picture:originalTags[4].tonieInfo.picture}};
    const titledOwn={source:'lib://test/familienabenteuer.taf',tonieInfo:{model:'   ',series:'Familie',episode:'Das Baumhaus',picture:originalTags[3].tonieInfo.picture}};
    const unknownOwn={source:'lib://test/custom-family.taf',tonieInfo:{model:unknownCatalogModel,series:'Familie',episode:'Meine Aufnahme',picture:originalTags[4].tonieInfo.picture}};
    const boxSystem={source:'lib://test/box-setup.taf',tonieInfo:{model:'box-de-de-01-00000000',series:'Toniebox',episode:'Einrichtung',picture:originalTags[0].tonieInfo.picture}};
    libraryTags=libraryTags.concat([aladdin,titledOwn,unknownOwn,boxSystem]);
    tags[0].source='lib://own.taf';delete tags[0].sourceInfo;
    tags[2].sourceInfo={model:'',series:'Veralteter Tag',episode:'Veralteter Titel',picture:originalTags[0].tonieInfo.picture};
    await open();await child('Tim').click();
    assert.equal(tags.some(tag=>tag.source===aladdin.source),false,'Aladdin exists only in the library, with no matching physical tag');
    assert.equal(await story(aladdin.source).count(),0,'A library-only Tonie is not shown until it belongs to the child’s box content area');
    assert.equal(await story(originalTags[2].source).locator('.th-content-title').textContent(),expectedOriginalNames[originalTags[2].source],'Current library metadata takes precedence over stale title and empty model on a mapped physical tag');
    assert.equal(await story('lib://own.taf').count(),0,'An assigned own file must not inherit the model of Tim’s physical figure');
    assert.equal(await story(titledOwn.source).count(),0,'A title and cover do not make an empty content model a Tonie');
    assert.equal(await story(unknownOwn.source).count(),0,'A nonempty custom model absent from the official catalog is not a Tonie');
    assert.equal(await story(boxSystem.source).count(),0,'Box system audio is excluded despite its nonempty model');
    await page.locator('[data-shelf="own"]').click();
    assert.equal(await story('lib://own.taf').count(),1,'The assigned own file remains available in Eigene Hörwelt');
    assert.equal(await story(titledOwn.source).locator('.th-content-title').textContent(),'Familie – Das Baumhaus');
    assert.equal(await story(titledOwn.source).locator('.th-cover img').getAttribute('src'),titledOwn.tonieInfo.picture,'An own file keeps its supplied cover without changing category');
    assert.equal(await story(unknownOwn.source).locator('.th-content-title').textContent(),'Familie – Meine Aufnahme','Unknown and custom models remain available in Eigene Hörwelt');
    assert.equal(await story(aladdin.source).count(),0);
    assert.equal(await story(boxSystem.source).count(),0,'Box system audio must not leak into Eigene Hörwelt');
    await page.locator('[data-action="parents"]').first().click();await page.locator('[data-tab="library"]').click();
    assert.equal(await page.getByRole('checkbox',{name:'Für alle Kinder ausblenden: Toniebox – Einrichtung',exact:true}).count(),0,'Technical box files are not exposed as configurable children’s stories');

    config.library.entries=[
      {source:aladdin.source,title:'Die Wunderlampe',series:'Lieblingsgeschichten',cover:originalTags[2].tonieInfo.picture,kind:'own'},
      {source:titledOwn.source,title:'Unser neues Baumhaus',series:'Familie',cover:originalTags[4].tonieInfo.picture,kind:'own'}
    ];
    await open();await child('Tim').click();
    assert.equal(await story(aladdin.source).count(),0,'Metadata cannot make a library-only Tonie belong to the child’s box');
    assert.equal(await story(titledOwn.source).count(),0,'Metadata overrides cannot promote an empty-model file into Tonies');
    await page.locator('[data-shelf="own"]').click();
    assert.equal(await story(aladdin.source).count(),0,'The legacy entry kind does not move a modeled Tonie into Eigene Hörwelt');
    assert.equal(await story(titledOwn.source).locator('.th-content-title').textContent(),'Familie – Unser neues Baumhaus');
    assert.equal(await story(titledOwn.source).locator('.th-cover img').getAttribute('src'),config.library.entries[1].cover);
    assert.equal(postCount,0,'Category browsing and metadata overrides never assign content');

    for(const failure of ['http','invalid']) {
      reset();await open();await child('Tim').click();
      assert.equal(await story(originalTags[2].source).count(),1,'The catalog is initially usable before the reload failure');
      await page.locator('[data-action="parents"]').first().click();await page.locator('[data-tab="config"]').click();
      catalogFailure=failure;
      await page.locator('[data-action="reload"]').click();
      await page.getByRole('heading',{name:'Die Hörwelt ist gerade nicht erreichbar.',exact:true}).waitFor();
      assert.match(await page.locator('#th-screen .th-empty p').textContent(),/Tonie-Katalog/,'The failed '+failure+' catalog reload explains why stories are unavailable');
      assert.equal(await page.locator('.th-content, .th-profile, [data-action="assign"]').count(),0,'A failed catalog reload cannot expose stale or misclassified content for assignment');
      assert.equal(postCount,0);
      catalogFailure='';
      await page.getByRole('button',{name:'Noch einmal versuchen',exact:true}).click();
      await child('Tim').waitFor();
      assert.equal(await page.locator('.th-profile').count(),2,'Retrying with a valid catalog restores the child selection');
      assert.equal(postCount,0,'Catalog recovery never changes a figure assignment');
    }

    reset();await page.setViewportSize({width:375,height:812});await open();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.equal(await child('Alexandra').locator('.th-profile-name').evaluate(el=>el.scrollWidth<=el.clientWidth+2),true,'Long name fits');
    await page.screenshot({path:path.join(artifacts,'home-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    process.stdout.write('Browser integration passed: v2 setup/export, box-specific and default Tonie inventories, physical figure search including unavailable and duplicate-model Kreativ-Tonies, preserved profile input and exact identifier export, global exclusions, protected assignments, explicit display names without repeated series and German sorting, 19 scrollable stories, stable search input and middle-caret editing, official-catalog categories and library precedence, category-stable metadata overrides, technical box audio exclusion, catalog reload failures and recovery, 768px and 375px layout. All server responses mocked.\n');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
