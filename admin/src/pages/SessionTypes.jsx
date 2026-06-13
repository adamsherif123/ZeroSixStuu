import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const COLORS = ["#2563EB","#10B981","#F59E0B","#EF4444","#8B5CF6","#14B8A6","#F97316","#111827"];

function currencyEGP(n) {
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `EGP ${Number(n || 0).toLocaleString("en-EG")}`;
  }
}

const emptyType = {
  name: "",
  hours: "",
  price: "",
  description: "",
  color: COLORS[0],
  active: true,
  depositPercent: 50,
};

export default function SessionTypes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null); // doc or null
  const [form, setForm] = useState(emptyType);
  const [saving, setSaving] = useState(false);
  const [qText, setQText] = useState("");

  // live subscription — order by name (A→Z)
  useEffect(() => {
    const qRef = query(collection(db, "session_types"), orderBy("name", "asc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (t) =>
        String(t.name || "").toLowerCase().includes(q) ||
        String(t.description || "").toLowerCase().includes(q)
    );
  }, [items, qText]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyType);
  };

  const startEdit = (it) => {
    setEditing(it);
    setForm({
      name: it.name || "",
      hours: it.hours ?? "",
      price: it.price ?? "",
      description: it.description || "",
      color: it.color || COLORS[0],
      active: !!it.active,
      depositPercent: it.depositPercent ?? 50,
    });
  };

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return alert("Please enter a name");
    const hours = Number(form.hours);
    const price = Number(form.price);
    const depositPercent = Math.max(0, Math.min(100, Number(form.depositPercent)));
    if (!Number.isFinite(hours) || hours <= 0) return alert("Hours must be a positive number");
    if (!Number.isFinite(price) || price < 0) return alert("Price must be a number");
    if (!Number.isFinite(depositPercent)) return alert("Deposit % must be 0–100");

    const payload = {
      name: form.name.trim(),
      hours,
      price,
      description: form.description.trim(),
      color: form.color || COLORS[0],
      active: !!form.active,
      depositPercent,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "session_types", editing.id), payload);
      } else {
        await addDoc(collection(db, "session_types"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
      setForm(emptyType);
    } catch (e) {
      console.error(e);
      alert("Failed to save session type.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (it) => {
    if (!confirm(`Delete "${it.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "session_types", it.id));
    } catch (e) {
      console.error(e);
      alert("Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Session Types</h2>
        <div className="flex items-center gap-2">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search sessions…"
            className="h-9 w-64 border border-gray-200 rounded-lg px-3 text-sm"
          />
          <button
            onClick={startCreate}
            className="h-9 px-3 rounded-lg bg-black text-white text-sm hover:bg-gray-900"
          >
            Create
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* left: list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-2">
            {loading ? "Loading…" : `${filtered.length} session type${filtered.length === 1 ? "" : "s"}`}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((t) => (
              <article key={t.id} className="border border-gray-200 rounded-xl p-3 bg-white hover:shadow-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: t.color || COLORS[0] }}
                      aria-hidden="true"
                    />
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                    {!t.active && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {t.hours} hrs • {currencyEGP(t.price)}
                  </div>
                  {t.description && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</div>
                  )}

                  {/* Buttons BELOW the text (your UI change) */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      className="px-2 py-1 text-xs border rounded-md"
                      onClick={() => startEdit(t)}
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-1 text-xs border rounded-md text-red-600"
                      onClick={() => remove(t)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <div className="text-sm text-gray-500">No session types yet.</div>
          )}
        </div>

        {/* right: editor */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">{editing ? "Edit Session Type" : "Create Session Type"}</div>
          </div>

          <div className="space-y-3">
            <Field label="Name">
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="8 Hour Booking"
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="8"
                  value={form.hours}
                  onChange={(e) => change("hours", e.target.value)}
                />
              </Field>
              <Field label="Price (EGP)">
                <input
                  type="number"
                  min="0"
                  step="50"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="7050"
                  value={form.price}
                  onChange={(e) => change("price", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Deposit % (due today)">
              <input
                type="number"
                min="0"
                max="100"
                className="w-32 border rounded-md px-3 py-2 text-sm"
                value={form.depositPercent}
                onChange={(e) => change("depositPercent", e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Client app can compute deposit from this (defaults to 50%).
              </div>
            </Field>

            <Field label="Color">
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className="w-7 h-7 rounded-full border"
                    style={{ backgroundColor: c, borderColor: c === form.color ? "#111827" : "#E5E7EB" }}
                    onClick={() => change("color", c)}
                    title={c}
                  />
                ))}
              </div>
            </Field>

            <Field label="Description">
              <textarea
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="(optional) e.g., Full-day studio session"
                value={form.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </Field>

            <Field label="Visible on client">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.active}
                  onChange={(e) => change("active", e.target.checked)}
                />
                <span>Active</span>
              </label>
            </Field>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-black text-white text-sm hover:bg-gray-900 disabled:opacity-60"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Create"}
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyType);
                  }}
                  className="px-3 py-2 rounded-md border text-sm"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Live preview */}
            <div className="mt-4 border-t pt-3">
              <div className="text-xs text-gray-500 mb-1">Client preview</div>
              <div className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: form.color }}
                  />
                  <div className="font-medium text-sm">{form.name || "Session name"}</div>
                </div>
                <div className="text-sm text-gray-700">{currencyEGP(Number(form.price || 0))}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
