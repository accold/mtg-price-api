from flask import Flask, request
import asyncio
from playwright.async_api import async_playwright
import re
import time

app = Flask(__name__)
cache = {}  # Simple in-memory cache

# Parse price strings to float
def parse_price(price_str):
    if not price_str or price_str == "N/A":
        return None
    try:
        return float(re.sub(r"[^0-9.]", "", price_str))
    except:
        return None

# Fuzzy match
def fuzzy_match(search_term, card_title):
    search_words = search_term.lower().split()
    title_words = card_title.lower().split()
    matched = [w for w in search_words if any(
        tw.find(w) != -1 or w.find(tw) != -1 or (abs(len(tw)-len(w)) <= 1 and tw[:-1] == w[:-1])
        for tw in title_words
    )]
    return len(matched) >= max(1, int(len(search_words)*0.8))

# Scraper
async def fetch_card_price(search_term, chat_user="Streamer"):
    cache_key = search_term.lower()
    # Use cached result if within 30 sec
    if cache_key in cache and time.time() - cache[cache_key]['time'] < 30:
        return cache[cache_key]['result'].replace("Streamer", chat_user)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36")
            page = await context.new_page()

            # Go to TCGPlayer homepage
            await page.goto("https://www.tcgplayer.com/", wait_until="domcontentloaded")

            # Wait for search input
            input_el = await page.wait_for_selector("#autocomplete-input", timeout=10000)
            await input_el.fill(search_term)
            await input_el.press("Enter")

            # Wait for product cards to render
            await page.wait_for_timeout(2500)

            # Scrape product cards
            products = await page.query_selector_all(".product-card")
            product_list = []
            for el in products:
                title_el = await el.query_selector(".product-card__title.truncate")
                set_el = await el.query_selector(".product-card__set-name__variant")
                price_el = await el.query_selector(".product-card__market-price--value")
                title = (await title_el.inner_text()).strip() if title_el else ""
                set_name = (await set_el.inner_text()).strip() if set_el else ""
                market = (await price_el.inner_text()).strip() if price_el else "N/A"
                is_foil = "foil" in title.lower()
                is_special = re.search(r"(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))", title + " " + set_name, re.I)
                clean_title = re.sub(r"\(foil\)", "", title, flags=re.I).strip().lower()
                if title:
                    product_list.append({
                        "title": title,
                        "setName": set_name,
                        "market": market,
                        "isFoil": is_foil,
                        "isSpecial": bool(is_special),
                        "cleanTitle": clean_title
                    })

            await browser.close()

            if not product_list:
                result = f"{chat_user}, no product cards found for \"{search_term}\""
                cache[cache_key] = {'result': result, 'time': time.time()}
                return result

            # Fuzzy matching
            matching_cards = [c for c in product_list if
                              search_term.lower() in c['cleanTitle'] or
                              fuzzy_match(search_term, c['title']) or
                              fuzzy_match(search_term, c['cleanTitle'])]
            fallback_card = product_list[0]

            non_foil = [c for c in matching_cards if not c['isFoil']]
            foil = [c for c in matching_cards if c['isFoil']]

            def prioritize(cards):
                if not cards:
                    return None
                main_set = [c for c in cards if not c['isSpecial'] and parse_price(c['market']) is not None]
                if main_set:
                    return sorted(main_set, key=lambda x: parse_price(x['market']))[0]
                valid = [c for c in cards if parse_price(c['market']) is not None]
                return sorted(valid, key=lambda x: parse_price(x['market']))[0] if valid else cards[0]

            best_non_foil = prioritize(non_foil)
            best_foil = prioritize(foil)

            message = f"{chat_user}, "
            if best_non_foil and best_foil:
                message += f"Card: {best_non_foil['cleanTitle']} ({best_non_foil['setName']}) | Regular: {best_non_foil['market']} | Foil: {best_foil['market']}"
            elif best_non_foil:
                message += f"Card: {best_non_foil['title']} ({best_non_foil['setName']}) | Market: {best_non_foil['market']} | Foil: Not found"
            elif best_foil:
                message += f"Card: {best_foil['cleanTitle']} ({best_foil['setName']}) | Regular: Not found | Foil: {best_foil['market']}"

            if len(message) > 390:
                message = message[:387] + "..."

            cache[cache_key] = {'result': message, 'time': time.time()}
            return message

    except Exception as e:
        return f"{chat_user}, failed to fetch card/product \"{search_term}\" - {str(e)}"

# Flask endpoint
@app.route("/price")
def price():
    card = request.args.get("card") or request.args.get("q") or ""
    user = request.args.get("user") or "Streamer"
    if not card.strip():
        return f"{user}, please provide a card name!"
    result = asyncio.run(fetch_card_price(card, user))
    return result

@app.route("/health")
def health():
    return "OK"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    # bind to 0.0.0.0 so Render can reach it
    app.run(host="0.0.0.0", port=port)
