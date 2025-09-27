const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
// const puppeteer = require("puppeteer"); // optional

const app = express();
const PORT = process.env.PORT || 3000;

// Helper function to parse price strings
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Fetch card price
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  try {
    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;

    const { data: html } = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const $ = cheerio.load(html);
    let products = [];

    const selectors = [
      ".product-card__product",
      ".search-result",
      ".product-item",
      "[data-testid='product-card']",
      ".product",
    ];

    for (const sel of selectors) {
      $(sel).each((i, el) => {
        const titleEl = $(el).find(".product-card__title, .product-title, h3, h4").first();
        const priceEl = $(el).find(".product-card__market-price--value, .market-price, .price").first();
        const setEl = $(el).find(".product-card__set-name__variant, .set-name, .product-set").first();

        const title = titleEl.text().trim();
        const market = priceEl.text().trim() || "N/A";
        const setName = setEl.text().trim();

        if (!title) return;

        const isFoil = title.toLowerCase().includes("foil");
        const isSpecial = /(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))/i.test(
          title + " " + setName
        );

        products.push({
          title,
          market,
          setName,
          isFoil,
          isSpecial,
          cleanTitle: title.toLowerCase().replace(/\(foil\)/gi, "").replace(/foil/gi, "").trim(),
        });
      });

      if (products.length > 0) break;
    }

    if (products.length === 0)
      return `${chatUser}, no product cards found for "${searchTerm}"`;

    const normalizedSearch = searchTerm.toLowerCase().replace(/\W/g, "");

    const fuzzyMatch = (searchTerm, cardTitle) => {
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
    };

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
      return `${chatUser}, no exact match for "${searchTerm}". Found: ${fallbackCard.title} (${fallbackCard.setName}) | Price: ${fallbackCard.market}`;
    }

    const nonFoilCards = matchingCards.filter((c) => !c.isFoil);
    const foilCards = matchingCards.filter((c) => c.isFoil);

    const prioritizeMainSet = (cards) => {
      if (cards.length === 0) return null;
      const mainSet = cards.filter((c) => !c.isSpecial && parsePrice(c.market) !== null);
      if (mainSet.length > 0) return mainSet.sort((a, b) => parsePrice(a.market) - parsePrice(b.market))[0];
      return cards.filter((c) => parsePrice(c.market) !== null).sort((a, b) => parsePrice(a.market) - parsePrice(b.market))[0] || cards[0];
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
    return message;
  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch card "${searchTerm}" - ${err.message}`;
  }
}

// Routes
app.get("/price", async (req, res) => {
  const card = req.query.card || "";
  const user = req.query.user || "Streamer";
  if (!card.trim()) return res.type("text/plain").send(`${user}, please provide a card name!`);
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.get("/price/:card", async (req, res) => {
  const card = req.params.card || "";
  const user = req.query.user || "Streamer";
  if (!card.trim()) return res.type("text/plain").send(`${user}, please provide a card name!`);
  const msg = await fetchCardPrice(card, user);
  res.type("text/plain").send(msg);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
