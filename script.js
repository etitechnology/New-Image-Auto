/* New Image Auto Services
   The sign's shadows follow the real sun over 7622 Talbert Ave. */
(() => {
  const LAT = 33.7008483;
  const LON = -117.9954228;
  const TZ = 'America/Los_Angeles';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- time in Huntington Beach ---------- */
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  });
  const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function shopClock(date = new Date()) {
    const p = Object.fromEntries(partsFmt.formatToParts(date).map(x => [x.type, x.value]));
    return { day: DAYS[p.weekday], minutes: (+p.hour % 24) * 60 + +p.minute };
  }

  function formatMinutes(m) {
    const h = Math.floor(m / 60) % 24;
    const mm = String(m % 60).padStart(2, '0');
    const suffix = h < 12 ? 'am' : 'pm';
    return `${h % 12 || 12}:${mm} ${suffix}`;
  }

  /* ---------- sun position (after suncalc, V. Agafonkin) ---------- */
  const rad = Math.PI / 180;
  function sunPosition(date) {
    const d = date.valueOf() / 864e5 - 0.5 + 2440588 - 2451545;
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const e = rad * 23.4397;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const H = rad * (280.16 + 360.9856235 * d) - rad * -LON - ra;
    const phi = rad * LAT;
    return {
      altitude: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
      azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) // from south, west positive
    };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- paint the wall ---------- */
  const wall = document.getElementById('wall');
  const signs = document.querySelectorAll('.sign');
  const slider = document.getElementById('clock');
  const clockOut = document.getElementById('clock-time');

  function paint(minutes) {
    const now = shopClock();
    const date = new Date(Date.now() + (minutes - now.minutes) * 60000);
    const { altitude, azimuth } = sunPosition(date);
    const altDeg = altitude / rad;

    const day = smooth(-7, 3, altDeg);                     // 0 at night, 1 in daylight
    const warm = day * (1 - smooth(4, 22, altDeg));        // golden hour
    // Standing on Talbert looking at the wall: morning sun from the left, afternoon from the right.
    const across = -Math.sin(azimuth) * Math.cos(altitude);
    const high = Math.max(0.12, Math.sin(altitude));

    wall.style.setProperty('--day', day.toFixed(3));
    wall.style.setProperty('--warm', warm.toFixed(3));
    wall.style.setProperty('--sun-x', clamp(-across, -1, 1).toFixed(3));

    // Direction and length of the cast shadow. At night the flood lamps light the letters from above.
    let dx = across * day;
    let dy = high * day + 0.9 * (1 - day);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const reach = (0.05 + (1 - high) * 0.08) * day + 0.035 * (1 - day);
    const soft = 0.004 + (1 - day) * 0.02 + warm * 0.006;
    const strength = 0.2 + 0.2 * day + 0.06 * (1 - day);

    signs.forEach(el => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      const s = [];
      // the letters' own thickness, seen almost head-on
      const depth = Math.max(2, Math.round(size * 0.028));
      for (let i = 1; i <= depth; i++) {
        s.push(`${(dx * i * 0.35).toFixed(2)}px ${(i * 0.75).toFixed(2)}px 0 var(--side)`);
      }
      // at night the flood lamps catch the top edge of each letter
      if (day < 0.6) s.unshift(`0 -1px 0 rgba(255, 228, 172, ${((0.6 - day) * 0.9).toFixed(2)})`);
      // cast shadow on the block
      const off = size * reach;
      s.push(`${(dx * off).toFixed(1)}px ${(dy * off).toFixed(1)}px ${(size * soft).toFixed(1)}px rgba(38, 34, 26, ${strength.toFixed(2)})`);
      s.push(`${(dx * off * 1.5).toFixed(1)}px ${(dy * off * 1.5).toFixed(1)}px ${(size * (soft * 3 + 0.02)).toFixed(1)}px rgba(38, 34, 26, ${(strength * 0.45).toFixed(2)})`);
      el.style.textShadow = s.join(', ');
    });

    clockOut.textContent = formatMinutes(minutes);
    slider.value = minutes;
    slider.setAttribute('aria-valuetext', formatMinutes(minutes));
  }

  /* ---------- the day scrubber ---------- */
  let userTouched = false;
  let raf = 0;

  slider.addEventListener('input', () => {
    userTouched = true;
    cancelAnimationFrame(raf);
    paint(+slider.value);
  });

  // Snap back to the real time a while after someone lets go.
  let snapTimer;
  slider.addEventListener('change', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      userTouched = false;
      if (reduceMotion) paint(shopClock().minutes); else sweepTo(shopClock().minutes, 1600);
    }, 12000);
  });

  // Always moves forward through the day, wrapping past midnight if needed.
  function sweepTo(target, duration) {
    const from = +slider.value;
    const to = target < from ? target + 1440 : target;
    const start = performance.now();
    cancelAnimationFrame(raf);
    const step = t => {
      const k = clamp((t - start) / duration, 0, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      paint(Math.round(from + (to - from) * ease) % 1440);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function start() {
    const nowM = shopClock().minutes;
    if (reduceMotion) { paint(nowM); return; }
    // One opening moment: the morning passes across the sign until it reaches the present.
    const from = nowM >= 390 && nowM <= 1260 ? 360 : (nowM + 1440 - 300) % 1440;
    paint(from);
    sweepTo(nowM, 2600);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }

  setInterval(() => { if (!userTouched) paint(shopClock().minutes); updateStatus(); }, 60000);
  window.addEventListener('resize', () => paint(+slider.value));

  /* ---------- open or closed ---------- */
  const OPEN = 8 * 60 + 30;
  const CLOSE = 18 * 60;
  const isWeekday = d => d >= 1 && d <= 5;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function updateStatus() {
    const { day, minutes } = shopClock();
    const status = document.getElementById('status');
    let text;
    let open = false;
    if (isWeekday(day) && minutes >= OPEN && minutes < CLOSE) {
      open = true;
      text = 'Open now until 6 pm';
    } else if (isWeekday(day) && minutes < OPEN) {
      text = 'Closed now. Opens today at 8:30 am';
    } else {
      let next = (day + 1) % 7;
      while (!isWeekday(next)) next = (next + 1) % 7;
      const label = next === (day + 1) % 7 ? 'tomorrow' : DAY_NAMES[next];
      text = `Closed now. Opens ${label} at 8:30 am`;
    }
    status.textContent = text;
    status.classList.toggle('is-open', open);

    document.querySelectorAll('#hours tr').forEach(tr => {
      tr.classList.toggle('is-today', +tr.dataset.day === day);
    });
  }
  updateStatus();

  /* ---------- floating call button once the wall is gone ---------- */
  const callout = document.querySelector('.callout');
  const building = document.querySelector('.building');
  const lot = document.getElementById('visit');
  if ('IntersectionObserver' in window) {
    let pastWall = false, atLot = false;
    const sync = () => callout.classList.toggle('is-shown', pastWall && !atLot);
    new IntersectionObserver(([e]) => { pastWall = !e.isIntersecting; sync(); }).observe(building);
    new IntersectionObserver(([e]) => { atLot = e.isIntersecting; sync(); }, { threshold: 0.25 }).observe(lot);

    /* ledger bars grow once, when they come into view */
    const ledger = document.querySelector('.ledger');
    if (!reduceMotion) {
      ledger.classList.add('is-waiting');
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { ledger.classList.remove('is-waiting'); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(ledger.querySelector('.ledger__rows'));
    }
  } else {
    callout.classList.add('is-shown');
  }
})();
