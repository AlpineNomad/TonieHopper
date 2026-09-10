/* Read-only smoke check of the installed plugin; non-GET requests are blocked. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
if (!process.argv[2]) {
  console.error('Usage: node tools/check-installed.cjs http://teddycloud.local');
  process.exit(1);
}
const target=new URL(process.argv[2]);
if (!/^https?:$/.test(target.protocol) || target.username || target.password || target.pathname!=='/' || target.search || target.hash) {
  throw new Error('TeddyCloud address must be an HTTP(S) origin without credentials or a subpath.');
}
const base=target.origin;
const output=path.resolve(__dirname,'../.local/installed-check');
fs.mkdirSync(output,{recursive:true,mode:0o700});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-webgl']});
  const page=await browser.newPage({viewport:{width:768,height:1024}}),errors=[],blocked=[],failed=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400){failed.push({status:response.status(),path:new URL(response.url()).pathname});}});
  await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET' || url.origin!==base){blocked.push({method:request.method(),path:url.pathname});return route.abort();}
    return route.continue();
  });
  try{
    await page.goto(base+'/plugins/toniehopper/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.querySelector('[data-action="parents"]').disabled,{},{timeout:20000});
    assert.equal(await page.locator('.th-error').count(),0);
    await page.getByRole('button',{name:'Für Eltern',exact:true}).click();
    await page.locator('[data-action="editProfile"]').last().click();
    const figureSearch=page.locator('#th-figure');
    assert.equal(await figureSearch.getAttribute('type'),'search','Installed figure picker uses a search input');
    const figures=await page.locator('#th-figure-results .th-figure-choice').count();
    assert.ok(figures>0,'Installed plugin reads real figures');
    const identifiers=await page.locator('#th-figure-results .th-picker-name small').allTextContents();
    assert.ok(identifiers.every(value=>/^[0-9a-f]{16}(?: · Box .+)?$/i.test(value)),'Results show full physical identifiers');
    const originalSearch=await figureSearch.elementHandle();
    await figureSearch.fill('kreativ');
    const creativeFigureMatches=await page.locator('#th-figure-results .th-figure-choice').count();
    assert.equal(await page.evaluate(node=>node===document.querySelector('#th-figure'),originalSearch),true,'Filtering preserves the search input');
    await figureSearch.fill('');
    assert.equal(await page.locator('#th-figure-results .th-figure-choice').count(),figures,'Clearing the query restores all physical figures');
    await originalSearch.dispose();
    await page.waitForTimeout(800);
    await page.screenshot({path:path.join(output,'installed-setup.png'),fullPage:true});
    await page.locator('[data-action="cancelEdit"]').click();
    await page.locator('[data-tab="library"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-hide]').length>0,{},{timeout:15000});
    const stories=await page.locator('[data-hide]').count();
    const effectiveConfig=await page.evaluate(()=>new Promise((resolve,reject)=>{
      window.TonieHopperConfig.load((error,config)=>error ? reject(error) : resolve(config));
    }));
    assert.equal(effectiveConfig.version,2,'Installed config is normalized to version 2');
    assert.ok(Array.isArray(effectiveConfig.library.hiddenSources),'Global exclusions are available');
    assert.equal('approvedSources' in effectiveConfig.library,false);
    assert.ok(effectiveConfig.profiles.every(profile=>!('allowedSources' in profile)),'No per-child allowlists remain');
    await page.locator('[data-tab="config"]').click();
    assert.ok(await page.getByRole('button',{name:'Konfiguration exportieren'}).isVisible());
    assert.deepEqual(errors,[]);
    assert.deepEqual(blocked,[]);
    const report={base,checkedAt:new Date().toISOString(),figures,creativeFigureMatches,stories,configVersion:effectiveConfig.version,globallyHiddenSources:effectiveConfig.library.hiddenSources.length,scriptErrors:errors,blockedRequests:blocked,failedGets:failed,mutationRequests:0};
    fs.writeFileSync(path.join(output,'browser-check.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
