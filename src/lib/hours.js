// Opening hours. A schedule is a list of { days: [0-6, Sunday first], open: 'HH:MM', close: 'HH:MM' }
// and is read in India time wherever the visitor is. Text comes out in the visitor's language.
import { currentLanguage, t } from '../i18n';

const dayName = d => t(`day.${d}`);

function timeToMins(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// "9 AM" in English; 24-hour "09:00" elsewhere, as people there write it
export function fmtTime(time) {
  const [h, m] = time.split(':').map(Number);
  if (currentLanguage() !== 'en') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

const isOpenAllDay = schedule => schedule.length === 1 && schedule[0].days.length === 7 &&
  schedule[0].open === '00:00' && schedule[0].close === '23:59';

export function getStatus(place) {
  const schedule = place.schedule;
  // Imported places often have no hours: say so rather than guess
  if (!schedule?.length) return { open: false, unknown: true, label: t('hours.notListed'), nextSlot: t('hours.callAhead') };
  if (isOpenAllDay(schedule)) return { open: true, label: t('hours.openAllDay'), nextSlot: t('hours.openAllDay') };
  const { day: today, mins: nowM } = getNowIST();

  for (const slot of schedule) {
    if (slot.days.includes(today) && nowM >= timeToMins(slot.open) && nowM < timeToMins(slot.close)) {
      return { open: true, label: t('hours.openCloses', { time: fmtTime(slot.close) }), nextSlot: t('hours.todayAt', { time: fmtTime(slot.open) }) };
    }
  }

  const laterToday = schedule
    .filter(s => s.days.includes(today) && timeToMins(s.open) > nowM)
    .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));
  if (laterToday.length) {
    const time = fmtTime(laterToday[0].open);
    return { open: false, label: t('hours.closedOpens', { time }), nextSlot: t('hours.todayAt', { time }) };
  }

  for (let delta = 1; delta <= 7; delta++) {
    const dayAhead = (today + delta) % 7;
    const slotsAhead = schedule
      .filter(s => s.days.includes(dayAhead))
      .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));
    if (slotsAhead.length) {
      const time = fmtTime(slotsAhead[0].open);
      const day = delta === 1 ? t('hours.tomorrow') : dayName(dayAhead);
      return { open: false, label: t('hours.closedOpensDay', { day, time }), nextSlot: t('hours.dayAt', { day, time }) };
    }
  }

  return { open: false, label: t('hours.closedToday'), nextSlot: t('hours.checkBackLater') };
}

// "Mon–Sat: 9 AM – 1 PM, 5 PM – 8 PM · Sun: 10 AM – 1 PM"
export function scheduleText(place) {
  const schedule = place.schedule;
  if (!schedule?.length) return t('hours.notListed');
  if (isOpenAllDay(schedule)) return t('hours.openAllDay');
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
      dayStr = dayName(sorted[0]);
    } else {
      const isConsec = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
      dayStr = isConsec
        ? `${dayName(sorted[0])}–${dayName(sorted[sorted.length - 1])}`
        : sorted.map(dayName).join(', ');
    }
    return `${dayStr}: ${g.ranges.join(', ')}`;
  }).join(' · ');
}
