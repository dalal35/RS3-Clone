import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

// Production DOM and rendered geometry, without access to the animation controller.
const readFrame = page => page.evaluate(() => {
  const rect = element => {
    const box = element.getBoundingClientRect();
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return {x:box.x,y:box.y,width:box.width,height:box.height,opacity,transform:getComputedStyle(element).transform};
  };
  const selectors = ['.hero-content','.hero-instrument','.workspace-stage','#showcase-panel','.narrative-thread','.thread-marker','.debrief-marker','.finish-marker'];
  return {
    y:scrollY,progress:Number(getComputedStyle(document.documentElement).getPropertyValue('--lap-progress')),
    chapter:document.documentElement.dataset.chapter,
    image:document.querySelector('#showcase-preview').getAttribute('src'),
    elements:Object.fromEntries(selectors.map(selector=>[selector,rect(document.querySelector(selector))])),
    overflow:document.documentElement.scrollWidth > innerWidth,
  };
});

async function jump(page,y) {
  await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),y);
  // A stable frame matters: no delayed reveal should continue after scroll stops.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect.poll(()=>page.evaluate(target=>Math.abs(scrollY-Math.max(0,Math.min(target,document.documentElement.scrollHeight-innerHeight))),y),{timeout:3000}).toBeLessThan(2);
}

async function chapterPosition(page,selector) {
  return page.locator(selector).evaluate(el=>{
    const rect=el.getBoundingClientRect();
    return Math.min(document.documentElement.scrollHeight-innerHeight,Math.max(0,scrollY+rect.top+(rect.height-innerHeight)/2));
  });
}

function assertFrameMatches(actual,expected,label) {
  assert.equal(actual.chapter,expected.chapter,`${label}: chapter reverses`);
  assert.equal(actual.image,expected.image,`${label}: actual screenshot reverses`);
  assert.ok(Math.abs(actual.progress-expected.progress)<.002,`${label}: shared progress reverses`);
  for(const [selector,frame] of Object.entries(actual.elements)) {
    const previous=expected.elements[selector];
    for(const property of ['x','y','width','height','opacity']) {
      assert.ok(Math.abs(frame[property]-previous[property])<(property==='opacity'?.025:2),`${label}: ${selector} ${property} returns to its scroll-derived value`);
    }
  }
}

async function assertReadable(page,selector) {
  const result=await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();let opacity=1;
    for(let node=el;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
    return {opacity,width:r.width,height:r.height,x:r.x,right:r.right,top:r.top,bottom:r.bottom,viewport:innerWidth,viewHeight:innerHeight};
  });
  assert.ok(result.opacity>=.45,`${selector} retains readable opacity (${result.opacity})`);
  assert.ok(result.width>20&&result.height>10,`${selector} occupies readable space`);
  assert.ok(result.x>=-1&&result.right<=result.viewport+1,`${selector} stays inside viewport horizontally`);
  assert.ok(result.bottom>74&&result.top<result.viewHeight,`${selector} remains in the visible composition`);
}

