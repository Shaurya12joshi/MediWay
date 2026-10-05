import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import { useGetDoctorQuery, useGetReviewsQuery, useVoteHelpfulMutation } from '../store/api';
import { getStatus, scheduleText } from '../lib/hours';
import { distanceKm, directionsUrl } from '../lib/origin';
import AuthButton from '../components/AuthButton';
import { BackIcon, CheckIcon, ClockIcon, DirectionsIcon, PenIcon, PinIcon, ThumbIcon } from '../components/icons';
import { NotFoundMessage, Spinner, Stars, useTitle } from '../components/ui';
import LanguagePicker from '../components/LanguagePicker';
import { useT } from '../i18n';
import { rememberVisit } from '../lib/visits';
import { specialtyLabels } from '../lib/specialties';

const SORTS = ['recent', 'helpful', 'highest', 'lowest'];
const FILTERS = ['all', 'verified', '5', '4', 'low'];

const SORT_TAB = 'py-[6px] px-[14px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-text [&.active]:border-text [&.active]:text-white';
const FILTER_CHIP = 'py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold';
const PILL = 'inline-flex items-center gap-[5px] text-[11px] font-semibold py-[5px] px-[12px] rounded-[100px] bg-[#EFF6FF] border-[1.5px] border-[#BFDBFE] text-[#1D4ED8]';
const SECTION_LABEL = 'text-[10px] font-bold tracking-[.1em] uppercase text-faint mb-[14px]';

function sortAndFilter(reviews, sort, filter) {
  let revs = reviews;
  if (filter === 'verified') revs = revs.filter(r => r.verified);
  if (filter === '5') revs = revs.filter(r => r.rating === 5);
  if (filter === '4') revs = revs.filter(r => r.rating === 4);
  if (filter === 'low') revs = revs.filter(r => r.rating <= 3);
  const by = {
    recent:  (a, b) => new Date(b.created_at) - new Date(a.created_at),
    helpful: (a, b) => (b.helpful_count || 0) - (a.helpful_count || 0),
    highest: (a, b) => b.rating - a.rating,
    lowest:  (a, b) => a.rating - b.rating,
  }[sort];
  return [...revs].sort(by);
}

function fmtReviewDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// This browser's helpful votes, remembered per review so a second tap takes the vote back
const votedKey = id => 'helpful_' + id;
function hasVoted(id) {
  try { return localStorage.getItem(votedKey(id)) === '1'; } catch { return false; }
}
function rememberVote(id, voted) {
  try { voted ? localStorage.setItem(votedKey(id), '1') : localStorage.removeItem(votedKey(id)); } catch { /* storage blocked */ }
}

