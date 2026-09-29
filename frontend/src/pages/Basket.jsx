import { useState } from "react";
import { api } from "../api";
import { useBasket } from "../App.jsx";

const inr = (n) => "Rs " + Number(n).toLocaleString("en-IN");
const SCOPES = [["grocery_marketplace", "Grocery apps + Amazon/Flipkart"], ["grocery", "Grocery apps only"], ["all", "All shops"]];

export default function Basket() {
  const { items, add, setQty, remove, clear } = useBasket();
  const [name, setName] = useState(""); const [pack, setPack] = useState(""); const [scope, setScope] = useState("grocery_marketplace");
  const [res, setRes] = useState(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");

  async function compare() {
    setLoading(true); setErr("");
    try { setRes(await api("/basket/compare", { method: "POST", body: { items, scope } })); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  const best = res?.best_single;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">Your basket</h1>
      <p className="mb-4 text-sm text-slate-500">Add a quantity (for example "200 g", "500 ml") so every shop is compared on the exact same pack. Leave it empty to let each shop show its cheapest available pack.</p>
      <form onSubmit={(e) => { e.preventDefault(); add(name, pack); setName(""); setPack(""); }} className="flex flex-wrap gap-2">
        <input className="input flex-[2] min-w-[160px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item - paneer" />
        <input className="input flex-1 min-w-[120px]" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="Quantity (optional) - 200 g" />
        <button className="btn">Add</button>
      </form>

      <ul className="mt-4 divide-y rounded-xl border bg-white">
        {items.length === 0 && <li className="p-6 text-center text-slate-500">Basket is empty. Add items above or from the search page.</li>}
        {items.map((i) => (
          <li key={i.q + "|" + i.pack} className="flex items-center gap-3 p-3">
            <span className="flex-1 font-medium">{i.q}{i.pack && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">{i.pack}</span>}</span>
            <button className="btn-ghost !px-3" onClick={() => setQty(i.q, i.pack, i.qty - 1)} aria-label="Less">-</button>
            <span className="w-6 text-center">{i.qty}</span>
            <button className="btn-ghost !px-3" onClick={() => setQty(i.q, i.pack, i.qty + 1)} aria-label="More">+</button>
            <button className="text-sm text-red-600 underline" onClick={() => remove(i.q, i.pack)}>Remove</button>
          </li>))}
      </ul>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn" onClick={compare} disabled={loading}>{loading ? "Comparing..." : "Find cheapest"}</button>
          <button className="btn-ghost" onClick={() => { clear(); setRes(null); }}>Empty basket</button>
        </div>)}
      {err && <p className="mt-3 rounded-lg bg-red-50 p-3 text-red-700" role="alert">{err}</p>}

      {res && (
        <div className="mt-8 space-y-8">
          {res.mode === "demo" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No live price source is set up yet. Add SERPAPI_KEY and/or Apify actor keys in backend/.env - until then this basket will show items as unavailable.</p>}
          {res.notices.map((n) => <p key={n} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{n}</p>)}
          {res.split.unavailable.length > 0 && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Not available anywhere: {res.split.unavailable.join(", ")}</p>}

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border-2 border-best bg-white p-5">
              <p className="text-sm font-semibold text-best">Cheapest way to buy everything</p>
              <p className="mt-1 text-3xl font-bold">{inr(res.split.grand)}</p>
              <p className="text-sm text-slate-500">from {res.split.stores} store{res.split.stores > 1 ? "s" : ""}, delivery fees included</p>
              {res.split.savings > 0 && <p className="mt-2 text-sm">You save <b>{inr(res.split.savings)}</b> compared with the best single store.</p>}
            </div>
            <div className="rounded-xl border bg-white p-5">
              <p className="text-sm font-semibold text-slate-500">Best single store</p>
              {best ? <><p className="mt-1 text-3xl font-bold">{inr(best.total)}</p>
                <p className="text-sm text-slate-500">{best.platform} - items {inr(best.subtotal)} + delivery {best.fee ? inr(best.fee) : "Free"}</p></>
                : <p className="mt-2 text-slate-500">No single store has every item in stock.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Where to buy each item</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {res.split.groups.map((g) => (
                <div key={g.platform_id} className="rounded-xl border bg-white">
                  <div className="flex items-center justify-between rounded-t-xl px-4 py-2 text-white" style={{ background: g.color }}>
                    <b>{g.platform}</b><span className="text-sm">{g.delivery_time}</span></div>
                  <ul className="divide-y text-sm">
                    {g.items.map((i) => (
                      <li key={i.q + i.pack} className="flex items-center justify-between gap-2 px-4 py-2">
                        <a href={i.link} target="_blank" rel="noopener noreferrer" className="underline">{i.q}{i.pack ? ` (${i.pack})` : ""} x {i.qty}</a>
                        <span>{inr(i.line)}</span></li>))}
                  </ul>
                  <div className="space-y-1 border-t px-4 py-3 text-sm">
                    <p className="flex justify-between"><span>Items</span><span>{inr(g.subtotal)}</span></p>
                    <p className="flex justify-between"><span>Delivery</span><span>{g.fee ? inr(g.fee) : "Free"}</span></p>
                    <p className="flex justify-between font-bold"><span>Total</span><span>{inr(g.total)}</span></p>
                  </div>
                </div>))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">All stores, one shop for everything</h2>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left"><tr>{["Store", "Items", "Delivery", "Total", "Missing"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
                <tbody>{res.singles.map((s) => (
                  <tr key={s.platform_id} className={`border-t ${best && s.platform_id === best.platform_id ? "bg-green-50" : ""}`}>
                    <td className="p-2 font-semibold">{s.platform}</td><td className="p-2">{inr(s.subtotal)}</td>
                    <td className="p-2">{s.fee ? inr(s.fee) : "Free"}</td><td className="p-2 font-bold">{s.complete ? inr(s.total) : "-"}</td>
                    <td className="p-2 text-slate-500">{s.missing.join(", ") || "None"}</td></tr>))}</tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Price of each item (per unit)</h2>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr><th className="p-2">Item</th>{res.platforms.map((p) => <th key={p.id} className="p-2">{p.name}</th>)}</tr></thead>
                <tbody>{res.matrix.map((r) => (
                  <tr key={r.q + r.pack} className="border-t"><td className="p-2 font-medium">{r.q}{r.pack ? ` (${r.pack})` : ""} x {r.qty}</td>
                    {res.platforms.map((p) => { const o = r.prices[String(p.id)]; const low = r.cheapest === String(p.id);
                      return <td key={p.id} className={`p-2 ${low ? "bg-green-100 font-bold text-green-800" : ""}`}>{o ? inr(o.price) : <span className="text-slate-300">no live price</span>}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div>
          </section>
        </div>)}
    </main>
  );
}