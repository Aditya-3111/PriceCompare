# PriceCompare

Search any product once and see its **real, live price** on every connected shop -
grocery quick-commerce apps (Blinkit, Zepto, Swiggy Instamart) and marketplaces
(Amazon, Flipkart, BigBasket, JioMart, Myntra, Ajio, Nykaa...) - side by side, with
delivery fee and delivery time included, sorted and filtered however you like.
No guessed or "estimated" prices are ever shown - only what a live API/scraper
actually returned.

**Stack:** React + Tailwind (Vite) frontend · Python Flask backend · SQLite by
default (MySQL optional) · SerpAPI (Google Shopping) + Apify for live prices.

---

## Features

- Email/password login (JWT) with **customer** and **admin** roles
- Search any product, optionally with an exact **quantity/pack size** (e.g. "500 ml")
  so every shop is compared on the same pack, not a random one
- Every result shown is a **live price** - a shop with no live match for that
  search is simply left out, never filled in with a guess
- Sort by total cost (price + delivery), price, delivery fee, rating, discount
- Filter by shop type, price range, minimum rating, free delivery, in stock
- **Basket**: add several items (each with its own optional quantity), and see
  - the cheapest single shop that has everything,
  - the cheapest way to split the basket across shops (delivery fees included),
  - a per-item price table with the lowest price highlighted
- **Automatic delivery location**: the browser is asked for location permission
  once after login and the pincode is detected automatically (manual entry also
  works); quick-commerce prices are looked up for that pincode/city
- Clicking a shop opens its real product/search page in a new tab
- **Admin panel**: enable/disable shops, edit delivery fee / free-delivery
  threshold / delivery time / search URL, add new shops, manage users, see
  top searches, see live-vs-demo mode and clear the price cache

---

## Project structure

```
pricecompare/
├── backend/
│   ├── app.py              Flask routes (auth, search, basket, admin, geo)
│   ├── models.py           SQLAlchemy models (User, Platform, SearchLog, PriceCache)
│   ├── providers.py        SerpAPI (Google Shopping) live price matching
│   ├── apify_provider.py   Apify actor calls for Blinkit/Zepto/Instamart etc.
│   ├── sizing.py           Shared "500 ml / 1 kg" pack-size parsing
│   ├── basket.py           Cheapest-single-shop and cheapest-split logic
│   ├── requirements.txt
│   └── .env.example        Copy to .env and fill in
└── frontend/
    ├── src/
    │   ├── App.jsx          Routing, auth context, basket state
    │   ├── LocationBar.jsx  Pincode detection / manual entry
    │   ├── api.js           Fetch wrapper (adds JWT + pincode headers)
    │   └── pages/
    │       ├── Login.jsx
    │       ├── Search.jsx
    │       ├── Basket.jsx
    │       └── Admin.jsx
    └── package.json
```

---

## 1. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env         # Windows   (Mac/Linux: cp .env.example .env)
python app.py                  # runs on http://localhost:5000
```

Tables and the default shops are created automatically on first run, and a
default admin is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`
(**set these before the first run** - they only take effect while the database
is still empty).

### Use MySQL instead of SQLite
```sql
CREATE DATABASE pricecompare CHARACTER SET utf8mb4;
```
In `.env`, set:
```
DATABASE_URL=mysql+pymysql://root:password@localhost:3306/pricecompare
```

### Forgot the admin password / want to reset everything
Stop the backend, delete `backend/pricecompare.db` (and the `backend/instance/`
folder if present), double-check `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env`, then
run `python app.py` again. This also wipes registered users and the price cache.

---

## 2. Frontend setup

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173 (proxies /api to Flask)
```

For production, set `VITE_API_URL` to your deployed backend URL and run
`npm run build`.

---

## 3. Getting live prices

Without any API key the app runs with **zero results** for every search - it
never invents a price. Two free sources plug in through `backend/.env` only;
no code changes needed.

### SerpAPI (Amazon, Flipkart, BigBasket, JioMart, ...)
1. Create a free account at https://serpapi.com and copy your API key.
2. In `backend/.env`: `SERPAPI_KEY=your_key_here`
3. Restart the backend.

Google Shopping results are matched to your shops by name (Admin > Platforms >
"Match keywords" = `Platform.source_match`). Every search is cached for
`CACHE_HOURS` (default 12) so the free plan's search quota lasts longer.

### Apify (Blinkit, Zepto, Swiggy Instamart)
1. Create a free account at https://apify.com (no credit card, $5/month free usage).
2. Console > your name > **Settings > API & Integrations** > copy the
   **Personal API token**. In `.env`: `APIFY_TOKEN=your_token`
3. In the Apify Store, find and test an actor for each app (e.g. "Blinkit
   scraper"). Run it once with your city/pincode and a sample product to make
   sure it returns a price.
4. Copy the actor's id (`username~actor-name`, from its URL) and its Input tab's
   JSON into `.env`, e.g.:
   ```
   APIFY_BLINKIT_ACTOR=username~blinkit-scraper
   APIFY_BLINKIT_INPUT='{"city": "delhi", "maxResults": 20, "searchTerms": ["{q}"]}'
   ```
   `{q}` is replaced with the search term automatically. Repeat for
   `APIFY_ZEPTO_ACTOR` / `APIFY_ZEPTO_INPUT` and `APIFY_INSTAMART_ACTOR` /
   `APIFY_INSTAMART_INPUT`. Leave an actor blank to skip that shop.
5. If prices come back 100x too large (paise instead of rupees), set
   `APIFY_PRICE_DIVISOR=100`.

The website asks for the browser's location once after login and detects the
pincode automatically (`APIFY_PINCODE` in `.env` is only a fallback). See
`backend/apify_provider.py` for the full matching logic.

Free-tier quotas run out fast - test with 2-3 searches first. Results are
cached per pincode/city for `CACHE_HOURS`, so repeating a search is free.

### Plugging in another source
`get_prices()` in `backend/providers.py` is the single place other APIs
(Amazon/Flipkart affiliate APIs, a different scraping service, etc.) plug into.

---

## 4. Quantity / pack-size filter

Type a product name and, optionally, a quantity (e.g. "500 ml", "1 kg"):
- **Quantity left empty** - each shop shows its own cheapest available pack
  (as before).
- **Quantity given** - every shop is matched to that *exact* pack size. A shop
  that doesn't stock that size is left out of the results rather than shown
  with a wrong-size price.

---

## 5. Basket

Add items on the Basket page (or "Add to basket" from a search), each with its
own optional quantity. "Find cheapest" shows the best single shop, the cheapest
split across shops (delivery fees included), each shop's breakdown, and a
per-item price table with the lowest price highlighted.

---

## Known limitations

- Free API quotas (SerpAPI ~250 searches/month, Apify ~$5/month) run out with
  heavy use; a paid plan is needed for a real deployment.
- Quick-commerce prices depend on the exact pincode/store and can differ
  slightly from what the shop's own app shows at checkout.
- Scraping any shop directly (instead of through an official API or a service
  like Apify) usually violates that shop's Terms of Service - avoid it.