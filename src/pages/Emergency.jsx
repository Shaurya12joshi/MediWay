import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSelector } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useT } from '../i18n';
import { supabaseConfigured } from '../lib/supabase';
import { cityCentre, directionsUrl } from '../lib/origin';
import { saveEmergencyRooms, savedEmergencyRooms } from '../lib/erCache';
import { useGetCitiesQuery, useGetNearbyQuery } from '../store/api';
import EmergencyCard from '../components/EmergencyCard';
import InstallApp from '../components/InstallApp';
import LanguagePicker from '../components/LanguagePicker';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';
import { telHref } from './search/kinds';
import { PAGE_DESCRIPTIONS } from '../lib/meta';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

function timeAgo(t, at) {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return t('em.minutesAgo', { count: minutes });
  if (minutes < 48 * 60) return t('em.hoursAgo', { count: Math.round(minutes / 60) });
  return t('em.daysAgo', { count: Math.round(minutes / 1440) });
}

// One page to keep: emergency numbers, sharing your location, and the nearest 24/7 emergency rooms.
// Online it refreshes the list and saves it on the phone; offline it shows what was saved.
export default function Emergency() {
  const t = useT();
  useTitle(`${t('em.pageTitle')} · MediWay`, PAGE_DESCRIPTIONS.emergency);
  const online = useOnline();
  const savedOrigin = useSelector(s => s.search.origin);

  const cities = useGetCitiesQuery(online && supabaseConfigured ? undefined : skipToken);
  const origin = savedOrigin ?? (cities.data?.[0] ? cityCentre(cities.data[0]) : null);
  const cityName = cities.data?.find(c => c.slug === origin?.city)?.name ?? null;
  const nearby = useGetNearbyQuery(online && origin && supabaseConfigured ? {
    lat: origin.lat, lng: origin.lng, doctors: false, places: true, kind: 'hospital',
    specialty: null, walkIn: false, rating: 0, language: null,
  } : skipToken);

  const live = nearby.currentData?.places?.filter(p => p.er24 === true).slice(0, 8);
  useEffect(() => {
    if (nearby.currentData?.places) saveEmergencyRooms(nearby.currentData.places, cityName);
  }, [nearby.currentData, cityName]);

  const saved = savedEmergencyRooms();
  const rooms = live ?? saved?.rooms ?? null;
  const near = live ? cityName : saved?.near;
  const loading = online && !live && (nearby.isFetching || cities.isFetching);

  return (
    <div className="font-sans min-h-screen bg-[#F8F2ED]">
      <nav className="sticky top-0 z-[200] bg-[#F5F5F4] border-b border-[#E2E8F0] h-[60px] flex items-center px-4 sm:px-6">
        <div className="max-w-[640px] w-full mx-auto flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 no-underline shrink-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#D6453A] flex items-center justify-center shrink-0"><PinIcon size={16} /></div>
            <span className="font-custom text-[24px] font-bold text-[#1E293B]">MediWay</span>
          </Link>
          <div className="flex-1"></div>
          <LanguagePicker />
        </div>
      </nav>

      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        <div>
          <h1 className="font-custom font-bold text-3xl text-slate-900">{t('em.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('em.pageIntro')}</p>
        </div>

        <EmergencyCard />

        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] mb-2">
            {t('em.nearestEr')}{near ? ` · ${t('em.nearCity', { city: near })}` : ''}
          </h2>
          {!online && saved && <p className="text-[12px] text-[#B45309] mb-2">{t('em.savedAgo', { when: timeAgo(t, saved.at) })}</p>}
          {loading && <p className="text-sm text-slate-500">{t('em.loadingEr')}</p>}
          {!loading && !rooms && <p className="text-sm text-slate-500">{online ? t('em.noErKnown') : t('em.noSaved')}</p>}
          {!loading && rooms?.length === 0 && <p className="text-sm text-slate-500">{t('em.noErKnown')}</p>}
          <div className="flex flex-col gap-2">
            {rooms?.map(r => (
              <div key={r.id} className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#1E293B] break-words">{r.name}</p>
                  <p className="text-[12px] text-[#64748B] truncate">{[r.distance_km != null ? `${r.distance_km} km` : null, r.address].filter(Boolean).join(' · ')}</p>
                  <p className="text-[11px] font-medium text-[#16A34A] mt-0.5">{t('place.erOpen')}</p>
                </div>
                {r.phone && (
                  <a href={telHref(r.phone)} className="shrink-0 bg-[#D0423A] hover:bg-[#B8362F] text-white text-[13px] font-semibold px-3 py-2 rounded-[10px] no-underline">{t('common.call')}</a>
                )}
                <a href={directionsUrl(r.address ? `${r.name} ${r.address}` : `${r.lat},${r.lng}`, savedOrigin)} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 border-[1.5px] border-[#E2E8F0] text-[#1E293B] text-[13px] font-semibold px-3 py-2 rounded-[10px] no-underline hover:border-[#1E293B]">{t('common.directions')}</a>
              </div>
            ))}
          </div>
        </section>

        <InstallApp />
      </main>
    </div>
  );
}
