const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Keep browser alive to avoid startup time
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
  }
  return browserInstance;
}

// Cache results for 30 seconds to avoid re-scraping
const cache = new Map();

// Normalize price strings to numbers
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fuzzy match helper - COMPLETE ORIGINAL LOGIC
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

// Scrape card prices with Playwright - OPTIMIZED FOR SPEED
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  // Check cache first
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 30000) { // 30 sec cache
      return cached.result.replace("Streamer", chatUser);
    }
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Make it look like a real browser - use correct Playwright methods
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewportSize({ width: 1920, height: 1080 });

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;
    
    // SPEED OPTIMIZATION: Load faster with domcontentloaded
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 10000 });

    // Give JavaScript a moment to render but don't wait for full network idle
    await page.waitForTimeout(2000);
    
    // Debug: Let's see what's actually on the page
    console.log('Page title:', await page.title());
    
    // Try multiple modern selectors that TCGPlayer might use - UPDATED WITH YOUR FINDINGS
    const possibleSelectors = [
      '#app section.marketplace__content section section section section section > div:nth-child(2) > div > div > div > div > a > section',
      '#app section.marketplace__content section > section > section > section > section > div:nth-child(2) > div > div > div > div > a',
      '.marketplace__content section section section section section > div > div > div > div > div > a > section',
      '.marketplace__content a > section',
      '#app a > section',
      'section.marketplace__content a section',
      '[data-testid="product-card"]',
      '[data-cy="product-card"]', 
      '.search-result-item',
      '.product-listing-item',
      '.tcg-product-card',
      '.search-results .product',
      '.product-grid .product',
      '.search-results-container .product',
      '.product-card__product',
      '.search-result',
      '.product-item'
    ];
    
    let foundSelector = null;
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        console.log(`Found products with selector: ${selector}`);
        foundSelector = selector;
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!foundSelector) {
      console.log('No product selectors found. Page URL:', page.url());
      const bodyText = await page.textContent('body');
      console.log('Page contains text:', bodyText.substring(0, 500));
      
      // Check if we got redirected or blocked
      if (bodyText.includes('blocked') || bodyText.includes('captcha') || bodyText.includes('robot')) {
        throw new Error('Blocked by anti-bot protection');
      }
      
      throw new Error('No product cards found on page');
    }

    // Use the found selector for scraping - COMPLETE ORIGINAL EXTRACTION LOGIC
    const products = await page.$$eval(
      foundSelector,
      (cards) =>
        cards.map((el) => {
          // Updated selectors based on current TCGPlayer structure
          const titleEl = el.querySelector(".product-card__title, span[class*='title'], .product-title, h3, h4");
          const priceEl = el.querySelector(".product-card__market-price--value, .market-price, .price, span[class*='price']");
          const setEl = el.querySelector(".product-card__set-name__variant, .product-card__set-name, .set-name, .product-set, div[class*='set-name']");

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
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    // COMPLETE ORIGINAL MATCHING LOGIC
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
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    // COMPLETE ORIGINAL FOIL/NON-FOIL LOGIC
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

    // COMPLETE ORIGINAL MESSAGE FORMATTING
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
    cache.set(cacheKey, { result: message, time: Date.now() });
    return message;
    
  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch card "${searchTerm}" - ${err.message}`;
  } finally {
    if (page) await page.close();
  }
}

// Clean old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.time > 60000) {
      cache.delete(key);
    }
  }
}, 60000);

// Routes - EXACTLY THE SAME AS YOUR WORKING VERSION
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

// Health check endpoint for monitoring
app.get("/health", (req, res) => {
  res.type("text/plain").send("OK");
});

// Graceful shutdown to close browser
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Fast TCG scraper running on port ${PORT}`);
  // Pre-warm browser on startup
  getBrowser().catch(console.error);
});
