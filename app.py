import os, re
import requests
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (JWTManager, create_access_token, jwt_required,
                                get_jwt_identity, get_jwt)
from sqlalchemy import func
from models import db, User, Platform, SearchLog, PriceCache
from providers import get_prices, api_key, cache_hours
from basket import compare_basket

load_dotenv()
app = Flask(__name__)
app.config.update(
    SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///pricecompare.db"),
    JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY", "dev-secret-change-me-please-32bytes!"),
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
)
CORS(app)
db.init_app(app)
jwt = JWTManager(app)

# name, category, url, search_url, source_match, color, fee, free_above, time, price_factor
PLATFORMS = [
 ("Blinkit","grocery","https://blinkit.com","https://blinkit.com/s/?q={q}","blinkit","#eab308",30,199,"10-15 min",1.06),
 ("Zepto","grocery","https://www.zeptonow.com","https://www.zeptonow.com/search?query={q}","zepto","#7c3aed",25,199,"10-12 min",1.05),
 ("Swiggy Instamart","grocery","https://www.swiggy.com/instamart","https://www.swiggy.com/instamart/search?custom_back=true&query={q}","instamart,swiggy","#f97316",30,199,"10-20 min",1.05),
 ("Flipkart Minutes","grocery","https://www.flipkart.com/grocery-supermart-store","https://www.flipkart.com/search?q={q}&marketplace=GROCERY","","#2563eb",25,249,"10-20 min",1.03),
 ("Amazon Fresh/Now","grocery","https://www.amazon.in/fresh","https://www.amazon.in/s?k={q}&i=nowstore","","#16a34a",29,249,"15 min - same day",1.02),
 ("BigBasket","grocery","https://www.bigbasket.com","https://www.bigbasket.com/ps/?q={q}","bigbasket","#65a30d",35,500,"Same day / 1 day",1.00),
 ("JioMart","grocery","https://www.jiomart.com","https://www.jiomart.com/search/{q}","jiomart","#0284c7",49,599,"1-2 days",0.97),
 ("DMart Ready","grocery","https://www.dmart.in","https://www.dmart.in/search?searchTerm={q}","dmart","#059669",50,700,"Next day",0.94),
 ("Amazon","marketplace","https://www.amazon.in","https://www.amazon.in/s?k={q}","amazon","#f59e0b",40,499,"1-3 days",1.00),
 ("Flipkart","marketplace","https://www.flipkart.com","https://www.flipkart.com/search?q={q}","flipkart","#1d4ed8",40,500,"2-4 days",0.98),
 ("Meesho","fashion","https://www.meesho.com","https://www.meesho.com/search?q={q}","meesho","#db2777",0,0,"4-7 days",0.90),
 ("Myntra","fashion","https://www.myntra.com","https://www.myntra.com/{q}","myntra","#e11d48",99,999,"2-5 days",1.05),
 ("Ajio","fashion","https://www.ajio.com","https://www.ajio.com/search/?text={q}","ajio","#0f766e",99,999,"3-6 days",1.02),
 ("Nykaa","fashion","https://www.nykaa.com","https://www.nykaa.com/search/result/?q={q}","nykaa","#ec4899",49,499,"2-5 days",1.03),
]

def seed():
    db.create_all()
    if not Platform.query.first():
        for n,c,u,su,sm,col,fee,free,t,f in PLATFORMS:
            db.session.add(Platform(name=n,category=c,url=u,search_url=su,source_match=sm,color=col,
                delivery_fee=fee,free_delivery_above=free,delivery_time=t,price_factor=f))
    email = os.getenv("ADMIN_EMAIL","admin@example.com")
    if not User.query.filter_by(email=email).first():
        a = User(name="Admin", email=email, role="admin")
        a.set_password(os.getenv("ADMIN_PASSWORD","admin123"))
        db.session.add(a)
    db.session.commit()

def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*a, **k):
        if get_jwt().get("role") != "admin":
            return jsonify(error="Admin access required"), 403
        return fn(*a, **k)
    return wrapper

def token_for(u):
    return create_access_token(identity=str(u.id), additional_claims={"role": u.role})

