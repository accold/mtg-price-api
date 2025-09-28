const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Keep browser alive
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

// Cache
const cache = new Map();

// Price parser
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fuzzy match
function fuzzyMatch(searchTerm, cardTitle) {
  const searchWords = searchTerm.toLowerCase().split(/\s+/);
  const titleWords = cardTitle.toLowerCase().split(/\s+/);
  const matchedWords = searchWords.filter(searchWord =>
    titleWords.some(titleWord =>
      titleWord.includes(searchWord) ||
      searchWord.includes(titleWord) ||
      (Math.abs(titleWord.length - searchWord.length) <= 1 &&
        titleWord.slice(0,-1) === searchWord.slice(0,-1))
    )
  );
  return matchedWords.length >= Math.ceil(searchWords.length * 0.8);
}

// Fetch card/product price
async function fetchCardPrice(searchTerm, chatUser="Streamer") {
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 30000) return cached.result.replace("Streamer", chatUser);
  }

  let page, context;
  try {
    const browser = await getBrowser();

    // Create a context with user agent
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    });

    page = await context.newPage();

    // Go to TCGPlayer homepage
    await page.goto("https://www.tcgplayer.com/", { waitUntil: "domcontentloaded" });

    // Wait for search input to appear (any category)
    const searchInput = await page.waitForSelector('#autocomplete-input', { timeout: 10000 });
    if (!searchInput) throw new Error("Search input not found on page");

    // Fill the search term and submit
    await searchInput.fill(searchTerm);
    await searchInput.press("Enter");

    // Wait for products to render
    await page.waitForTimeout(2500);

    // Scrape product cards
    const products = await page.$$eval(".product-card", cards =>
      cards.map(el => {
        const title = el.querySelector(".product-card__title.truncate")?.innerText.trim() || "";
        const setName = el.querySelector(".product-card__set-name__variant")?.innerText.trim() || "";
        const market = el.querySelector(".product-card__market-price--value")?.innerText.trim() || "N/A";
        const isFoil = title.toLowerCase().includes("foil");
        const isSpecial = /(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))/i.test(title + " " + setName);
        return title ? { title, setName, market, isFoil, isSpecial, cleanTitle: title.toLowerCase().replace(/\(foil\)/gi,"").trim() } : null;
      }).filter(Boolean)
    );

    if (products.length === 0) {
      const result = `${chatUser}, no product cards found for "${searchTerm}"`;
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    // Fuzzy match
    const matchingCards = products.filter(c =>
      c.cleanTitle.includes(searchTerm.toLowerCase()) ||
      fuzzyMatch(searchTerm, c.title) ||
      fuzzyMatch(searchTerm, c.cleanTitle)
    );

    const fallbackCard = products[0];

    const nonFoilCards = matchingCards.filter(c => !c.isFoil);
    const foilCards = matchingCards.filter(c => c.isFoil);

    const prioritizeMainSet = (cards) => {
      if (cards.length === 0) return null;
      const mainSet = cards.filter(c => !c.isSpecial && parsePrice(c.market) !== null);
      if (mainSet.length) return mainSet.sort((a,b)=>parsePrice(a.market)-parsePrice(b.market))[0];
      return (cards.filter(c=>parsePrice(c.market)!==null).sort((a,b)=>parsePrice(a.market)-parsePrice(b.market))[0] || cards[0]);
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

    if (message.length>390) message = message.slice(0,387)+"...";

    cache.set(cacheKey,{result:message,time:Date.now()});
    return message;

  } catch(err){
    console.error(`Error fetching card/product "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch card/product "${searchTerm}" - ${err.message}`;
  } finally {
    if (page) await page.close();
    if (context) await context.close();
  }
}

// Nightbot route
app.get("/price", async (req,res)=>{
  const card = req.query.q || req.query.card || "";
  const user = req.query.user || "Streamer";

  if (!card.trim()) return res.type("text/plain").send(`${user}, please provide a card name!`);

  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

// Health
app.get("/health",(req,res)=>res.type("text/plain").send("OK"));

// Cache cleanup
setInterval(()=>{
  const now = Date.now();
  for(const [key,value] of cache.entries()){
    if(now - value.time > 60000) cache.delete(key);
  }
},60000);

app.listen(PORT, ()=>console.log(`✅ TCGPlayer scraper running on port ${PORT}`));
