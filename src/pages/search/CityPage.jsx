import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { supabaseConfigured } from '../../lib/supabase';
import { cityCentre } from '../../lib/origin';
import { useGetCitiesQuery } from '../../store/api';
import { useT } from '../../i18n';
import { resetFilters, setFilter, setOrigin, setView } from '../../store/searchSlice';
import NotFound from '../NotFound';
import SearchPage from './SearchPage';

// /varanasi/hospitals, /varanasi/emergency …: the search page set to one city and one kind of place.
// These are the addresses search engines index (scripts/prerender.mjs writes their HTML).
export const CATEGORIES = {
  hospitals: { type: 'hospital', label: 'kind.hospitals' },
  clinics: { type: 'clinic', label: 'kind.clinics' },
  pharmacies: { type: 'pharmacy', label: 'kind.pharmacies' },
  labs: { type: 'lab', label: 'kind.labs' },
  doctors: { type: 'doctor', label: 'kind.doctors' },
  emergency: { type: 'all', er24: true, label: 'results.erPlaces' },
};

export default function CityPage() {
  const { city, category } = useParams();
  const dispatch = useDispatch();
  const t = useT();
  const preset = CATEGORIES[category];
  const cities = useGetCitiesQuery(preset && supabaseConfigured ? undefined : skipToken);
  const match = cities.data?.find(c => c.slug === city);

  useEffect(() => {
    if (!match || !preset) return;
    dispatch(resetFilters());
    dispatch(setFilter({ key: 'type', value: preset.type }));
    if (preset.er24) dispatch(setFilter({ key: 'er24', value: true }));
    dispatch(setOrigin(cityCentre(match)));
    dispatch(setView('list'));
  }, [match, preset, dispatch]);

  if (!preset || (cities.data && !match)) return <NotFound />;
  return <SearchPage title={`${t(preset.label)} · ${match?.name ?? ''} | MediWay`} />;
}
