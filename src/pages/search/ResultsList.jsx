import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { useT } from '../../i18n';
import { getStatus, scheduleText } from '../../lib/hours';
import { directionsUrl } from '../../lib/origin';
import { rememberVisit } from '../../lib/visits';
import { showToast } from '../../store/toastSlice';
import {
  DOCTORS_PAGE, PLACES_PAGE, PLACES_PREVIEW, fewerDoctors, fewerPlaces, initialPlaces,
  moreDoctors, morePlaces, openDirections, setSort, toggleSaved,
} from '../../store/searchSlice';
import { PLACES_FETCH_LIMIT } from '../../store/api';
import { ClockIcon, DirectionsIcon, PinIcon } from '../../components/icons';
import { Stars } from '../../components/ui';
import { KINDS, KindIcon, TravellerBadges, kindOf, placeDestination, placeStatus, telHref } from './kinds';
import { specialtyLabels } from '../../lib/specialties';
import { localityOf, showsDoctors, showsPlaces, visiblePlaces } from './filtering';

const SORTS = [['rating', 'sort.rating', 'sort.byRating'], ['distance', 'sort.distance', 'sort.byDistance'], ['name', 'sort.name', 'sort.byName']];
const SORT_TAB = 'px-3.5 py-[7px] rounded-lg text-[13px] font-medium border-[1.5px] cursor-pointer font-sans transition-all';
const SORT_ON = `${SORT_TAB} bg-[#1E293B] border-[#1E293B] text-white`;
const SORT_OFF = `${SORT_TAB} bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#1E293B]`;
const TAG = 'text-[11px] font-medium px-[9px] py-[3px] rounded-[6px]';

// Cards fade in, staggered. After "Load more" only the new cards animate.
const fadeIn = (i, from) => ({ className: 'animate-fadeUp', style: { animationDelay: `${Math.min(Math.max(i - from, 0), 8) * 0.05}s` } });

function Pager({ left, page, canCollapse, onMore, onFewer }) {
  const t = useT();
  if (left <= 0 && !canCollapse) return null;
  return (
    <div className="flex gap-2">
      {left > 0 && (
        <button type="button" onClick={onMore} className="flex-1 py-2.5 rounded-xl border-[1.5px] border-dashed border-[#CBD5E1] bg-transparent text-[13px] font-medium text-[#1E293B] cursor-pointer font-sans hover:border-[#D0423A] hover:text-[#D0423A] transition-colors">
          {t('results.loadMore', { count: Math.min(left, page) })} <span className="text-[#94A3B8] font-normal">{t('results.left', { count: left })}</span>
        </button>
      )}
      {canCollapse && (
        <button type="button" onClick={onFewer} className={`${left > 0 ? '' : 'flex-1 '}px-4 py-2.5 rounded-xl border-[1.5px] border-[#E2E8F0] bg-white text-[13px] font-medium text-[#64748B] cursor-pointer font-sans hover:border-[#1E293B] hover:text-[#1E293B] transition-colors`}>{t('results.showFewer')}</button>
      )}
    </div>
  );
}

