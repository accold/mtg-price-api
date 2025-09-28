const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Normalize price strings
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

// Scrape card prices with Playwright
async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
  let browser;
  let timeoutTriggered = false;

  try {
    browser = await chromium.launch({ headless: true });

    const page = await browser.newPage();
    const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      searchTerm
    )}&view=grid`;

    // Set a 20-second max timeout to avoid Nightbot timeout
    const pagePromise = page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Fallback timeout
    const fallback = new Promise((resolve) => {
      setTimeout(() => {
        timeoutTriggered = true;
        resolve(null);
      }, 18000); // 18 seconds
    });

    await Promise.race([pagePromise, fallback]);
    if (timeoutTriggered) {
      return `${chatUser}, fetching "${searchTerm}" is taking too long. Try again in a moment.`;
    }

    // Grab product cards
    const products = await page.$$eval(
      ".product-card__product, .search-result, .product-item, [data-testid='product-card'], .product",
      (cards) =>
        cards
          .map((el) => {
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
          })
          .filter(Boolean)
    );

    if (products.length === 0) {
      return `${chatUser}, no product cards found for "${searchTerm}"`;
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
      return `${chatUser}, no exact match for "${searchTerm}". Found: ${fallbackCard.title} (${fallbackCard.setName}) | Price: ${fallbackCard.market}`;
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
    return message;
  } catch (err) {
    console.error(`Error fetching card "${searchTerm}":`, err.message);
    return `${chatUser}, failed to fetch card "${searchTerm}" - ${err.message}`;
  } finally {
    if (browser) await browser.close();
  }
}

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

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
