const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for 2 minutes
const cache = new Map();

function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// HTTP-only scraper - much faster than Playwright
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 120000) { // 2 min cache
      return cached.result.replace("Streamer", chatUser);
    }
  }

  try {
    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchTerm)}&view=grid`;
    
    console.log(`HTTP request to: ${searchUrl}`);
    
    const response = await axios.get(searchUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      }
    });

    const $ = cheerio.load(response.data);
    console.log('Page loaded, looking for products...');

    // Try multiple selectors for product cards
    let products = [];
    const selectors = [
      '.product-card__product',
      '.search-result',
      '.product-item',
      '[data-testid="product-card"]',
      'a[href*="/product/"]'
    ];

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} products with selector: ${selector}`);
        
        elements.each((i, el) => {
          if (i >= 10) return; // Only process first 10
          
          const $el = $(el);
          
          // Try different title selectors
          const title = $el.find('.product-card__title').text().trim() ||
                       $el.find('[class*="title"]').text().trim() ||
                       $el.find('h3, h4').text().trim() ||
                       $el.text().trim().split('\n')[0];

          // Try different price selectors  
          const market = $el.find('.product-card__market-price--value').text().trim() ||
                        $el.find('[class*="price"]').text().trim() ||
                        $el.find('[class*="market"]').text().trim() ||
                        'N/A';

          // Try different set selectors
          const setName = $el.find('.product-card__set-name__variant').text().trim() ||
                         $el.find('[class*="set"]').text().trim() ||
                         '';

          if (title && title.length > 2) {
            products.push({
              title,
              market,
              setName,
              isFoil: title.toLowerCase().includes("foil"),
              cleanTitle: title.toLowerCase().replace(/\(foil\)/gi, "").replace(/foil/gi, "").trim()
            });
          }
        });
        
        if (products.length > 0) break;
      }
    }

    // If no structured data found, try to extract from page text
    if (products.length === 0) {
      console.log('No structured products found, trying text extraction...');
      const pageText = $.text();
      
      // Look for price patterns in the text
      const priceMatches = pageText.match(/\$\d+\.\d+/g);
      if (priceMatches && priceMatches.length > 0) {
        const result = `${chatUser}, found "${searchTerm}" but couldn't parse details. Try the website directly.`;
        cache.set(cacheKey, { result, time: Date.now() });
        return result;
      }
      
      throw new Error('No products or prices found in page');
    }

    console.log(`Extracted ${products.length} products`);

    // Simple matching
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
    console.log(`Success: ${message}`);
    return message;
    
  } catch (err) {
    console.error(`HTTP error for "${searchTerm}":`, err.message);
    
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return `${chatUser}, connection error - try again`;
    } else if (err.response && err.response.status === 403) {
      return `${chatUser}, blocked by website - try again later`;
    } else {
      return `${chatUser}, error finding "${searchTerm}"`;
    }
  }
}

// Clean cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.time > 180000) {
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

app.listen(PORT, () => {
  console.log(`✅ HTTP-only scraper on port ${PORT}`);
});
