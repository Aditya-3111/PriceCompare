import { useEffect, useState } from "react";
import { api } from "../api";

const EMPTY = { name: "", category: "marketplace", url: "", search_url: "", color: "#334155", delivery_fee: 0, free_delivery_above: 0, delivery_time: "2-4 days", price_factor: 1, enabled: true };

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null); const [plats, setPlats] = useState([]); const [users, setUsers] = useState([]);
  const [prov, setProv] = useState(null);
  const [form, setForm] = useState(EMPTY); const [msg, setMsg] = useState("");

  const load = () => {
    api("/admin/stats").then(setStats); api("/admin/platforms").then((d) => setPlats(d.platforms)); api("/admin/users").then((d) => setUsers(d.users)); api("/admin/provider").then(setProv);
  };
  useEffect(load, []);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  async function savePlat(p) {
    try { await api(`/admin/platforms/${p.id}`, { method: "PUT", body: p }); flash(`${p.name} saved`); load(); } catch (e) { flash(e.message); }
  }
  const edit = (id, k, v) => setPlats(plats.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  async function addPlat(e) {
    e.preventDefault();
    try { await api("/admin/platforms", { method: "POST", body: form }); setForm(EMPTY); flash("Platform added"); load(); } catch (x) { flash(x.message); }
  }
  async function del(p) { if (confirm(`Delete ${p.name}?`)) { await api(`/admin/platforms/${p.id}`, { method: "DELETE" }); load(); } }
  async function patchUser(u, body) { await api(`/admin/users/${u.id}`, { method: "PUT", body }); load(); }

  const Tab = ({ id, children }) => <button onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? "bg-ink text-white" : "bg-white border"}`}>{children}</button>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Admin panel</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2"><Tab id="overview">Overview</Tab><Tab id="platforms">Platforms & delivery</Tab><Tab id="users">Users</Tab><Tab id="provider">Price source</Tab>
        {msg && <span className="ml-auto rounded bg-best px-3 py-1 text-sm text-white">{msg}</span>}</div>

      {tab === "overview" && stats && (
        <div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Users", stats.users], ["Searches", stats.searches], ["Platforms", stats.platforms], ["Enabled", stats.enabled]].map(([l, v]) => (
              <div key={l} className="rounded-xl border bg-white p-4"><p className="text-3xl font-bold">{v}</p><p className="text-sm text-slate-500">{l}</p></div>))}
          </div>
          <h2 className="mb-2 mt-6 font-semibold">Most searched</h2>
          <ul className="rounded-xl border bg-white">{stats.top_searches.length === 0 && <li className="p-4 text-slate-500">No searches yet.</li>}
            {stats.top_searches.map((s) => <li key={s.query} className="flex justify-between border-b p-3 last:border-0"><span>{s.query}</span><b>{s.count}</b></li>)}</ul>
        </div>
      )}

      {tab === "platforms" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-left"><tr>{["On", "Name", "Type", "Delivery fee", "Free above", "Delivery time", "Price factor", "Match keywords", "Search URL ({q})", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{plats.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2"><input type="checkbox" checked={p.enabled} onChange={(e) => edit(p.id, "enabled", e.target.checked)} /></td>
                  <td className="p-2 font-semibold">{p.name}</td>
                  <td className="p-2"><select className="input" value={p.category} onChange={(e) => edit(p.id, "category", e.target.value)}>{["marketplace", "grocery", "fashion", "brand"].map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td className="p-2"><input className="input w-20" type="number" value={p.delivery_fee} onChange={(e) => edit(p.id, "delivery_fee", +e.target.value)} /></td>
                  <td className="p-2"><input className="input w-20" type="number" value={p.free_delivery_above} onChange={(e) => edit(p.id, "free_delivery_above", +e.target.value)} /></td>
                  <td className="p-2"><input className="input w-28" value={p.delivery_time} onChange={(e) => edit(p.id, "delivery_time", e.target.value)} /></td>
                  <td className="p-2"><input className="input w-20" type="number" step="0.01" value={p.price_factor} onChange={(e) => edit(p.id, "price_factor", +e.target.value)} /></td>
                  <td className="p-2"><input className="input w-28" value={p.source_match || ""} onChange={(e) => edit(p.id, "source_match", e.target.value)} /></td>
                  <td className="p-2"><input className="input" value={p.search_url || ""} onChange={(e) => edit(p.id, "search_url", e.target.value)} /></td>
                  <td className="whitespace-nowrap p-2"><button className="btn !py-1" onClick={() => savePlat(p)}>Save</button> <button className="btn-ghost !py-1 text-red-600" onClick={() => del(p)}>Delete</button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <form onSubmit={addPlat} className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-3">
            <h2 className="font-semibold sm:col-span-3">Add a platform or brand website</h2>
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="Website URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <input className="input" placeholder="Search URL with {q}" value={form.search_url} onChange={(e) => setForm({ ...form, search_url: e.target.value })} />
            <input className="input" type="number" placeholder="Delivery fee" onChange={(e) => setForm({ ...form, delivery_fee: +e.target.value })} />
            <input className="input" type="number" placeholder="Free delivery above" onChange={(e) => setForm({ ...form, free_delivery_above: +e.target.value })} />
            <input className="input" placeholder="Delivery time" onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} />
            <button className="btn sm:col-span-3">Add platform</button>
          </form>
        </div>
      )}

      {tab === "provider" && prov && (
        <div className="max-w-xl space-y-3 rounded-xl border bg-white p-5 text-sm">
          <p>Mode: <b>{prov.mode === "live" ? "Live (SerpAPI key found)" : "Demo (no SERPAPI_KEY set)"}</b></p>
          <p>Cache: prices are re-used for <b>{prov.cache_hours} hours</b>. Cached searches: <b>{prov.cached_queries}</b></p>
          <p className="text-slate-500">Set SERPAPI_KEY and CACHE_HOURS in backend/.env and restart the backend. "Match keywords" of a platform (Platforms tab, source_match) decide which live results belong to it.</p>
          <button className="btn" onClick={async () => { await api("/admin/cache", { method: "DELETE" }); flash("Cache cleared"); load(); }}>Clear price cache</button>
        </div>
      )}

      {tab === "users" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{["Name", "Email", "Role", "Status", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id} className="border-t"><td className="p-2">{u.name}</td><td className="p-2">{u.email}</td>
                <td className="p-2"><select className="input w-28" value={u.role} onChange={(e) => patchUser(u, { role: e.target.value })}><option>customer</option><option>admin</option></select></td>
                <td className="p-2">{u.active ? "Active" : "Disabled"}</td>
                <td className="p-2"><button className="btn-ghost !py-1" onClick={() => patchUser(u, { active: !u.active })}>{u.active ? "Disable" : "Enable"}</button></td></tr>))}</tbody></table>
        </div>
      )}
    </main>
  );
}
