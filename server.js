const express = require("express");
const puppeteer = require("puppeteer");

const app = express();

async function fetchCardPrice(searchTerm, chatUser = "Streamer") {
    // ✅ Use Render-provided path if set, otherwise Puppeteer's default
    const customPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const executablePath =
        customPath && customPath.length > 0
            ? customPath
            : puppeteer.executablePath();

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--disable-gpu"
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        const searchUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
            searchTerm
        )}&view=grid`;
        await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        let products = [];
        const selectors = [
            ".product-card__product",
            ".search-result",
            ".product-item",
            "[data-testid=\"product-card\"]",
            ".product"
        ];

        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                products = await page.$$eval(selector, (cards) => {
                    return cards.map(card => {
                        const titleEl =
                            card.querySelector(".product-card__title") ||
                            card.querySelector(".product-title") ||
                            card.querySelector("h3") ||
                            card.querySelector("h4") ||
                            card.querySelector("[data-testid=\"product-title\"]");

                        const priceEl =
                            card.querySelector(".product-card__market-price--value") ||
                            card.querySelector(".market-price") ||
                            card.querySelector(".price") ||
                            card.querySelector("[data-testid=\"market-price\"]");

                        const setEl =
                            card.querySelector(".product-card__set-name__variant") ||
                            card.querySelector(".set-name") ||
                            card.querySelector(".product-set");

                        const title = titleEl?.textContent?.trim() || "";
                        const market = priceEl?.textContent?.trim() || "N/A";
                        const setName = setEl?.textContent?.trim() || "";

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
                                .trim()
                        };
                    }).filter(Boolean);
                }, selector);

                if (products.length > 0) break;
            } catch {
                continue;
            }
        }

        if (products.length === 0) throw new Error("No product cards found");

        const normalizedSearch = searchTerm.toLowerCase().replace(/\W/g, "");
        const fuzzyMatch = (searchTerm, cardTitle) => {
            const searchWords = searchTerm.toLowerCase().split(/\s+/);
            const titleWords = cardTitle.toLowerCase().split(/\s+/);
            const matchedWords = searchWords.filter(searchWord => {
                return titleWords.some(titleWord => {
                    return (
                        titleWord.includes(searchWord) ||
                        searchWord.includes(titleWord) ||
                        (Math.abs(titleWord.length - searchWord.length) <= 1 &&
                            titleWord.slice(0, -1) === searchWord.slice(0, -1))
                    );
                });
            });
            return matchedWords.length >= Math.ceil(searchWords.length * 0.8);
        };

        const matchingCards = products.filter(card => {
            const normalizedTitle = card.cleanTitle.replace(/\W/g, "");
            const normalizedFullTitle = card.title.toLowerCase().replace(/\W/g, "");
            return (
                normalizedTitle.includes(normalizedSearch) ||
                normalizedFullTitle.includes(normalizedSearch) ||
                fuzzyMatch(searchTerm, card.title) ||
                fuzzyMatch(searchTerm, card.cleanTitle)
            );
        });

        if (matchingCards.length === 0) {
            const fallback = products[0];
            await browser.close();
            let message = `${chatUser}, no exact match for "${searchTerm}". Found: ${fallback.title} (${fallback.setName}) | Price: ${fallback.market}`;
            if (message.length > 390) message = message.slice(0, 387) + "...";
            return message;
        }

        const nonFoilCards = matchingCards.filter(card => !card.isFoil);
        const foilCards = matchingCards.filter(card => card.isFoil);

        const prioritizeMainSet = (cards) => {
            if (cards.length === 0) return null;
            const mainSetCards = cards.filter(card => !card.isSpecial);
            if (mainSetCards.length > 0) {
                const sortedMain = mainSetCards
                    .filter(card => card.market !== "N/A")
                    .sort((a, b) => parseFloat(a.market.replace(/[^0-9.]/g, "")) - parseFloat(b.market.replace(/[^0-9.]/g, "")));
                if (sortedMain.length > 0) return sortedMain[0];
            }
            const sortedAll = cards
                .filter(card => card.market !== "N/A")
                .sort((a, b) => parseFloat(a.market.replace(/[^0-9.]/g, "")) - parseFloat(b.market.replace(/[^0-9.]/g, "")));
            return sortedAll[0] || cards[0];
        };

        const bestNonFoil = prioritizeMainSet(nonFoilCards);
        const bestFoil = prioritizeMainSet(foilCards);

        await browser.close();

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
        if (browser) await browser.close();
        let message = `${chatUser}, failed to fetch card "${searchTerm}" - ${err.message}`;
        if (message.length > 390) message = message.slice(0, 387) + "...";
        return message;
    }
}

// --- Express routes for Nightbot ---
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
