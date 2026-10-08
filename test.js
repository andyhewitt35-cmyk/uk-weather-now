// usage: node test.js <url> <prefix: local|live>
const { chromium } = require('playwright-core');
const URL_ = process.argv[2] || 'http://127.0.0.1:18933/';
const PRE = process.argv[3] || 'local';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PLACES = {Parbold: [53.5920, -2.7708], Glasgow: [55.8642, -4.2518], London: [51.5074, -0.1278]};
(async () => {
  const b = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true});
  for (const [w, h, name] of [[390, 844, 'mobile'], [1280, 900, 'desktop']]) {
    const ctx = await b.newContext({viewport: {width: w, height: h}, deviceScaleFactor: name === 'mobile' ? 2 : 1, isMobile: name === 'mobile', hasTouch: name === 'mobile',
      permissions: ['geolocation'], geolocation: {latitude: PLACES.Parbold[0], longitude: PLACES.Parbold[1]}, timezoneId: 'Europe/London', locale: 'en-GB'});
    const p = await ctx.newPage(); const errs = [], bad = []; let apiCalls = 0;
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
    p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 120)); if (r.url().includes('open-meteo')) apiCalls++; });
    if (name === 'mobile') { const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8});
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4}); }
    const t0 = Date.now();
    await p.goto(URL_, {waitUntil: 'domcontentloaded'});
    const dcl = Date.now() - t0;
    await p.waitForFunction(() => window.__wx && (window.__wx.overview || window.__wx.overviewError), null, {timeout: 30000});
    const ovT = Date.now() - t0;
    const ov = await p.evaluate(() => window.__wx.overview);
    ok(!!ov && ov.n === 25, `${name}: UK overview loaded in ${ovT} ms (page shell ${dcl} ms): ${ov && ov.dry}/${ov && ov.n} dry`);
    ok(await p.isVisible('#prompt') && !(await p.isVisible('#nowCard')), `${name}: prompt shown, no default location`);
    if (name === 'mobile') await p.screenshot({path: `shots/${PRE}-mobile-default.png`});
    for (const [city, ll] of Object.entries(PLACES)) {
      await ctx.setGeolocation({latitude: ll[0], longitude: ll[1]});
      const seq = await p.evaluate(() => window.__placeSeq || 0); const t1 = Date.now();
      await p.click('#nearBtn');
      await p.waitForFunction(q => (window.__placeSeq || 0) > q, seq, {timeout: 10000});
      await p.waitForFunction(() => window.__wx.here || window.__wx.error, null, {timeout: 30000}); const tHere = Date.now() - t1;
      await p.waitForFunction(() => window.__wx.spots, null, {timeout: 30000}).catch(() => {});
      await p.waitForFunction(() => /your location\)/.test(document.getElementById('placeLine').textContent), null, {timeout: 8000}).catch(() => {});
      await p.waitForTimeout(1500);
      const wx = await p.evaluate(() => ({here: window.__wx.here, spots: window.__wx.spots, radar: window.__wx.radar, key: (document.getElementById('keyLine') || {}).textContent, sun: (document.getElementById('sunLine') || {}).textContent, radarLine: (document.getElementById('radarLine') || {}).textContent, place: document.getElementById('placeLine').textContent}));
      ok(wx.here && wx.key && wx.spots && wx.spots.n > 5, `${name}: Near me ${city} (now card ${tHere} ms) [${wx.place.replace(/ refresh clear/, '')}]\n      KEY: ${wx.key}\n      SUN: ${wx.sun}\n      RADAR: ${wx.radarLine}\n      model ${wx.here && wx.here.model}; spots ${wx.spots && wx.spots.dry}/${wx.spots && wx.spots.n} dry; nearest dry: ${wx.spots && JSON.stringify(wx.spots.nearestDry.slice(0, 2))}`);
      if (city === 'Parbold') { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({path: `shots/${PRE}-${name}-parbold.png`}); }
    }
    // radius
    const n25 = (await p.evaluate(() => window.__wx.spots)).n;
    await p.evaluate(() => { window.__wx.spots = null; }); await p.click('#radBtns button[data-r="100"]');
    await p.waitForFunction(() => window.__wx.spots, null, {timeout: 30000}).catch(() => {});
    const s100 = await p.evaluate(() => window.__wx.spots); ok(s100 && s100.n >= n25, `${name}: radius 100 mi: ${s100 && s100.n} places, ${s100 && s100.dry} dry`);
    // postcode search
    await p.fill('#placeInput', 'WN8 7AA'); const seq = await p.evaluate(() => window.__placeSeq); await p.click('#placeGo');
    await p.waitForFunction(q => window.__placeSeq > q, seq, {timeout: 10000}).catch(() => {});
    await p.waitForFunction(() => window.__wx.here, null, {timeout: 30000});
    ok(/WN8 7AA/.test(await p.textContent('#placeLine')), `${name}: postcode search WN8 7AA -> ${(await p.textContent('#placeLine')).replace(/ refresh clear/, '')}`);
    await p.fill('#placeInput', 'Fort William'); const seq2 = await p.evaluate(() => window.__placeSeq); await p.click('#placeGo');
    await p.waitForFunction(q => window.__placeSeq > q, seq2, {timeout: 10000}).catch(() => {});
    await p.waitForTimeout(500); ok(/Fort William/.test(await p.textContent('#placeLine')), `${name}: town search Fort William -> ${(await p.textContent('#placeLine')).replace(/ refresh clear/, '')}`);
    // timeline + map
    const hrs = await p.$$eval('#tl .hr', t => t.length); ok(hrs === 12, `${name}: 12-hour timeline (${hrs})`);
    await p.waitForFunction(() => window.__wx.spots, null, {timeout: 30000}).catch(() => {});
    await p.locator('#mapCard').scrollIntoViewIfNeeded(); await p.waitForTimeout(3000);
    const mk = await p.evaluate(() => window.__wx.mapMarkers); const radarImgs = await p.$$eval('img.leaflet-tile', t => t.filter(i => i.src.includes('rainviewer')).length);
    ok(mk > 0 && radarImgs > 0, `${name}: map ${mk} markers, ${radarImgs} radar tiles; slider ${await p.textContent('#radarTime')}`);
    await p.click('#playBtn'); await p.waitForTimeout(1600); const rt = await p.textContent('#radarTime'); await p.click('#playBtn');
    ok(/Radar \d\d:\d\d/.test(rt), `${name}: radar timeline plays (${rt})`);
    await p.screenshot({path: `shots/${PRE}-${name}-map.png`});
    // remembered location
    await p.reload({waitUntil: 'domcontentloaded'}); await p.waitForFunction(() => window.__wx.here, null, {timeout: 30000});
    ok(/last used/.test(await p.textContent('#placeLine')), `${name}: last location remembered`);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
    if (name === 'mobile') { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 392, `mobile: no sideways scroll (${sw})`); }
    ok(errs.length === 0, `${name}: no console errors ${errs.join(' | ')}`);
    ok(bad.length === 0, `${name}: no failed requests ${bad.join(' | ')}`);
    console.log(`  ${name}: Open-Meteo requests this session: ${apiCalls}`);
    await ctx.close();
    if (name === 'mobile') { console.log('  (pausing 65 s to stay inside Open-Meteo per-minute limit)'); await new Promise(r => setTimeout(r, 65000)); }
  }
  await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