function ReviewCard({ review: r, index, voted, busy, onHelpful }) {
  const t = useT();
  return (
    <div className={`bg-white rounded-[16px] border border-border p-[16px] sm:p-[22px] transition-all duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,.07)] hover:translate-y-[-1px] animate-fadeUp ${r.verified ? 'border-l-[3px] border-l-red' : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="flex items-start justify-between gap-[12px] mb-[14px] flex-wrap">
        <div className="flex items-center gap-[12px] min-w-0">
          <div className="w-[40px] h-[40px] rounded-full bg-[linear-gradient(135deg,#94A3B8,#64748B)] flex items-center justify-center font-semibold text-[15px] text-white shrink-0">{(r.author || '?').charAt(0)}</div>
          <div>
            <div className="font-semibold text-[14px] text-text flex items-center gap-[6px] flex-wrap">
              {r.author}
              {r.verified && (
                <span className="inline-flex items-center gap-[3px] text-[10px] font-semibold bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] py-[2px] px-[7px] rounded-[5px]"><CheckIcon size={8} strokeWidth={3} />{t('profile.visitedBadge')}</span>
              )}
            </div>
            <div className="text-[11px] text-faint mt-[2px]">{r.origin || ''}{r.origin && r.created_at ? ' · ' : ''}{fmtReviewDate(r.created_at)}</div>
          </div>
        </div>
        <Stars rating={r.rating} size={13} />
      </div>
      {r.recommend != null && (
        <div className={`inline-flex items-center gap-[5px] text-[11px] font-semibold py-[4px] px-[10px] rounded-[6px] mb-[10px] ${r.recommend ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
          {t(r.recommend ? 'profile.recommends' : 'profile.notRecommend')}
        </div>
      )}
      {r.title && <div className="font-semibold text-[14px] text-text mb-[6px]">{r.title}</div>}
      {r.body && <div className="text-[13px] text-muted leading-[1.65] mb-[4px] break-words">{r.body}</div>}
      {r.stood_out?.length > 0 && (
        <div className="mt-[10px]">
          <div className="text-[10px] font-bold tracking-[.06em] uppercase text-[#16A34A] mb-[6px]">{t('profile.stoodOut')}</div>
          <div className="flex flex-wrap gap-[5px]">{r.stood_out.map(t => <span key={t} className="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]">{t}</span>)}</div>
        </div>
      )}
      {r.could_improve?.length > 0 && (
        <div className="mt-[10px]">
          <div className="text-[10px] font-bold tracking-[.06em] uppercase text-[#B45309] mb-[6px]">{t('profile.couldImprove')}</div>
          <div className="flex flex-wrap gap-[5px]">{r.could_improve.map(t => <span key={t} className="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309]">{t}</span>)}</div>
        </div>
      )}
      {r.tags?.length > 0 && <div className="flex flex-wrap gap-[5px] mt-[10px]">{r.tags.map(t => <span key={t} className="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#F2F1ED] border border-border text-faint">{t}</span>)}</div>}
      {r.visit_date && <div className="text-[11px] text-faint mt-[8px]">{t('profile.visitedOn', { date: r.visit_date })}</div>}
      <div className="flex items-center gap-[10px] mt-[14px] pt-[12px] border-t border-border">
        <button type="button" disabled={busy} onClick={() => onHelpful(r)}
          className={`flex items-center gap-[5px] text-[12px] text-faint border-[1.5px] border-border rounded-[8px] py-[5px] px-[11px] bg-white cursor-pointer transition-colors duration-150 hover:border-red hover:text-red [&.liked]:text-red [&.liked]:border-[#F5C6C2] [&.liked]:bg-[#FDECEA] ${voted ? 'liked' : ''}`}>
          <ThumbIcon size={12} fill={voted ? '#D0423A' : 'none'} />
          {t('profile.helpful')} <span>{r.helpful_count || 0}</span>
        </button>
        <div className="w-[1px] h-[14px] bg-border"></div>
        <span className="text-[11px] text-faint">{t(r.verified ? 'profile.verifiedVisit' : 'profile.unverified')}</span>
      </div>
    </div>
  );
}

