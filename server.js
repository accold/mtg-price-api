const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// Cache
const cache = new Map();

// Normalize price
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fuzzy match
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

// Fetch card price
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 30000) return cached.result.replace("Streamer", chatUser);
  }

  try {
    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchTerm)}&view=grid`;
    const response = await axios.get(searchUrl);
    const $ = cheerio.load(response.data);

    const products = [];

    $(".product-card").each((i, el) => {
      const title = $(el).find(".product-card__title.truncate").text().trim();
      const setName = $(el).find(".product-card__set-name__variant").text().trim();
      const price = $(el).find(".product-card__market-price--value").text().trim();
      if (!title) return;

      const isFoil = title.toLowerCase().includes("foil");
      const isSpecial = /(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))/i.test(title + " " + setName);

      products.push({
        title,
        setName,
        market: price || "N/A",
        isFoil,
        isSpecial,
        cleanTitle: title.toLowerCase().replace(/\(foil\)/gi, "").trim(),
      });
    });

    if (products.length === 0) {
      const result = `${chatUser}, no product cards found for "${searchTerm}"`;
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    const matchingCards = products.filter(
      (c) =>
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
      if (mainSet.length > 0) return mainSet.sort((a,b) => parsePrice(a.market)-parsePrice(b.market))[0];
      return (cards.filter(c => parsePrice(c.market) !== null).sort((a,b) => parsePrice(a.market)-parsePrice(b.market))[0] || cards[0]);
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

    cache.set(cacheKey, { result: message, time: Date.now() });
    return message;

  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch card "${searchTerm}" - ${err.message}`;
  }
}

// Nightbot route
app.get("/price", async (req, res) => {
  const card = req.query.q || req.query.card || "";
  const user = req.query.user || "Streamer";

  if (!card.trim()) return res.type("text/plain").send(`${user}, please provide a card name!`);

  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

// Health check
app.get("/health", (req, res) => res.type("text/plain").send("OK"));

// Clean old cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.time > 60000) cache.delete(key);
  }
}, 60000);

app.listen(PORT, () => console.log(`✅ TCGPlayer scraper running on port ${PORT}`));
