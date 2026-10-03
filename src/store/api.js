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
        return { data: { doctors: docs.data ?? [], places: facilities.data ?? [] } };
      },
      keepUnusedDataFor: 600,
    }),

    getDoctor: build.query({
      queryFn: id => run(supabase.from('doctors').select('*').eq('id', id).single()),
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
  useGetDoctorQuery,
  useGetReviewsQuery,
  useAddReviewMutation,
  useVoteHelpfulMutation,
} = api;
