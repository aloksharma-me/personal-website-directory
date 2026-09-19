/* Takes a screenshot of every site in js/data.js and saves it as a small WebP in assets/previews/.

   Usage (from scripts/):
     npm install
     npm run screenshots                  # only sites without a screenshot yet
     npm run screenshots -- --force       # redo all of them
     npm run screenshots -- juanmnl.com   # redo specific sites

   Uses your installed Google Chrome (set CHROME_PATH to use another browser). */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/previews');

const VIEWPORT = { width: 1280, height: 800 }; // 16:10, same as the card preview
const SCALE = 0.5;                            // saved at 640×400
const QUALITY = 70;
const CONCURRENCY = 4;
const NAV_TIMEOUT = 25_000;
const SETTLE_MS = 1500;                       // let fonts, fade-ins and intros finish
const BLANK_BYTES = 1200;                     // a single-colour 640×400 WebP is ~1KB
const BLANK_RETRIES = 3;                      // intros and fade-ins: wait and try again
const BLANK_WAIT_MS = 4000;
const SITE_TIMEOUT = 75_000;                  // hard limit per site, so one bad page can't stall a worker

const CHROME_PATH = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Must match previewPath() in js/directory.js.
export function slug(site) {
  return site.toLowerCase().replace(/[^a-z0-9.-]+/g, '_');
}

function loadSites() {
  const code = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  return vm.runInNewContext(`${code}\nSITES_DATA`);
}

async function capture(page, site) {
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  await page.setViewport(VIEWPORT);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  try {
    await page.goto(`https://${site}`, { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 });
  } catch (err) {
    // Pages that never go network-idle (analytics, websockets) have usually rendered anyway.
    if (!/timed? ?out/i.test(err.message)) throw err;
  }
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  let image;
  for (let attempt = 0; attempt <= BLANK_RETRIES; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, BLANK_WAIT_MS));
    image = await page.screenshot({
      type: 'webp',
      quality: QUALITY,
      clip: { x: 0, y: 0, ...VIEWPORT, scale: SCALE }
    });
    if (image.length > BLANK_BYTES) break;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${slug(site)}.webp`), image);
}

function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 30_000,
    args: [
      '--hide-scrollbars',
      '--mute-audio',
      // Background tabs otherwise stop rendering and screenshots hang when running in parallel.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`gave up after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let sites = loadSites().map((s) => s.site);
  if (only.length) sites = sites.filter((s) => only.includes(s));
  else if (!force) sites = sites.filter((s) => !fs.existsSync(path.join(OUT_DIR, `${slug(s)}.webp`)));

  console.log(`Capturing ${sites.length} site(s)…`);

  const failed = [];
  let done = 0;
  const queue = [...sites];

  // Each worker gets its own browser with a single tab: parallel tabs in one headless Chrome
  // get throttled and their screenshots hang.
  async function worker() {
    let browser = await launchBrowser();
    while (queue.length) {
      const site = queue.shift();
      if (!browser.connected) browser = await launchBrowser();
      const page = await browser.newPage();
      try {
        await withTimeout(capture(page, site), SITE_TIMEOUT);
      } catch (err) {
        failed.push(site);
        console.warn(`  ✗ ${site}: ${err.message.split('\n')[0]}`);
      } finally {
        await page.close().catch(() => {});
      }
      done++;
      if (done % 25 === 0 || done === sites.length) console.log(`  ${done}/${sites.length}`);
    }
    await browser.close().catch(() => {});
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Done. ${sites.length - failed.length} saved, ${failed.length} failed.`);
  if (failed.length) console.log(`Failed:\n  ${failed.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
