import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { supabaseConfigured } from '../../lib/supabase';
import { cityCentre, nearestCity } from '../../lib/origin';
import { api, useGetCitiesQuery, useGetNearbyQuery } from '../../store/api';
import { resetFilters, setOrigin, setQuery, setView } from '../../store/searchSlice';
import { showToast } from '../../store/toastSlice';
import AuthButton from '../../components/AuthButton';
import Footer from '../../components/Footer';
import { PinIcon } from '../../components/icons';
import { useTitle } from '../../components/ui';
import LanguagePicker from '../../components/LanguagePicker';
import { useT } from '../../i18n';
import { saveEmergencyRooms } from '../../lib/erCache';
import { KINDS } from './kinds';
import { mapPlaces, matchesDoctor, matchesPlace, showsDoctors, showsPlaces, sortDoctors } from './filtering';
import FilterSidebar from './FilterSidebar';
import ResultsList from './ResultsList';
import MapView from './MapView';
import DirectionsDrawer from './DirectionsDrawer';

const VIEW_BTN = 'flex items-center gap-1.5 px-3.5 py-[5px] rounded-[7px] text-[13px] font-medium border-none cursor-pointer font-sans transition-all';
const VIEW_ON = `${VIEW_BTN} bg-white text-[#1E293B] shadow-sm`;
const VIEW_OFF = `${VIEW_BTN} bg-transparent text-[#64748B]`;

