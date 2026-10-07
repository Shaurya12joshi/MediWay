import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { showToast } from '../../store/toastSlice';
import {
  useAdminCitiesQuery, useAutoReviewMutation, usePlacesPagesInfiniteQuery, usePlacesSummaryQuery,
  useReviewPlaceMutation, useUnpublishPlaceMutation,
} from './adminApi';
import { BTN_APPROVE, BTN_DARK, BTN_PLAIN, Empty, LOAD_MORE, SELECT, TabLoading, KindBadge, chip, fmtShortDate, mapLink } from './shared';

const VIEWS = [['review', 'Needs a look'], ['low', 'Low confidence'], ['auto', 'Auto-published']];
const KINDS = ['all', 'hospital', 'clinic', 'pharmacy', 'lab'];
const DONE_MESSAGE = { approve: 'Published', merge: 'Merged into the existing listing', reject: 'Rejected' };

function summaryText(view, count) {
  if (count == null) return '…';
  return {
    review: count ? `${count} need a look · the rules weren't sure about these` : 'Nothing needs you. Run ⚡ Auto-review after each import.',
    low:    count ? `${count} low-confidence places, hidden from the site · approve any you know are real` : 'No low-confidence places.',
    auto:   count ? `${count} published automatically · remove any that look wrong` : 'Nothing published automatically yet.',
  }[view];
}