export async function verifyNarrative({page,browser,url,origin,errors,badRequests,consoleErrors}) {
  const capture=async name=>page.screenshot({path:`test-results/website-narrative-${name}.png`});
  const sources={telemetry:/telemetry.webp$/,advanced:/advanced.webp$/,video:/video.webp$/};
  await expect(page.locator('html')).toHaveAttribute('data-motion-state','active');
  await page.evaluate(()=>window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*.12,behavior:'instant'}));
  await expect.poll(()=>page.locator('html').evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--lap-progress'))),{message:'One shared scroll signal advances when jumping into the narrative'}).toBeGreaterThan(.1);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect.poll(()=>page.locator('html').evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--lap-progress')))).toBeLessThan(.002);
  await expect(page.locator('.narrative-thread')).toHaveCount(1);
  const initial=await readFrame(page);
  assert.ok(Number.isFinite(initial.progress),'Shared scroll progress is numeric');
  assert.equal(initial.chapter,'hero');
  assert.equal(initial.overflow,false);
  await assertReadable(page,'#hero-title');

  const openingEnd=await page.locator('#features').evaluate(el=>scrollY+el.getBoundingClientRect().top);
  let previousOpacity=1,previousTrace=1,previousProgress=0;
  for(let step=1;step<=12;step++) {
    await jump(page,openingEnd*step/12);
    const current=await readFrame(page);
    const trace=await page.locator('.telemetry-primary').evaluate(el=>parseFloat(getComputedStyle(el).strokeDashoffset));
    assert.ok(current.progress>=previousProgress,'Slow forward scroll advances shared progression');
    assert.ok(current.elements['.hero-content'].opacity<=previousOpacity+.005,'Hero typography yields emphasis continuously');
    assert.ok(trace<=previousTrace+.005,`The original hero trace draws as the workspace emerges: step ${step}, ${trace} <= ${previousTrace}`);
    previousOpacity=current.elements['.hero-content'].opacity;previousTrace=trace;previousProgress=current.progress;
  }
  assert.ok(previousOpacity<initial.elements['.hero-content'].opacity-.2,'Hero emphasis transfers visibly to the product');
  await jump(page,0);
  assertFrameMatches(await readFrame(page),initial,'slow-scroll reversal');

  const positions=[];
  for(const feature of Object.keys(sources)) {
    const selector=`[data-story-feature="${feature}"]`;
    const y=await chapterPosition(page,selector);
    await jump(page,y);
    await expect(page.locator('#showcase-preview')).toHaveAttribute('src',sources[feature]);
    await expect(page.locator('html')).toHaveAttribute('data-chapter',feature==='telemetry'?'comparison':feature);
    await assertReadable(page,`${selector} h3`);
    const image=await page.locator('#showcase-preview').boundingBox();
    const copy=await page.locator(`${selector} h3`).boundingBox();
    assert.ok(image.y+image.height>74&&image.y<page.viewportSize().height,'Workspace remains a visible feature anchor');
    const overlapWidth=Math.max(0,Math.min(image.x+image.width,copy.x+copy.width)-Math.max(image.x,copy.x));
    const overlapHeight=Math.max(0,Math.min(image.y+image.height,copy.y+copy.height)-Math.max(image.y,copy.y));
    assert.ok(overlapWidth*overlapHeight<1,'Feature heading does not overlap the product screenshot');
    positions.push({name:feature,y,frame:await readFrame(page)});
    await capture(`desktop-${feature}`);
  }
  // Rapid jumps back through every feature must produce the same composition.
  for(const position of [...positions].reverse()) {
    await jump(page,position.y);
    await expect(page.locator('#showcase-preview')).toHaveAttribute('src',sources[position.name]);
    assertFrameMatches(await readFrame(page),position.frame,position.name);
  }
  await jump(page,0);
  assertFrameMatches(await readFrame(page),initial,'hero');

  const landmarks=[
    ['hero-workspace','.showcase-section'],['feature-comparison','[data-story-feature="telemetry"]'],
    ['feature-advanced','[data-story-feature="advanced"]'],['feature-video','[data-story-feature="video"]'],
    ['workflow','.workflow-section'],['debrief','.insights-section'],['demo','.demo-section'],['finish','.download-section'],
  ];
  // Deliberately offset from each chapter boundary: screenshots document handoffs.
  const handoffs=[];
  for(const [name,selector] of landmarks) {
    const y=await page.locator(selector).evaluate(el=>Math.max(0,scrollY+el.getBoundingClientRect().top-innerHeight*.38));
    await jump(page,y);
    assert.equal((await readFrame(page)).overflow,false,`${name}: no horizontal overflow`);
    handoffs.push({name,y,frame:await readFrame(page)});
    await capture(`desktop-between-${name}`);
  }
  for(const handoff of [...handoffs].reverse()) {
    await jump(page,handoff.y);
    assertFrameMatches(await readFrame(page),handoff.frame,`handoff ${handoff.name}`);
  }
  const middle=positions[1].y;
  await page.locator('#feature-telemetry').focus();
  await page.keyboard.press('Home');
  await jump(page,middle);
  await expect(page.locator('#showcase-preview')).toHaveAttribute('src',sources.telemetry);
  await page.locator('.header-download').focus();
  await expect(page.locator('#showcase-preview')).toHaveAttribute('src',sources.advanced);
  await jump(page,middle);
  const beforeReduction=await readFrame(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('html')).toHaveAttribute('data-motion-state','reduced');
  for(const selector of ['.hero-content','.hero-instrument','.workspace-stage']) {
    assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).transform),'none',`${selector}: live reduced motion clears decorative transforms`);
  }
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  await expect(page.locator('#demo-open')).toBeEnabled();
  await page.locator('#feature-video').click();
  await page.locator('.header-download').focus();
  await expect(page.locator('#showcase-preview')).toHaveAttribute('src',sources.video);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('html')).toHaveAttribute('data-motion-state','active');
  await jump(page,middle);
  assertFrameMatches(await readFrame(page),beforeReduction,'live motion restoration');

  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1280,height:600}]) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-motion-state','active');
    const device=viewport.width<800?`mobile-${viewport.width}`:'short-laptop';
    for(const [name,selector] of landmarks) {
      const y=await chapterPosition(page,selector);
      await jump(page,y);
      assert.equal((await readFrame(page)).overflow,false,`${device} ${name}: no horizontal overflow`);
      if(viewport.width===390)await capture(`${device}-${name}`);
    }
    // A conventional-flow narrow or short viewport must not clip chapter copy.
    for(const selector of ['[data-story-feature="telemetry"] h3','[data-story-feature="advanced"] h3','[data-story-feature="video"] h3','#workflow-title','#demo-title','#download-title']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await assertReadable(page,selector);
    }
  }

  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  noJS.on('pageerror',error=>errors.push(error.message));
  noJS.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  noJS.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)badRequests.push(`${response.status()} ${response.url()}`);});
  await noJS.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await noJS.goto(url);
  for(const selector of ['#hero-title','#features-title','[data-story-feature="telemetry"] h3','[data-story-feature="advanced"] h3','[data-story-feature="video"] h3','#workflow-title','.insights-layout small','#demo-title','#download-title']) {
    await noJS.locator(selector).scrollIntoViewIfNeeded();
    await assertReadable(noJS,selector);
  }
  await expect(noJS.locator('.demo-direct')).toHaveAttribute('href','./demo/index.html');
  await expect(noJS.locator('#mac-download')).toHaveAttribute('href',/aarch64.dmg$/);
  await expect(noJS.locator('#windows-download')).toHaveAttribute('href',/x64-setup.exe$/);
  await noJS.screenshot({path:'test-results/website-narrative-mobile-nojs.png',fullPage:true});
  assert.equal(await noJS.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No-JS content fits mobile');
  await noJS.close();
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url);
}
