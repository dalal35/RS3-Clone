import assert from 'node:assert/strict';

// Sample the actual painted SVG against actual sticky/transformed content. This
// deliberately covers the handoff, not only each settled chapter screenshot.
export async function verifyWorkspaceRoute({page,url}) {
  for (const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await page.locator('html[data-motion-state="active"]').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const bounds=await page.evaluate(()=>({start:document.querySelector('#features').offsetTop-innerHeight*.8,end:document.querySelector('#workflow').offsetTop}));
    const positions=Array.from({length:19},(_,i)=>Math.max(0,bounds.start+(bounds.end-bounds.start)*i/18));
    const frames=new Map();
    for(const [index,y] of [...positions,...positions.slice().reverse()].entries()) {
      await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const result=await page.evaluate(()=>{
        const selectors=['.hero-foot > *','.trace-destination > *','#features .section-heading','.workspace-stage','.feature-details>div','#workflow .section-heading'];
        const boxes=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(el=>({selector,box:el.getBoundingClientRect()})));
        const path=document.querySelector('.signal-route-line');
        const visible=getComputedStyle(path.parentElement).display!=='none';
        const collisions=[];
        if(visible) for(let distance=0;distance<=path.getTotalLength();distance+=2) {
          const p=path.getPointAtLength(distance);
          if(p.y<88||p.y>innerHeight)continue;
          for(const {selector,box} of boxes) if(p.x>box.left-8&&p.x<box.right+8&&p.y>box.top-8&&p.y<box.bottom+8)collisions.push({selector,x:p.x,y:p.y});
        }
        const heading=document.querySelector('#features .section-heading').getBoundingClientRect();
        const stage=document.querySelector('.workspace-stage').getBoundingClientRect();
        const copy=[...document.querySelectorAll('.feature-details>div')].map(el=>el.getBoundingClientRect());
        const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
        return {collisions:collisions.slice(0,2),overlap:Math.max(overlap(heading,stage),...copy.map(box=>overlap(box,stage))),overflow:document.documentElement.scrollWidth>innerWidth,path:getComputedStyle(path).d,visible};
      });
      if(result.collisions.length)await page.screenshot({path:`test-results/workspace-route-collision-${viewport.width}.png`});
      assert.deepEqual(result.collisions,[],`${viewport.width} scroll ${y}: telemetry clears content`);
      assert.equal(result.overlap,0,`${viewport.width} scroll ${y}: workspace clears heading and copy`);
      assert.equal(result.overflow,false,'route does not widen the page');
      if(index<positions.length)frames.set(y,result.path);
      else assert.equal(result.path,frames.get(y),'route reverses exactly after rapid scroll jumps');
      if([2,5,10,18].includes(index))await page.screenshot({path:`test-results/workspace-route-${viewport.width}-${index}.png`});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.signal-route').evaluate(el=>getComputedStyle(el).display),'none');
    assert.equal(await page.locator('.workspace-stage').evaluate(el=>getComputedStyle(el).transform),'none');
    await page.screenshot({path:`test-results/workspace-route-${viewport.width}-reduced.png`});
    await page.emulateMedia({reducedMotion:'no-preference'});
  }
  // Remeasure while sticky, then return to the same viewport and scroll. A route
  // based on the sticky element's current offset drifts on this round trip.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(url);
  await page.locator('html[data-motion-state="active"]').waitFor();
  const y=await page.locator('.workspace-story').evaluate(el=>el.getBoundingClientRect().top+scrollY+300);
  const read=async()=>{
    await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
    return page.locator('.signal-route-line').evaluate(el=>getComputedStyle(el).d);
  };
  const before=await read();
  await page.setViewportSize({width:1280,height:720});
  await read();
  await page.screenshot({path:'test-results/workspace-route-resize-laptop.png'});
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await read(),before,'sticky resize round trip preserves document route');
}
