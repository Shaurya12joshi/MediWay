import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { directionsUrl } from '../../lib/origin';
import { closeDirections, setDirMode } from '../../store/searchSlice';
import { useT } from '../../i18n';
import { TRAVEL_SPEEDS, estimateMinutes } from './filtering';

const MODES = [
  { mode: 'drive', label: 'dir.drive', icon: <><rect x="1" y="11" width="22" height="7" rx="2" /><path d="M5 11V8a7 7 0 0 1 14 0v3" /><circle cx="7" cy="18" r="1" /><circle cx="17" cy="18" r="1" /></> },
  { mode: 'walk', label: 'dir.walk', icon: <><circle cx="12" cy="4" r="1.5" /><path d="M7 21l2-6 2 3 3-5 1 8" /><path d="M9 15l-2-5 2-1 3 2 2-4" /></> },
  { mode: 'transit', label: 'dir.transit', icon: <><rect x="3" y="2" width="18" height="16" rx="2" /><path d="M3 10h18" /><circle cx="8" cy="21" r="1" /><circle cx="16" cy="21" r="1" /><path d="M8 18v3M16 18v3" /></> },
];

// Bottom sheet on phones, floating panel from md
export default function DirectionsDrawer() {
  const t = useT();
  const dispatch = useDispatch();
  const { dirDoctor, dirMode, route, origin } = useSelector(s => s.search);

  // Keep the last doctor on screen while the drawer slides away
  const [shown, setShown] = useState(dirDoctor);
  if (dirDoctor && dirDoctor !== shown) setShown(dirDoctor);
  const d = dirDoctor ?? shown;

  // Driving time is the road route's once the map has drawn it; walk and transit use typical speeds
  // over that road distance. Before that, every time is a rough estimate from the distance, and says so.
  const minutes = mode => route
    ? (mode === 'drive' ? route.minutes : Math.round(route.km / TRAVEL_SPEEDS[mode] * 60))
    : estimateMinutes(d.distance_km, mode);
  const timeLabel = mode => {
    const m = minutes(mode);
    if (m == null) return '–';
    const text = m >= 60 ? t('dir.hoursMin', { h: Math.floor(m / 60), m: m % 60 }) : t('dir.min', { min: m });
    return route && mode === 'drive' ? text : `~${text}`;
  };

  // Nothing to show until a doctor is picked (an empty drawer is only a border and a shadow)
  if (!d) return null;

  // Closed: slid down and hidden — `invisible` flips only once the slide has finished
  return (
    <div id="dirDrawer" aria-hidden={!dirDoctor}
      className={`fixed bottom-0 left-0 right-0 md:bottom-12 md:left-4 md:right-auto md:w-[380px] z-[500] bg-white rounded-t-2xl md:rounded-2xl shadow-[0_-8px_30px_rgba(0,0,0,.15)] md:shadow-[0_18px_48px_rgba(15,23,42,.18)] md:border md:border-[#E2E8F0] max-h-[50vh] md:max-h-[calc(100vh-180px)] overflow-y-auto transform transition-[transform,visibility] duration-300 ease-out ${dirDoctor ? '' : 'translate-y-[120%] invisible'}`}>
      <>
        <div className="w-10 h-1 bg-[#E2E8F0] rounded mx-auto mt-3 md:hidden"></div>
        <div className="relative px-5 pt-3.5 pb-3 border-b border-[#E2E8F0]">
          <p className="font-serif text-[17px] text-[#1E293B] mb-0.5">{d.hospital}</p>
          <p className="text-[12px] text-[#64748B]">{d.hospital_address}</p>
          <button type="button" onClick={() => dispatch(closeDirections())} aria-label={t('dir.close')}
            className="absolute top-3.5 right-4 bg-none border-[1.5px] border-[#E2E8F0] rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-[#94A3B8] hover:border-[#D0423A] hover:text-[#D0423A]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="flex gap-2 px-5 py-3 border-b border-[#E2E8F0] overflow-x-auto">
          {MODES.map(({ mode, label, icon }) => {
            const on = dirMode === mode;
            return (
              <button key={mode} type="button" aria-pressed={on} onClick={() => dispatch(setDirMode(mode))}
                className={`flex flex-col items-center gap-[3px] px-3.5 py-2 rounded-[10px] border-[1.5px] cursor-pointer font-sans min-w-[72px] transition-all ${on ? 'border-[#D0423A] bg-[#FDECEA]' : 'border-[#E2E8F0] bg-white hover:border-[#D0423A]'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{icon}</svg>
                <span className={`text-[11px] font-medium ${on ? 'text-[#D0423A]' : 'text-[#64748B]'}`}>{t(label)}</span>
                <span className="text-[13px] font-semibold text-[#1E293B]">{timeLabel(mode)}</span>
              </button>
            );
          })}
        </div>
        <p className="px-5 pt-3 text-[12px] text-[#64748B] leading-snug">
          {route
            ? t('dir.routeNote', { km: route.km.toFixed(1) })
            : d.distance_km != null ? t('dir.estimateNote', { km: d.distance_km }) : t('dir.estimateNoteNoKm')}
          {' '}{t('dir.gmapsNote')}
        </p>
        <div className="px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2.5">
          <a href={directionsUrl(`${d.hospital} ${d.hospital_address}`, origin, dirMode)} target="_blank" rel="noopener noreferrer"
            className="flex-1 bg-[#D0423A] hover:bg-[#B8362F] text-white border-none py-[11px] rounded-[10px] text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-[7px] font-sans no-underline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            {t(`dir.button.${dirMode}`)}
          </a>
        </div>
      </>
    </div>
  );
}
