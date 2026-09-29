import { useEffect, useState } from "react";
import { api } from "../api";
import { useBasket } from "../App.jsx";

const SORTS = [
  ["total_asc", "Lowest total (price + delivery)"], ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"], ["delivery_asc", "Lowest delivery fee"],
  ["rating_desc", "Top rated"], ["discount_desc", "Biggest discount"],
];
const inr = (n) => "Rs " + Number(n).toLocaleString("en-IN");

export default function Search() {
  const { add, items: basketItems } = useBasket();
  const [q, setQ] = useState(""); const [pack, setPack] = useState(""); const [cats, setCats] = useState([]);
  const [fl, setFl] = useState({ sort: "total_asc", category: "", min: "", max: "", free_delivery: false, in_stock: false, min_rating: "" });
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const [showF, setShowF] = useState(false);

  useEffect(() => { api("/categories").then((d) => setCats(d.categories)).catch(() => {}); }, []);

  async function run(query = q, f = fl, p2 = pack) {
    if (!query.trim()) return;
    setLoading(true); setErr("");
    const p = new URLSearchParams({ q: query, sort: f.sort });
    if (p2.trim()) p.set("pack", p2.trim());
    if (f.category) p.set("category", f.category);
    if (f.min) p.set("min", f.min); if (f.max) p.set("max", f.max);
    if (f.free_delivery) p.set("free_delivery", "1"); if (f.in_stock) p.set("in_stock", "1");
    if (f.min_rating) p.set("min_rating", f.min_rating);
    try { setData(await api("/search?" + p)); } catch (x) { setErr(x.message); } finally { setLoading(false); }
  }
  const change = (k, v) => { const n = { ...fl, [k]: v }; setFl(n); if (data) run(data.query, n); };
  const best = data?.results?.length ? Math.min(...data.results.map((r) => r.total)) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-wrap gap-2">
        <input className="input !py-3 text-base flex-[3] min-w-[200px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any product - milk, atta, iPhone 15, kurta..." />
        <input className="input !py-3 text-base flex-1 min-w-[140px]" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="Quantity (optional) - 500 ml, 1 kg" />
        <button className="btn px-6">Compare</button>
        <button type="button" className="btn-ghost md:hidden" onClick={() => setShowF(!showF)}>Filters</button>
      </form>
      <p className="mt-1 text-xs text-slate-500">Leave quantity empty to see each shop's cheapest pack. Enter a quantity (e.g. "500 ml") to compare the exact same pack size everywhere.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className={`${showF ? "block" : "hidden"} space-y-4 rounded-xl border bg-white p-4 text-sm md:block h-fit`}>
          <label className="block"><span className="mb-1 block font-semibold">Sort by</span>
            <select className="input" value={fl.sort} onChange={(e) => change("sort", e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="block"><span className="mb-1 block font-semibold">Shop type</span>
            <select className="input" value={fl.category} onChange={(e) => change("category", e.target.value)}>
              <option value="">All shops</option>{cats.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</select></label>
          <div><span className="mb-1 block font-semibold">Total price range</span>
            <div className="flex gap-2">
              <input className="input" type="number" placeholder="Min" value={fl.min} onChange={(e) => change("min", e.target.value)} />
              <input className="input" type="number" placeholder="Max" value={fl.max} onChange={(e) => change("max", e.target.value)} /></div></div>
          <label className="block"><span className="mb-1 block font-semibold">Minimum rating</span>
            <select className="input" value={fl.min_rating} onChange={(e) => change("min_rating", e.target.value)}>
              <option value="">Any</option><option>3.5</option><option>4</option><option>4.5</option></select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fl.free_delivery} onChange={(e) => change("free_delivery", e.target.checked)} /> Free delivery only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fl.in_stock} onChange={(e) => change("in_stock", e.target.checked)} /> In stock only</label>
        </aside>

        <section>
          {err && <p className="rounded-lg bg-red-50 p-3 text-red-700" role="alert">{err}</p>}
          {loading && <p className="text-slate-500">Checking live prices on every shop...</p>}
          {!data && !loading && <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">Type a product above to see real prices from every connected shop, side by side.</p>}
          {data && !loading && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <p>{data.count} shop{data.count === 1 ? "" : "s"} have a live price for "<b>{data.query}</b>"{data.pack && <> in <b>{data.pack}</b></>}.</p>
                {data.count > 0 && (
                  <button className="btn !py-1" onClick={() => add(data.query, data.pack)}>
                    {basketItems.some((i) => i.q.toLowerCase() === data.query.toLowerCase() && (i.pack || "").toLowerCase() === (data.pack || "").toLowerCase()) ? "In basket - add one more" : "Add to basket"}
                  </button>
                )}
              </div>
              {data.notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{data.notice}</p>}
              {data.count === 0 && !data.notice && (
                <p className="rounded-xl border p-8 text-center text-slate-500">
                  No shop has a live price for this{data.pack ? ` in ${data.pack}` : ""} right now. Try a different search term{data.pack && ", a different quantity,"} or check back later.
                </p>
              )}
              <div className="space-y-3">
                {data.results.map((r) => (
                  <article key={r.platform_id} className={`flex flex-wrap items-center gap-4 rounded-xl border bg-white p-4 ${r.total === best ? "border-best ring-1 ring-best" : ""}`}>
                    <a href={r.link} target="_blank" rel="noopener noreferrer" title={`Open ${r.platform}`}
                       className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: r.color }}>{r.platform[0]}</a>
                    <div className="min-w-[160px] flex-1">
                      <h3 className="font-semibold">{r.platform} {r.total === best && <span className="ml-1 rounded bg-best px-2 py-0.5 text-xs text-white">Best deal</span>}</h3>
                      <p className="text-sm text-slate-500">{r.title}</p>
                      <p className="text-sm text-slate-500">
                        {r.rating != null ? `Rating ${r.rating} / 5` : "No rating available"}
                        {!r.in_stock && <span className="ml-2 text-red-600">Out of stock</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">{inr(r.price)}</p>
                      {r.discount > 0 && <p className="text-xs text-slate-500"><s>{inr(r.mrp)}</s> {r.discount}% off</p>}
                    </div>
                    <div className="w-40 text-sm">
                      <p>Delivery: <b>{r.delivery_fee ? inr(r.delivery_fee) : "Free"}</b></p>
                      <p className="text-slate-500">{r.delivery_time}</p>
                      {r.delivery_fee > 0 && r.free_delivery_above > 0 && <p className="text-xs text-slate-400">Free above {inr(r.free_delivery_above)}</p>}
                      <p className="mt-1 font-semibold">Total {inr(r.total)}</p>
                    </div>
                    <a href={r.link} target="_blank" rel="noopener noreferrer" className="btn">Buy on {r.platform}</a>
                  </article>
                ))}
              </div>
              {data.unavailable?.length > 0 && (
                <p className="mt-4 text-xs text-slate-400">No live price found on: {data.unavailable.join(", ")}.</p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}