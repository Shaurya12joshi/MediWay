import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { showToast } from '../../store/toastSlice';
import { scheduleText } from '../../lib/hours';
import {
  NEAR_TOURISTS_KM, useAdminCitiesQuery, useDismissSuggestionMutation, useHoursPagesInfiniteQuery, useHoursSummaryQuery,
  useRemoveAutoHoursMutation, useSaveDetailsMutation, useSaveHoursMutation,
} from './adminApi';
import { BTN_APPROVE, BTN_PLAIN, Empty, KindBadge, LOAD_MORE, SELECT, TabLoading, chip, fmtShortDate, mapLink } from './shared';

// Opening hours for live places. scripts/enrich-hours.mjs fills what it can from the places' own
// websites; what it wasn't sure about waits under Suggestions, and only what it found nothing for
// needs a phone call.

const VIEWS = [['suggestions', 'Suggestions'], ['call', 'To call'], ['auto', 'Auto-filled']];
const EMPTY = {
  suggestions: ['No suggestions', 'Run scripts/enrich-hours.mjs --ai to read more places’ websites.'],
  call: ['All done here', 'Every place in this list has hours.'],
  auto: ['Nothing filled automatically', 'Hours found by scripts/enrich-hours.mjs show up here to spot-check.'],
};
const SOURCE_LABEL = {
  website: 'From their website (structured data)',
  'website-ai': 'Read from their website by Gemini',
  name: 'From the name',
  osm: 'From OpenStreetMap',
};
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
// Asked on the same call; they show as badges and filters for travellers on the search page
const DETAIL_QUESTIONS = [
  ['intl_insurance', 'Takes international travel insurance?', ['hospital', 'clinic']],
  ['accepts_cards', 'Accepts card payment?', ['hospital', 'clinic', 'pharmacy', 'lab']],
  ['english_desk', 'English spoken at the front desk?', ['hospital', 'clinic', 'pharmacy', 'lab']],
  ['travel_clinic', 'Travel clinic (vaccines, travel advice)?', ['hospital', 'clinic']],
  ['female_doctor', 'A female doctor available?', ['hospital', 'clinic']],
];

