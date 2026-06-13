import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { addMonths, endOfMonth, format, getDay, getDaysInMonth, startOfMonth, subMonths } from "date-fns";

// ===== Helpers =====
const DOW = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
const pad = (n)=> String(n).padStart(2,"0");
const to24h = (s) => {
  // accepts "9:00am", "09:00", "17:30", "5pm"
  if (!s) return "";
  const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return s;
  let h = parseInt(m[1],10);
  const mm = parseInt(m[2] ?? "0",10);
  const ampm = m[3];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${pad(h)}:${pad(mm)}`;
};
const validHHMM = (s)=> /^\d{2}:\d{2}$/.test(s || "");
const isoDate = (d)=> format(d, "yyyy-MM-dd");

// Firestore locations
const HOURS_DOC = doc(db, "settings", "working_hours"); // single doc storing hours

// ===== UI Pieces =====
function TimeCell({value,onChange,placeholder}) {
  return (
    <input
      value={value}
      onChange={(e)=> onChange(to24h(e.target.value))}
      placeholder={placeholder}
      className="w-28 border rounded-md px-2 py-1 text-sm"
      aria-label={placeholder}
    />
  );
}

function Row({ label, v, onChange }) {
  const id = label.toLowerCase();
  return (
    <div className="grid grid-cols-[140px,120px,120px,120px] items-center gap-3 py-2">
      <div className="text-xs font-semibold text-gray-700">{label}</div>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!v.closed}
          onChange={(e)=> onChange({ ...v, closed: e.target.checked })}
        />
        <span className="text-xs text-gray-600">Closed</span>
      </label>
      <TimeCell
        value={v.open}
        onChange={(open)=> onChange({ ...v, open })}
        placeholder="Open (09:00)"
      />
      <TimeCell
        value={v.close}
        onChange={(close)=> onChange({ ...v, close })}
        placeholder="Close (17:00)"
      />
    </div>
  );
}

// ===== Page =====
export default function WorkingHours() {
  // canonical state kept as:
  // { hasRegular: true, regular: {sun:{closed:true,open:"",close:""}, ...}, overrides: { "YYYY-MM-DD": {closed:boolean, open, close } } }
  const [hours, setHours] = useState(null);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);

  // live subscribe
  useEffect(()=>{
    const unsub = onSnapshot(HOURS_DOC, (snap)=>{
      if (snap.exists()) {
        const data = snap.data();
        setHours({
          hasRegular: data.hasRegular ?? true,
          regular: normalizeRegular(data.regular),
          overrides: data.overrides ?? {},
        });
      } else {
        // first-time defaults
        setHours({
          hasRegular: true,
          regular: {
            sun:{closed:true, open:"", close:""},
            mon:{closed:false, open:"09:00", close:"17:00"},
            tue:{closed:false, open:"09:00", close:"17:00"},
            wed:{closed:false, open:"09:00", close:"17:00"},
            thu:{closed:false, open:"09:00", close:"17:00"},
            fri:{closed:false, open:"09:00", close:"17:00"},
            sat:{closed:true, open:"", close:""},
          },
          overrides: {},
        });
      }
    });
    return ()=>unsub();
  }, []);

  const normalizeRegular = (reg)=>{
    const out = {};
    dayKeys.forEach(k=>{
      const r = reg?.[k] || {};
      out[k] = {
        closed: !!r.closed,
        open: r.open || (k==="sun"||k==="sat" ? "" : "09:00"),
        close: r.close || (k==="sun"||k==="sat" ? "" : "17:00"),
      };
    });
    return out;
  };

  const setReg = (k, val)=> setHours(h=> ({...h, regular: {...h.regular, [k]: val}}));

  const saveRegular = async ()=>{
    if (!hours) return;
    setSaving(true);
    const reg = {...hours.regular};
    // quick validation
    for (const k of dayKeys) {
      const r = reg[k];
      if (!r.closed) {
        if (!validHHMM(r.open) || !validHHMM(r.close)) {
          alert(`Invalid time for ${k.toUpperCase()}. Use HH:MM like 09:00`);
          setSaving(false);
          return;
        }
      }
    }
    await setDoc(HOURS_DOC, {
      hasRegular: !!hours.hasRegular,
      regular: reg,
      overrides: hours.overrides || {},
      updatedAt: Date.now(),
    }, { merge: true });
    setSaving(false);
  };

  // per-day override edit
  const selKey = selectedDate ? isoDate(selectedDate) : null;
  const currentOverride = selKey ? (hours?.overrides?.[selKey] ?? {}) : {};
  const upsertOverride = async ()=>{
    if (!selKey) return;
    let payload = {...currentOverride};
    // if closed, clear times
    if (payload.closed) { payload.open=""; payload.close=""; }
    else {
      if (!validHHMM(payload.open) || !validHHMM(payload.close)) {
        alert("Invalid time. Use HH:MM like 10:00");
        return;
      }
    }
    const newOverrides = { ...(hours.overrides || {}), [selKey]: payload };
    await updateDoc(HOURS_DOC, {
      overrides: newOverrides,
      updatedAt: Date.now(),
    });
  };

  const clearOverride = async ()=>{
    if (!selKey) return;
    const { [selKey]:_, ...rest } = hours.overrides || {};
    await updateDoc(HOURS_DOC, { overrides: rest, updatedAt: Date.now() });
  };

  // month grid
  const days = useMemo(()=>{
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const startIdx = getDay(first); // 0=Sun
    const total = Math.ceil((startIdx + getDaysInMonth(month))/7) * 7; // full weeks
    const items = [];
    for (let i=0;i<total;i++){
      const d = new Date(first);
      d.setDate(1 - startIdx + i);
      items.push(d);
    }
    return items;
  }, [month]);

  if (!hours) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  // computed helper to show what hours apply on a given day
  const effectiveForDate = (d)=>{
    const k = isoDate(d);
    if (hours.overrides?.[k]) return { source:"override", ...hours.overrides[k] };
    const dow = dayKeys[getDay(d)];
    return { source:"regular", ...hours.regular[dow] };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Working Hours</h2>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold mb-2">Consultation</div>
        </div>

        {/* Tabs (only one active for now) */}
        <div className="mt-2 border-b border-gray-200 text-sm">
          <button className="px-3 py-2 font-medium border-b-2 border-black">Set Hours of Availability</button>
        </div>

        {/* Regular hours */}
        <div className="mt-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!hours.hasRegular}
              onChange={(e)=> setHours(h=> ({...h, hasRegular: e.target.checked}))}
            />
            <span className="text-sm">I have regular hours every week</span>
          </label>

          <div className="mt-3 rounded-lg border border-gray-200 p-3">
            {/* Header row */}
            <div className="grid grid-cols-[140px,120px,120px,120px] gap-3 text-[11px] text-gray-500 pb-1">
              <div>DAY</div><div>STATUS</div><div>OPEN</div><div>CLOSE</div>
            </div>

            {dayKeys.map((k,i)=>(
              <Row
                key={k}
                label={DOW[i]}
                v={hours.regular[k]}
                onChange={(val)=> setReg(k, val)}
              />
            ))}

            <button
              onClick={saveRegular}
              disabled={saving}
              className="mt-3 px-4 py-2 rounded-md bg-black text-white text-sm hover:bg-gray-900 disabled:opacity-60"
            >
              {saving ? "Saving…" : "SAVE REGULAR HOURS"}
            </button>
          </div>
        </div>

        {/* Overrides */}
        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">OVERRIDE HOURS FOR SPECIFIC DAYS</div>

          {/* Month header */}
          <div className="flex items-center gap-2 mb-2">
            <button
              className="px-2 py-1 border rounded-md"
              onClick={()=> setMonth(subMonths(month,1))}
            >‹</button>
            <div className="font-medium">{format(month, "MMMM yyyy")}</div>
            <button
              className="px-2 py-1 border rounded-md"
              onClick={()=> setMonth(addMonths(month,1))}
            >›</button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7 gap-2">
            {["S","M","T","W","T","F","S"].map(c=>(
              <div key={c} className="text-center text-[11px] text-gray-500">{c}</div>
            ))}
            {days.map((d, idx)=>{
              const inMonth = d.getMonth() === month.getMonth();
              const eff = effectiveForDate(d);
              const k = isoDate(d);
              const active = selectedDate && isoDate(selectedDate) === k;
              return (
                <button
                  key={idx}
                  onClick={()=> setSelectedDate(d)}
                  className={[
                    "h-24 p-2 rounded-lg text-left border",
                    inMonth ? "bg-white" : "bg-gray-50 text-gray-400",
                    active ? "border-black" : "border-gray-200",
                  ].join(" ")}
                >
                  <div className="text-xs font-semibold mb-1">{format(d, "d")}</div>
                  <div className="text-[11px] text-gray-600">
                    {eff.closed ? "Closed" : `${eff.open}–${eff.close}`}
                  </div>
                  {hours.overrides?.[k] && <div className="mt-1 inline-block text-[10px] px-1.5 py-0.5 bg-black text-white rounded">Override</div>}
                </button>
              );
            })}
          </div>

          {/* Editor for selected day */}
          {selectedDate && (
            <div className="mt-4 p-3 border rounded-lg">
              <div className="text-sm font-medium mb-2">{format(selectedDate, "EEEE, MMM d, yyyy")}</div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!currentOverride.closed}
                    onChange={(e)=>{
                      const closed = e.target.checked;
                      const next = { ...currentOverride, closed };
                      if (closed) { next.open=""; next.close=""; }
                      setHours(h=> ({...h, overrides: { ...(h.overrides||{}), [selKey]: next }}));
                    }}
                  />
                  <span className="text-sm">Closed</span>
                </label>

                {!currentOverride.closed && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">Open</span>
                      <TimeCell
                        value={currentOverride.open || ""}
                        onChange={(open)=> setHours(h=> ({...h, overrides: { ...(h.overrides||{}), [selKey]: { ...currentOverride, open } }}))}
                        placeholder="10:00"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">Close</span>
                      <TimeCell
                        value={currentOverride.close || ""}
                        onChange={(close)=> setHours(h=> ({...h, overrides: { ...(h.overrides||{}), [selKey]: { ...currentOverride, close } }}))}
                        placeholder="18:00"
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={clearOverride}
                    className="px-3 py-1.5 text-sm border rounded-md"
                  >
                    Clear Override
                  </button>
                  <button
                    onClick={upsertOverride}
                    className="px-3 py-1.5 text-sm bg-black text-white rounded-md"
                  >
                    Save Override
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
