import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../App.jsx";

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const d = await api(`/auth/${mode}`, { method: "POST", body: f });
      login(d.token, d.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-center bg-ink p-12 text-white md:flex">
        <h1 className="text-4xl font-bold leading-tight">Ek search.<br />Har dukaan ka price.</h1>
        <p className="mt-4 max-w-sm text-slate-300">Amazon, Flipkart, Blinkit, BigBasket, Myntra aur bhi - price, delivery fee aur delivery time ek hi screen par compare karo.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h2>
          {mode === "register" && <input className="input" placeholder="Full name" value={f.name} onChange={set("name")} required />}
          <input className="input" type="email" placeholder="Email" value={f.email} onChange={set("email")} required />
          <input className="input" type="password" placeholder="Password (min 6 characters)" value={f.password} onChange={set("password")} required />
          {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}</button>
          <p className="text-center text-sm text-slate-500">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button type="button" className="font-semibold text-ink underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
