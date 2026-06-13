// ======================= app.js =======================

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Booking types (hours + price in EGP)
let bookingTypes = [];

let workingHours = null;

let dayBookings = [];   // confirmed bookings on the selected date
let dayUnsub = null;  



const DEPOSIT_PERCENT = 50;

// Elements
const typeGrid = document.getElementById('typeGrid');
const stepType = document.getElementById('step-type');
const stepCal = document.getElementById('step-calendar');
const stepInfo = document.getElementById('step-info');
const stepPayment = document.getElementById('step-payment');

const monthLabel = document.getElementById('monthLabel');
const calGrid = document.getElementById('calGrid');
const dayTitle = document.getElementById('dayTitle');
const timesEl = document.getElementById('times');
const priceSummary = document.getElementById('priceSummary');

let current = new Date();
current.setHours(0,0,0,0);
let selected = new Date(current);
let selectedType = null;
let selectedTime = null;
let userFormData = null;

function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function formatCurrencyEGP(n){ return `EGP ${n.toLocaleString('en-EG')}`; }

function showStep(which){
  stepType.classList.toggle('hidden', which !== 'type');
  stepCal.classList.toggle('hidden', which !== 'calendar');
  stepInfo.classList.toggle('hidden', which !== 'info');
  stepPayment.classList.toggle('hidden', which !== 'payment');
}

