import { useGetSiteStatsQuery } from './api';

// What the marketing pages may claim, from the live data: "3,500+" places, "1" city, "Live in Varanasi"
export function useSiteStats() {
  const { data } = useGetSiteStatsQuery();
  const n = data?.places ?? 0;
  const names = data?.cities ?? [];
  return {
    placesListed: !data ? '…' : n >= 100 ? `${(Math.floor(n / 100) * 100).toLocaleString('en-IN')}+` : String(n),
    citiesLive: data ? String(names.length) : '…',
    liveIn: names.length ? `Live in ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}` : 'Launching city by city',
  };
}
