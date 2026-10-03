import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { showToast } from '../../store/toastSlice';
import { useAdminCitiesQuery, useHoursPagesInfiniteQuery, useHoursSummaryQuery, useSaveHoursMutation } from './adminApi';
import { BTN_APPROVE, BTN_PLAIN, Empty, KindBadge, LOAD_MORE, SELECT, TabLoading, chip, fmtShortDate, mapLink } from './shared';

// Live places with no hours (and hospitals whose 24/7 ER status is unknown), ready to call

const KINDS = [['hospital', 'Hospitals'], ['pharmacy', 'Pharmacies'], ['clinic', 'Clinics'], ['lab', 'Labs']];
const DAY_BUTTONS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6], MON_SAT = [1, 2, 3, 4, 5, 6];
const HOUR_PRESETS = [
  { label: 'Open 24/7', days: ALL_DAYS, ranges: [['00:00', '23:59']] },
  { label: 'Mon–Sat 9 AM–9 PM', days: MON_SAT, ranges: [['09:00', '21:00']] },
  { label: 'Every day 7 AM–8 PM', days: ALL_DAYS, ranges: [['07:00', '20:00']] },
  { label: 'Mon–Sat 10–2 & 5–8', days: MON_SAT, ranges: [['10:00', '14:00'], ['17:00', '20:00']] },
];
const ER_CHOICES = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']];
// Two sessions (morning + evening OPD) is the most a day needs here
const MAX_RANGES = 2;

const TIME_INPUT = 'border-[1.5px] border-[#E6E6E1] rounded-[8px] px-[8px] py-[5px] text-[13px] font-sans';
const toggle = on => on ? 'bg-[#1E293B] text-white border-[#1E293B]' : 'bg-white text-[#64748B] border-[#E6E6E1]';

function HoursCard({ place: h, listArgs, onSkip }) {
  const dispatch = useDispatch();
  const [save, { isLoading: busy }] = useSaveHoursMutation();
  const isHospital = h.kind === 'hospital';
  // Has hours already: only the ER question is open
  const hasHours = Array.isArray(h.schedule) && h.schedule.length > 0;
  const tried = h.hours_source === 'unreachable' && h.hours_checked_at ? `No answer on ${fmtShortDate(h.hours_checked_at)}` : '';

  const [days, setDays] = useState([]);
  const [ranges, setRanges] = useState([['', '']]);
  const [er, setEr] = useState(h.er24 === true ? 'yes' : h.er24 === false ? 'no' : null);
  const [error, setError] = useState('');

  const toggleDay = d => setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]);
  const setRange = (i, which, value) => setRanges(rs => rs.map((r, j) => j === i ? (which === 0 ? [value, r[1]] : [r[0], value]) : r));
  const applyPreset = p => { setDays(p.days); setRanges(p.ranges); };

  async function submit(outcome, schedule, er24, message) {
    const { error } = await save({ id: h.id, outcome, schedule, er24, listArgs });
    if (error) { console.error(error); setError(error.message || 'Something went wrong — try again'); return; }
    dispatch(showToast(message));
  }

  function handleSave() {
    setError('');
    const slots = ranges.map(([open, close]) => ({ open, close })).filter(s => s.open || s.close);
    let schedule = null;
    if (!hasHours && (days.length || slots.length)) {
      if (!days.length) return setError('Pick the days it’s open.');
      if (!slots.length || slots.some(s => !s.open || !s.close)) return setError('Enter opening and closing times.');
      if (slots.some(s => s.close <= s.open)) return setError('Closing time must be after opening time (overnight hours aren’t supported yet).');
      const sortedDays = [...days].sort();
      schedule = slots.map(s => ({ days: sortedDays, open: s.open, close: s.close }));
    }
    const hasEr24 = er === 'yes' ? true : er === 'no' ? false : null;
    if (!schedule && !(isHospital && hasEr24 !== null)) {
      return setError(isHospital ? 'Add hours or answer the emergency question.' : 'Add the opening hours, or press “No answer”.');
    }
    submit('verified', schedule, isHospital ? hasEr24 : null, `Saved ${h.name}`);
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[18px]">
      <div className="flex items-start justify-between gap-[10px] flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-[8px] mb-[3px]">
            <KindBadge kind={h.kind} />
            {tried && <span className="text-[11px] text-[#B45309]">{tried}</span>}
            {hasHours && <span className="text-[11px] text-[#94A3B8]">Has hours · ER status unknown</span>}
          </div>
          <div className="font-serif text-[17px] text-[#1E293B] break-words">{h.name}</div>
          <div className="text-[12px] text-[#64748B] mt-[2px] break-words">{h.address || 'No address'} · <a href={mapLink(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">map</a></div>
        </div>
        {h.phone
          ? <a href={`tel:${h.phone.replace(/[^\d+]/g, '')}`} className="shrink-0 flex items-center gap-[7px] bg-[#1E293B] hover:bg-black text-white no-underline px-[14px] py-[9px] rounded-[10px] text-[14px] font-semibold">📞 {h.phone}</a>
          : <span className="text-[12px] text-[#94A3B8]">No phone</span>}
      </div>

      {!hasHours && (
        <div className="mt-[14px] pt-[14px] border-t border-[#F0EFEA]">
          <div className="flex flex-wrap gap-[6px] mb-[10px]">
            {HOUR_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => applyPreset(p)} className="px-[10px] py-[6px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-[#E6E6E1] bg-white text-[#3F3F46] cursor-pointer font-sans hover:border-[#1E293B]">{p.label}</button>
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
                <input type="time" value={open} aria-label="Opens at" onChange={e => setRange(i, 0, e.target.value)} className={TIME_INPUT} />
                <span className="text-[12px] text-[#94A3B8]">to</span>
                <input type="time" value={close} aria-label="Closes at" onChange={e => setRange(i, 1, e.target.value)} className={TIME_INPUT} />
                {i > 0 && <button type="button" onClick={() => setRanges(rs => rs.filter((_, j) => j !== i))} className="text-[#94A3B8] bg-transparent border-none cursor-pointer text-[16px] leading-none px-[4px]" title="Remove">×</button>}
              </div>
            ))}
          </div>
          {ranges.length < MAX_RANGES && (
            <button type="button" onClick={() => setRanges(rs => [...rs, ['17:00', '20:00']])} className="mt-[6px] text-[12px] text-[#D0423A] bg-transparent border-none cursor-pointer font-sans p-0">+ Add evening session</button>
          )}
        </div>
      )}

      {isHospital && (
        <div className="mt-[12px] flex flex-wrap items-center gap-[6px]">
          <span className="text-[13px] text-[#3F3F46] mr-[4px]">24/7 emergency room?</span>
          {ER_CHOICES.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={er === v} onClick={() => setEr(v)}
              className={`px-[11px] py-[6px] rounded-[8px] text-[12px] font-medium border-[1.5px] cursor-pointer font-sans ${toggle(er === v)}`}>{label}</button>
          ))}
        </div>
      )}

      <div className="mt-[14px] flex flex-wrap gap-[8px] items-center">
        <button type="button" disabled={busy} onClick={handleSave} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>Save</button>
        <button type="button" disabled={busy} onClick={() => submit('unreachable', null, null, 'Noted — it’ll come back later in the queue')}
          className={`${BTN_PLAIN} px-[14px] py-[9px] text-[13px] hover:border-[#B45309] hover:text-[#B45309]`}>No answer</button>
        <button type="button" disabled={busy} onClick={() => onSkip(h.id)} className="bg-transparent border-none text-[13px] text-[#94A3B8] cursor-pointer font-sans hover:text-[#1E293B]">Skip</button>
        {error && <span role="alert" className="text-[12px] text-[#D0423A]">{error}</span>}
      </div>
    </div>
  );
}

