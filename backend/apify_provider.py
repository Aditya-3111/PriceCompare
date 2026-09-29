"""Live prices for Blinkit / Zepto / Instamart (etc.) through Apify actors.

Configured only through backend/.env - no code edits needed to change actor or location.
Results are cached in the database so your free Apify credit lasts longer.
"""
import json, os, re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import requests
from models import db, PriceCache
from sizing import extract_sizes as _sizes

# .env key  ->  platform name in your Platforms table
APIFY_PLATFORMS = {
    "BLINKIT": "Blinkit",
    "ZEPTO": "Zepto",
    "INSTAMART": "Swiggy Instamart",
    "AMAZONFRESH": "Amazon Fresh/Now",
    "FLIPKARTMINUTES": "Flipkart Minutes",
}
DEFAULT_INPUT = '{"queries": ["{q}"], "location": "{pincode}"}'

def _env(k, d=""): return os.getenv(k, d).strip()
def _norm(q): return " ".join(q.lower().split())

def _num(v):
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, dict):
        for k in ("value", "amount", "price"):
            if k in v: return _num(v[k])
    if isinstance(v, str):
        m = re.search(r"\d[\d,]*\.?\d*", v)
        return float(m.group().replace(",", "")) if m else None
    return None

def _first(d, keys):
    for k in keys:
        if d.get(k) not in (None, ""): return d[k]
    return None

def _normalize(items):
    """Turn whatever the actor returns into one standard shape."""
    div = float(_env("APIFY_PRICE_DIVISOR", "1") or 1)
    out = []
    for it in items:
        if not isinstance(it, dict): continue
        price = _num(_first(it, ["price", "sellingPrice", "selling_price", "salePrice", "offerPrice", "discountedPrice", "sp"]))
        if price is None: continue
        mrp = _num(_first(it, ["mrp", "MRP", "originalPrice", "original_price", "marketPrice"]))
        stock = _first(it, ["inStock", "in_stock", "available", "isAvailable"])
        status = str(_first(it, ["stock", "stockStatus", "availability"]) or "").lower()
        in_stock = bool(stock) if stock is not None else not ("out" in status or "unavailable" in status)
        out.append(dict(
            brand=str(_first(it, ["brand", "brandName"]) or ""),
            name=str(_first(it, ["name", "title", "productName", "product_name"]) or ""),
            qty=str(_first(it, ["quantity", "variant", "unit", "weight", "packSize", "pack_size", "size"]) or ""),
            price=price / div, mrp=(mrp / div) if mrp else None, in_stock=in_stock,
            rating=_num(_first(it, ["rating", "avgRating"])),
            url=str(_first(it, ["url", "productUrl", "product_url", "link"]) or "")))
    return out

_STOP = {"of", "and", "with", "the", "a", "in", "pack", "x"}

def _words(text):
    """Meaningful words of a product text: sizes/numbers removed, plural 's' trimmed."""
    text = re.sub(r"\d+(?:\.\d+)?\s*(kg|gm|g|ltrs|ltr|litres|litre|liters|liter|l|ml)\b", " ", text.lower())
    return {w.rstrip("s") for w in re.findall(r"[a-z]+", text) if w not in _STOP}

def _is_multipack(i):
    return bool(re.match(r"\s*\d+\s*x\s", i["qty"].lower())) or "pack of" in i["name"].lower()

def _pick(items, q, pack=""):
    """Cheapest product matching the words in q, and the pack size if one was given.

    pack (e.g. "500 ml", "1 kg") takes priority. If pack is empty, a size typed
    inside q itself (old "milk 500ml" style) is used instead. If neither has a
    size, any pack is accepted - the cheapest available quantity is returned,
    same as before this filter existed.

    When pack IS given but this platform doesn't stock that exact size, we
    return None (no result) rather than silently substituting a different
    size - that mismatch was the whole problem being fixed.
    """
    qw = _words(q)
    want = _sizes(pack) if pack.strip() else _sizes(q)
    txt = lambda i: i["name"] + " " + i["qty"] + " " + i.get("brand", "")
    pool = [i for i in items if qw and qw <= _words(txt(i))] or items       # same product words
    if not (re.search(r"pack|\d\s*x\s", q.lower()) or re.search(r"pack|\d\s*x\s", pack.lower())):
        pool = [i for i in pool if not _is_multipack(i)] or pool           # single packs only
    if want:
        sized = [i for i in pool if want <= _sizes(i["name"] + " " + i["qty"])]
        if not sized: return None                                          # exact size not sold here
        pool = sized
    ok = [i for i in pool if i["in_stock"]]
    pool = ok or pool
    return min(pool, key=lambda i: i["price"]) if pool else None

def _run(actor, payload):
    r = requests.post(f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items",
                      params={"token": _env("APIFY_TOKEN"), "timeout": 90}, json=payload, timeout=120)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []

def apify_prices(q, platforms, pincode="", pack=""):
    """-> ({platform_id: result}, notice or None)"""
    if not _env("APIFY_TOKEN"): return {}, None
    pin = pincode or _env("APIFY_PINCODE")
    ttl = timedelta(hours=float(_env("APIFY_CACHE_HOURS") or _env("CACHE_HOURS", "12")))
    now, by_name = datetime.utcnow(), {p.name: p for p in platforms}
    found, notes, todo, cached = {}, [], {}, {}
    for key, pname in APIFY_PLATFORMS.items():
        actor = _env(f"APIFY_{key}_ACTOR")
        if not actor or pname not in by_name: continue
        ck = f"apify:{key}:{pin}:{_norm(q)}"[:200]
        row = PriceCache.query.filter_by(key=ck).first()
        if row and row.created_at > now - ttl: cached[key] = json.loads(row.payload)
        else: todo[key] = (ck, row, actor, _env(f"APIFY_{key}_INPUT") or DEFAULT_INPUT)

    def call(key):
        _, _, actor, tpl = todo[key]
        safe = q.replace('"', "").replace("\\", "")
        payload = json.loads(tpl.replace("{q}", safe).replace("{pincode}", pin))
        return _normalize(_run(actor, payload))

    if todo:
        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {k: ex.submit(call, k) for k in todo}
        for key, fut in futs.items():
            ck, row, _, _ = todo[key]
            try:
                items = fut.result()[:80]
            except Exception as e:
                notes.append(f"Apify {APIFY_PLATFORMS[key]} failed: {str(e)[:120]}")
                if row: cached[key] = json.loads(row.payload)
                continue
            payload = json.dumps(items)
            if row: row.payload, row.created_at = payload, now
            else: db.session.add(PriceCache(key=ck, payload=payload))
            cached[key] = items
        db.session.commit()

    for key, items in cached.items():
        best = _pick(items, q, pack)
        if best:
            found[by_name[APIFY_PLATFORMS[key]].id] = dict(
                price=best["price"], old_price=best["mrp"], rating=best["rating"], in_stock=best["in_stock"],
                link=best["url"], title=(best["name"] + " " + best["qty"]).strip())
    return found, (notes[0] if notes else None)