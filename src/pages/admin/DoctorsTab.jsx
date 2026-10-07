import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { showToast } from '../../store/toastSlice';
import { scheduleText } from '../../lib/hours';
import {
  useAdminCitiesQuery, useAutoReviewDoctorsMutation, useDoctorHoursPagesInfiniteQuery, useDoctorHoursSummaryQuery,
  useDoctorsPagesInfiniteQuery, useDoctorsSummaryQuery, useReviewDoctorMutation, useSaveDoctorHoursMutation, useUnpublishDoctorMutation,
} from './adminApi';
import ScheduleEditor, { DOCTOR_PRESETS, EMPTY_HOURS, readSchedule } from './ScheduleEditor';
import { BTN_APPROVE, BTN_DARK, BTN_PLAIN, Empty, LOAD_MORE, SELECT, TabLoading, fmtShortDate } from './shared';

// Doctors read from hospital and clinic websites by scripts/import-doctors.mjs. "Auto-review" applies the rules
// in auto_review_doctors(); people only see what's held, and can take anything published back off the site.

const VIEWS = [['review', 'Needs a look'], ['auto', 'Auto-published'], ['hours', 'No hours yet']];
const DONE_MESSAGE = { approve: 'Published', merge: 'Added to the existing profile', reject: 'Rejected' };

function summaryText(view, count) {
  if (count == null) return '…';
  return {
    review: count ? `${count} need a look · the rules weren't sure about these` : 'Nothing needs you. Run ⚡ Auto-review after each import.',
    auto: count ? `${count} published automatically · remove any that look wrong` : 'Nothing published automatically yet.',
    hours: count ? `${count} live doctors with no OPD hours · call and ask when they see patients` : 'Every doctor here has hours.',
  }[view];
}

function DoctorHeader({ doctor: d }) {
  const pct = Math.round(d.confidence * 100);
  const hours = d.schedule ? scheduleText(d) : d.opd_text;
  return (
    <>
      <div className="flex items-center gap-[8px] flex-wrap mb-[3px]">
        {d.specialty.map(s => <span key={s} className="text-[10px] font-bold uppercase tracking-[.08em] px-[7px] py-[2px] rounded-[5px] text-[#D0423A] bg-[#FDECEA]">{s}</span>)}
        <span className={`text-[11px] font-semibold ${pct >= 90 ? 'text-[#16A34A]' : 'text-[#B45309]'}`}>{pct}% confident</span>
        {d.gender === 'female' && <span className="text-[11px] text-[#1D4ED8]">👩‍⚕️ female</span>}
      </div>
      <div className="font-serif text-[17px] text-[#1E293B] break-words">{d.name}</div>
      <div className="text-[12px] text-[#64748B] mt-[2px] break-words">
        {[d.qualification, d.specialty_text && d.specialty_text !== d.specialty[0] ? `“${d.specialty_text}”` : null].filter(Boolean).join(' · ')}
      </div>
      <div className="text-[12px] text-[#64748B] mt-[2px] break-words">
        at <strong className="text-[#1E293B] font-semibold">{d.place?.name ?? d.place_id}</strong>{d.place?.address ? `, ${d.place.address}` : ''}
        {hours ? ` · ${hours}` : ''}
        {d.languages?.length ? ` · speaks ${d.languages.join(', ')}` : ''}
      </div>
      {d.evidence && <div className="text-[12px] text-[#94A3B8] mt-[6px] italic break-words">“{d.evidence}”</div>}
      <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#D0423A] underline break-all">{d.source_url}</a>
    </>
  );
}

const CARD = 'bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[16px] flex flex-col sm:flex-row sm:items-center gap-[12px]';

