const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Keep browser instance alive and reuse pages
let browserInstance = null;
let pagePool = [];
const MAX_PAGES = 3;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    // Pre-create pages for faster access
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await browserInstance.newPage();
      pagePool.push(page);
    }
  }
  return browserInstance;
}

async function getPage() {
  await getBrowser();
  return pagePool.pop() || await browserInstance.newPage();
}

function returnPage(page) {
  if (pagePool.length < MAX_PAGES) {
    pagePool.push(page);
  } else {
    page.close();
  }
}

// Simple cache to avoid repeated requests
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

// Normalize price strings to numbers
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Simplified fuzzy match for speed
function fuzzyMatch(searchTerm, cardTitle) {
  const search = searchTerm.toLowerCase();
  const title = cardTitle.toLowerCase();
  return title.includes(search) || search.includes(title);
}

// Ultra-fast scraper - prioritize speed over perfection
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  // Check cache first
  const cacheKey = searchTerm.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result.replace("Streamer", chatUser);
  }

  let page;
  try {
    page = await getPage();
    
    // Aggressive timeout settings
    await page.setDefaultTimeout(3000);
    await page.setDefaultNavigationTimeout(3000);

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchTerm)}&view=grid`;
    
    // Navigate with minimal waiting
    await page.goto(searchUrl, { 
      waitUntil: "domcontentloaded",
      timeout: 3000 
    });

    // Wait for ANY product cards with short timeout
    await page.waitForSelector(
      ".product-card__product, .search-result, .product-item",
      { timeout: 2000 }
    );

    // Get just the first few results - speed over completeness
    const products = await page.$$eval(
      ".product-card__product, .search-result, .product-item",
      (cards, searchTerm) => {
        return cards.slice(0, 8).map((el) => {
          const titleEl = el.querySelector(".product-card__title, .product-title, h3, h4");
          const priceEl = el.querySelector(".product-card__market-price--value, .market-price, .price");
          const setEl = el.querySelector(".product-card__set-name__variant, .set-name, .product-set");

          const title = titleEl ? titleEl.innerText.trim() : "";
          const market = priceEl ? priceEl.innerText.trim() : "N/A";
          const setName = setEl ? setEl.innerText.trim() : "";

          if (!title) return null;

          // Simple matching
          const searchLower = searchTerm.toLowerCase();
          const titleLower = title.toLowerCase();
          const isMatch = titleLower.includes(searchLower) || searchLower.includes(titleLower);

          return {
            title,
            market,
            setName,
            isFoil: title.toLowerCase().includes("foil"),
            isMatch,
            cleanTitle: title.replace(/\(foil\)/gi, "").replace(/foil/gi, "").trim()
          };
        }).filter(Boolean);
      },
      searchTerm
    );

    if (products.length === 0) {
      const result = `${chatUser}, no results found for "${searchTerm}"`;
      cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // Find best match quickly
    const exactMatches = products.filter(p => p.isMatch);
    const candidates = exactMatches.length > 0 ? exactMatches : [products[0]];
    
    const nonFoil = candidates.find(c => !c.isFoil);
    const foil = candidates.find(c => c.isFoil);

    let message = `${chatUser}, `;
    
    if (nonFoil && foil) {
      message += `${nonFoil.cleanTitle} | Regular: ${nonFoil.market} | Foil: ${foil.market}`;
    } else if (nonFoil) {
      message += `${nonFoil.title} | Price: ${nonFoil.market}`;
    } else if (foil) {
      message += `${foil.cleanTitle} | Foil: ${foil.market}`;
    } else {
      message += `${products[0].title} | Price: ${products[0].market}`;
    }

    if (message.length > 390) message = message.slice(0, 387) + "...";
    
    // Cache result
    cache.set(cacheKey, { result: message, timestamp: Date.now() });
    return message;

  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    const result = `${chatUser}, failed to fetch "${searchTerm}"`;
    return result;
  } finally {
    if (page) returnPage(page);
  }
}

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60000);

// Routes - no timeout middleware, let Nightbot handle it
app.get("/price", async (req, res) => {
  const card = req.query.card || "";
  const user = req.query.user || "Streamer";
  
  if (!card.trim()) {
    return res.type("text/plain").send(`${user}, please provide a card name!`);
  }
  
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.get("/price/:card", async (req, res) => {
  const card = req.params.card || "";
  const user = req.query.user || "Streamer";
  
  if (!card.trim()) {
    return res.type("text/plain").send(`${user}, please provide a card name!`);
  }
  
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.get("/health", (req, res) => {
  res.type("text/plain").send("OK");
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Ultra-fast TCG scraper running on port ${PORT}`);
  // Pre-warm the browser
  getBrowser().catch(console.error);
});
