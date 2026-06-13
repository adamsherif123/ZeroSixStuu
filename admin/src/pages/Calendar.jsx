import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { parseISO, addMinutes, setHours, setMinutes, format } from "date-fns";

// CSS is loaded via CDN in index.html; we style the look via our own CSS overrides in index.css

function parseTimeLabel(label) {
  if (!label) return { h: 9, m: 0, ampm: "AM" };
  const m = String(label).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return { h: 9, m: 0, ampm: "AM" };
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2] || "0", 10);
  const ampm = m[3].toUpperCase();
  return { h, m: mm, ampm };
}
function startFromISOAndLabel(isoDay, label) {
  const base = typeof isoDay === "string" ? parseISO(isoDay) : new Date(isoDay);
  const { h, m, ampm } = parseTimeLabel(label);
  let hour24 = h % 12;
  if (ampm === "PM") hour24 += 12;
  return setMinutes(setHours(base, hour24), m);
}
function hoursFromAny(b) {
  const n1 = Number(b?.selectedType?.hours);
  if (!Number.isNaN(n1) && n1 > 0) return n1;
  const n2 = Number(b?.hours);
  if (!Number.isNaN(n2) && n2 > 0) return n2;
  const n3 = Number(b?.typeId);
  if (!Number.isNaN(n3) && n3 > 0) return n3;
  const name = b?.selectedType?.name || b?.typeName || "";
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*hour/i);
  if (m) return Number(m[1]);
  return 1;
}
function endFromStartAndHours(start, hours) {
  return addMinutes(start, Math.max(30, Math.round(hours * 60)));
}

function currencyEGP(n) {
  try {
    return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `EGP ${Number(n || 0).toLocaleString("en-EG")}`;
  }
}

// Simple tooltip manager
const Tooltip = (() => {
  let el = null;
  const ensure = () => {
    if (!el) {
      el = document.createElement("div");
      el.className = "zs-tooltip";
      document.body.appendChild(el);
    }
    return el;
  };
  const show = (html, x, y) => {
    const t = ensure();
    t.innerHTML = html;
    t.style.opacity = "1";
    position(x, y);
  };
  const position = (x, y) => {
    const t = ensure();
    const pad = 10;
    const vw = window.innerWidth, vh = window.innerHeight;
    const rect = t.getBoundingClientRect();
    let left = x + pad, top = y + pad;
    if (left + rect.width + 8 > vw) left = x - rect.width - pad;
    if (top + rect.height + 8 > vh) top = y - rect.height - pad;
    t.style.transform = `translate(${left}px, ${top}px)`;
  };
  const hide = () => {
    if (el) el.style.opacity = "0";
  };
  return { show, position, hide };
})();

export default function Calendar() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "bookings"));
    const unsub = onSnapshot(
      q,
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

  const events = useMemo(() => {
    return rows
      .filter((b) =>
        !["declined", "failed", "canceled", "cancelled", "pending"].includes(
          String(b.status || b.payment_status || "confirmed").toLowerCase()
        )
      )
      .map((b) => {
        const iso = b.selectedDate || b.bookedDate || b.dateISO || b.createdAt;
        const timeLabel = b.selectedTime || b.timeLabel;
        if (!iso || !timeLabel) return null;

        const start = startFromISOAndLabel(iso, timeLabel);
        const hours = hoursFromAny(b);
        const end = endFromStartAndHours(start, hours);

        const type = b.selectedType || {};
        const titleBase = type.name || b.typeName || "Session";
        const customer =
          (b.customer && (b.customer.firstName || b.customer.lastName))
            ? `${b.customer.firstName || ""} ${b.customer.lastName || ""}`.trim()
            : (b.customer?.email || b.email || "");
        const price = Number(type.price ?? b.price ?? 0);
        const depositPercent = Number(b.depositPercent ?? 50);

        return {
          id: b.id,
          title: customer ? `${titleBase} — ${customer}` : titleBase,
          start,
          end,
          classNames: ["zs-event"],
          extendedProps: {
            customer,
            typeName: titleBase,
            hours,
            price,
            deposit: Math.round(price * depositPercent / 100),
            timeLabel: timeLabel,
          },
        };
      })
      .filter(Boolean);
  }, [rows]);

  // compact event content: two lines (title + time range)
  const renderEvent = (arg) => {
    const startStr = format(arg.event.start, "h:mm a");
    const endStr = format(arg.event.end, "h:mm a");
    return {
      domNodes: [
        (() => {
          const wrap = document.createElement("div");
          wrap.className = "zs-event-inner";
          const line1 = document.createElement("div");
          line1.className = "zs-event-title";
          line1.textContent = arg.event.title;
          const line2 = document.createElement("div");
          line2.className = "zs-event-time";
          line2.textContent = `${startStr} – ${endStr}`;
          wrap.appendChild(line1);
          wrap.appendChild(line2);
          return wrap;
        })(),
      ],
    };
  };

  // tooltip content
  const tooltipHTML = (ev) => {
    const p = ev.extendedProps || {};
    const startStr = format(ev.start, "EEE, MMM d • h:mm a");
    const endStr = format(ev.end, "h:mm a");
    return `
      <div class="zs-tt-title">${p.typeName || "Session"}</div>
      <div class="zs-tt-line">${startStr} – ${endStr}</div>
      ${p.customer ? `<div class="zs-tt-line">Client: <span class="zs-tt-strong">${p.customer}</span></div>` : ""}
      ${p.hours ? `<div class="zs-tt-line">Duration: ${p.hours}h</div>` : ""}
      ${Number.isFinite(p.price) ? `<div class="zs-tt-line">Price: <span class="zs-tt-strong">${currencyEGP(p.price)}</span></div>` : ""}
      ${Number.isFinite(p.deposit) ? `<div class="zs-tt-line">Deposit: ${currencyEGP(p.deposit)}</div>` : ""}
    `;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Calendar</h2>
        {!loading && <div className="text-sm text-gray-500">{events.length} events</div>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,today,next",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height="78vh"
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          slotLabelFormat={{ hour: "numeric", minute: "2-digit" }}
          nowIndicator={true}
          allDaySlot={false}
          expandRows={true}
          dayMaxEventRows={2}
          stickyHeaderDates={true}
          events={events}
          eventContent={renderEvent}
          displayEventEnd={true}
          eventMinHeight={26}
          eventOverlap={true}
          eventClassNames={() => ["zs-event"]}

          // NEW: hover tooltip
          eventMouseEnter={(info) => {
            Tooltip.show(tooltipHTML(info.event), info.jsEvent.pageX, info.jsEvent.pageY);
          }}
          eventMouseLeave={() => {
            Tooltip.hide();
          }}
          eventMouseMove={(info) => {
            Tooltip.position(info.jsEvent.pageX, info.jsEvent.pageY);
          }}
        />
      </div>
    </div>
  );
}