// `title`: the city pages (/varanasi/hospitals) name what they list
export default function SearchPage({ title }) {
  const t = useT();
  useTitle(title ?? `MediWay — ${t('search.title')}`);
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const { origin, filters, query, sortBy, view } = useSelector(s => s.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  // The map is built the first time it's shown, then kept
  const [mapMounted, setMapMounted] = useState(view === 'map');

  const cities = useGetCitiesQuery(supabaseConfigured ? undefined : skipToken);

  // Where to measure from: ?city=<slug> wins, then the origin this tab already had (if it's
  // inside a launched city), then the first launched city
  useEffect(() => {
    const list = cities.data;
    if (!list) return;
    const fromLink = list.find(c => c.slug === params.get('city')?.toLowerCase());
    if (fromLink) dispatch(setOrigin(cityCentre(fromLink)));
    else if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && nearestCity(list, origin.lat, origin.lng).inside) return;
    else if (list[0]) dispatch(setOrigin(cityCentre(list[0])));
  }, [cities.data]); // once, when the cities arrive — not on every origin change

  // Same origin + same server-side filters -> same rows from the cache, so flipping a chip back is instant
  const nearby = useGetNearbyQuery(origin && supabaseConfigured ? {
    lat: origin.lat,
    lng: origin.lng,
    doctors: showsDoctors(filters),
    places: showsPlaces(filters),
    // ERs are hospitals: fetch the nearest hospitals, not the nearest places of every kind
    kind: KINDS[filters.type] ? filters.type : filters.er24 ? 'hospital' : null,
    specialty: filters.specialty !== 'all' ? filters.specialty : null,
    walkIn: filters.walkIn,
    rating: filters.rating,
    language: filters.language !== 'all' ? filters.language : null,
  } : skipToken);

  const failed = !supabaseConfigured || cities.isError || nearby.isError || (cities.isSuccess && !origin);
  const loading = !failed && !nearby.currentData;
  const retry = () => (cities.isError ? cities.refetch() : nearby.refetch());

  const data = nearby.currentData;
  const matchedDoctors = useMemo(() => (data?.doctors ?? []).filter(d => matchesDoctor(d, filters, query)), [data, filters, query]);
  const doctors = useMemo(() => sortDoctors(matchedDoctors, sortBy), [matchedDoctors, sortBy]);
  const places = useMemo(() => (data?.places ?? []).filter(h => matchesPlace(h, filters, query)), [data, filters, query]);
  const placesOnMap = useMemo(() => mapPlaces(places, filters), [places, filters]);
  const cityName = cities.data?.find(c => c.slug === origin?.city)?.name;
  useEffect(() => {
    if (data?.places?.length) saveEmergencyRooms(data.places, cityName ?? null);
  }, [data, cityName]);

  function detectLocation() {
    if (!navigator.geolocation) {
      dispatch(showToast(t('search.toastNoGeolocation')));
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // Cities must be loaded to tell which one the user is in
        const request = dispatch(api.endpoints.getCities.initiate());
        const list = await request.unwrap().catch(() => []);
        request.unsubscribe();
        setDetecting(false);
        const { city, inside } = nearestCity(list, coords.latitude, coords.longitude);
        if (inside || !city) {
          dispatch(setOrigin({ lat: coords.latitude, lng: coords.longitude, city: city?.slug ?? null, fromDevice: true }));
        } else {
          dispatch(showToast(t('search.toastNotInArea', { city: city.name })));
          dispatch(setOrigin(cityCentre(city)));
        }
      },
      error => {
        console.error(error);
        setDetecting(false);
        dispatch(showToast(t('search.toastLocationFailed')));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function reset() {
    dispatch(resetFilters());
    dispatch(showToast(t('search.toastFiltersReset')));
  }

  function showView(v) {
    dispatch(setView(v));
    if (v === 'map') setMapMounted(true);
  }

  // Phones: filters fold away in both views. On the map they replace the results pane.
  const filterPanelId = view === 'map' ? 'mapFilters' : 'filterSidebar';
  function toggleFilters() {
    setFiltersOpen(open => !open);
    if (!filtersOpen) requestAnimationFrame(() => document.getElementById(filterPanelId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  return (
    <div className="font-sans">
      <nav className="bg-[#F5F5F4] border-b border-gray-50 sticky top-0 z-[200]">
        <div className="max-w-[1280px] 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-wrap items-center gap-2 sm:gap-4 py-2.5 lg:flex-nowrap lg:py-0 lg:h-16">
          <Link to="/" className="order-1 flex items-center gap-2.5 no-underline shrink-0">
            <div className="bg-[#D6453A] w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0">
              <PinIcon size={18} />
            </div>
            <span className="text-xl sm:text-2xl font-custom font-bold md:text-3xl lg:text-4xl hover:text-[#D6453A] text-[#1E293B]">MediWay</span>
          </Link>

          <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1 lg:max-w-[900px] flex items-center bg-white border-[1.5px] border-[#E2E8F0] rounded-xl overflow-hidden transition-all focus-within:border-[#D0423A] focus-within:shadow-[0_0_0_3px_rgba(208,66,58,.08)]">
            <input type="text" placeholder={t('search.placeholder')} aria-label={t('search.searchLabel')} value={query}
              onChange={e => dispatch(setQuery(e.target.value))}
              className="flex-1 min-w-0 border-none outline-none px-3 sm:px-3.5 py-2.5 text-sm text-[#1E293B] bg-transparent placeholder-[#94A3B8] font-sans" />
            <div className="w-px h-5 bg-[#E2E8F0] shrink-0"></div>
            <button type="button" onClick={detectLocation} aria-label={t('search.useMyLocation')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2.5 text-[13px] text-[#64748B] cursor-pointer whitespace-nowrap bg-transparent border-none outline-none font-sans shrink-0">
              <PinIcon size={13} fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0" />
              <span className="hidden sm:inline">{t(detecting ? 'search.detecting' : origin?.fromDevice ? 'search.currentLocation' : 'search.location')}</span>
            </button>
            {/* Results already filter as you type; this retries after a failed load */}
            <button type="button" onClick={() => failed && retry()}
              className="bg-[#D0423A] hover:bg-[#B8362F] border-none px-3 sm:px-4 py-3 text-white text-[13px] font-semibold cursor-pointer transition-colors font-sans shrink-0">
              {t('search.search')}
            </button>
          </div>

          <div className="order-2 ml-auto lg:order-3 lg:ml-0 flex items-center gap-2 sm:gap-4 shrink-0">
            <LanguagePicker />
            <AuthButton className="text-slate-600 hover:text-[#D6453A] text-sm font-semibold whitespace-nowrap" />
            <Link to="/emergency" className="flex items-center gap-1.5 bg-red-50 border-[1.5px] border-red-200 text-red-600 text-[13px] font-semibold px-2.5 sm:px-3.5 py-2 rounded-[10px] no-underline whitespace-nowrap shrink-0 hover:bg-red-100">
              <div className="animate-pulse-dot w-2 h-2 bg-red-600 rounded-full shrink-0"></div>
              <span className="hidden sm:inline">{t('common.emergency')}</span>
              <span className="sm:hidden">{t('common.sos')}</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="bg-white border-b border-[#E2E8F0] lg:sticky lg:top-16 z-[150]">
        <div className="max-w-[1280px] 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 min-h-[48px] py-2 lg:py-0 lg:h-12 flex items-center justify-between gap-3">
          <div className="flex bg-slate-100 rounded-[9px] p-[3px] gap-0.5 shrink-0">
            <button type="button" aria-pressed={view === 'list'} onClick={() => showView('list')} className={view === 'list' ? VIEW_ON : VIEW_OFF}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              {t('search.list')}
            </button>
            <button type="button" aria-pressed={view === 'map'} onClick={() => showView('map')} className={view === 'map' ? VIEW_ON : VIEW_OFF}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
              {t('search.map')}
            </button>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-[13px] text-[#64748B] truncate">
              <strong className="text-[#1E293B]">{loading ? '…' : doctors.length + places.length}</strong> {t('search.resultsNear', { city: origin ? (cityName ?? t('search.you')) : '…' })}
            </div>
            <button type="button" onClick={toggleFilters} aria-expanded={filtersOpen} aria-controls={filterPanelId}
              className={`md:hidden flex items-center gap-1.5 shrink-0 border-[1.5px] bg-white rounded-[9px] px-3 py-[5px] text-[13px] font-medium cursor-pointer font-sans hover:border-[#D0423A] hover:text-[#D0423A] transition-all ${filtersOpen ? 'border-[#D0423A] text-[#D0423A]' : 'border-[#E2E8F0] text-[#1E293B]'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              {t('search.filters')}
            </button>
          </div>
        </div>
      </div>

      <div className={`${view === 'map' ? 'max-w-none' : 'max-w-[1280px] 2xl:max-w-[1440px]'} mx-auto px-4 sm:px-6 pt-5 pb-12`}>
        <div className={`${view === 'map' ? 'hidden' : 'grid'} grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr] gap-5 lg:gap-6`}>
          <FilterSidebar open={filtersOpen} onReset={reset} />
          <ResultsList doctors={doctors} places={places} loading={loading} failed={failed} cityName={cityName} onRetry={retry} onReset={reset} />
        </div>

        {mapMounted && (
          <MapView visible={view === 'map'} doctors={matchedDoctors} places={placesOnMap} showDoctorCards={showsDoctors(filters)}
            resultCount={loading ? null : doctors.length + places.length}
            filtersOpen={filtersOpen} onToggleFilters={toggleFilters} onReset={reset} />
        )}
      </div>

      <DirectionsDrawer />

      <Footer className="py-5" inner="max-w-[1280px] 2xl:max-w-[1440px] mx-auto px-6" />
    </div>
  );
}
