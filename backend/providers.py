"""Price providers - live data only, nothing guessed.

  * SERPAPI_KEY set  -> Google Shopping results (free plan works) are matched to your
    platforms by the shop name (Platform.source_match). Matched platforms get a
    real, live price straight from the search result.
  * An Apify actor configured for a platform (APIFY_<KEY>_ACTOR in .env) -> that
    platform's real price/stock comes straight from the actor's run.
  * A platform with no live source, or no result for this search/pack, is left
    OUT of the results entirely. No made-up "estimated" price is ever shown.
Every API result is cached (CACHE_HOURS) so free searches last longer.
"""
import json, os
from datetime import datetime, timedelta
from urllib.parse import quote_plus
import requests
from models import db, PriceCache
from apify_provider import apify_prices
from sizing import extract_sizes

def api_key(): return os.getenv("SERPAPI_KEY", "").strip()
def cache_hours(): return float(os.getenv("CACHE_HOURS", "12"))
def norm(q): return " ".join(q.lower().split())

def serpapi_search(q):
    r = requests.get("https://serpapi.com/search.json", timeout=25, params=dict(
        engine="google_shopping", q=q, gl="in", hl="en", google_domain="google.co.in", api_key=api_key()))
    r.raise_for_status()
    data = r.json()
    if data.get("error"): raise RuntimeError(data["error"])
    out = []
    for x in data.get("shopping_results", []):
        if x.get("extracted_price") is None: continue
        out.append(dict(source=x.get("source", ""), title=x.get("title", ""),
                        price=x["extracted_price"], old_price=x.get("extracted_old_price"),
                        rating=x.get("rating"), link=x.get("link") or x.get("product_link") or ""))
    return out

def live_results(q):
    """-> (results or None, notice or None). Cached in DB."""
    if not api_key(): return None, None
    k, now = norm(q), datetime.utcnow()
    row = PriceCache.query.filter_by(key=k).first()
    if row and row.created_at > now - timedelta(hours=cache_hours()):
        return json.loads(row.payload), None
    try:
        res = serpapi_search(q)
    except Exception as e:
        if row: return json.loads(row.payload), "Live API failed - showing older cached prices."
        return None, f"Live API error ({e})."
    payload = json.dumps(res)
    if row: row.payload, row.created_at = payload, now
    else: db.session.add(PriceCache(key=k, payload=payload))
    db.session.commit()
    return res, None

def get_prices(q, platforms, pincode="", pack=""):
    """-> ({platform_id: offer}, notice)

    Only platforms with a real, live match are included in the returned dict.
    A platform with no live source, or no matching result for this search/pack,
    is simply absent - the caller shows it as "no live price found", never a
    guessed number.
    """
    live, notice = live_results(q)
    want = extract_sizes(pack) if pack.strip() else extract_sizes(q)
    best = {}
    for r in live or []:
        if want and not (extract_sizes(r["title"]) & want): continue   # wrong pack size, skip
        src = r["source"].lower()
        for p in platforms:
            keys = [s.strip().lower() for s in (p.source_match or "").split(",") if s.strip()]
            if any(s in src for s in keys):
                if p.id not in best or r["price"] < best[p.id]["price"]: best[p.id] = r
                break
    apify_found, apify_notice = apify_prices(q, platforms, pincode, pack)
    best.update(apify_found)
    notice = notice or apify_notice

    offers = {}
    for p in platforms:
        if p.id not in best: continue
        r = best[p.id]
        price = round(r["price"])
        mrp = round(r["old_price"]) if r.get("old_price") else price
        search_link = p.search_url.replace("{q}", quote_plus(q)) if p.search_url else p.url
        offers[p.id] = dict(price=price, mrp=mrp, rating=r.get("rating"),
                            in_stock=r.get("in_stock", True), link=r["link"] or search_link,
                            title=r["title"], live=True)
        offers[p.id]["discount"] = max(0, round((mrp - price) / mrp * 100)) if mrp else 0
    return offers, notice