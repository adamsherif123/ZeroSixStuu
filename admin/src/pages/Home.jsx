import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, parseISO, startOfWeek } from "date-fns";

function currencyEGP(n) {
  try {
    return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `EGP ${Number(n || 0).toLocaleString("en-EG")}`;
  }
}

export default function Home() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // live subscription to bookings
  useEffect(() => {
    const q = query(collection(db, "bookings"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach((d) => {
        const x = d.data() || {};
        // normalize likely fields coming from your client flow
        const type = x.selectedType || {};
        rows.push({
          id: d.id,
          createdAt: x.createdAt || x.created_at || null,
          bookedAtISO: x.selectedDate || x.bookedDate || null, // ISO date string from client meta
          timeLabel: x.selectedTime || null,
          price: Number(type.price ?? x.price ?? 0),
          hours: Number(type.hours ?? x.hours ?? 0),
          name: type.name || x.typeName || "Session",
          depositPercent: Number(x.depositPercent ?? 50),
          status: (x.status || x.payment_status || "confirmed").toLowerCase(),
          customerEmail: x.customer?.email || x.email || null,
        });
      });
      setBookings(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // filter to successful/confirmed only
  const confirmed = useMemo(() => {
    return bookings.filter(b => !["declined","failed","canceled","cancelled","pending"].includes(b.status));
  }, [bookings]);

  // aggregate metrics
  const stats = useMemo(() => {
    const sessions = confirmed.length;
    const hours = confirmed.reduce((s,b)=> s + (b.hours || 0), 0);
    const revenue = confirmed.reduce((s,b)=> s + (b.price || 0), 0);
    const avgSession = sessions ? (hours / sessions) : 0;
    const deposits = confirmed.reduce((s,b)=> s + Math.round((b.price||0) * (b.depositPercent||50) / 100), 0);
    const uniqueClients = new Set(confirmed.map(b => (b.customerEmail || "").toLowerCase()).filter(Boolean)).size;

    // bookings by day (line chart)
    const byDayMap = new Map();
    confirmed.forEach(b => {
      const iso = b.bookedAtISO || b.createdAt;
      if (!iso) return;
      const d = typeof iso === "string" ? parseISO(iso) : new Date(iso.seconds ? iso.seconds*1000 : iso);
      const key = format(d, "yyyy-MM-dd");
      byDayMap.set(key, (byDayMap.get(key) || 0) + 1);
    });
    const byDay = Array.from(byDayMap.entries())
      .sort((a,b)=> a[0] < b[0] ? -1 : 1)
      .map(([day, count]) => ({ day, count }));

    // revenue by session type (bar)
    const byTypeMap = new Map();
    confirmed.forEach(b => {
      const key = b.name || "Session";
      byTypeMap.set(key, (byTypeMap.get(key) || 0) + (b.price || 0));
    });
    const byType = Array.from(byTypeMap.entries())
      .sort((a,b)=> b[1]-a[1])
      .map(([type, amount]) => ({ type, amount }));

    // bookings by weekday (pie)
    const wdMap = new Map(); // 0..6
    confirmed.forEach(b => {
      const iso = b.bookedAtISO || b.createdAt;
      if (!iso) return;
      const d = typeof iso === "string" ? parseISO(iso) : new Date(iso.seconds ? iso.seconds*1000 : iso);
      const wd = d.getDay();
      wdMap.set(wd, (wdMap.get(wd) || 0) + 1);
    });
    const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const byWeekday = Array.from(wdMap.entries())
      .sort((a,b)=> a[0]-b[0])
      .map(([wd, count])=> ({ name: weekdayNames[wd], value: count }));

    // weekly utilization (requires working-hours later; for now, booked hours per week)
    const byWeekMap = new Map();
    confirmed.forEach(b => {
      const iso = b.bookedAtISO || b.createdAt;
      if (!iso) return;
      const d = typeof iso === "string" ? parseISO(iso) : new Date(iso.seconds ? iso.seconds*1000 : iso);
      const wk = startOfWeek(d, { weekStartsOn: 0 });
      const key = format(wk, "yyyy-MM-dd");
      byWeekMap.set(key, (byWeekMap.get(key) || 0) + (b.hours || 0));
    });
    const hoursByWeek = Array.from(byWeekMap.entries())
      .sort((a,b)=> a[0] < b[0] ? -1 : 1)
      .map(([week, hours]) => ({ week, hours }));

    return { sessions, hours, revenue, avgSession, deposits, uniqueClients, byDay, byType, byWeekday, hoursByWeek };
  }, [confirmed]);

  const COLORS = ["#2563eb","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card label="Total Sessions" value={stats.sessions} />
        <Card label="Hours Booked" value={stats.hours.toFixed(1)} />
        <Card label="Gross Revenue" value={currencyEGP(stats.revenue)} />
        <Card label="Avg Session (hrs)" value={stats.avgSession.toFixed(2)} />
        <Card label="Deposits Collected" value={currencyEGP(stats.deposits)} />
        <Card label="Unique Clients" value={stats.uniqueClients} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Bookings over Time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Revenue by Session Type">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(v)=>currencyEGP(v)} />
                <Bar dataKey="amount" fill="#10b981" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Bookings by Weekday">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.byWeekday} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {stats.byWeekday.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Booked Hours per Week">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.hoursByWeek}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading bookings…</div>}
      {!loading && confirmed.length === 0 && (
        <div className="text-sm text-gray-500">No confirmed bookings yet.</div>
      )}
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}