// state / setState come from the admin page, so the filters survive switching tabs
export default function HoursTab({ state, setState }) {
  const cities = useAdminCitiesQuery();
  const city = state.city ?? cities.data?.[0]?.slug;
  const cityName = cities.data?.find(c => c.slug === city)?.name;
  const listArgs = cities.data ? { cityName, kind: state.kind, phoneOnly: state.phoneOnly } : skipToken;
  const summary = useHoursSummaryQuery(listArgs);
  const pages = useHoursPagesInfiniteQuery(listArgs);
  // Skipped places stay in the query (and the offset), just off screen
  const [skipped, setSkipped] = useState([]);

  if (cities.isLoading) return <TabLoading />;
  if (cities.isError) return <div className="text-center py-[48px] text-[14px] text-[#94A3B8]">Couldn't load cities. Have the Supabase migrations been run?</div>;

  const update = patch => { setState(s => ({ ...s, ...patch })); setSkipped([]); };
  const rows = (pages.data?.pages.flatMap(p => p.rows) ?? []).filter(h => !skipped.includes(h.id));

  return (
    <>
      <div className="mb-[16px]">
        <h1 className="font-serif text-[24px]">Opening hours</h1>
        <p className="text-[13px] text-[#94A3B8] mt-[3px]">
          {summary.data == null ? '…' : summary.data ? `${summary.data} to call · places nobody has tried come first` : 'Nothing left to call for this filter.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-[8px] mb-[18px]">
        <select value={city ?? ''} onChange={e => update({ city: e.target.value })} aria-label="City" className={SELECT}>
          {cities.data.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => update({ kind: k })} className={chip(k === state.kind)}>{label}</button>
        ))}
        <label className="flex items-center gap-[6px] text-[12px] text-[#64748B] ml-[4px] cursor-pointer">
          <input type="checkbox" checked={state.phoneOnly} onChange={e => update({ phoneOnly: e.target.checked })} className="accent-[#D0423A]" /> Only places with a phone number
        </label>
      </div>

      {pages.isLoading ? <TabLoading /> : pages.isError
        ? <p className="text-[13px] text-[#D0423A]">Couldn't load places. Has 20261003_place_hours.sql been run?</p>
        : rows.length === 0 && !pages.hasNextPage
          ? <Empty title="All done here">Every place in this list has hours.</Empty>
          : <div className="flex flex-col gap-[12px]">
              {rows.map(h => <HoursCard key={h.id} place={h} listArgs={listArgs} onSkip={id => setSkipped(s => [...s, id])} />)}
            </div>}

      {pages.hasNextPage && (
        <button type="button" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()} className={LOAD_MORE}>
          {pages.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
