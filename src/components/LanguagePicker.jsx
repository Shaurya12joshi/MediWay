import { useDispatch, useSelector } from 'react-redux';
import { LANGUAGES, useT } from '../i18n';
import { setLanguage } from '../store/prefsSlice';

// A globe and the language's own name: readable whatever language the page is in now
export default function LanguagePicker({ className = '' }) {
  const t = useT();
  const dispatch = useDispatch();
  const lang = useSelector(s => s.prefs.lang);

  return (
    <label className={`relative flex items-center gap-1 text-[13px] text-slate-600 shrink-0 ${className}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span className="sr-only">{t('common.language')}</span>
      <select value={lang} onChange={e => dispatch(setLanguage(e.target.value))}
        className="appearance-none bg-transparent border-none outline-none cursor-pointer font-medium pr-1 max-w-[90px] sm:max-w-none">
        {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
  );
}
