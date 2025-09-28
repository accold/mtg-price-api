const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Keep browser alive and pre-create pages
let browserInstance = null;
let pagePool = [];

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    });
    
    // Pre-create 3 pages for instant use
    for (let i = 0; i < 3; i++) {
      const page = await browserInstance.newPage();
      pagePool.push(page);
    }
    console.log('Browser ready with page pool');
  }
  return browserInstance;
}

function getPage() {
  if (pagePool.length > 0) {
    return pagePool.pop();
  }
  return browserInstance.newPage();
}

function returnPage(page) {
  if (pagePool.length < 3) {
    pagePool.push(page);
  } else {
    page.close();
  }
}

// Aggressive cache - 2 minutes
const cache = new Map();

function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Ultra-fast scraper - optimized for Nightbot's timeout
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 120000) { // 2 min cache
      return cached.result.replace("Streamer", chatUser);
    }
  }

  let page;
  try {
    await getBrowser(); // Ensure browser is ready
    page = await getPage();

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchTerm)}&view=grid`;
    
    // Ultra aggressive timeouts for Nightbot
    await page.goto(searchUrl, { 
      waitUntil: "domcontentloaded", 
      timeout: 4000 
    });

    // Wait just 1 second for JS to render
    await page.waitForTimeout(1000);
    
    // Try the most likely selectors first
    const quickSelectors = [
      '#app a > section',
      '.marketplace__content a section',
      '.product-card__product'
    ];
    
    let foundSelector = null;
    for (const selector of quickSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        foundSelector = selector;
        console.log(`Quick found: ${selector} (${elements.length} items)`);
        break;
      }
    }
    
    if (!foundSelector) {
      throw new Error('No products found quickly');
    }

    // Get just first 5 results for speed
    const products = await page.$$eval(
      foundSelector,
      (cards) =>
        cards.slice(0, 5).map((el) => {
          const titleEl = el.querySelector(".product-card__title, span[class*='title'], h3, h4");
          const priceEl = el.querySelector(".product-card__market-price--value, .market-price, .price");
          const setEl = el.querySelector(".product-card__set-name__variant, .set-name");

          const title = titleEl ? titleEl.innerText.trim() : "";
          const market = priceEl ? priceEl.innerText.trim() : "N/A";
          const setName = setEl ? setEl.innerText.trim() : "";

          if (!title) return null;

          return {
            title,
            market,
            setName,
            isFoil: title.toLowerCase().includes("foil"),
            cleanTitle: title.toLowerCase().replace(/\(foil\)/gi, "").replace(/foil/gi, "").trim()
          };
        }).filter(Boolean)
    );

    if (products.length === 0) {
      const result = `${chatUser}, no results found for "${searchTerm}"`;
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    // Simple matching - just check if search term is in title
    const searchLower = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matches = products.filter(card => {
      const titleLower = card.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      return titleLower.includes(searchLower) || searchLower.includes(titleLower);
    });

    const candidates = matches.length > 0 ? matches : [products[0]];
    const nonFoil = candidates.find(c => !c.isFoil);
    const foil = candidates.find(c => c.isFoil);

    let message = `${chatUser}, `;
    if (nonFoil && foil) {
      message += `${nonFoil.cleanTitle} | Regular: ${nonFoil.market} | Foil: ${foil.market}`;
    } else if (nonFoil) {
      message += `${nonFoil.title} | Price: ${nonFoil.market}`;
    } else {
      message += `${candidates[0].title} | Price: ${candidates[0].market}`;
    }

    if (message.length > 390) message = message.slice(0, 387) + "...";
    
    cache.set(cacheKey, { result: message, time: Date.now() });
    return message;
    
  } catch (err) {
    console.error(`Fast error for "${searchTerm}":`, err.message);
    return `${chatUser}, search timed out for "${searchTerm}"`;
  } finally {
    if (page) returnPage(page);
  }
}

// Clean cache every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.time > 180000) { // 3 min
      cache.delete(key);
    }
  }
}, 60000);

app.get("/price", async (req, res) => {
  const card = req.query.card || "";
  const user = req.query.user || "Streamer";
  if (!card.trim())
    return res.type("text/plain").send(`${user}, please provide a card name!`);
  
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.get("/price/:card", async (req, res) => {
  const card = req.params.card || "";
  const user = req.query.user || "Streamer";
  if (!card.trim())
    return res.type("text/plain").send(`${user}, please provide a card name!`);
  
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.get("/health", (req, res) => {
  res.type("text/plain").send("OK");
});

process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Ultra-fast server on port ${PORT}`);
  // Pre-warm everything
  getBrowser().then(() => {
    console.log('🔥 Browser pre-warmed and ready');
  }).catch(console.error);
});