function DoctorProfile({ doctor: d, reviews }) {
  const t = useT();
  const origin = useSelector(s => s.search.origin);
  const [sort, setSort] = useState('recent');
  const [filter, setFilter] = useState('all');
  const [voteBusy, setVoteBusy] = useState(null);
  const [voteHelpful] = useVoteHelpfulMutation();
  const [, rerender] = useState(0);

  const total = reviews.length;
  const avg = total ? (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : '0.0';

  let bd = d.rating_breakdown;
  if (!bd) {
    bd = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => { bd[Math.round(r.rating)] = (bd[Math.round(r.rating)] || 0) + 1; });
  }
  const totalBd = Object.values(bd).reduce((a, b) => a + b, 0) || 1;

  const status = getStatus(d);
  const timings = scheduleText(d);
  const specialtyText = specialtyLabels(t, d);
  const languages = d.languages || [];
  const firstName = (d.name || '').split(' ').slice(1).join(' ');
  const displayRating = total ? avg : '—';
  // Measured from the search page's origin: the detected position, or the centre of the city browsed
  const distance = origin && Number.isFinite(+d.lat) && Number.isFinite(+d.lng)
    ? Math.round(distanceKm(origin.lat, origin.lng, +d.lat, +d.lng) * 10) / 10 : null;
  const dirUrl = directionsUrl(`${d.hospital || ''} ${d.hospital_address || ''}`.trim(), origin);
  const visited = () => rememberVisit('doctor', d.id, d.name);

  async function toggleHelpful(r) {
    const undo = hasVoted(r.id);
    setVoteBusy(r.id);
    const { error } = await voteHelpful({ doctorId: String(d.id), reviewId: r.id, undo });
    setVoteBusy(null);
    if (error) { console.error('helpful vote failed:', error); return; }
    rememberVote(r.id, !undo);
    rerender(n => n + 1);
  }

  const shown = sortAndFilter(reviews, sort, filter);

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] 2xl:grid-cols-[1fr_360px] gap-[24px] items-start">
      <div className="flex flex-col gap-[20px] min-w-0">

        <div className="bg-white rounded-[18px] border border-border overflow-hidden">
          <div className="h-[4px] bg-[linear-gradient(90deg,#D0423A_0%,#E87040_60%,#F4A261_100%)]"></div>
          <div className="p-[18px] sm:p-[28px] flex gap-[14px] sm:gap-[24px] items-start">
            <div className="relative shrink-0">
              <div className="w-[64px] h-[64px] sm:w-[96px] sm:h-[96px] rounded-[18px] sm:rounded-[22px] flex items-center justify-center font-serif text-[22px] sm:text-[30px] text-white shadow-[0_0_0_3px_#F5F0EB,0_0_0_5px_rgba(208,66,58,.15)]"
                style={{ background: d.avatar_bg || 'linear-gradient(135deg,#94A3B8,#64748B)' }}>{d.initials || ''}</div>
              {status.open && <div className="absolute bottom-[-2px] right-[-2px] w-[20px] h-[20px] rounded-full bg-[#22C55E] border-[3px] border-white"></div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-[16px] flex-wrap">
                <div className="min-w-0">
                  {d.featured && <div className="inline-block bg-red text-white text-[10px] font-bold tracking-[.08em] uppercase py-[3px] px-[10px] rounded-[6px] mb-[8px]">{t('profile.topPick')}</div>}
                  <h1 className="font-serif text-[23px] sm:text-[30px] leading-[1.1] text-text break-words">{d.name}</h1>
                  <div className="text-[14px] font-semibold text-red mt-[4px]">{specialtyText}</div>
                  {d.qualification && <div className="text-[12px] text-faint mt-[2px]">{d.qualification}</div>}
                  {d.source === 'website' && d.source_url && (
                    <div className="text-[11px] text-faint mt-[4px]">
                      {t('profile.fromWebsite', { place: d.hospital || '' })} · <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">{t('profile.sourceLink')}</a>
                    </div>
                  )}
                </div>
                <div className="bg-bg border border-border rounded-[14px] py-[10px] px-[14px] sm:py-[12px] sm:px-[18px] text-center shrink-0 min-w-[96px] sm:min-w-[110px]">
                  <div className="font-serif text-[28px] sm:text-[36px] leading-[1] text-text">{displayRating}</div>
                  <div className="mt-[6px]"><Stars rating={+displayRating || 0} size={14} /></div>
                  <div className="text-[11px] text-faint mt-[4px]">{t('profile.reviews', { count: total })}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[10px] mt-[20px] pt-[18px] border-t border-border">
                <div className="flex items-center gap-[6px] text-[13px] text-muted">
                  <PinIcon size={14} fill="none" stroke="#94A3B8" strokeWidth="2" />
                  {d.hospital || ''}{distance != null && <> · <strong className="text-text font-semibold">{t('card.kmAway', { km: distance })}</strong></>}
                </div>
                {d.experience && (
                  <div className="flex items-center gap-[6px] text-[13px] text-muted">
                    <ClockIcon size={14} stroke="#94A3B8" />
                    <strong className="text-text font-semibold">{t('profile.years', { years: d.experience })}</strong> {t('profile.experience')}
                  </div>
                )}
                <div className={`flex items-center gap-[6px] text-[13px] text-muted ${status.open ? 'text-[#16A34A] font-semibold' : ''}`}>
                  <div className={`w-[8px] h-[8px] rounded-full inline-block ${status.open ? 'bg-[#22C55E]' : 'bg-faint'}`}></div>
                  {status.label}
                </div>
              </div>
              <div className="flex flex-wrap gap-[6px] mt-[14px]">
                {d.walk_in && <span className={PILL}><CheckIcon />{t('profile.walkIns')}</span>}
                {d.insurance && <span className={PILL}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>{t('profile.insurance')}</span>}
                {d.gender === 'female' && <span className={PILL}>👩‍⚕️ {t('detail.female_doctor')}</span>}
                {languages.map(l => <span key={l} className="inline-flex items-center gap-[5px] text-[11px] font-medium py-[5px] px-[12px] rounded-[100px] bg-[#F2F1ED] border-[1.5px] border-border text-muted">{t(`lang.${l}`)}</span>)}
              </div>
            </div>
          </div>
        </div>

        {(d.about || d.specialties?.length > 0) && (
          <div className="bg-white rounded-[18px] border border-border overflow-hidden p-[18px] sm:p-[28px]">
            {d.about && <><div className={SECTION_LABEL}>{t('profile.about')}</div><p className="text-[14px] text-muted leading-[1.7]">{d.about}</p></>}
            {d.specialties?.length > 0 && <>
              <div className={`${SECTION_LABEL} mt-[20px]`}>{t('profile.specialises')}</div>
              <div className="flex flex-wrap gap-[8px] mt-[16px]">{d.specialties.map(s => <span key={s} className="text-[12px] font-medium py-[6px] px-[14px] rounded-[9px] bg-[#F2F1ED] border border-border text-muted cursor-default transition-all duration-150 hover:bg-[#FDECEA] hover:border-[#F3C9C6] hover:text-[#C83930]">{s}</span>)}</div>
            </>}
          </div>
        )}

        <div className="bg-white rounded-[18px] border border-border overflow-hidden p-[18px] sm:p-[28px]">
          <div className="flex items-start justify-between gap-[16px] flex-wrap mb-[24px]">
            <div>
              <h2 className="font-serif text-[19px] sm:text-[22px] text-text">{t('profile.patientReviews')}</h2>
              <p className="text-[12px] text-faint mt-[4px]">{total === 1 ? t('profile.reviewCollected') : t('profile.reviewsCollected', { count: total })}</p>
            </div>
            <Link to={`/review?id=${d.id}`} className="inline-flex items-center gap-[7px] bg-red text-white text-[13px] font-semibold py-[10px] px-[18px] rounded-[10px] no-underline transition-colors duration-150 hover:bg-red-dark shrink-0">
              <PenIcon />
              {t('profile.writeReview')}
            </Link>
          </div>
          <div className="flex items-center gap-[20px] sm:gap-[40px]">
            <div className="text-center shrink-0">
              <div className="font-serif text-[44px] sm:text-[68px] leading-[1] text-text">{avg}</div>
              <div className="mt-[8px]"><Stars rating={+avg || 0} size={17} /></div>
              <div className="text-[11px] text-faint mt-[8px]">{t('profile.outOf')}</div>
            </div>
            <div className="flex-1 flex flex-col gap-[9px]">
              {[5, 4, 3, 2, 1].map(n => (
                <div key={n} className="flex items-center gap-[10px]">
                  <span className="text-[12px] text-muted w-[10px] text-right shrink-0">{n}</span>
                  <span className="text-[13px] text-[#F59E0B] shrink-0">★</span>
                  <div className="flex-1 h-[8px] bg-[#F2F1ED] rounded-[100px] overflow-hidden">
                    <div className={`h-full rounded-[100px] transition-[width] duration-700 ease-[cubic-bezier(.4,0,.2,1)] ${n >= 4 ? 'bg-red' : 'bg-[#E6C4C1]'}`}
                      style={{ width: `${Math.round((bd[n] || 0) / totalBd * 100)}%` }}></div>
                  </div>
                  <span className="text-[12px] text-faint w-[28px] text-right shrink-0">{bd[n] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-[10px]">
          <div className="flex items-center gap-[6px] flex-wrap">
            <span className="text-[12px] text-faint me-[2px]">{t('profile.sort')}</span>
            {SORTS.map(key => (
              <button key={key} type="button" onClick={() => setSort(key)} className={`${SORT_TAB} ${sort === key ? 'active' : ''}`}>{t(`profile.sort.${key}`)}</button>
            ))}
          </div>
          <div className="flex items-center gap-[6px] flex-wrap">
            {FILTERS.map(key => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={`${FILTER_CHIP} ${filter === key ? 'active' : ''}`}>{t(`profile.filter.${key}`)}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-[14px]">
          {shown.length
            ? shown.map((r, i) => <ReviewCard key={r.id} review={r} index={i} voted={hasVoted(r.id)} busy={voteBusy === r.id} onHelpful={toggleHelpful} />)
            : <div className="text-center py-[40px] text-[14px] text-faint">{t('profile.noMatch')}</div>}
        </div>

      </div>

      <div className="lg:sticky lg:top-[76px] flex flex-col gap-[16px] w-full min-w-0">

        <div className="bg-white rounded-[18px] border border-border overflow-hidden">
          <div className="p-[20px_22px] flex flex-col gap-[14px]">
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-[12px] p-[11px_14px] flex items-center justify-between">
              <div className="flex items-center gap-[7px] text-[12px] text-muted font-medium"><div className="w-[7px] h-[7px] rounded-full bg-[#22C55E] shrink-0"></div>{t('profile.nextAvailable')}</div>
              <div className="text-[13px] font-bold text-[#16A34A]">{status.nextSlot}</div>
            </div>
            {d.consult_fee != null && (
              <div className="flex items-center justify-between py-[14px] border-y border-border">
                <span className="text-[12px] text-faint">{t('profile.fee')}</span>
                <div className="flex items-baseline gap-[3px]">
                  <span className="font-serif text-[26px] text-text">₹{d.consult_fee}</span>
                  <span className="text-[11px] text-faint">{t('profile.perVisit')}</span>
                </div>
              </div>
            )}
            <a href={dirUrl} target="_blank" rel="noopener noreferrer" onClick={visited} className="w-full bg-white text-text border-[1.5px] border-border p-[12px] rounded-[11px] text-[13px] font-semibold cursor-pointer transition-all duration-150 hover:border-red hover:text-red flex items-center justify-center gap-[7px] no-underline font-sans">
              <DirectionsIcon />
              {t('profile.getDirections')}
            </a>
          </div>
        </div>

        <div className="bg-white rounded-[18px] border border-border overflow-hidden">
          <div className="p-[22px]">
            <div className={SECTION_LABEL}>{t('profile.clinicInfo')}</div>
            <div className="flex flex-col gap-[16px] mt-[4px]">
              <div className="flex gap-[12px] items-start">
                <div className="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><PinIcon size={15} fill="none" stroke="#94A3B8" strokeWidth="2" /></div>
                <div><div className="text-[13px] font-semibold text-text">{d.hospital || ''}</div><div className="text-[12px] text-faint mt-[2px] leading-[1.5]">{d.hospital_address || ''}</div></div>
              </div>
              <div className="flex gap-[12px] items-start">
                <div className="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><ClockIcon size={15} stroke="#94A3B8" /></div>
                <div><div className="text-[13px] font-semibold text-text">{t('profile.timings')}</div><div className="text-[12px] text-faint mt-[2px] leading-[1.5]">{timings}</div></div>
              </div>
              <div className="flex gap-[12px] items-start">
                <div className="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
                <div>
                  <div className="text-[13px] font-semibold text-text">{t('profile.languages')}</div>
                  <div className="flex flex-wrap gap-[5px] mt-[6px]">{languages.map(l => <span key={l} className="text-[11px] font-medium py-[3px] px-[9px] rounded-[6px] bg-[#F2F1ED] border border-border text-muted">{t(`lang.${l}`)}</span>)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] overflow-hidden bg-[#1a1a1a] p-[22px]">
          <div className="w-[40px] h-[40px] rounded-[10px] bg-[rgba(255,255,255,.1)] flex items-center justify-center mb-[16px]">
            <PenIcon size={18} strokeWidth={2} stroke="white" />
          </div>
          <div className="font-serif text-[17px] text-white mb-[6px]">{t('profile.visitedName', { name: firstName })}</div>
          <div className="text-[12px] text-[rgba(255,255,255,.45)] mb-[16px] leading-[1.55]">{t('profile.reviewHelps')}</div>
          <Link to={`/review?id=${d.id}`} className="flex items-center justify-center gap-[7px] bg-red text-white text-[13px] font-semibold py-[11px] rounded-[10px] no-underline transition-colors duration-150 hover:bg-red-dark font-sans">
            <PenIcon />
            {t('profile.writeReview')}
          </Link>
        </div>

      </div>
    </div>

    <div className="fixed bottom-0 left-0 right-0 z-[200] bg-[rgba(255,255,255,.97)] backdrop-blur-[12px] border-t border-border py-[12px] px-[16px] sm:px-[24px] pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="max-w-[1280px] 2xl:max-w-[1440px] mx-auto flex items-center justify-between gap-[12px] flex-wrap">
        <div className="min-w-0">
          <div className="font-serif text-[15px] text-text">{d.name}</div>
          <div className="text-[12px] text-faint mt-[2px]">{specialtyText} · {d.hospital || ''}</div>
        </div>
        <div className="flex gap-[8px] shrink-0">
          <a href={dirUrl} target="_blank" rel="noopener noreferrer" onClick={visited} className="flex items-center gap-[6px] bg-white text-text border-[1.5px] border-border py-[9px] px-[16px] rounded-[9px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:border-red hover:text-red font-sans no-underline">
            <DirectionsIcon />
            {t('common.directions')}
          </a>
        </div>
      </div>
    </div>
    </>
  );
}

export default function Profile() {
  const t = useT();
  const [params] = useSearchParams();
  const id = useParams().id ?? params.get('id');
  const doctor = useGetDoctorQuery(id, { skip: !id });
  const reviews = useGetReviewsQuery(id, { skip: !id });
  useTitle(doctor.data ? `MediWay — ${doctor.data.name}` : `MediWay — ${t('profile.title')}`);

  let content;
  if (!id) content = <NotFoundMessage title={t('profile.noDoctor')} linkText={t('common.backToResultsArrow')} />;
  else if (doctor.isLoading || reviews.isLoading) content = <Spinner label={t('profile.loading')} />;
  else if (!doctor.data) content = <NotFoundMessage title={t('profile.notFound')} linkText={t('common.backToResultsArrow')} />;
  // A missing reviews table shouldn't hide the profile
  else content = <DoctorProfile doctor={doctor.data} reviews={reviews.data ?? []} />;

  return (
    <div className="font-sans min-h-screen">
      <nav className="sticky top-0 z-[200] bg-[#F5F5F4] backdrop-blur-[12px] border-b border-border h-[60px] flex items-center px-[16px] sm:px-[24px]">
        <div className="max-w-[1280px] 2xl:max-w-[1440px] w-full mx-auto flex items-center gap-[8px] sm:gap-[12px]">
          <Link to="/" className="flex items-center gap-[9px] no-underline shrink-0 min-w-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-red flex items-center justify-center shrink-0">
              <PinIcon size={16} />
            </div>
            <span className="font-custom text-[22px] sm:text-[29px] font-bold text-text hover:text-[#D6453A]">MediWay</span>
          </Link>
          <div style={{ flex: 1 }}></div>

          <Link to="/search" title={t('common.backToResults')} className="flex items-center gap-[5px] text-[13px] text-faint no-underline transition-colors duration-150 hover:text-text shrink-0">
            <BackIcon />
            <span className="hidden md:inline">{t('common.backToResults')}</span>
          </Link>
          <LanguagePicker />
          <AuthButton />
          <Link to="/emergency" className="flex items-center gap-[6px] bg-[#FEF2F2] border-[1.5px] border-[#FECACA] text-[#DC2626] text-[12px] font-semibold py-[6px] px-[9px] sm:px-[12px] rounded-[8px] no-underline whitespace-nowrap shrink-0">
            <div className="w-[7px] h-[7px] rounded-full bg-[#DC2626] animate-pulse-dot shrink-0"></div>
            <span className="hidden sm:inline">{t('common.emergency')}</span>
            <span className="sm:hidden">{t('common.sos')}</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-[1280px] 2xl:max-w-[1440px] mx-auto pt-[24px] sm:pt-[32px] px-[16px] sm:px-[24px] pb-[160px]">
        {content}
      </div>
    </div>
  );
}