function PlaceCard({ place: h, anim, origin, cityName }) {
  const t = useT();
  const k = kindOf(h), status = placeStatus(h);
  const where = [h.distance_km != null ? t('common.km', { km: h.distance_km }) : null, localityOf(h.address, cityName)].filter(Boolean).join(' · ');
  return (
    <div className={`${anim.className} bg-white border border-[#E2E8F0] rounded-2xl ps-4 pe-3 py-4 flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,.06)] hover:border-slate-300 transition-all`} style={anim.style}>
      <a href={directionsUrl(placeDestination(h), origin)} target="_blank" rel="noopener noreferrer" onClick={() => rememberVisit('place', h.id, h.name)}
        className="flex items-center gap-3 flex-1 min-w-0 no-underline" title={t('common.directions')}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${k.color}14`, color: k.color }}>
          <KindIcon kind={k} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#1E293B] break-words">{h.name}</p>
          <p className="text-[12px] text-[#64748B] truncate">{k.label}{where ? ' · ' + where : ''}</p>
          <p className={`text-[11px] font-medium mt-0.5 ${status.cls}`}>
            {status.text}
            {h.place_rating && <span className="text-[#64748B] font-normal"> · <span className="text-[#F59E0B]">★</span> {t('results.ratingCount', { rating: h.place_rating, count: h.place_reviews })}</span>}
          </p>
          <TravellerBadges place={h} className="mt-1" />
        </div>
      </a>
      <div className="flex flex-col gap-1.5 shrink-0">
        {h.phone && (
          <a href={telHref(h.phone)} title={t('results.callPhone', { phone: h.phone })} className="w-8 h-8 rounded-[9px] border-[1.5px] border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:border-[#D0423A] hover:text-[#D0423A] transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </a>
        )}
        <Link to={`/review?place=${h.id}`} title={t('card.rate')} aria-label={`${t('card.rate')}: ${h.name}`}
          className="w-8 h-8 rounded-[9px] border-[1.5px] border-[#E2E8F0] flex items-center justify-center text-[#94A3B8] hover:border-[#F59E0B] hover:text-[#F59E0B] transition-colors text-[15px] no-underline">★</Link>
      </div>
    </div>
  );
}

function DoctorCard({ doctor: d, anim }) {
  const t = useT();
  const dispatch = useDispatch();
  const saved = useSelector(s => s.search.saved.includes(d.id));
  const displayRating = d.rating ?? d.google_rating ?? '—';
  const displayReviews = d.reviews ?? d.google_reviews ?? 0;
  const status = getStatus(d);

  function toggleBookmark() {
    dispatch(toggleSaved(d.id));
    dispatch(showToast(t(saved ? 'card.toastRemoved' : 'card.toastSaved', { name: d.name })));
  }

  function directions() {
    rememberVisit('doctor', d.id, d.name);
    dispatch(openDirections(d));
  }

  return (
    <div className={`${anim.className} bg-white border border-[#E2E8F0] ${d.featured ? 'border-[#D0423A] shadow-[0_0_0_1px_#D0423A,0_4px_16px_rgba(208,66,58,.08)]' : ''} rounded-2xl p-4 sm:p-5 flex gap-3 sm:gap-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.07)] hover:border-slate-300 transition-all cursor-default mb-3`} style={anim.style}>
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px] shrink-0 flex items-center justify-center text-[18px] sm:text-[22px] font-serif text-white" style={{ background: d.avatar_bg }}>{d.initials}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-[3px]">
          <div className="min-w-0">
            <p className="font-serif text-[16px] sm:text-[18px] text-[#1E293B] leading-[1.2]">{d.name}</p>
            <p className="text-[13px] text-[#D0423A] font-medium mb-[5px]">{specialtyLabels(t, d)}</p>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            {d.featured && <span className="bg-[#D0423A] text-white text-[10px] font-bold uppercase tracking-[.06em] px-2 py-[3px] rounded-[6px] shrink-0">{t('card.topPick')}</span>}
            <button type="button" onClick={toggleBookmark} title={t(saved ? 'card.saved' : 'card.save')} aria-pressed={saved}
              className="bg-transparent border-[1.5px] border-[#E2E8F0] rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-[#94A3B8] hover:border-[#D0423A] hover:text-[#D0423A] transition-all shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke={saved ? 'none' : 'currentColor'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </button>
          </div>
        </div>
        <p className="text-[13px] text-[#64748B] mb-2 flex items-center gap-[5px]">
          <PinIcon size={12} fill="none" stroke="currentColor" strokeWidth="2" />
          {d.hospital ?? ''}{d.distance_km != null ? ` · ${t('card.kmAway', { km: d.distance_km })}` : ''}
        </p>
        <p className="text-[12px] text-[#94A3B8] mb-2.5 flex items-center gap-[5px]">
          <ClockIcon size={11} />
          {scheduleText(d)}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`${TAG} ${status.open ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
            {status.open ? '●' : '○'} {status.label}
          </span>
          {d.walk_in && <span className={`${TAG} bg-[#EFF6FF] text-[#2563EB]`}>{t('card.walkIns')}</span>}
          {d.insurance && <span className={`${TAG} bg-[#EFF6FF] text-[#2563EB]`}>{t('card.insurance')}</span>}
          {d.gender === 'female' && <span className={`${TAG} bg-[#EFF6FF] text-[#1D4ED8]`}>👩‍⚕️ {t('detail.female_doctor')}</span>}
          {d.languages?.length > 0 && <span className={`${TAG} bg-slate-100 text-[#64748B]`}>{d.languages.map(l => t(`lang.${l}`)).join(' · ')}</span>}
          {d.experience && <span className={`${TAG} bg-slate-100 text-[#64748B]`}>{t('card.yearsExp', { years: d.experience })}</span>}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="flex items-center gap-[5px] text-[12px] text-[#64748B]">
              <Stars rating={displayRating} size={12} className="gap-0.5" />
              <span>{displayRating} ({displayReviews})</span>
            </div>
            <div className="flex items-center gap-[5px] text-[12px] text-[#64748B]">
              <ClockIcon size={12} />
              {t('card.next', { slot: status.nextSlot })}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={directions} className="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] px-3.5 py-[7px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:border-[#D0423A] hover:text-[#D0423A] hover:bg-[#FDECEA] transition-all font-sans flex items-center gap-[5px]">
              <DirectionsIcon />
              {t('common.directions')}
            </button>
            <Link to={`/doctor/${d.id}`} className="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] px-3.5 py-[7px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:border-[#1E293B] transition-all font-sans flex items-center gap-[5px] no-underline">
              {t('card.viewProfile')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex gap-3 sm:gap-4 mb-3 animate-pulse">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px] bg-[#EEF2F6] shrink-0"></div>
      <div className="flex-1 space-y-2.5 py-1">
        <div className="h-4 bg-[#EEF2F6] rounded w-2/5"></div>
        <div className="h-3 bg-[#EEF2F6] rounded w-3/5"></div>
        <div className="h-3 bg-[#EEF2F6] rounded w-1/3"></div>
      </div>
    </div>
  );
}

function NoResults({ failed, onRetry, onReset }) {
  const t = useT();
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center">
      {failed ? <>
        <p className="text-[32px] mb-3">⚠️</p>
        <p className="font-serif text-[22px] mb-2">{t('results.failedTitle')}</p>
        <p className="text-[14px] text-[#64748B]">{t('results.failedText')}</p>
        <button type="button" onClick={onRetry} className="mt-4 bg-[#D0423A] text-white border-none px-6 py-2.5 rounded-[10px] text-[14px] font-semibold cursor-pointer font-sans">{t('results.tryAgain')}</button>
      </> : <>
        <p className="text-[32px] mb-3">🔍</p>
        <p className="font-serif text-[22px] mb-2">{t('results.noneTitle')}</p>
        <p className="text-[14px] text-[#64748B]">{t('results.noneText')}</p>
        <button type="button" onClick={onReset} className="mt-4 bg-[#D0423A] text-white border-none px-6 py-2.5 rounded-[10px] text-[14px] font-semibold cursor-pointer font-sans">{t('results.resetFilters')}</button>
      </>}
    </div>
  );
}

// After collapsing a list, its heading may have scrolled above the viewport: bring it back
function scrollBackTo(ref) {
  requestAnimationFrame(() => {
    if (ref.current?.getBoundingClientRect().top < 0) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export default function ResultsList({ doctors, places, loading, failed, cityName, onRetry, onReset }) {
  const t = useT();
  const dispatch = useDispatch();
  const { filters, query, sortBy, origin, placesShown, doctorsShown } = useSelector(s => s.search);
  const placesLabel = useRef(null), doctorLabel = useRef(null);

  // Where "Load more" started, for the current filters only: any other change re-animates every card
  const listKey = JSON.stringify([filters, query, sortBy, origin]);
  const [loadedMore, setLoadedMore] = useState({ key: null, places: 0, doctors: 0 });
  const from = loadedMore.key === listKey ? loadedMore : { places: 0, doctors: 0 };

  const kind = KINDS[filters.type];
  const capped = places.length >= PLACES_FETCH_LIMIT; // the query returns at most this many
  const shownPlaces = visiblePlaces(places, filters, placesShown, PLACES_PREVIEW);
  const shownDoctors = doctors.slice(0, doctorsShown);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {SORTS.map(([key, label]) => (
            <button key={key} type="button" className={sortBy === key ? SORT_ON : SORT_OFF} onClick={() => dispatch(setSort(key))}>{t(label)}</button>
          ))}
        </div>
        <span className="text-[13px] text-[#64748B]">{t(SORTS.find(s => s[0] === sortBy)[2])}</span>
      </div>

      {loading ? <>
        {showsPlaces(filters) && <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl h-[86px] animate-pulse"></div>
          <div className="bg-white border border-[#E2E8F0] rounded-2xl h-[86px] animate-pulse"></div>
        </div>}
        {showsDoctors(filters) && <>
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8]">{t('results.doctors')}</p>
          <div><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        </>}
      </> : <>
        {places.length > 0 && (
          <div>
            <p ref={placesLabel} className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] mb-2.5 scroll-mt-36">
              {filters.er24 ? t('results.erPlaces') : kind ? kind.plural : t('results.places')} · {places.length}{capped ? '+' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
              {shownPlaces.map((h, i) => <PlaceCard key={h.id} place={h} anim={fadeIn(i, from.places)} origin={origin} cityName={cityName} />)}
            </div>
            <div className="mt-2.5 empty:hidden">
              <Pager left={places.length - shownPlaces.length} page={PLACES_PAGE} canCollapse={placesShown > initialPlaces(filters.type)}
                onMore={() => { setLoadedMore({ ...from, key: listKey, places: shownPlaces.length }); dispatch(morePlaces()); }}
                onFewer={() => { dispatch(fewerPlaces()); scrollBackTo(placesLabel); }} />
            </div>
          </div>
        )}

        {doctors.length > 0 && <>
          <p ref={doctorLabel} className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] scroll-mt-36">
            {doctors.length === 1 ? t('results.doctorsOne') : t('results.doctorsCount', { count: doctors.length })}
          </p>
          <div>
            {shownDoctors.map((d, i) => <DoctorCard key={d.id} doctor={d} anim={fadeIn(i, from.doctors)} />)}
          </div>
          <div className="-mt-1 empty:hidden">
            <Pager left={doctors.length - shownDoctors.length} page={DOCTORS_PAGE} canCollapse={doctorsShown > DOCTORS_PAGE}
              onMore={() => { setLoadedMore({ ...from, key: listKey, doctors: shownDoctors.length }); dispatch(moreDoctors()); }}
              onFewer={() => { dispatch(fewerDoctors()); scrollBackTo(doctorLabel); }} />
          </div>
        </>}

        {/* Only an empty page overall is "no results": "Pharmacies" has no doctors by design */}
        {doctors.length === 0 && (places.length === 0 || failed) && <NoResults failed={failed} onRetry={onRetry} onReset={onReset} />}
      </>}

      <p className="text-[11px] text-[#94A3B8] pt-2">
        {t('results.attribution')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#64748B]">© OpenStreetMap</a>
        {' · '}
        <a href="https://overturemaps.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#64748B]">Overture Maps</a>
      </p>
    </main>
  );
}
