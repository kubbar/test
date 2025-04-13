const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

app.get('/:channel', async (req, res) => {
  const { channel } = req.params;

  if (!channel || typeof channel !== 'string') {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  let browser = null;
  let streamingLink = null;

  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-extensions'
      ],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      protocolTimeout: 5000 // زيادة الوقت المستغرق لبروتوكول
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000 // زيادة وقت الانتظار لتحميل الصفحة
    });

    const streamingLinkPromise = new Promise((resolve, reject) => {
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8')) {
          resolve(url);
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout while waiting for the streaming link.'));
      }, 60000); // وقت انتهاء المهلة 60 ثانية
    });

    streamingLink = await streamingLinkPromise;

    if (streamingLink) {
      const decodedLink = decodeURIComponent(streamingLink);
      const proxyLink = `https://${req.get('host')}/chunk/proxy/${decodedLink}`;
      res.status(200).json({ streamingLink: proxyLink });
    } else {
      res.status(404).json({ error: 'No streaming link found' });
    }
  } catch (error) {
    console.error('Error in API route:', error);
    res.status(500).json({ error: 'An error occurred while fetching channel data' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/chunk/proxy/*', async (req, res) => {
  const targetUrl = req.url.replace('/chunk/proxy/', '');

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      headers: {
        'Referer': 'https://www.elahmad.com',
      },
    });
    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error in proxy route:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
