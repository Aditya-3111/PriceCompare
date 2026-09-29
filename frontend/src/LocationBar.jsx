import { useEffect, useState } from "react";
import { api } from "./api";

export default function LocationBar() {
  const [pin, setPin] = useState(localStorage.getItem("pincode") || "");
  const [place, setPlace] = useState(localStorage.getItem("place") || "");
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  const save = (p, pl = "") => {
    localStorage.setItem("pincode", p); localStorage.setItem("place", pl);
    setPin(p); setPlace(pl); setOpen(false); setManual("");
    setMsg("Location updated. Search again to refresh prices.");
  };

  function detect() {
    setMsg(""); setBusy(true);
    if (!navigator.geolocation) { setBusy(false); setOpen(true); setMsg("Your browser cannot share location. Enter your pincode."); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const d = await api(`/geo/pincode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          save(d.pincode, d.place);
        } catch (e) { setOpen(true); setMsg(e.message); } finally { setBusy(false); }
      },
      () => { setBusy(false); setOpen(true); setMsg("Location permission was blocked. Enter your pincode instead."); },
      { timeout: 10000, maximumAge: 600000 }
    );
  }

  // Ask once, right after login, if no pincode is saved yet
  useEffect(() => { if (!localStorage.getItem("pincode")) detect(); }, []);

  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => setOpen(!open)}>
        {busy ? "Finding location..." : pin ? `Deliver to ${pin}${place ? " - " + place : ""}` : "Set location"}
      </button>
      {msg && !open && <p className="absolute right-0 top-11 z-20 w-56 rounded-lg bg-white p-2 text-xs shadow" role="status">{msg}</p>}
      {open && (
        <div className="absolute right-0 top-11 z-20 w-72 space-y-3 rounded-xl border bg-white p-4 text-sm shadow-lg">
          <p className="font-semibold">Where should we check delivery?</p>
          <button className="btn w-full" onClick={detect} disabled={busy}>Use my current location</button>
          <form onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(manual)) save(manual); else setMsg("Enter a 6-digit pincode."); }} className="flex gap-2">
            <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} />
            <button className="btn-ghost">Save</button>
          </form>
          {msg && <p className="text-xs text-amber-700" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}
