import asyncio
import re
import urllib.parse
from pyppeteer import launch

async def run(runRequest):
    logger = runRequest['modules']['logger']
    chatUser = runRequest['trigger']['metadata'].get('username', 'Streamer')
    args = runRequest['trigger']['metadata'].get('userCommand', {}).get('args', [])
    searchTerm = ' '.join(args).strip()

    logger.info(f"Searching TCGPlayer for: {searchTerm}")

    response = {
        "success": True,
        "effects": []
    }

    if not searchTerm:
        response['effects'].append({
            "type": "firebot:chat",
            "message": f"{chatUser}, please provide a card name!",
            "chatter": "bot"
        })
        return response

    browser = None
    try:
        browser = await launch({
            'headless': True,
            'args': [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu'
            ]
        })
        page = await browser.newPage()
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        )

        search_url = f"https://www.tcgplayer.com/search/all/product?q={urllib.parse.quote(searchTerm)}&view=grid"
        logger.info(f"Navigating to: {search_url}")
        await page.goto(search_url, {'waitUntil': 'networkidle2', 'timeout': 30000})
        await asyncio.sleep(3)

        selectors = [
            '.product-card__product',
            '.search-result',
            '.product-item',
            '[data-testid="product-card"]',
            '.product'
        ]

        products = []

        for selector in selectors:
            try:
                await page.waitForSelector(selector, {'timeout': 5000})
                elements = await page.querySelectorAll(selector)
                for el in elements:
                    title_el = await el.querySelector('.product-card__title') or \
                               await el.querySelector('.product-title') or \
                               await el.querySelector('h3') or \
                               await el.querySelector('h4') or \
                               await el.querySelector('[data-testid="product-title"]')
                    price_el = await el.querySelector('.product-card__market-price--value') or \
                               await el.querySelector('.market-price') or \
                               await el.querySelector('.price') or \
                               await el.querySelector('[data-testid="market-price"]')
                    set_el = await el.querySelector('.product-card__set-name__variant') or \
                             await el.querySelector('.set-name') or \
                             await el.querySelector('.product-set')

                    title = await title_el.getProperty('textContent')
                    title = (await title.jsonValue()).strip() if title else ''
                    market = await price_el.getProperty('textContent') if price_el else None
                    market = (await market.jsonValue()).strip() if market else 'N/A'
                    setName = await set_el.getProperty('textContent') if set_el else None
                    setName = (await setName.jsonValue()).strip() if setName else ''

                    if not title:
                        continue

                    isFoil = 'foil' in title.lower()
                    isSpecial = bool(re.search(r"(serialized|prestige|hyperspace|showcase|alternate art|extended art|organized play|promo|\(prestige\)|\(showcase\)|\(hyperspace\)|\(serialized\))",
                                                title + ' ' + setName, re.I))
                    cleanTitle = re.sub(r'\(foil\)|foil', '', title, flags=re.I).strip().lower()

                    products.append({
                        'title': title,
                        'market': market,
                        'setName': setName,
                        'isFoil': isFoil,
                        'isSpecial': isSpecial,
                        'cleanTitle': cleanTitle
                    })

                if products:
                    break
            except Exception:
                continue

        if not products:
            raise Exception("No product cards found with any selector")

        logger.info(f"Found {len(products)} total products")

        normalizedSearch = re.sub(r'\W', '', searchTerm.lower())

        def fuzzy_match(searchTerm, cardTitle):
            searchWords = searchTerm.lower().split()
            titleWords = cardTitle.lower().split()
            matched = [w for w in searchWords if any(
                w in tw or tw in w or (abs(len(tw)-len(w)) <= 1 and tw[:-1] == w[:-1])
                for tw in titleWords)]
            return len(matched) >= max(1, int(len(searchWords)*0.8))

        matchingCards = [c for c in products if
                         normalizedSearch in re.sub(r'\W', '', c['cleanTitle']) or
                         normalizedSearch in re.sub(r'\W', '', c['title'].lower()) or
                         fuzzy_match(searchTerm, c['title']) or
                         fuzzy_match(searchTerm, c['cleanTitle'])]

        logger.info(f"Found {len(matchingCards)} matching cards after filtering")

        if not matchingCards:
            fallback = products[0]
            response['effects'].append({
                "type": "firebot:chat",
                "message": f"{chatUser}, no exact match for '{searchTerm}'. Found: {fallback['title']} ({fallback['setName']}) | Price: {fallback['market']}",
                "chatter": "bot"
            })
            await browser.close()
            return response

        nonFoilCards = [c for c in matchingCards if not c['isFoil']]
        foilCards = [c for c in matchingCards if c['isFoil']]

        def prioritize_main_set(cards):
            if not cards:
                return None
            mainSetCards = [c for c in cards if not c['isSpecial']]
            sortedMain = sorted(
                [c for c in mainSetCards if c['market'] != 'N/A'],
                key=lambda x: float(re.sub(r'[^0-9.]', '', x['market']) or 999999)
            )
            if sortedMain:
                return sortedMain[0]
            sortedAll = sorted(
                [c for c in cards if c['market'] != 'N/A'],
                key=lambda x: float(re.sub(r'[^0-9.]', '', x['market']) or 999999)
            )
            return sortedAll[0] if sortedAll else cards[0]

        bestNonFoil = prioritize_main_set(nonFoilCards)
        bestFoil = prioritize_main_set(foilCards)

        await browser.close()

        message = f"{chatUser}, "
        if bestNonFoil and bestFoil:
            message += f"Card: {bestNonFoil['cleanTitle']} ({bestNonFoil['setName']}) | Regular: {bestNonFoil['market']} | Foil: {bestFoil['market']}"
        elif bestNonFoil:
            message += f"Card: {bestNonFoil['title']} ({bestNonFoil['setName']}) | Market: {bestNonFoil['market']} | Foil: Not found"
        elif bestFoil:
            message += f"Card: {bestFoil['cleanTitle']} ({bestFoil['setName']}) | Regular: Not found | Foil: {bestFoil['market']}"

        response['effects'].append({
            "type": "firebot:chat",
            "message": message,
            "chatter": "bot"
        })

        return response

    except Exception as e:
        logger.error(f"Error fetching card: {str(e)}")
        if browser:
            await browser.close()
        response['success'] = False
        response['effects'].append({
            "type": "firebot:chat",
            "message": f"{chatUser}, failed to fetch card '{searchTerm}' - {str(e)}",
            "chatter": "bot"
        })
        return response

# Example run for testing
if __name__ == "__main__":
    class DummyLogger:
        def info(self, msg): print("[INFO]", msg)
        def error(self, msg): print("[ERROR]", msg)

    dummy_run_request = {
        "modules": {"logger": DummyLogger()},
        "trigger": {"metadata": {"username": "Tester", "userCommand": {"args": ["cancel"]}}}
    }

    result = asyncio.get_event_loop().run_until_complete(run(dummy_run_request))
    import json
    print(json.dumps(result, indent=4))
