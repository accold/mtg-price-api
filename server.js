const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Simple browser management - create fresh each time but reuse when possible
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
    });
  }
  return browserInstance;
}

// Simple cache
const cache = new Map();

// Normalize price strings to numbers
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fuzzy match helper
function fuzzyMatch(searchTerm, cardTitle) {
  const searchWords = searchTerm.toLowerCase().split(/\s+/);
  const titleWords = cardTitle.toLowerCase().split(/\s+/);
  const matchedWords = searchWords.filter((searchWord) =>
    titleWords.some(
      (titleWord) =>
        titleWord.includes(searchWord) ||
        searchWord.includes(titleWord) ||
        (Math.abs(titleWord.length - searchWord.length) <= 1 &&
          titleWord.slice(0, -1) === searchWord.slice(0, -1))
    )
  );
  return matchedWords.length >= Math.ceil(searchWords.length * 0.8);
}

// Simplified but robust scraper
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  // Check cache first
  const cacheKey = searchTerm.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 30000) { // 30 second cache
    return cached.result.replace("Streamer", chatUser);
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set reasonable timeouts
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(8000);

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;
    
    console.log(`Searching for: ${searchTerm} at ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 8000 });

    // Debug: check what's on the page
    const pageTitle = await page.title();
    console.log(`Page loaded: ${pageTitle}`);

    // Try multiple selector strategies
    let selectorFound = false;
    const selectors = [
      ".product-card__product",
      ".search-result", 
      ".product-item",
      "[data-testid='product-card']",
      ".product",
      ".search-result-item",
      ".tcg-product-card"
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        console.log(`Found elements with selector: ${selector}`);
        selectorFound = true;
        break;
      } catch (e) {
        console.log(`No elements found with: ${selector}`);
      }
    }

    if (!selectorFound) {
      console.log("No product selectors found, taking screenshot...");
      await page.screenshot({ path: 'debug.png' });
      throw new Error("No product cards found with any selector");
    }

    // Extract product data
    const products = await page.$$eval(
      ".product-card__product, .search-result, .product-item, [data-testid='product-card'], .product",
      (cards) =>
        cards.slice(0, 12).map((el) => {
          const titleEl =
            el.querySelector(".product-card__title") ||
            el.querySelector(".product-title") ||
            el.querySelector("h3") ||
            el.querySelector("h4");

          const priceEl =
            el.querySelector(".product-card__market-price--value") ||
            el.querySelector(".market-price") ||
            el.querySelector(".price");

          const setEl =
            el.querySelector(".product-card__set-name__variant") ||
            el.querySelector(".set-name") ||
            el.querySelector(".product-set");

          const title = titleEl ? titleEl.innerText.trim() : "";
          const market = priceEl ? priceEl.innerText.trim() : "N/A";
          const setName = setEl ? setEl.innerText.trim() : "";

          if (!title) return null;

          const isFoil = title.toLowerCase().includes("foil");
          const isSpecial = /(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))/i.test(
            title + " " + setName
          );

          return {
            title,
            market,
            setName,
            isFoil,
            isSpecial,
            cleanTitle: title
              .toLowerCase()
              .replace(/\(foil\)/gi, "")
              .replace(/foil/gi, "")
              .trim(),
          };
        }).filter(Boolean)
    );

    if (products.length === 0) {
      const result = `${chatUser}, no product cards found for "${searchTerm}"`;
      cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    const normalizedSearch = searchTerm.toLowerCase().replace(/\W/g, "");
    const matchingCards = products.filter((card) => {
      const normalizedTitle = card.cleanTitle.replace(/\W/g, "");
      const normalizedFullTitle = card.title.toLowerCase().replace(/\W/g, "");
      return (
        normalizedTitle.includes(normalizedSearch) ||
        normalizedFullTitle.includes(normalizedSearch) ||
        fuzzyMatch(searchTerm, card.title) ||
        fuzzyMatch(searchTerm, card.cleanTitle)
      );
    });

    const fallbackCard = products[0];
    if (matchingCards.length === 0) {
      const result = `${chatUser}, no exact match for "${searchTerm}". Found: ${fallbackCard.title} (${fallbackCard.setName}) | Price: ${fallbackCard.market}`;
      cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    const nonFoilCards = matchingCards.filter((c) => !c.isFoil);
    const foilCards = matchingCards.filter((c) => c.isFoil);

    const prioritizeMainSet = (cards) => {
      if (cards.length === 0) return null;
      const mainSet = cards.filter((c) => !c.isSpecial && parsePrice(c.market) !== null);
      if (mainSet.length > 0)
        return mainSet.sort((a, b) => parsePrice(a.market) - parsePrice(b.market))[0];
      return (
        cards
          .filter((c) => parsePrice(c.market) !== null)
          .sort((a, b) => parsePrice(a.market) - parsePrice(b.market))[0] || cards[0]
      );
    };

    const bestNonFoil = prioritizeMainSet(nonFoilCards);
    const bestFoil = prioritizeMainSet(foilCards);

    let message = `${chatUser}, `;
    if (bestNonFoil && bestFoil) {
      message += `Card: ${bestNonFoil.cleanTitle} (${bestNonFoil.setName}) | Regular: ${bestNonFoil.market} | Foil: ${bestFoil.market}`;
    } else if (bestNonFoil) {
      message += `Card: ${bestNonFoil.title} (${bestNonFoil.setName}) | Market: ${bestNonFoil.market} | Foil: Not found`;
    } else if (bestFoil) {
      message += `Card: ${bestFoil.cleanTitle} (${bestFoil.setName}) | Regular: Not found | Foil: ${bestFoil.market}`;
    }

    if (message.length > 390) message = message.slice(0, 387) + "...";
    
    // Cache the result
    cache.set(cacheKey, { result: message, timestamp: Date.now() });
    console.log(`Successfully found: ${searchTerm}`);
    return message;

  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    console.error(err.stack);
    
    // Try to give a more helpful error message
    if (err.message.includes('timeout')) {
      return `${chatUser}, search for "${searchTerm}" timed out - try again`;
    } else if (err.message.includes('net::')) {
      return `${chatUser}, connection error for "${searchTerm}" - try again`;
    } else {
      return `${chatUser}, error searching for "${searchTerm}" - try again`;
    }
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('Error closing page:', e.message);
      }
    }
  }
}

// Clean up cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > 60000) { // 1 minute
      cache.delete(key);
    }
  }
}, 30000);

// Routes
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

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
