// server.js
const express = require('express');
const cors = require('cors');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = require('node-fetch');

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
let browser = null;

// ------------------- Start Puppeteer -------------------
async function startBrowser(headless = true) {
  browser = await puppeteerExtra.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,720',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });
  console.log('Browser started (headless=' + headless + ')');
}

// ------------------- Extract M3U8 -------------------
async function extractM3U8(pageUrl) {
  if (!browser) throw new Error('Browser not started');

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9', referer: pageUrl });
  await page.setRequestInterception(false);

  let m3u8Url = null;

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const ct = (response.headers()['content-type'] || '').toLowerCase();
      if (url.endsWith('.m3u8') || ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl')) {
        if (!m3u8Url) m3u8Url = url;
      }
    } catch (e) {}
  });

  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    // on attend un peu pour laisser le player charger
    await new Promise(r => setTimeout(r, 5000));
  } catch (e) {
    console.warn('extractM3U8 goto error:', e.message);
  } finally {
    try { await page.close(); } catch(e){}
  }

  return m3u8Url;
}

// ------------------- /extract -------------------
app.get('/extract', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl) return res.status(400).send('url param manquant');

  try {
    const m3u8Url = await extractM3U8(pageUrl);
    if (!m3u8Url) return res.status(404).send('Aucun flux trouvé');

    // fetch le contenu M3U8
    const resp = await fetch(m3u8Url, { headers: { Referer: pageUrl, 'User-Agent': 'Mozilla/5.0' } });
    if (!resp.ok) return res.status(502).send('Impossible de récupérer la playlist');

    const body = await resp.text();
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(body);

  } catch (err) {
    console.error('Error /extract:', err);
    res.status(500).send('Erreur interne: ' + err.message);
  }
});

// ------------------- Start Server -------------------
startBrowser(true)
  .then(() => app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`)))
  .catch(err => { console.error('Could not start browser:', err); process.exit(1); });

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (browser) await browser.close();
  process.exit();
});
