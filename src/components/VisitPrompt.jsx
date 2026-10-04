import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { askLater, forgetVisit, reviewLink, visitToAskAbout } from '../lib/visits';

// "Did you visit {name}? Rate it": shown once someone comes back a while after taking directions.
// Checks on load and whenever the tab comes back into view (they return from Google Maps).
export default function VisitPrompt() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [visit, setVisit] = useState(null);

  useEffect(() => {
    const check = () => setVisit(visitToAskAbout());
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  // Not over the review form, the admin pages, or the emergency page
  if (!visit || /^\/(review|admin|auth|emergency)/.test(pathname)) return null;

  const close = handle => () => { handle(visit); setVisit(null); };
  const rate = () => { forgetVisit(); setVisit(null); navigate(reviewLink(visit)); };

  return (
    <div role="dialog" aria-label={t('visit.question', { name: visit.name })}
      className="fixed z-[600] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-[360px] bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_18px_48px_rgba(15,23,42,.18)] p-4 animate-fadeUp">
      <p className="font-serif text-[16px] text-[#1E293B] leading-snug">{t('visit.question', { name: visit.name })}</p>
      <p className="text-[12px] text-[#64748B] mt-0.5">{t('visit.help')}</p>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={rate} className="flex-1 bg-[#D0423A] hover:bg-[#B8362F] text-white text-[13px] font-semibold py-2 rounded-[10px] border-none cursor-pointer font-sans">★ {t('visit.rate')}</button>
        <button type="button" onClick={close(askLater)} className="px-3 py-2 rounded-[10px] border-[1.5px] border-[#E2E8F0] bg-white text-[13px] text-[#64748B] cursor-pointer font-sans hover:border-[#1E293B]">{t('visit.notYet')}</button>
        <button type="button" onClick={close(forgetVisit)} className="px-3 py-2 rounded-[10px] border-none bg-transparent text-[13px] text-[#94A3B8] cursor-pointer font-sans hover:text-[#1E293B]">{t('visit.didntGo')}</button>
      </div>
    </div>
  );
}