function StagedCard({ doctor: d, listArgs }) {
  const dispatch = useDispatch();
  const [review, { isLoading: busy }] = useReviewDoctorMutation();
  const reason = d.review_note?.startsWith('held:') ? d.review_note.slice(5).trim() : null;

  async function decide(decision) {
    const { error } = await review({ id: d.id, decision, listArgs });
    if (error) { console.error(error); dispatch(showToast(error.message || 'Something went wrong. Try again')); return; }
    dispatch(showToast(DONE_MESSAGE[decision]));
  }

  return (
    <div className={CARD}>
      <div className="flex-1 min-w-0">
        <DoctorHeader doctor={d} />
        {reason && <div className="text-[12px] text-[#B45309] mt-[6px]">Held: {reason}</div>}
        {d.match && <div className="text-[12px] text-[#B45309] mt-[6px]">Maybe the same person as <strong>{d.match.name}</strong>{d.match.hospital ? ` (${d.match.hospital})` : ''}, already live</div>}
      </div>
      <div className="flex gap-[6px] shrink-0">
        {d.match ? <>
          <button type="button" disabled={busy} onClick={() => decide('merge')} className={`${BTN_DARK} px-[12px] py-[8px] text-[12px]`}>Same person</button>
          <button type="button" disabled={busy} onClick={() => decide('approve')} className={`${BTN_PLAIN} px-[12px] py-[8px] text-[12px] hover:border-[#16A34A] hover:text-[#16A34A]`}>Different doctor</button>
        </> : (
          <button type="button" disabled={busy || d.specialty.length === 0} onClick={() => decide('approve')} className={`${BTN_APPROVE} px-[12px] py-[8px] text-[12px]`}>Approve</button>
        )}
        <button type="button" disabled={busy} onClick={() => decide('reject')} className={`${BTN_PLAIN} px-[12px] py-[8px] text-[12px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Reject</button>
      </div>
    </div>
  );
}

function PublishedCard({ doctor: d, listArgs }) {
  const dispatch = useDispatch();
  const [unpublish, { isLoading: busy }] = useUnpublishDoctorMutation();

  async function remove() {
    const { error } = await unpublish({ id: d.id, publishedId: d.published_id, listArgs });
    if (error) { console.error(error); dispatch(showToast(error.message || 'Something went wrong. Try again')); return; }
    dispatch(showToast('Removed from the site'));
  }

  return (
    <div className={CARD}>
      <div className="flex-1 min-w-0">
        <DoctorHeader doctor={d} />
        <div className="text-[12px] text-[#94A3B8] mt-[6px]">Published automatically{d.reviewed_at ? ` on ${fmtShortDate(d.reviewed_at)}` : ''} · <a href={`/doctor/${d.published_id}`} target="_blank" rel="noopener noreferrer" className="underline">profile</a></div>
      </div>
      <button type="button" disabled={busy} onClick={remove} className={`${BTN_PLAIN} shrink-0 px-[12px] py-[8px] text-[12px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Remove from site</button>
    </div>
  );
}

// A live doctor with no hours: call, enter the OPD days and times
function DoctorHoursCard({ doctor: d, listArgs, onSkip }) {
  const dispatch = useDispatch();
  const [save, { isLoading: busy }] = useSaveDoctorHoursMutation();
  const [hours, setHours] = useState(EMPTY_HOURS);
  const [error, setError] = useState('');
  const tried = d.hours_source === 'unreachable' && d.hours_checked_at ? `No answer on ${fmtShortDate(d.hours_checked_at)}` : '';

  async function submit(outcome) {
    setError('');
    let schedule = null;
    if (outcome === 'verified') {
      const read = readSchedule(hours);
      if (read.error || !read.schedule) return setError(read.error || 'Pick the days and times they see patients.');
      schedule = read.schedule;
    }
    const { error: e } = await save({ id: d.id, outcome, schedule, listArgs });
    if (e) { console.error(e); setError(e.message || 'Something went wrong. Try again'); return; }
    dispatch(showToast(outcome === 'verified' ? `Saved ${d.name}'s hours` : 'Noted. They’ll come back later in the queue'));
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[18px]">
      <div className="flex items-start justify-between gap-[10px] flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap mb-[3px]">
            {(d.specialty ?? []).map(s => <span key={s} className="text-[10px] font-bold uppercase tracking-[.08em] px-[7px] py-[2px] rounded-[5px] text-[#D0423A] bg-[#FDECEA]">{s}</span>)}
            {tried && <span className="text-[11px] text-[#B45309]">{tried}</span>}
          </div>
          <div className="font-serif text-[17px] text-[#1E293B] break-words">{d.name}</div>
          <div className="text-[12px] text-[#64748B] mt-[2px] break-words">
            {d.hospital}{d.hospital_address ? `, ${d.hospital_address}` : ''}
            {d.source_url && <> · <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">their page</a></>}
            {' · '}<a href={`/doctor/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">profile</a>
          </div>
        </div>
        {d.phone
          ? <a href={`tel:${d.phone.replace(/[^\d+]/g, '')}`} className="shrink-0 flex items-center gap-[7px] bg-[#1E293B] hover:bg-black text-white no-underline px-[14px] py-[9px] rounded-[10px] text-[14px] font-semibold">📞 {d.phone}</a>
          : <span className="text-[12px] text-[#94A3B8]">No phone</span>}
      </div>
      <div className="mt-[14px] pt-[14px] border-t border-[#F0EFEA]">
        <p className="text-[12px] text-[#64748B] mb-[8px]">“Which days and times does {d.name} see patients?”</p>
        <ScheduleEditor value={hours} onChange={setHours} presets={DOCTOR_PRESETS} />
      </div>
      <div className="mt-[14px] flex flex-wrap gap-[8px] items-center">
        <button type="button" disabled={busy} onClick={() => submit('verified')} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>Save</button>
        <button type="button" disabled={busy} onClick={() => submit('unreachable')} className={`${BTN_PLAIN} px-[14px] py-[9px] text-[13px] hover:border-[#B45309] hover:text-[#B45309]`}>No answer</button>
        <button type="button" disabled={busy} onClick={() => onSkip(d.id)} className="bg-transparent border-none text-[13px] text-[#94A3B8] cursor-pointer font-sans hover:text-[#1E293B]">Skip</button>
        {error && <span role="alert" className="text-[12px] text-[#D0423A]">{error}</span>}
      </div>
    </div>
  );
}

// state / setState come from the admin page, so the city and view survive switching tabs
export default function DoctorsTab({ state, setState }) {
  const dispatch = useDispatch();
  const cities = useAdminCitiesQuery();
  const city = state.city ?? cities.data?.[0]?.slug;
  const cityName = cities.data?.find(c => c.slug === city)?.name;
  const hoursView = state.view === 'hours';
  const listArgs = city ? { city, view: state.view } : skipToken;
  const hoursArgs = cityName ? { cityName } : skipToken;
  const summary = useDoctorsSummaryQuery(hoursView ? skipToken : listArgs);
  const pages = useDoctorsPagesInfiniteQuery(hoursView ? skipToken : listArgs);
  const hoursSummary = useDoctorHoursSummaryQuery(hoursView ? hoursArgs : skipToken);
  const hoursPages = useDoctorHoursPagesInfiniteQuery(hoursView ? hoursArgs : skipToken);
  const [skipped, setSkipped] = useState([]);
  const [autoReview] = useAutoReviewDoctorsMutation();
  const [autoStatus, setAutoStatus] = useState(null);

  if (cities.isLoading) return <TabLoading />;
  if (cities.isError) return <div className="text-center py-[48px] text-[14px] text-[#94A3B8]">Couldn't load cities. Have the Supabase migrations been run?</div>;

  const toast = message => dispatch(showToast(message));
  const update = patch => setState(s => ({ ...s, ...patch }));
  const list = hoursView ? hoursPages : pages;
  const rows = (list.data?.pages.flatMap(p => p.rows) ?? []).filter(d => !hoursView || !skipped.includes(d.id));

  // Preview what the rules would do, confirm, then do it
  async function runAutoReview() {
    const cityName = cities.data.find(c => c.slug === city)?.name ?? city;
    setAutoStatus('Checking…');
    const { data: preview, error } = await autoReview({ city, dryRun: true });
    if (error) { console.error(error); toast(error.message || 'Auto-review failed: has 20261006_doctor_import.sql been run?'); setAutoStatus(null); return; }
    const held = Object.values(preview.held ?? {}).reduce((n, v) => n + v, 0);
    if (!preview.publish && !preview.merge) { toast(held ? `Nothing new to publish · ${held} need a look` : 'Nothing new to publish'); setAutoStatus(null); return; }
    const ok = window.confirm(`Auto-review doctors in ${cityName}:\n\n` +
      `• Publish ${preview.publish} doctors that pass the rules\n• Add ${preview.merge} to profiles that already exist\n• Hold ${held} for you to check\n\n` +
      `You can take any of them off the site later under "Auto-published".`);
    if (!ok) { setAutoStatus(null); return; }
    setAutoStatus('Publishing…');
    const { data: result, error: runError } = await autoReview({ city, dryRun: false });
    setAutoStatus(null);
    if (runError) { console.error(runError); toast(runError.message || 'Auto-review failed'); return; }
    toast(`Published ${result.publish} · added to existing ${result.merge}`);
    update({ view: 'review' });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-[12px] mb-[16px]">
        <div>
          <h1 className="font-serif text-[24px]">Imported doctors</h1>
          <p className="text-[13px] text-[#94A3B8] mt-[3px]">{city ? summaryText(state.view, hoursView ? hoursSummary.data : summary.data) : 'Add a city first.'}</p>
        </div>
        <button type="button" disabled={Boolean(autoStatus) || !city} onClick={runAutoReview} className={`${BTN_DARK} px-[14px] py-[9px] text-[13px]`}>
          {autoStatus || '⚡ Auto-review'}
        </button>
      </div>

      <div className="flex gap-[6px] mb-[12px] border-b border-[#E6E6E1]">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" onClick={() => update({ view: v })}
            className={`px-[12px] py-[8px] text-[13px] font-semibold bg-transparent border-0 border-b-2 cursor-pointer font-sans -mb-px ${v === state.view ? 'border-[#D0423A] text-[#1E293B]' : 'border-transparent text-[#94A3B8] hover:text-[#1E293B]'}`}>{label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-[8px] mb-[18px]">
        <select value={city ?? ''} onChange={e => update({ city: e.target.value })} aria-label="City" className={SELECT}>
          {cities.data.map(c => <option key={c.slug} value={c.slug}>{c.name}{c.launched ? '' : ' (not launched)'}</option>)}
        </select>
        <span className="text-[12px] text-[#94A3B8]">Import more with <code>node scripts/import-doctors.mjs --city {city}</code></span>
      </div>

      {city && (list.isLoading ? <TabLoading /> : list.isError
        ? <p className="text-[13px] text-[#D0423A]">Couldn't load doctors. Has 20261006_doctor_import.sql been run?</p>
        : rows.length === 0 && !list.hasNextPage
          ? <Empty title="Nothing here">{hoursView ? 'Every doctor in this city has hours.' : 'No imported doctors for this view.'}</Empty>
          : <div className="flex flex-col gap-[10px]">
              {rows.map(d => hoursView ? <DoctorHoursCard key={d.id} doctor={d} listArgs={hoursArgs} onSkip={id => setSkipped(s => [...s, id])} />
                : state.view === 'auto' ? <PublishedCard key={d.id} doctor={d} listArgs={listArgs} />
                : <StagedCard key={d.id} doctor={d} listArgs={listArgs} />)}
            </div>)}

      {list.hasNextPage && (
        <button type="button" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()} className={LOAD_MORE}>
          {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
