const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const [w,h,n] of [[412,915,'phone'],[1280,720,'desk']]) { const p = await (await b.newContext({viewport:{width:w,height:h},colorScheme:'dark'})).newPage();
    await p.goto('file://'+process.argv[2]); await p.waitForTimeout(800);
    console.log(n, await p.evaluate(()=>({h:document.documentElement.scrollHeight, ih:innerHeight, sw:document.documentElement.scrollWidth, iw:innerWidth})));
    await p.screenshot({path:process.argv[3]+'/board-'+n+'.png'}); }
  await b.close(); })();