// --- Step 1: render booking type cards ---
function renderTypeGrid(){
  typeGrid.innerHTML = '';
  bookingTypes.forEach((t)=>{
    const card = document.createElement('button');
    card.className = 'type-card';
    card.innerHTML = `
      <div class="type-main">
        <div class="type-title">${t.name}</div>
      </div>
      <div class="type-price">${formatCurrencyEGP(t.price)}</div>
      <div class="type-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M9 6l6 6-6 6" fill="none" stroke="#c1c5ce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    card.addEventListener('click', ()=>{
      subscribeBookingsForDay(selected);     // NOTE: t has {hours, price, depositPercent, name, ...}
      showStep('calendar');
      renderRight();        // this will recompute slots based on hours + working hours
    });
    typeGrid.appendChild(card);
  });
}

document.getElementById('changeTypeBtn').addEventListener('click', ()=> showStep('type'));

// --- Calendar + Slots ---
function renderCalendar(){
  const first = startOfMonth(current); const last = endOfMonth(current);
  const prevLast = new Date(current.getFullYear(), current.getMonth(), 0);
  const startIdx = first.getDay();
  const daysInMonth = last.getDate();
  monthLabel.textContent = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;
  calGrid.innerHTML = '';
  const totalCells = 42; // 6 weeks
  for(let i=0;i<totalCells;i++){
    const cell = document.createElement('button');
    cell.className = 'day';
    let dayNum, cellDate, muted=false;
    if(i < startIdx){
      dayNum = prevLast.getDate() - (startIdx - 1 - i);
      cellDate = new Date(current.getFullYear(), current.getMonth()-1, dayNum);
      muted = true;
    } else if(i >= startIdx + daysInMonth){
      dayNum = i - (startIdx + daysInMonth) + 1;
      cellDate = new Date(current.getFullYear(), current.getMonth()+1, dayNum);
      muted = true;
    } else {
      dayNum = i - startIdx + 1;
      cellDate = new Date(current.getFullYear(), current.getMonth(), dayNum);
    }
    cell.textContent = dayNum;
    if(muted) cell.classList.add('muted');
    if(cellDate.getTime() === selected.getTime()) cell.classList.add('selected');
    if(!muted){
      cell.addEventListener('click', ()=>{
        selected = cellDate;
        subscribeBookingsForDay(selected); // NEW: listen to that day's bookings
        renderCalendar();
        renderRight();
      });
    }
    calGrid.appendChild(cell);
  }
}

function hhmmToDate(baseDate, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}
function minutes(n){ return n*60000; }

function overlaps(aStart, aEnd, bStart, bEnd){
  return aStart < bEnd && bStart < aEnd;
}

function toLabel(d){
  // "h:mm AM/PM"
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2,"0")} ${ampm}`;
}

function computeAvailableStartTimes(dateObj, sessionHours, dayHours, existing) {
  // closed?
  if (!dayHours || dayHours.closed) return [];

  const open  = hhmmToDate(dateObj, dayHours.open);   // e.g. 09:00
  const close = hhmmToDate(dateObj, dayHours.close);  // e.g. 20:00
  const durMs = minutes(Math.max(30, Math.round(sessionHours*60)));

  const lastPossibleStart = new Date(close.getTime() - durMs);
  if (lastPossibleStart < open) return []; // session won't fit that day

  const out = [];
  for (let t = new Date(open); t <= lastPossibleStart; t = new Date(t.getTime() + minutes(30))) {
    const s = t;
    const e = new Date(t.getTime() + durMs);

    // block if overlaps any existing booking
    const conflict = existing.some(({ start, end }) => overlaps(s, e, start, end));
    if (!conflict) out.push({ label: toLabel(s), start: s, end: e });
  }
  return out;
}

function formatDayLabel(d){
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

function renderRight(){
  dayTitle.textContent = formatDayLabel(selected);
  const hoursForDay = effectiveHoursForDate(selected);
  const chosenHours = selectedType?.hours ? Number(selectedType.hours) : 1; // default 1h if missing
  const slots = computeAvailableStartTimes(selected, chosenHours, hoursForDay, dayBookings);
  timesEl.innerHTML = '';
  slots.forEach(slot => {
    const b = document.createElement('button');
    b.className = 'time-btn';
    b.textContent = slot.label;
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.time-btn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
      selectedTime = slot.label; // we keep your label storage ("3:30 PM")

      if(selectedType){
        const deposit = Math.round(selectedType.price * DEPOSIT_PERCENT / 100);
        priceSummary.innerHTML = `
          <div class="summary-row"><span>${selectedType.name}</span><span>${formatCurrencyEGP(selectedType.price)}</span></div>
          <div class="summary-row"><span>Deposit (${DEPOSIT_PERCENT}%)</span><span>${formatCurrencyEGP(deposit)}</span></div>
          <div class="actions"><button id="nextBtn" class="btn-primary">Next</button></div>
        `;
        document.getElementById('nextBtn').addEventListener('click', goToInfoPage);
      }
    });
    timesEl.appendChild(b);
  });
}

function goToInfoPage(){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'GMT';
  const when = `${formatDayLabel(selected)} at ${selectedTime} ${tz}`;

  const appt = `
    <div class="appt-title">${selectedType.name}</div>
    <div class="appt-sub">${when}</div>
    <div class="appt-price">${formatCurrencyEGP(selectedType.price)}</div>
    <ul class="appt-list">
      <li>${selectedType.hours} Hour Studio Session</li>
    </ul>
  `;
  document.getElementById('apptSummary').innerHTML = appt;

  const imgEl = document.getElementById('apptImg');
  if (imgEl) {
    imgEl.src = '/assets/studio.jpg';
    imgEl.alt = `${selectedType.name} preview`;
  }

  showStep('info');
  wireEgyptPhoneMask();
  wirePromoCodeUppercase();
}

/* ================= Egyptian phone formatting ================ */
function egMask(value){
  let d = String(value).replace(/\D/g,'');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('20')) d = d.slice(2);
  if (d.startsWith('0'))  d = d.slice(1);
  d = d.slice(0, 10);
  let out = '+20';
  if (d.length) out += ' ';
  if (d.length <= 2) return out + d;
  const op = d.slice(0,2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `${out}${op} ${rest}`;
  const part1 = rest.slice(0,4);
  const part2 = rest.slice(4);
  return `${out}${op} ${part1}${part2 ? ' ' + part2 : ''}`;
}
function egIsValid(masked){
  return /^\+20\s?(10|11|12|15)\s?\d{4}\s?\d{4}$/.test(masked.trim());
}
function egToE164(masked){
  const d = masked.replace(/\D/g,'');
  if (!/^201(0|1|2|5)\d{8}$/.test(d)) return null;
  return '+' + d;
}
function wireEgyptPhoneMask(){
  const phone = document.getElementById('phone');
  if (!phone || phone._egMasked) return;
  phone._egMasked = true;
  phone.value = egMask(phone.value);
  phone.addEventListener('input', (e)=>{
    e.target.value = egMask(e.target.value);
    e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
  });
  phone.addEventListener('blur', (e)=>{
    e.target.value = egMask(e.target.value);
  });
}
/* ============================================================ */

/* ================= Promo code uppercase helper =============== */
function wirePromoCodeUppercase(){
  const promo = document.getElementById('promoCode');
  if (!promo || promo._wired) return;
  promo._wired = true;
  promo.addEventListener('input', (e)=>{
    e.target.value = e.target.value.toUpperCase().replace(/\s+/g,'');
  });
}
/* ============================================================ */

// Clear/select/back
document.getElementById('backToCalendar').addEventListener('click', ()=> showStep('calendar'));
document.getElementById('clearSelection').addEventListener('click', ()=>{
  selectedTime = null;
  document.querySelectorAll('.time-btn').forEach(x=>x.classList.remove('selected'));
  priceSummary.innerHTML = '';
  showStep('calendar');
});

// --------- Step 3 submit → Step 4 (no DB write here) ---------
document.getElementById('userForm').addEventListener('submit', (e)=>{
  e.preventDefault();

  const phoneMasked = document.getElementById('phone').value.trim();
  if (!egIsValid(phoneMasked)){
    alert('Please enter a valid Egyptian mobile number like: +20 10 1234 5678');
    return;
  }
  const e164 = egToE164(phoneMasked);

  userFormData = Object.fromEntries(new FormData(e.currentTarget).entries());
  userFormData.phone_e164 = e164;

  goToPaymentPage(); // show payment UI + auto-load Paymob iframe
});

document.getElementById('backToInfo').addEventListener('click', ()=> showStep('info'));

// --- Step 4: Payment page
function goToPaymentPage(){
  if (!selectedType || !selectedTime) {
    alert("Please select a booking type, date, and time first.");
    showStep('calendar');
    return;
  }

  const price = selectedType.price;
  const deposit = Math.round(price * DEPOSIT_PERCENT / 100);
  const remaining = price - deposit;

  renderOrderSummary({ price, deposit, remaining });

  document.getElementById('dueTodayNote').textContent =
    `You will be charged ${formatCurrencyEGP(deposit)} today (a ${DEPOSIT_PERCENT}% deposit). ` +
    `The remaining ${formatCurrencyEGP(remaining)} is due after your session.`;

  showStep('payment');
  

  // Auto-load Paymob iframe on entering Payment step
  if (PAYMOB_LIVE) {
    initPaymobIframe({
      amountCents: deposit * 100,
      billing: {
        first_name: userFormData?.firstName || '',
        last_name:  userFormData?.lastName  || '',
        email:      userFormData?.email     || '',
        phone_number: userFormData?.phone_e164 || ''
      }
    }).catch(err=>{
      console.error(err);
      alert("Could not start payment: " + (err?.message || err));
    });
  }
}

function renderOrderSummary({ price, deposit, remaining }){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'GMT';
  const when = `${formatDayLabel(selected)} at ${selectedTime} ${tz}`;
  const el = document.getElementById('orderSummary');
  el.innerHTML = `
    <div class="sum-row">
      <div class="sum-title">
        <div class="strong">${selectedType.name}</div>
        <div class="muted small">${when}</div>
      </div>
      <div class="strong">${formatCurrencyEGP(price)}</div>
    </div>
    <div class="sum-hr"></div>
    <div class="sum-row"><div>Deposit (due today)</div><div class="strong">${formatCurrencyEGP(deposit)}</div></div>
    <div class="sum-row"><div>Remaining (after session)</div><div>${formatCurrencyEGP(remaining)}</div></div>
    <div class="sum-hr"></div>
    <div class="sum-row sum-total"><div>Total</div><div>${formatCurrencyEGP(price)}</div></div>
  `;
}

/* ================== Paymob wiring (REAL) ================== */
const PAYMOB_LIVE = true;                 // real flow enabled
const PAYMOB_IFRAME_ID = "959460";        // Developers → Iframes

async function initPaymobIframe({ amountCents, billing }) {
  // Attach your booking meta so /success.html can finalize via /api/paymob/confirm
  const meta = {
    selectedType: {
      id: selectedType.id,
      name: selectedType.name,
      hours: selectedType.hours,
      price: selectedType.price,
    },
    selectedDate: selected.toISOString(),
    selectedTime,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "GMT",
    customer: {
      firstName: userFormData?.firstName || "",
      lastName:  userFormData?.lastName  || "",
      email:     userFormData?.email     || "",
      phoneE164: userFormData?.phone_e164 || "",
      brandAgency: userFormData?.brandAgency || null,
      promoCode: (userFormData?.promoCode || "").toUpperCase() || null,
    },
    depositPercent: DEPOSIT_PERCENT,
  };

  const res = await fetch("/api/paymob/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_cents: amountCents, billing, meta }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(txt || "Failed to start Paymob session");
  }

  const { payment_token, merchant_order_id } = await res.json();

  // Save for success.html to finish booking + email
  localStorage.setItem("merchant_order_id", merchant_order_id);

  // Load the iframe
  const iframe = document.getElementById("paymobIframe");
  const placeholder = document.getElementById("cardPlaceholder");

  iframe.src = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${payment_token}`;
  iframe.style.display = "block";
  if (placeholder) placeholder.style.display = "none";
}

async function subscribeSessionTypes(){
  const { collection, query, where, orderBy, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const q = query(
    collection(window.db, "session_types"),
    where("active", "==", true),
    orderBy("name", "asc")
  );
  onSnapshot(q, (snap)=>{
    bookingTypes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // if we had a previously selectedType that no longer exists, clear it
    if (selectedType && !bookingTypes.find(t => t.id === selectedType.id)) {
      selectedType = null;
      showStep('type');
    }
    renderTypeGrid(); // re-render the grid with live types
  });
}


async function subscribeWorkingHours(){
  const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const ref = doc(window.db, "settings", "working_hours");
  onSnapshot(ref, (snap)=>{
    if (snap.exists()) {
      workingHours = snap.data();
    } else {
      workingHours = null;
    }
    // when hours change, recompute slots if we're on calendar/info/payment steps
    if (document.getElementById('step-calendar') && !stepCal.classList.contains('hidden')) {
      renderRight();
    }
  });
}

function isoDate(d) {
  // local date in YYYY-MM-DD for override keys
  const y = d.getFullYear();
  const m = `${d.getMonth()+1}`.padStart(2,'0');
  const day = `${d.getDate()}`.padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function effectiveHoursForDate(d) {
  // returns { closed:boolean, open:"HH:MM", close:"HH:MM" } or fallback
  if (!workingHours || workingHours.hasRegular == null) {
    // fallback: allow 08:00-20:00 if nothing set
    return { closed:false, open:"08:00", close:"20:00" };
  }
  const key = isoDate(d);
  if (workingHours.overrides && workingHours.overrides[key]) {
    return workingHours.overrides[key];
  }
  const dow = d.getDay(); // 0=Sun..6=Sat
  const map = ["sun","mon","tue","wed","thu","fri","sat"];
  const reg = workingHours.regular?.[map[dow]];
  if (reg) return reg;
  return { closed:false, open:"08:00", close:"20:00" };
}

function parseBookingToRange(b) {
  // get start & end Date objects for a booking b like your admin calendar did
  const startISO = b.selectedDate || b.bookedDate || b.dateISO || b.createdAt;
  if (!startISO) return null;

  // Parse start date (midnight) then apply time label (e.g. "3:00 PM")
  const base = new Date(startISO);
  const timeLabel = b.selectedTime || b.timeLabel || "9:00 AM";

  const m = String(timeLabel).match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  let hh = 9, mm = 0;
  if (m) {
    hh = parseInt(m[1],10) % 12;
    if (m[3].toUpperCase() === "PM") hh += 12;
    mm = parseInt(m[2]||"0",10);
  }
  base.setHours(hh, mm, 0, 0);

  // hours from booking
  const hours =
    Number(b?.selectedType?.hours) ||
    Number(b?.hours) ||
    Number(b?.typeId) ||
    (/(\d+(?:\.\d+)?)\s*hour/i.test(b?.selectedType?.name||"") ? Number(RegExp.$1) : 1);

  const start = base;
  const end = new Date(start.getTime() + Math.max(30, Math.round(hours*60)) * 60000);
  return { start, end };
}

async function subscribeBookingsForDay(d) {
  const { collection, query, where, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  if (dayUnsub) { dayUnsub(); dayUnsub = null; }

  // day interval in ISO to query by string (your client saved ISO strings)
  // 00:00 inclusive to 24:00 exclusive in local time, converted to ISO
  const start = new Date(d); start.setHours(0,0,0,0);
  const end = new Date(d);   end.setDate(end.getDate()+1); end.setHours(0,0,0,0);
  const startISO = start.toISOString();
  const endISO   = end.toISOString();

  // Note: if your schema sometimes uses Firestore Timestamp instead of string,
  // you can add an additional listener for that field as needed.
  const qStr = query(
    collection(window.db, "bookings"),
    where("selectedDate", ">=", startISO),
    where("selectedDate", "<", endISO)
  );

  dayUnsub = onSnapshot(qStr, (snap)=>{
    const list = [];
    snap.forEach(doc=>{
      const b = doc.data() || {};
      const status = String(b.status || b.payment_status || "confirmed").toLowerCase();
      if (["declined","failed","canceled","cancelled","pending"].includes(status)) return;
      const rng = parseBookingToRange(b);
      if (rng) list.push(rng);
    });
    dayBookings = list;
    // recompute time buttons (if already on the right panel)
    renderRight();
  });
}

// Optional: allow retry via button
document.getElementById('payBtn').addEventListener('click', async ()=>{
  if (!selectedType || !userFormData) {
    alert("Please fill your info first.");
    return;
  }
  const price = selectedType.price;
  const deposit = Math.round(price * DEPOSIT_PERCENT / 100);

  try {
    await initPaymobIframe({
      amountCents: deposit * 100,
      billing: {
        first_name: userFormData?.firstName || '',
        last_name:  userFormData?.lastName  || '',
        email:      userFormData?.email     || '',
        phone_number: userFormData?.phone_e164 || ''
      }
    });
  } catch (err) {
    console.error(err);
    alert("Could not start payment: " + (err?.message || err));
  }
});

// nav
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
prevBtn.addEventListener('click', ()=>{ current = new Date(current.getFullYear(), current.getMonth()-1, 1); renderCalendar(); });
nextBtn.addEventListener('click', ()=>{ current = new Date(current.getFullYear(), current.getMonth()+1, 1); renderCalendar(); });

// init
subscribeSessionTypes();     // load live session types from admin
subscribeWorkingHours();     // load live working hours from admin
subscribeBookingsForDay(selected); // listen to bookings for today
showStep('type');
renderCalendar();
renderRight();
