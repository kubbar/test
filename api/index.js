const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  const { channel } = req.query;

  if (!channel || typeof channel !== 'string') {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
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
      }, 60000);
    });

    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const streamingLink = await streamingLinkPromise;
    if (streamingLink) {
      res.status(200).json({ streamingLink });
    } else {
      res.status(404).json({ error: 'No streaming link found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