# ---------- auth ----------
@app.post("/api/auth/register")
def register():
    d = request.get_json() or {}
    if not all(d.get(k) for k in ("name","email","password")):
        return jsonify(error="Name, email and password are required"), 400
    if len(d["password"]) < 6:
        return jsonify(error="Password must be at least 6 characters"), 400
    if User.query.filter_by(email=d["email"].lower()).first():
        return jsonify(error="Email already registered"), 409
    u = User(name=d["name"], email=d["email"].lower()); u.set_password(d["password"])
    db.session.add(u); db.session.commit()
    return jsonify(token=token_for(u), user=u.to_dict()), 201

@app.post("/api/auth/login")
def login():
    d = request.get_json() or {}
    u = User.query.filter_by(email=(d.get("email") or "").lower()).first()
    if not u or not u.check_password(d.get("password","")):
        return jsonify(error="Wrong email or password"), 401
    if not u.active:
        return jsonify(error="This account is disabled"), 403
    return jsonify(token=token_for(u), user=u.to_dict())

@app.get("/api/auth/me")
@jwt_required()
def me():
    return jsonify(user=db.get_or_404(User, int(get_jwt_identity())).to_dict())

# ---------- location ----------
def req_pincode():
    p = request.headers.get("X-Pincode", "").strip()
    return p if re.fullmatch(r"\d{6}", p) else ""

@app.get("/api/geo/pincode")
@jwt_required()
def geo_pincode():
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify(error="Invalid location"), 400
    try:
        r = requests.get("https://nominatim.openstreetmap.org/reverse", timeout=10,
                         params=dict(format="jsonv2", lat=lat, lon=lon, addressdetails=1, zoom=18),
                         headers={"User-Agent": "PriceCompare/1.0 (learning project)", "Accept-Language": "en"})
        r.raise_for_status()
        addr = r.json().get("address", {})
    except Exception:
        return jsonify(error="Could not look up your pincode. Please enter it manually."), 502
    pin = re.sub(r"\s", "", addr.get("postcode", ""))
    if not re.fullmatch(r"\d{6}", pin):
        return jsonify(error="Pincode not found for this spot. Please enter it manually."), 404
    place = addr.get("suburb") or addr.get("city") or addr.get("town") or addr.get("village") or addr.get("state_district") or ""
    return jsonify(pincode=pin, place=place)

# ---------- search ----------
@app.get("/api/search")
@jwt_required()
def search():
    f = request.args
    q = (f.get("q") or "").strip()
    if not q:
        return jsonify(error="Enter a product name"), 400
    pack = (f.get("pack") or "").strip()
    plats = Platform.query.filter_by(enabled=True)
    if f.get("category"):
        plats = plats.filter_by(category=f["category"])
    plats = plats.all()
    offers, notice = get_prices(q, plats, req_pincode(), pack)
    items = []
    for p in plats:
        o = offers.get(p.id)
        if o is None: continue          # no live price found on this shop - don't show a guessed one
        fee = 0 if (p.free_delivery_above and o["price"] >= p.free_delivery_above) else p.delivery_fee
        items.append(dict(o, platform_id=p.id, platform=p.name, category=p.category, color=p.color,
                          delivery_fee=fee, delivery_time=p.delivery_time,
                          free_delivery_above=p.free_delivery_above, total=o["price"] + fee))
    if f.get("min"): items = [i for i in items if i["total"] >= float(f["min"])]
    if f.get("max"): items = [i for i in items if i["total"] <= float(f["max"])]
    if f.get("free_delivery") == "1": items = [i for i in items if i["delivery_fee"] == 0]
    if f.get("in_stock") == "1": items = [i for i in items if i["in_stock"]]
    if f.get("min_rating"): items = [i for i in items if (i["rating"] or 0) >= float(f["min_rating"])]
    keys = {"price_asc": ("price", False), "price_desc": ("price", True),
            "total_asc": ("total", False), "rating_desc": ("rating", True),
            "discount_desc": ("discount", True), "delivery_asc": ("delivery_fee", False)}
    k, rev = keys.get(f.get("sort", "total_asc"), keys["total_asc"])
    items.sort(key=lambda i: i[k] if i[k] is not None else -1, reverse=rev)
    db.session.add(SearchLog(term=q, user_id=int(get_jwt_identity()))); db.session.commit()
    unavailable = [p.name for p in plats if p.id not in offers]
    if not offers and not notice and not api_key():
        notice = "No live price source is set up yet. Add SERPAPI_KEY and/or Apify actor keys in backend/.env."
    return jsonify(query=q, pack=pack, count=len(items), results=items, notice=notice,
                   unavailable=unavailable, mode="live" if api_key() else "demo")
                   
