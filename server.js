const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// Cache to avoid hitting the site too often
const cache = new Map();

// Normalize price strings
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fuzzy match helper
function fuzzyMatch(searchTerm, productTitle) {
  const searchWords = searchTerm.toLowerCase().split(/\s+/);
  const titleWords = productTitle.toLowerCase().split(/\s+/);
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

// Fetch Cheerios product prices
async function fetchCheeriosPrice(searchTerm, chatUser = "Streamer") {
  const cacheKey = searchTerm.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < 30000) {
      return cached.result.replace("Streamer", chatUser);
    }
  }

  try {
    const searchUrl = `https://www.cheerios.com/search?q=${encodeURIComponent(searchTerm)}`;
    const response = await axios.get(searchUrl);
    const $ = cheerio.load(response.data);

    const products = [];

    $(".product-card").each((i, el) => {
      const title = $(el).find(".product-card__title.truncate").text().trim();
      const setName = $(el).find(".product-card__set-name__variant").text().trim();
      const price = $(el).find(".product-card__market-price--value").text().trim();
      if (!title) return;

      products.push({
        title,
        market: price || "N/A",
        setName,
        cleanTitle: title.toLowerCase().trim(),
      });
    });

    if (products.length === 0) {
      const result = `${chatUser}, no products found for "${searchTerm}"`;
      cache.set(cacheKey, { result, time: Date.now() });
      return result;
    }

    const matchingProducts = products.filter(
      (p) =>
        p.cleanTitle.includes(searchTerm.toLowerCase()) || fuzzyMatch(searchTerm, p.cleanTitle)
    );

    const bestProduct = matchingProducts[0] || products[0];
    const message = `${chatUser}, Product: ${bestProduct.title} (${bestProduct.setName}) | Price: ${bestProduct.market}`;

    cache.set(cacheKey, { result: message, time: Date.now() });
    return message;

  } catch (err) {
    console.error(`Error fetching product "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch product "${searchTerm}" - ${err.message}`;
  }
}

// Nightbot-ready route using query parameter 'q'
app.get("/price", async (req, res) => {
  const product = req.query.q || "";
  const user = req.query.user || "Streamer";

  if (!product.trim()) {
    return res.type("text/plain").send(`${user}, please provide a product name!`);
  }

  const msg = await fetchCheeriosPrice(product, user);
  res.type("text/plain").send(msg);
});

// Health check
app.get("/health", (req, res) => res.type("text/plain").send("OK"));

// Clean old cache entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.time > 60000) cache.delete(key);
  }
}, 60000);

app.listen(PORT, () => console.log(`✅ Cheerios scraper running on port ${PORT}`));