// Yes / No / unknown answers for one place. Hidden until the migration adds the columns.
function DetailQuestions({ place: h, answers, setAnswers }) {
  const questions = DETAIL_QUESTIONS.filter(([key, , kinds]) => key in h && kinds.includes(h.kind));
  if (!questions.length) return null;
  const value = key => key in answers ? answers[key] : h[key];
  return (
    <div className="mt-[12px] pt-[12px] border-t border-[#F0EFEA]">
      <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#94A3B8] mb-[8px]">For travellers · if they know</div>
      <div className="flex flex-col gap-[6px]">
        {questions.map(([key, question]) => (
          <div key={key} className="flex flex-wrap items-center gap-[6px]">
            <span className="text-[13px] text-[#3F3F46] mr-[4px] min-w-[240px]">{question}</span>
            {[[true, 'Yes'], [false, 'No'], [null, '?']].map(([v, label]) => (
              <button key={label} type="button" aria-pressed={value(key) === v} onClick={() => setAnswers(a => ({ ...a, [key]: v }))}
                className={`px-[10px] py-[4px] rounded-[7px] text-[12px] font-medium border-[1.5px] cursor-pointer font-sans ${toggle(value(key) === v)}`}>{label}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const TIME_INPUT = 'border-[1.5px] border-[#E6E6E1] rounded-[8px] px-[8px] py-[5px] text-[13px] font-sans';
const toggle = on => on ? 'bg-[#1E293B] text-white border-[#1E293B]' : 'bg-white text-[#64748B] border-[#E6E6E1]';

function HoursCard({ place: h, listArgs, onSkip }) {
  const dispatch = useDispatch();
  const [save, { isLoading: savingHours }] = useSaveHoursMutation();
  const [saveDetails, { isLoading: savingDetails }] = useSaveDetailsMutation();
  const busy = savingHours || savingDetails;
  const [answers, setAnswers] = useState({});
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

  // Only the answers that changed are sent
  const changedDetails = Object.fromEntries(Object.entries(answers).filter(([k, v]) => v !== (h[k] ?? null)));
  const hasDetails = Object.keys(changedDetails).length > 0;

  async function sendDetails() {
    if (!hasDetails) return true;
    const { error } = await saveDetails({ id: h.id, details: changedDetails });
    if (error) { console.error(error); setError(error.message || 'Couldn’t save the traveller answers'); return false; }
    return true;
  }

  async function submit(outcome, schedule, er24, message) {
    if (outcome === 'verified' && !(await sendDetails())) return;
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
      // Traveller answers alone are saved; the place stays in the queue for its hours
      if (hasDetails) {
        return sendDetails().then(ok => { if (ok) { dispatch(showToast(`Saved traveller details for ${h.name} — hours still needed`)); } });
      }
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
            <TouristDistance place={h} />
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

      <DetailQuestions place={h} answers={answers} setAnswers={setAnswers} />

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


// Name, address and the links an admin needs to check a place
// "0.8 km from Assi Ghat": why this place is high in the queue
function TouristDistance({ place: h }) {
  if (h.tourist_km == null || !h.tourist_area) return null;
  const near = h.tourist_km <= NEAR_TOURISTS_KM;
  return <span className={`text-[11px] ${near ? 'text-[#1D4ED8]' : 'text-[#94A3B8]'}`}>📍 {h.tourist_km < 1 ? `${Math.round(h.tourist_km * 1000)} m` : `${h.tourist_km.toFixed(1)} km`} from {h.tourist_area}</span>;
}

function PlaceTitle({ place: h, extra }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-[8px] mb-[3px] flex-wrap">
        <KindBadge kind={h.kind} />
        <TouristDistance place={h} />
        {extra}
      </div>
      <div className="font-serif text-[17px] text-[#1E293B] break-words">{h.name}</div>
      <div className="text-[12px] text-[#64748B] mt-[2px] break-words">
        {h.address || 'No address'} · <a href={mapLink(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">map</a>
        {h.website && <> · <a href={h.website} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">website</a></>}
        {h.phone && <> · <a href={`tel:${h.phone.replace(/[^\d+]/g, '')}`} className="text-[#D0423A] underline">{h.phone}</a></>}
      </div>
    </div>
  );
}

const isOpenAllDay = schedule => schedule.length === 1 && schedule[0].days.length === 7 && schedule[0].open === '00:00' && schedule[0].close === '23:59';

// Hours (and ER answer) as a sentence, with the words they were read from
function FoundHours({ schedule, er24, kind, evidence, label }) {
  return (
    <div className="mt-[12px] rounded-[10px] bg-[#F7F6F2] border border-[#EFEDE8] p-[12px]">
      <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#94A3B8] mb-[4px]">{label}</div>
      <div className="text-[14px] text-[#1E293B] font-medium">
        {!schedule?.length ? 'No hours given' : isOpenAllDay(schedule) ? 'Open 24/7' : scheduleText({ schedule })}
      </div>
      {kind === 'hospital' && er24 != null && (
        <div className="text-[13px] text-[#3F3F46] mt-[2px]">24/7 emergency room: <strong>{er24 ? 'yes' : 'no'}</strong></div>
      )}
      {evidence && <blockquote className="mt-[8px] pl-[10px] border-l-2 border-[#D6D3CC] text-[12px] text-[#64748B] whitespace-pre-line break-words">{evidence}</blockquote>}
    </div>
  );
}

function useNotify() {
  const dispatch = useDispatch();
  return message => dispatch(showToast(message));
}

// The script found hours but wasn't sure: one tap to accept, or send it to the phone queue
function SuggestionCard({ place: h, listArgs }) {
  const toast = useNotify();
  const [save, { isLoading: saving }] = useSaveHoursMutation();
  const [dismiss, { isLoading: dismissing }] = useDismissSuggestionMutation();
  const [error, setError] = useState('');
  const isHospital = h.kind === 'hospital';

  async function accept() {
    setError('');
    const { error } = await save({
      id: h.id, outcome: 'verified', listArgs,
      schedule: h.suggested_schedule ?? null,
      er24: isHospital ? h.suggested_er24 ?? null : null,
    });
    if (error) { console.error(error); setError(error.message || 'Something went wrong — try again'); return; }
    toast(`Saved ${h.name}`);
  }

  async function reject() {
    setError('');
    const { error } = await dismiss({ id: h.id, listArgs });
    if (error) { console.error(error); setError(error.message || 'Something went wrong — try again'); return; }
    toast('Moved to the phone queue');
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[18px]">
      <PlaceTitle place={h} />
      <FoundHours schedule={h.suggested_schedule} er24={h.suggested_er24} kind={h.kind} evidence={h.suggestion_evidence} label="Suggested automatically: check the evidence" />
      <div className="mt-[14px] flex flex-wrap gap-[8px] items-center">
        <button type="button" disabled={saving || dismissing} onClick={accept} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>✓ Accept</button>
        <button type="button" disabled={saving || dismissing} onClick={reject} className={`${BTN_PLAIN} px-[14px] py-[9px] text-[13px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Not right — I’ll call</button>
        {error && <span role="alert" className="text-[12px] text-[#D0423A]">{error}</span>}
      </div>
    </div>
  );
}

// Live hours a script filled in: spot-check, keep, or take off the site
function AutoFilledCard({ place: h, listArgs }) {
  const toast = useNotify();
  const [save, { isLoading: saving }] = useSaveHoursMutation();
  const [remove, { isLoading: removing }] = useRemoveAutoHoursMutation();
  const [error, setError] = useState('');
  const hasAutoHours = h.schedule?.length > 0 && h.hours_source in SOURCE_LABEL;
  const when = h.hours_checked_at ? `filled ${fmtShortDate(h.hours_checked_at)}` : '';

  async function keep() {
    setError('');
    const { error } = await save({
      id: h.id, outcome: 'verified', listArgs,
      schedule: hasAutoHours ? h.schedule : null,
      er24: h.kind === 'hospital' && h.er24_auto ? h.er24 : null,
    });
    if (error) { console.error(error); setError(error.message || 'Something went wrong — try again'); return; }
    toast(`Confirmed ${h.name}`);
  }

  async function takeOff() {
    setError('');
    const { error } = await remove({ id: h.id, listArgs });
    if (error) { console.error(error); setError(error.message || 'Something went wrong — try again'); return; }
    toast('Removed — back in the phone queue');
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[18px]">
      <PlaceTitle place={h} extra={when && <span className="text-[11px] text-[#94A3B8]">{when}</span>} />
      <FoundHours schedule={hasAutoHours ? h.schedule : null} er24={h.er24_auto ? h.er24 : null} kind={h.kind} evidence={h.hours_evidence}
        label={SOURCE_LABEL[h.hours_source] ?? 'Emergency status read from their website'} />
      <div className="mt-[14px] flex flex-wrap gap-[8px] items-center">
        <button type="button" disabled={saving || removing} onClick={keep} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>✓ Looks right</button>
        <button type="button" disabled={saving || removing} onClick={takeOff} className={`${BTN_PLAIN} px-[14px] py-[9px] text-[13px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Remove from site</button>
        {error && <span role="alert" className="text-[12px] text-[#D0423A]">{error}</span>}
      </div>
    </div>
  );
}

function summaryText(view, count) {
  if (count == null) return '…';
  return {
    suggestions: count ? `${count} found automatically but not certain · nearest to tourists first · accept or send to the phone queue` : 'No suggestions waiting.',
    call: count ? `${count} to call · nearest to tourists first, then places nobody has tried` : 'Nothing left to call for this filter.',
    auto: count ? `${count} filled automatically · newest first · remove any that look wrong` : 'Nothing filled automatically yet.',
  }[view];
}

// state / setState come from the admin page, so the filters survive switching tabs
export default function HoursTab({ state, setState }) {
  const cities = useAdminCitiesQuery();
  const city = state.city ?? cities.data?.[0]?.slug;
  const cityName = cities.data?.find(c => c.slug === city)?.name;
  const listArgs = cities.data ? { cityName, kind: state.kind, phoneOnly: state.phoneOnly, nearTourists: state.nearTourists, view: state.view } : skipToken;
  const summary = useHoursSummaryQuery(listArgs);
  const pages = useHoursPagesInfiniteQuery(listArgs);
  // Skipped places stay in the query (and the offset), just off screen
  const [skipped, setSkipped] = useState([]);

  if (cities.isLoading) return <TabLoading />;
  if (cities.isError) return <div className="text-center py-[48px] text-[14px] text-[#94A3B8]">Couldn't load cities. Have the Supabase migrations been run?</div>;

  const update = patch => { setState(s => ({ ...s, ...patch })); setSkipped([]); };
  const rows = (pages.data?.pages.flatMap(p => p.rows) ?? []).filter(h => !skipped.includes(h.id));
  const [emptyTitle, emptyText] = EMPTY[state.view];

  return (
    <>
      <div className="mb-[16px]">
        <h1 className="font-serif text-[24px]">Opening hours</h1>
        <p className="text-[13px] text-[#94A3B8] mt-[3px]">{summaryText(state.view, summary.data)}</p>
      </div>

      <div className="flex gap-[6px] mb-[12px] border-b border-[#E6E6E1]">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" onClick={() => update({ view: v })}
            className={`px-[12px] py-[8px] text-[13px] font-semibold bg-transparent border-0 border-b-2 cursor-pointer font-sans -mb-px ${v === state.view ? 'border-[#D0423A] text-[#1E293B]' : 'border-transparent text-[#94A3B8] hover:text-[#1E293B]'}`}>{label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-[8px] mb-[18px]">
        <select value={city ?? ''} onChange={e => update({ city: e.target.value })} aria-label="City" className={SELECT}>
          {cities.data.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => update({ kind: k })} className={chip(k === state.kind)}>{label}</button>
        ))}
        {state.view === 'call' && (
          <label className="flex items-center gap-[6px] text-[12px] text-[#64748B] ml-[4px] cursor-pointer">
            <input type="checkbox" checked={state.phoneOnly} onChange={e => update({ phoneOnly: e.target.checked })} className="accent-[#D0423A]" /> Only places with a phone number
          </label>
        )}
        {state.view === 'call' && state.kind === 'hospital' && (
          <label className="flex items-center gap-[6px] text-[12px] text-[#64748B] ml-[4px] cursor-pointer" title="Tourist areas are set per city in cities.areas">
            <input type="checkbox" checked={state.nearTourists} onChange={e => update({ nearTourists: e.target.checked })} className="accent-[#D0423A]" /> Only within {NEAR_TOURISTS_KM} km of tourist areas
          </label>
        )}
      </div>

      {pages.isLoading ? <TabLoading /> : pages.isError
        ? <p className="text-[13px] text-[#D0423A]">Couldn't load places. Have 20261003_place_hours.sql and 20261003_auto_hours.sql been run?</p>
        : rows.length === 0 && !pages.hasNextPage
          ? <Empty title={emptyTitle}>{emptyText}</Empty>
          : <div className="flex flex-col gap-[12px]">
              {rows.map(h => state.view === 'suggestions' ? <SuggestionCard key={h.id} place={h} listArgs={listArgs} />
                : state.view === 'auto' ? <AutoFilledCard key={h.id} place={h} listArgs={listArgs} />
                : <HoursCard key={h.id} place={h} listArgs={listArgs} onSkip={id => setSkipped(s => [...s, id])} />)}
            </div>}

      {pages.hasNextPage && (
        <button type="button" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()} className={LOAD_MORE}>
          {pages.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
