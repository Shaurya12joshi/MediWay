// Days and opening times, as an admin enters them from a phone call (hospital hours, a doctor's OPD)

const DAY_BUTTONS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6], MON_SAT = [1, 2, 3, 4, 5, 6];
// Two sessions (morning + evening OPD) is the most a day needs here
const MAX_RANGES = 2;
const TIME_INPUT = 'border-[1.5px] border-[#E6E6E1] rounded-[8px] px-[8px] py-[5px] text-[13px] font-sans';
export const toggle = on => on ? 'bg-[#1E293B] text-white border-[#1E293B]' : 'bg-white text-[#64748B] border-[#E6E6E1]';

export const PLACE_PRESETS = [
  { label: 'Open 24/7', days: ALL_DAYS, ranges: [['00:00', '23:59']] },
  { label: 'Mon–Sat 9 AM–9 PM', days: MON_SAT, ranges: [['09:00', '21:00']] },
  { label: 'Every day 7 AM–8 PM', days: ALL_DAYS, ranges: [['07:00', '20:00']] },
  { label: 'Mon–Sat 10–2 & 5–8', days: MON_SAT, ranges: [['10:00', '14:00'], ['17:00', '20:00']] },
];
export const DOCTOR_PRESETS = [
  { label: 'Mon–Sat 10–2 & 5–8', days: MON_SAT, ranges: [['10:00', '14:00'], ['17:00', '20:00']] },
  { label: 'Mon–Sat 9 AM–5 PM', days: MON_SAT, ranges: [['09:00', '17:00']] },
  { label: 'Mon–Sat 10 AM–2 PM', days: MON_SAT, ranges: [['10:00', '14:00']] },
  { label: 'Evenings, Mon–Sat 5–8 PM', days: MON_SAT, ranges: [['17:00', '20:00']] },
];

export const EMPTY_HOURS = { days: [], ranges: [['', '']] };

// { schedule } when complete, { error } when half filled in, {} when left empty
export function readSchedule({ days, ranges }) {
  const slots = ranges.map(([open, close]) => ({ open, close })).filter(s => s.open || s.close);
  if (!days.length && !slots.length) return {};
  if (!days.length) return { error: 'Pick the days.' };
  if (!slots.length || slots.some(s => !s.open || !s.close)) return { error: 'Enter the start and end times.' };
  if (slots.some(s => s.close <= s.open)) return { error: 'The end time must be after the start (overnight hours aren’t supported yet).' };
  const sortedDays = [...days].sort();
  return { schedule: slots.map(s => ({ days: sortedDays, open: s.open, close: s.close })) };
}

export default function ScheduleEditor({ value, onChange, presets = PLACE_PRESETS, addLabel = '+ Add evening session' }) {
  const { days, ranges } = value;
  const set = patch => onChange({ ...value, ...patch });
  const toggleDay = d => set({ days: days.includes(d) ? days.filter(x => x !== d) : [...days, d] });
  const setRange = (i, which, v) => set({ ranges: ranges.map((r, j) => j === i ? (which === 0 ? [v, r[1]] : [r[0], v]) : r) });
  return (
    <>
      <div className="flex flex-wrap gap-[6px] mb-[10px]">
        {presets.map(p => (
          <button key={p.label} type="button" onClick={() => onChange({ days: p.days, ranges: p.ranges })} className="px-[10px] py-[6px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-[#E6E6E1] bg-white text-[#3F3F46] cursor-pointer font-sans hover:border-[#1E293B]">{p.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[5px] mb-[8px]">
        {DAY_BUTTONS.map(([label, d]) => (
          <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}
            className={`w-[42px] py-[6px] rounded-[7px] text-[12px] font-medium border-[1.5px] cursor-pointer font-sans ${toggle(days.includes(d))}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[8px]">
        {ranges.map(([open, close], i) => (
          <div key={i} className="flex items-center gap-[6px]">
            <input type="time" value={open} aria-label="Starts at" onChange={e => setRange(i, 0, e.target.value)} className={TIME_INPUT} />
            <span className="text-[12px] text-[#94A3B8]">to</span>
            <input type="time" value={close} aria-label="Ends at" onChange={e => setRange(i, 1, e.target.value)} className={TIME_INPUT} />
            {i > 0 && <button type="button" onClick={() => set({ ranges: ranges.filter((_, j) => j !== i) })} className="text-[#94A3B8] bg-transparent border-none cursor-pointer text-[16px] leading-none px-[4px]" title="Remove">×</button>}
          </div>
        ))}
      </div>
      {ranges.length < MAX_RANGES && (
        <button type="button" onClick={() => set({ ranges: [...ranges, ['17:00', '20:00']] })} className="mt-[6px] text-[12px] text-[#D0423A] bg-transparent border-none cursor-pointer font-sans p-0">{addLabel}</button>
      )}
    </>
  );
}
