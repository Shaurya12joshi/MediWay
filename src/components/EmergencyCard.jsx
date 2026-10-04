import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { useT } from '../i18n';
import { setFilter, setView } from '../store/searchSlice';

function EmergencyAction({ href, onClick, icon, title, subtitle, tone = 'bg-red-100' }) {
  const body = (
    <>
      <div className={`w-9 h-9 rounded-lg ${tone} flex items-center justify-center shrink-0 text-lg`} aria-hidden="true">{icon}</div>
      <div className="flex-1 min-w-0 text-start">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </>
  );
  const cls = 'w-full flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 cursor-pointer hover:border-slate-300 transition-colors no-underline';
  return href ? <a href={href} className={cls}>{body}</a> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

// What to do right now: call for help, tell someone where you are, find a 24/7 ER.
// MediWay itself never contacts anyone, and the card says so. Works offline (calls and sharing need no data).
export default function EmergencyCard({ className = '', showPageLink = false }) {
  const t = useT();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [share, setShare] = useState('idle'); // idle | locating | failed

  function findEmergencyRoom() {
    dispatch(setFilter({ key: 'type', value: 'all' }));
    dispatch(setFilter({ key: 'er24', value: true }));
    dispatch(setView('list'));
    navigate('/search');
  }

  // The phone's share sheet where there is one (WhatsApp, SMS…), WhatsApp otherwise
  function shareLocation() {
    if (!navigator.geolocation) { setShare('failed'); return; }
    setShare('locating');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const url = `https://maps.google.com/?q=${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
      const text = t('em.shareText', { url });
      setShare('idle');
      if (navigator.share) {
        try { await navigator.share({ title: t('em.shareTitle'), text }); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }, () => setShare('failed'), { enableHighAccuracy: true, timeout: 10000 });
  }

  const shareSubtitle = { idle: t('em.shareSub'), locating: t('em.locating'), failed: t('em.shareFailed') }[share];

  return (
    <div className={`w-full rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-white ${className}`}>
      <div className="bg-red-700 px-5 py-4">
        <div className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 w-fit mb-3">
          <span className="w-2 h-2 rounded-full bg-red-300 animate-pulse"></span>
          <span className="text-white text-xs font-semibold tracking-widest uppercase">{t('em.badge')}</span>
        </div>
        <p className="text-white font-semibold text-sm">{t('em.callFirst')}</p>
        <p className="text-white/70 text-xs mt-0.5">{t('em.free')}</p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <EmergencyAction href="tel:112" icon="🚨" title={t('em.call112')} subtitle={t('em.call112Sub')} />
        <EmergencyAction href="tel:108" icon="🚑" title={t('em.call108')} subtitle={t('em.call108Sub')} tone="bg-amber-100" />
        <EmergencyAction onClick={shareLocation} icon="📍" title={t('em.share')} subtitle={shareSubtitle} tone="bg-blue-100" />
        <EmergencyAction onClick={findEmergencyRoom} icon="🏥" title={t('em.findEr')} subtitle={t('em.findErSub')} tone="bg-green-100" />
      </div>

      <p className="px-5 pb-4 text-[11px] leading-snug text-slate-400">
        {t('em.disclaimer')}
        {showPageLink && <> <Link to="/emergency" className="text-red-700 underline">{t('em.openPage')}</Link></>}
      </p>
    </div>
  );
}
