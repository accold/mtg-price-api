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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;
    
    // SPEED OPTIMIZATION: Wait for network idle instead of arbitrary timeout
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 15000 });

    // Wait for page to fully load JavaScript content
    await page.waitForLoadState('networkidle');
    
    // Debug: Let's see what's actually on the page
    console.log('Page title:', await page.title());
    
    // Try multiple modern selectors that TCGPlayer might use
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
      // Debug: Take screenshot and log page content
      console.log('No product selectors found. Page URL:', page.url());
      
      // Get all elements that might be product cards
      const allDivs = await page.$eval('div', (divs) => 
        divs.slice(0, 50).map(div => ({
          classes: div.className,
          dataAttrs: Object.keys(div.dataset),
          text: div.innerText?.substring(0, 100)
        })).filter(div => 
          div.text && (
            div.text.includes('

    // Use the found selector for scraping
    const products = await page.$eval(
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  // Pre-warm browser on startup
  getBrowser().catch(console.error);
});) || 
            div.text.toLowerCase().includes('cancel') ||
            div.classes.includes('product') ||
            div.classes.includes('card') ||
            div.classes.includes('search')
          )
        )
      );
      
      console.log('Potential product elements:', JSON.stringify(allDivs, null, 2));
      
      const bodyText = await page.textContent('body');
      console.log('Page contains text:', bodyText.substring(0, 500));
      
      // Check if we got redirected or blocked
      if (bodyText.includes('blocked') || bodyText.includes('captcha') || bodyText.includes('robot')) {
        throw new Error('Blocked by anti-bot protection');
      }
      
      throw new Error('No product cards found on page');
    }

    // Use the found selector for scraping
    const products = await page.$eval(
      foundSelector,
      (cards) =>
        cards.map((el) => {
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
      cache.set(cacheKey, { result, time: Date.now() });
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
      cache.set(cacheKey, { result, time: Date.now() });
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  // Pre-warm browser on startup
  getBrowser().catch(console.error);
});