@app.post("/api/basket/compare")
@jwt_required()
def basket_compare():
    raw = (request.get_json() or {}).get("items") or []
    items = [dict(q=str(i.get("q", "")).strip(), pack=str(i.get("pack") or "").strip(),
                  qty=max(1, min(20, int(i.get("qty", 1) or 1))))
             for i in raw if str(i.get("q", "")).strip()][:15]
    if not items: return jsonify(error="Add at least one item to your basket"), 400
    scope = (request.get_json() or {}).get("scope", "grocery_marketplace")
    cats = {"grocery": ["grocery"], "grocery_marketplace": ["grocery", "marketplace"]}.get(scope)
    plats = Platform.query.filter_by(enabled=True)
    if cats: plats = plats.filter(Platform.category.in_(cats))
    plats = plats.all()
    notices = []
    def offers_for(q, pack=""):
        o, n = get_prices(q, plats, req_pincode(), pack)
        if n and n not in notices: notices.append(n)
        return o
    res = compare_basket(items, plats, offers_for)
    res.update(notices=notices, mode="live" if api_key() else "demo")
    return jsonify(res)

@app.get("/api/categories")
@jwt_required()
def categories():
    return jsonify(categories=[c for (c,) in db.session.query(Platform.category).distinct()])

# ---------- admin ----------
@app.get("/api/admin/stats")
@admin_required
def stats():
    top = (db.session.query(SearchLog.term, func.count(SearchLog.id))
           .group_by(SearchLog.term).order_by(func.count(SearchLog.id).desc()).limit(8).all())
    return jsonify(users=User.query.count(), searches=SearchLog.query.count(),
                   platforms=Platform.query.count(),
                   enabled=Platform.query.filter_by(enabled=True).count(),
                   top_searches=[dict(query=q, count=n) for q, n in top])

PFIELDS = ("name","category","url","search_url","source_match","color","delivery_fee",
           "free_delivery_above","delivery_time","price_factor","enabled")

@app.get("/api/admin/provider")
@admin_required
def provider_info():
    return jsonify(mode="live" if api_key() else "demo", key_set=bool(api_key()),
                   cache_hours=cache_hours(), cached_queries=PriceCache.query.count())

@app.delete("/api/admin/cache")
@admin_required
def clear_cache():
    PriceCache.query.delete(); db.session.commit()
    return jsonify(ok=True)

@app.get("/api/admin/platforms")
@admin_required
def list_platforms():
    return jsonify(platforms=[p.to_dict() for p in Platform.query.order_by(Platform.name)])

@app.post("/api/admin/platforms")
@admin_required
def add_platform():
    d = request.get_json() or {}
    if not d.get("name"): return jsonify(error="Name is required"), 400
    if Platform.query.filter_by(name=d["name"]).first(): return jsonify(error="Already exists"), 409
    p = Platform(**{k: d[k] for k in PFIELDS if k in d})
    db.session.add(p); db.session.commit()
    return jsonify(platform=p.to_dict()), 201

@app.put("/api/admin/platforms/<int:pid>")
@admin_required
def update_platform(pid):
    p = db.get_or_404(Platform, pid); d = request.get_json() or {}
    for k in PFIELDS:
        if k in d: setattr(p, k, d[k])
    db.session.commit()
    return jsonify(platform=p.to_dict())

@app.delete("/api/admin/platforms/<int:pid>")
@admin_required
def delete_platform(pid):
    db.session.delete(db.get_or_404(Platform, pid)); db.session.commit()
    return jsonify(ok=True)

@app.get("/api/admin/users")
@admin_required
def users():
    return jsonify(users=[u.to_dict() for u in User.query.order_by(User.id.desc())])

@app.put("/api/admin/users/<int:uid>")
@admin_required
def update_user(uid):
    u = db.get_or_404(User, uid); d = request.get_json() or {}
    if "active" in d: u.active = bool(d["active"])
    if d.get("role") in ("customer", "admin"): u.role = d["role"]
    db.session.commit()
    return jsonify(user=u.to_dict())

with app.app_context():
    seed()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
