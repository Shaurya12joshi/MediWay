// Opening hours. A schedule is a list of { days: [0-6, Sunday first], open: 'HH:MM', close: 'HH:MM' }
// and is read in India time wherever the visitor is.

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getNowIST() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 330 * 60000);
  return { day: ist.getDay(), mins: ist.getHours() * 60 + ist.getMinutes() };
}

// Imported places often have no hours: say so rather than guess
const UNKNOWN_HOURS = { open: false, unknown: true, label: 'Hours not listed', nextSlot: 'Call ahead' };

export function getStatus(place) {
  const schedule = place.schedule;
  if (!schedule?.length) return UNKNOWN_HOURS;
  const { day: today, mins: nowM } = getNowIST();

  for (const slot of schedule) {
    if (slot.days.includes(today) && nowM >= timeToMins(slot.open) && nowM < timeToMins(slot.close)) {
      return { open: true, label: `Open · closes ${fmtTime(slot.close)}`, nextSlot: `Today ${fmtTime(slot.open)}` };
    }
  }

  const laterToday = schedule
    .filter(s => s.days.includes(today) && timeToMins(s.open) > nowM)
    .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));
  if (laterToday.length) {
    const next = laterToday[0];
    return { open: false, label: `Closed · opens ${fmtTime(next.open)}`, nextSlot: `Today ${fmtTime(next.open)}` };
  }

  for (let delta = 1; delta <= 7; delta++) {
    const dayAhead = (today + delta) % 7;
    const slotsAhead = schedule
      .filter(s => s.days.includes(dayAhead))
      .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));
    if (slotsAhead.length) {
      const next = slotsAhead[0];
      const dayLabel = delta === 1 ? 'Tomorrow' : DAY_NAMES[dayAhead];
      return { open: false, label: `Closed · opens ${dayLabel} ${fmtTime(next.open)}`, nextSlot: `${dayLabel} ${fmtTime(next.open)}` };
    }
  }

  return { open: false, label: 'Closed today', nextSlot: 'Check back later' };
}

// "Mon–Sat: 9 AM – 1 PM, 5 PM – 8 PM · Sun: 10 AM – 1 PM"
export function scheduleText(place) {
  const schedule = place.schedule;
  if (!schedule?.length) return 'Hours not listed';
  const groups = [];
  for (const slot of schedule) {
    const key = slot.days.join(',');
    const existing = groups.find(g => g.key === key);
    const range = `${fmtTime(slot.open)} – ${fmtTime(slot.close)}`;
    if (existing) existing.ranges.push(range);
    else groups.push({ key, days: slot.days, ranges: [range] });
  }

  return groups.map(g => {
    const sorted = [...g.days].sort((a, b) => a - b);
    let dayStr;
    if (sorted.length === 1) {
      dayStr = DAY_NAMES[sorted[0]];
    } else {
      const isConsec = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
      dayStr = isConsec
        ? `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`
        : sorted.map(d => DAY_NAMES[d]).join(', ');
    }
    return `${dayStr}: ${g.ranges.join(', ')}`;
  }).join(' · ');
}
