import { useSyncExternalStore } from 'react';
import { useT } from '../i18n';
import { canPrompt, isIPhone, isInstalled, promptInstall, subscribe } from '../lib/install';

// Shown only where installing is possible and MediWay isn't installed yet
export default function InstallApp({ className = '' }) {
  const t = useT();
  const promptable = useSyncExternalStore(subscribe, canPrompt);
  if (isInstalled() || (!promptable && !isIPhone())) return null;

  return (
    <div className={`flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-[#D6453A] flex items-center justify-center shrink-0 text-white text-lg" aria-hidden="true">📲</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{t('em.install')}</p>
        <p className="text-xs text-slate-500">{promptable ? t('em.installSub') : t('em.installIos')}</p>
      </div>
      {promptable && (
        <button type="button" onClick={promptInstall} className="shrink-0 bg-[#1E293B] hover:bg-black text-white text-[13px] font-semibold px-3.5 py-2 rounded-[10px] border-none cursor-pointer font-sans">
          {t('em.installButton')}
        </button>
      )}
    </div>
  );
}
