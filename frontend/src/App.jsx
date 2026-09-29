import { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login.jsx";
import Search from "./pages/Search.jsx";
import Admin from "./pages/Admin.jsx";
import Basket from "./pages/Basket.jsx";
import LocationBar from "./LocationBar.jsx";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const BasketCtx = createContext(null);
export const useBasket = () => useContext(BasketCtx);

function useBasketState() {
  const [items, setItems] = useState(() => { try { return JSON.parse(localStorage.getItem("basket")) || []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("basket", JSON.stringify(items)); } catch {} }, [items]);
  const key = (q, pack) => q.trim().toLowerCase() + "|" + (pack || "").trim().toLowerCase();
  // Same product with a different pack size is kept as its own basket line.
  const add = (q, pack = "", qty = 1) => {
    q = q.trim(); pack = (pack || "").trim();
    if (!q) return;
    const k = key(q, pack);
    setItems((c) => c.some((i) => key(i.q, i.pack) === k)
      ? c.map((i) => (key(i.q, i.pack) === k ? { ...i, qty: Math.min(20, i.qty + qty) } : i))
      : [...c, { q, pack, qty }]);
  };
  const setQty = (q, pack, qty) => setItems((c) => c.map((i) => (key(i.q, i.pack) === key(q, pack) ? { ...i, qty: Math.max(1, Math.min(20, qty)) } : i)));
  const remove = (q, pack) => setItems((c) => c.filter((i) => key(i.q, i.pack) !== key(q, pack)));
  return { items, add, setQty, remove, clear: () => setItems([]) };
}

function Nav() {
  const { user, logout } = useAuth(); const { items } = useBasket(); const nav = useNavigate();
  if (!user) return null;
  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight">Price<span className="text-best">Compare</span></Link>
        <nav className="flex items-center gap-2 text-sm">
          <LocationBar />
          <Link to="/" className="btn-ghost">Search</Link>
          <Link to="/basket" className="btn-ghost">Basket{items.length > 0 && <span className="ml-1 rounded-full bg-best px-2 text-xs text-white">{items.length}</span>}</Link>
          {user.role === "admin" && <Link to="/admin" className="btn-ghost">Admin</Link>}
          <span className="hidden text-slate-500 sm:inline">{user.name}</span>
          <button className="btn" onClick={() => { logout(); nav("/login"); }}>Log out</button>
        </nav>
      </div>
    </header>
  );
}

const Private = ({ children, admin }) => {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-slate-500">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem("token"));
  const basket = useBasketState();
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const login = (token, u) => { localStorage.setItem("token", token); setUser(u); };
  const logout = () => { localStorage.removeItem("token"); setUser(null); };
  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      <BasketCtx.Provider value={basket}>
      <Nav />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={<Private><Search /></Private>} />
        <Route path="/basket" element={<Private><Basket /></Private>} />
        <Route path="/admin" element={<Private admin><Admin /></Private>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </BasketCtx.Provider>
    </AuthCtx.Provider>
  );
}