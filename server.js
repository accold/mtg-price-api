import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;

// Helper to normalize prices
function parsePrice(priceStr) {
  if (!priceStr || priceStr === "N/A") return null;
  return parseFloat(priceStr.replace(/[^0-9.]/g, ""));
}

// Main scraper function
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;

    await page.goto(searchUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const products = await page.evaluate(() => {
      const selectors = [
        ".product-card__product",
        ".search-result",
        ".product-item",
        "[data-testid='product-card']",
        ".product",
      ];

      for (const sel of selectors) {
        const nodes = Array.from(document.querySelectorAll(sel));
        if (nodes.length) {
          return nodes.map(card => {
            const titleEl =
              card.querySelector(".product-card__title") ||
              card.querySelector(".product-title") ||
              card.querySelector("h3") ||
              card.querySelector("h4");

            const priceEl =
              card.querySelector(".product-card__market-price--value") ||
              card.querySelector(".market-price") ||
              card.querySelector(".price");

            const setEl =
              card.querySelector(".product-card__set-name__variant") ||
              card.querySelector(".set-name") ||
              card.querySelector(".product-set");

            const title = titleEl?.textContent?.trim() || "";
            const market = priceEl?.textContent?.trim() || "N/A";
            const setName = setEl?.textContent?.trim() || "";
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
              cleanTitle: title.toLowerCase().replace(/\(foil\)/gi, "").replace(/foil/gi, "").trim(),
            };
          });
        }
      }
      return [];
    });

    if (!products.length) return `${chatUser}, no product cards found for "${searchTerm}"`;

    const fallbackCard = products[0];

    const bestCard = products
      .filter(c => !c.isFoil)
      .sort((a, b) => (parsePrice(a.market) || 99999) - (parsePrice(b.market) || 99999))[0] || fallbackCard;

    await browser.close();

    return `${chatUser}, Card: ${bestCard.title} (${bestCard.setName}) | Price: ${bestCard.market}`;
  } catch (err) {
    if (browser) await browser.close();
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
