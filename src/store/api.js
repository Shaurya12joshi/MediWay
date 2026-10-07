import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { supabase } from '../lib/supabase';

// Every endpoint talks to Supabase directly. Results are cached by their arguments, so
// flipping a search filter back, or returning to a profile, is instant.

// Errors must be serialisable to live in the store
export const toError = e => ({ message: e?.message ?? String(e), code: e?.code });

// Supabase builders resolve to { data, error } instead of throwing
export async function run(request) {
  const { data, error } = await request;
  return error ? { error: toError(error) } : { data };
}

// Everything within the distance slider's max is fetched once; the slider then filters locally.
export const SEARCH_RADIUS_KM = 20;
export const PLACES_FETCH_LIMIT = 300;

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['Reviews'],
  endpoints: build => ({

    // Launched cities live in the `cities` table: adding one is a row there, not a code change.
    // The first city launched is the default.
    getCities: build.query({
      queryFn: () => run(supabase
        .from('cities')
        .select('slug, name, center_lat, center_lng, radius_km')
        .eq('launched', true)
        .order('created_at')),
    }),

    // Doctors and facilities around the origin, nearest first, with distance_km.
    // Only the filters that change which rows come back are arguments; the rest apply on screen.
    getNearby: build.query({
      async queryFn({ lat, lng, doctors, places, kind, specialty, walkIn, rating, language }) {
        const [docs, facilities] = await Promise.all([
          doctors ? supabase.rpc('nearby_doctors', {
            origin_lat: lat,
            origin_lng: lng,
            radius_km: SEARCH_RADIUS_KM,
            specialty_filter: specialty,
            walk_in_only: walkIn,
            min_rating: rating,
            language_filter: language,
          }) : { data: [] },
          // Facilities of every kind, or just the chosen one (so "Pharmacies" gets the nearest
          // pharmacies, not the pharmacies among the nearest few hundred places)
          places ? supabase.rpc('nearby_hospitals', {
            origin_lat: lat,
            origin_lng: lng,
            radius_km: SEARCH_RADIUS_KM,
            specialty_filter: specialty,
            kind_filter: kind,
            max_results: PLACES_FETCH_LIMIT,
          }) : { data: [] },
        ]);
        const error = docs.error || facilities.error;
        if (error) return { error: toError(error) };

        // The hours of the hospital or clinic each doctor works at, for doctors whose own hours aren't known
        const doctorsFound = docs.data ?? [];
        const placeIds = [...new Set(doctorsFound.filter(d => d.place_id && !d.schedule?.length).map(d => d.place_id))];
        if (placeIds.length) {
          const { data: placeRows } = await supabase.from('hospitals').select('id, schedule').in('id', placeIds);
          const hoursOf = new Map((placeRows ?? []).map(p => [p.id, p.schedule]));
          for (const d of doctorsFound) if (hoursOf.get(d.place_id)?.length) d.place_schedule = hoursOf.get(d.place_id);
        }

        // Visitors' ratings for these places (20261004_tourist_features.sql); missing ratings never block the search
        const placesFound = facilities.data ?? [];
        if (placesFound.length) {
          const { data: ratings } = await supabase.from('place_ratings').select('place_id, rating, reviews')
            .in('place_id', placesFound.map(p => p.id));
          const byId = new Map((ratings ?? []).map(r => [r.place_id, r]));
          for (const p of placesFound) {
            const r = byId.get(p.id);
            if (r) { p.place_rating = +r.rating; p.place_reviews = r.reviews; }
          }
        }
        return { data: { doctors: docs.data ?? [], places: placesFound } };
      },
      keepUnusedDataFor: 600,
    }),

    // What the marketing pages may claim: live cities and how many places are listed, straight from the data
    getSiteStats: build.query({
      async queryFn() {
        const [cities, places] = await Promise.all([
          supabase.from('cities').select('name').eq('launched', true).order('created_at'),
          supabase.from('hospitals').select('id', { count: 'exact', head: true }),
        ]);
        const error = cities.error || places.error;
        if (error) return { error: toError(error) };
        return { data: { cities: cities.data.map(c => c.name), places: places.count ?? 0 } };
      },
      keepUnusedDataFor: 3600,
    }),

    // Listed places by name, for "is your clinic already on MediWay?" on the join form
    findPlaces: build.query({
      queryFn: ({ city, text }) => run(supabase.from('hospitals')
        .select('id, name, address, kind')
        .eq('city', city)
        .ilike('name', `%${text.replace(/[%_,()]/g, ' ').trim()}%`)
        .order('name')
        .limit(8)),
    }),

    // The public "Join MediWay" form; an admin approves it in Admin -> Applications
    applyAsDoctor: build.mutation({
      queryFn: application => run(supabase.from('doctor_applications').insert(application)),
    }),

    getPlace: build.query({
      queryFn: id => run(supabase.from('hospitals').select('id, name, address, kind, city').eq('id', id).single()),
    }),

    // With their hospital or clinic's hours (place_schedule), for when the doctor's own aren't known
    getDoctor: build.query({
      async queryFn(id) {
        const result = await run(supabase.from('doctors').select('*').eq('id', id).single());
        if (result.error || !result.data.place_id || result.data.schedule?.length) return result;
        const { data: place } = await supabase.from('hospitals').select('schedule').eq('id', result.data.place_id).maybeSingle();
        return { data: { ...result.data, place_schedule: place?.schedule ?? null } };
      },
    }),

    getReviews: build.query({
      queryFn: doctorId => run(supabase
        .from('reviews')
        .select('*')
        .eq('doctor_id', doctorId)
        .order('created_at', { ascending: false })),
      providesTags: (_r, _e, doctorId) => [{ type: 'Reviews', id: String(doctorId) }],
    }),

    addReview: build.mutation({
      queryFn: review => run(supabase.from('reviews').insert(review)),
      invalidatesTags: (_r, _e, review) => [{ type: 'Reviews', id: String(review.doctor_id) }],
    }),

    // The RPCs return the new count; fold it into the cached reviews so the button updates in place
    voteHelpful: build.mutation({
      queryFn: ({ reviewId, undo }) => run(supabase.rpc(undo ? 'decrement_helpful' : 'increment_helpful', { review_id: reviewId })),
      async onQueryStarted({ doctorId, reviewId, undo }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getReviews', doctorId, reviews => {
            const r = reviews.find(x => x.id === reviewId);
            if (r) r.helpful_count = data ?? Math.max(0, (r.helpful_count || 0) + (undo ? -1 : 1));
          }));
        } catch { /* the caller reports the failure */ }
      },
    }),
  }),
});

export const {
  useGetCitiesQuery,
  useGetNearbyQuery,
  useGetSiteStatsQuery,
  useFindPlacesQuery,
  useApplyAsDoctorMutation,
  useGetPlaceQuery,
  useGetDoctorQuery,
  useGetReviewsQuery,
  useAddReviewMutation,
  useVoteHelpfulMutation,
} = api;
