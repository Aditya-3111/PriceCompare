"""Basket optimiser: compares one-store totals and a smart split across stores."""

def fee_for(p, subtotal):
    return 0 if (p.free_delivery_above and subtotal >= p.free_delivery_above) else (p.delivery_fee or 0)

def compare_basket(items, platforms, offers_for):
    pm = {p.id: p for p in platforms}
    rows = [dict(q=i["q"], qty=i["qty"], pack=i.get("pack", ""), offers=offers_for(i["q"], i.get("pack", "")))
            for i in items]

    def price(r, pid):
        o = r["offers"].get(pid)
        return o["price"] * r["qty"] if o and o["in_stock"] else None

    singles = []
    for p in platforms:
        sub, missing = 0, []
        for r in rows:
            v = price(r, p.id)
            if v is None: missing.append(r["q"])
            else: sub += v
        fee = fee_for(p, sub) if sub else 0
        singles.append(dict(platform_id=p.id, platform=p.name, color=p.color, delivery_time=p.delivery_time,
                            subtotal=sub, fee=fee, total=sub + fee, complete=not missing, missing=missing))
    singles.sort(key=lambda s: (not s["complete"], s["total"]))
    best_single = singles[0] if singles and singles[0]["complete"] else None

    def cost(assign):
        subs = {}
        for idx, pid in assign.items(): subs[pid] = subs.get(pid, 0) + price(rows[idx], pid)
        return sum(s + fee_for(pm[pid], s) for pid, s in subs.items())

    assign = {}
    for idx, r in enumerate(rows):
        cands = [pid for pid in pm if price(r, pid) is not None]
        if cands: assign[idx] = min(cands, key=lambda pid: price(r, pid))
    improved, passes = True, 0
    while improved and passes < 20:          # delivery-fee aware local search
        improved, passes = False, passes + 1
        for idx, r in enumerate(rows):
            if idx not in assign: continue
            cur = cost(assign)
            for pid in pm:
                if pid != assign[idx] and price(r, pid) is not None:
                    old = assign[idx]; assign[idx] = pid
                    if cost(assign) < cur - 1e-9: cur, improved = cost(assign), True
                    else: assign[idx] = old
    if best_single and cost(assign) >= best_single["total"]:
        assign = {idx: best_single["platform_id"] for idx in range(len(rows))}

    groups = {}
    for idx, pid in assign.items():
        g = groups.setdefault(pid, dict(platform_id=pid, platform=pm[pid].name, color=pm[pid].color,
                                        delivery_time=pm[pid].delivery_time, items=[], subtotal=0))
        o, r = rows[idx]["offers"][pid], rows[idx]
        g["items"].append(dict(q=r["q"], pack=r["pack"], qty=r["qty"], unit=o["price"],
                               line=o["price"] * r["qty"], link=o["link"], live=o["live"]))
        g["subtotal"] += o["price"] * r["qty"]
    for g in groups.values():
        g["fee"] = fee_for(pm[g["platform_id"]], g["subtotal"]); g["total"] = g["subtotal"] + g["fee"]
    glist = sorted(groups.values(), key=lambda g: -g["total"])
    grand = sum(g["total"] for g in glist)
    unavailable = [rows[i]["q"] for i in range(len(rows)) if i not in assign]

    matrix = []
    for r in rows:
        prices = {str(pid): (r["offers"].get(pid) if r["offers"].get(pid, {}).get("in_stock") else None) for pid in pm}
        avail = [(o["price"], pid) for pid, o in ((int(k), v) for k, v in prices.items()) if o]
        matrix.append(dict(q=r["q"], pack=r["pack"], qty=r["qty"], prices=prices,
                           cheapest=str(min(avail)[1]) if avail else None))
    return dict(
        platforms=[dict(id=p.id, name=p.name, color=p.color) for p in platforms],
        matrix=matrix, singles=singles, best_single=best_single,
        split=dict(groups=glist, grand=grand, stores=len(glist), unavailable=unavailable,
                   savings=(best_single["total"] - grand) if best_single else None))