function Sources({ sources }) {
  return (sources || []).map((s, i) => (
    <span key={i}>
      {i > 0 && ' + '}
      {s.source === 'osm'
        ? <a href={`https://www.openstreetmap.org/${s.id}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#1E293B]">OSM</a>
        : s.source === 'overture' ? 'Overture' : s.source}
    </span>
  ));
}

function PlaceHeader({ place: p }) {
  const pct = Math.round(p.confidence * 100);
  return (
    <>
      <div className="flex items-center gap-[8px] flex-wrap mb-[3px]">
        <KindBadge kind={p.kind} />
        <span className={`text-[11px] font-semibold ${pct >= 90 ? 'text-[#16A34A]' : pct >= 75 ? 'text-[#64748B]' : 'text-[#B45309]'}`}>{pct}% confident</span>
        <span className="text-[11px] text-[#94A3B8]"><Sources sources={p.sources} /></span>
      </div>
      <div className="font-serif text-[17px] text-[#1E293B] break-words">{p.name}</div>
      <div className="text-[12px] text-[#64748B] mt-[2px] break-words">
        {p.address || 'No address'}{p.phone ? ` · ${p.phone}` : ''}{p.opening_hours ? ` · ${p.opening_hours}` : ''}
        {' · '}<a href={mapLink(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">check on map</a>
      </div>
    </>
  );
}

const CARD = 'bg-white border border-[#E6E6E1] rounded-[14px] p-[14px] sm:p-[16px] flex flex-col sm:flex-row sm:items-center gap-[12px]';

// Held or low-confidence: approve, merge into the listing it duplicates, or reject
function StagedCard({ place: p, listArgs }) {
  const dispatch = useDispatch();
  const [review, { isLoading: busy }] = useReviewPlaceMutation();
  const reason = p.review_note?.startsWith('held:') ? p.review_note.slice(5).trim() : null;

  async function decide(decision) {
    const { error } = await review({ id: p.id, decision, listArgs });
    if (error) { console.error(error); dispatch(showToast(error.message || 'Something went wrong. Try again')); return; }
    dispatch(showToast(DONE_MESSAGE[decision]));
  }

  return (
    <div className={CARD}>
      <div className="flex-1 min-w-0">
        <PlaceHeader place={p} />
        {reason && <div className="text-[12px] text-[#B45309] mt-[6px]">Held: {reason}</div>}
        {p.match_id && <div className="text-[12px] text-[#B45309] mt-[6px]">Possible duplicate of <strong>{p.match_name || p.match_id}</strong> (already live)</div>}
      </div>
      <div className="flex gap-[6px] shrink-0">
        {p.match_id ? <>
          <button type="button" disabled={busy} onClick={() => decide('merge')} className={`${BTN_DARK} px-[12px] py-[8px] text-[12px]`}>Merge</button>
          <button type="button" disabled={busy} onClick={() => decide('approve')} className={`${BTN_PLAIN} px-[12px] py-[8px] text-[12px] hover:border-[#16A34A] hover:text-[#16A34A]`}>Add as new</button>
        </> : (
          <button type="button" disabled={busy} onClick={() => decide('approve')} className={`${BTN_APPROVE} px-[12px] py-[8px] text-[12px]`}>Approve</button>
        )}
        <button type="button" disabled={busy} onClick={() => decide('reject')} className={`${BTN_PLAIN} px-[12px] py-[8px] text-[12px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Reject</button>
      </div>
    </div>
  );
}

// The undo for auto-review: take a published place off the site
function PublishedCard({ place: p, listArgs }) {
  const dispatch = useDispatch();
  const [unpublish, { isLoading: busy }] = useUnpublishPlaceMutation();

  async function remove() {
    const { error } = await unpublish({ id: p.id, publishedId: p.published_id, listArgs });
    if (error) { console.error(error); dispatch(showToast(error.message || 'Something went wrong. Try again')); return; }
    dispatch(showToast('Removed from the site'));
  }

  return (
    <div className={CARD}>
      <div className="flex-1 min-w-0">
        <PlaceHeader place={p} />
        <div className="text-[12px] text-[#94A3B8] mt-[6px]">Published automatically{p.reviewed_at ? ` on ${fmtShortDate(p.reviewed_at)}` : ''}</div>
      </div>
      <button type="button" disabled={busy} onClick={remove} className={`${BTN_PLAIN} shrink-0 px-[12px] py-[8px] text-[12px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Remove from site</button>
    </div>
  );
}

// state / setState come from the admin page, so the city, kind and view survive switching tabs
export default function PlacesTab({ state, setState }) {
  const dispatch = useDispatch();
  const cities = useAdminCitiesQuery();
  const city = state.city ?? cities.data?.[0]?.slug;
  const listArgs = city ? { city, kind: state.kind, view: state.view } : skipToken;
  const summary = usePlacesSummaryQuery(listArgs);
  const pages = usePlacesPagesInfiniteQuery(listArgs);
  const [autoReview] = useAutoReviewMutation();
  const [autoStatus, setAutoStatus] = useState(null); // button label while running

  if (cities.isLoading) return <TabLoading />;
  if (cities.isError) return <div className="text-center py-[48px] text-[14px] text-[#94A3B8]">Couldn't load cities. Have the Supabase migrations been run?</div>;

  const toast = message => dispatch(showToast(message));
  const update = patch => setState(s => ({ ...s, ...patch }));
  const rows = pages.data?.pages.flatMap(p => p.rows) ?? [];

  // Preview what the rules would do, confirm, then do it
  async function runAutoReview() {
    const cityName = cities.data.find(c => c.slug === city)?.name ?? city;
    setAutoStatus('Checking…');
    const { data: preview, error } = await autoReview({ city, dryRun: true });
    if (error) { console.error(error); toast(error.message || 'Auto-review failed. Have all the migrations been run?'); setAutoStatus(null); return; }

    const outcomes = Object.entries(preview.held ?? {});
    const held = outcomes.filter(([k]) => k.startsWith('held')).reduce((n, [, v]) => n + v, 0);
    const hidden = preview.held?.['hidden: low confidence'] || 0;
    if (!preview.publish && !preview.merge) {
      toast(held ? `Nothing new to publish · ${held} still need a look` : 'Nothing new to publish');
      setAutoStatus(null);
      return;
    }
    const ok = window.confirm(
      `Auto-review ${cityName}:\n\n` +
      `• Publish ${preview.publish} places that pass the rules\n` +
      `• Merge ${preview.merge} duplicates into existing listings\n` +
      `• Hold ${held} for you to check\n` +
      `• Keep ${hidden} low-confidence places hidden\n\n` +
      `You can take any of them off the site later under "Auto-published".`);
    if (!ok) { setAutoStatus(null); return; }

    setAutoStatus('Publishing…');
    const { data: result, error: runError } = await autoReview({ city, dryRun: false });
    setAutoStatus(null);
    if (runError) { console.error(runError); toast(runError.message || 'Auto-review failed'); return; }
    toast(`Published ${result.publish} · merged ${result.merge}`);
    update({ view: 'review' });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-[12px] mb-[16px]">
        <div>
          <h1 className="font-serif text-[24px]">Imported places</h1>
          <p className="text-[13px] text-[#94A3B8] mt-[3px]">{city ? summaryText(state.view, summary.data) : 'Add a city first.'}</p>
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
        {KINDS.map(k => (
          <button key={k} type="button" onClick={() => update({ kind: k })} className={chip(k === state.kind)}>{k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}</button>
        ))}
      </div>

      {city && (pages.isLoading ? <TabLoading /> : pages.isError
        ? <p className="text-[13px] text-[#D0423A]">Couldn't load places. Have all the Supabase migrations been run?</p>
        : rows.length === 0 && !pages.hasNextPage
          ? <Empty title="Nothing here">No places for this view and filter.</Empty>
          : <div className="flex flex-col gap-[10px]">
              {rows.map(p => state.view === 'auto'
                ? <PublishedCard key={p.id} place={p} listArgs={listArgs} />
                : <StagedCard key={p.id} place={p} listArgs={listArgs} />)}
            </div>)}

      {pages.hasNextPage && (
        <button type="button" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()} className={LOAD_MORE}>
          {pages.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
