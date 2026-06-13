import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";

// ---------- util ----------
const norm = (s) => (s || "").trim();
const keyFrom = (b) => {
  // Prefer email as unique key; else phone; else a synthetic key
  const email = norm(b?.customer?.email || b?.email);
  const phone = norm(b?.customer?.phoneE164 || b?.phone || b?.phone_e164);
  return email || phone || `anon_${Math.random().toString(36).slice(2)}`;
};
const displayName = (b) => {
  const fn = norm(b?.customer?.firstName || b?.firstName);
  const ln = norm(b?.customer?.lastName || b?.lastName);
  const combo = `${fn} ${ln}`.trim();
  if (combo) return combo;
  const email = norm(b?.customer?.email || b?.email);
  const phone = norm(b?.customer?.phoneE164 || b?.phone || b?.phone_e164);
  return email || phone || "Unknown";
};
const hoursFromAny = (b) => {
  const n1 = Number(b?.selectedType?.hours);
  if (!Number.isNaN(n1) && n1 > 0) return n1;
  const n2 = Number(b?.hours);
  if (!Number.isNaN(n2) && n2 > 0) return n2;
  const n3 = Number(b?.typeId);
  if (!Number.isNaN(n3) && n3 > 0) return n3;
  // Try to read from name like "3 Hour Booking"
  const name = b?.selectedType?.name || b?.typeName || "";
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*hour/i);
  if (m) return Number(m[1]);
  return 1;
};
const priceFromAny = (b) => Number(b?.selectedType?.price ?? b?.price ?? 0);
const parseWhen = (b) => {
  // prefer the date you attached to meta in client flow
  const iso = b?.selectedDate || b?.bookedDate || b?.dateISO || b?.createdAt;
  if (!iso) return null;
  if (typeof iso === "string") return new Date(iso);
  if (iso?.seconds) return new Date(iso.seconds * 1000);
  try { return new Date(iso); } catch { return null; }
};
const currencyEGP = (n) => {
  try {
    return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `EGP ${Number(n || 0).toLocaleString("en-EG")}`;
  }
};
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join("") || "C";
const colorFor = (seed) => {
  const colors = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#14b8a6","#f97316"];
  let h=0; for (let i=0;i<seed.length;i++) h=(h*31+seed.charCodeAt(i))>>>0;
  return colors[h % colors.length];
};

// ---------- page ----------
export default function Clients() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  useEffect(() => {
    const qRef = query(collection(db, "bookings"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push({ id: doc.id, ...(doc.data() || {}) }));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  // Build a client index from bookings
  const clients = useMemo(() => {
    const map = new Map();
    for (const b of rows) {
      const status = String(b?.status || b?.payment_status || "confirmed").toLowerCase();
      if (["declined","failed","canceled","cancelled","pending"].includes(status)) continue;

      const key = keyFrom(b);
      const name = displayName(b);
      const email = norm(b?.customer?.email || b?.email);
      const phone = norm(b?.customer?.phoneE164 || b?.phone || b?.phone_e164);
      const when = parseWhen(b);
      const hrs = hoursFromAny(b);
      const price = priceFromAny(b);

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name,
          email,
          phone,
          sessions: 0,
          hours: 0,
          revenue: 0,
          firstAt: null,
          lastAt: null,
        });
      }
      const c = map.get(key);
      c.sessions += 1;
      c.hours += hrs;
      c.revenue += price;
      if (when) {
        if (!c.firstAt || when < c.firstAt) c.firstAt = when;
        if (!c.lastAt  || when > c.lastAt)  c.lastAt  = when;
      }
    }

    let arr = Array.from(map.values());
    // search filter
    const q = qText.trim().toLowerCase();
    if (q) {
      arr = arr.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    }
    // default sort: most recent activity
    arr.sort((a,b)=> (b.lastAt?.getTime()||0) - (a.lastAt?.getTime()||0));
    return arr;
  }, [rows, qText]);

  const toCSV = () => {
    const headers = ["Name","Email","Phone","Sessions","Hours","Revenue","First Booking","Last Booking"];
    const lines = [headers.join(",")];
    clients.forEach(c => {
      const f = c.firstAt ? c.firstAt.toISOString() : "";
      const l = c.lastAt ? c.lastAt.toISOString() : "";
      lines.push([
        `"${c.name}"`,
        `"${c.email}"`,
        `"${c.phone}"`,
        c.sessions,
        c.hours,
        c.revenue,
        `"${f}"`,
        `"${l}"`
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "clients.csv"; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Clients</h2>
        <div className="flex items-center gap-2">
          <input
            value={qText}
            onChange={(e)=> setQText(e.target.value)}
            placeholder="Search name, email, phone…"
            className="h-9 w-64 border border-gray-200 rounded-lg px-3 text-sm"
          />
          <button
            onClick={toCSV}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="text-xs text-gray-500 mb-2">{loading ? "Loading…" : `${clients.length} clients`}</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {clients.map((c) => (
            <article key={c.id} className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 hover:shadow-sm bg-white">
              <div
                className="flex items-center justify-center w-11 h-11 rounded-full text-white text-sm font-semibold shadow-sm"
                style={{ backgroundColor: colorFor(c.id) }}
                aria-hidden="true"
              >
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                  <div className="text-xs text-gray-500 ml-3">{c.lastAt ? new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" }).format(c.lastAt) : "-"}</div>
                </div>
                <div className="text-xs text-gray-600 truncate">{c.email || "—"}</div>
                <div className="text-xs text-gray-600 truncate">{c.phone || "—"}</div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Sessions" value={c.sessions} />
                  <Stat label="Hours" value={c.hours.toFixed(1)} />
                  <Stat label="Total Spend" value={currencyEGP(c.revenue)} />
                </div>

                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                  <span>First: {c.firstAt ? new Intl.DateTimeFormat(undefined, { year:"numeric", month:"short", day:"numeric" }).format(c.firstAt) : "—"}</span>
                  <span>Last: {c.lastAt ? new Intl.DateTimeFormat(undefined, { year:"numeric", month:"short", day:"numeric" }).format(c.lastAt) : "—"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!loading && clients.length === 0 && (
          <div className="text-sm text-gray-500">No clients yet.</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 py-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-[12px] font-semibold">{value}</div>
    </div>
  );
}
