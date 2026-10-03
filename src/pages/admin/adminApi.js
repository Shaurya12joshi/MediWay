import { supabase } from '../../lib/supabase';
import { api, run, toError } from '../../store/api';

// Admin-only endpoints, added to the shared API when the admin page loads

export const PLACES_PAGE = 40, HOURS_PAGE = 20;

// Imported places: never auto-reviewed, or held back by the rules in auto_review_places()
const needsALook = q => q.eq('status', 'pending').or('review_note.is.null,review_note.like."held:*"');

// Live places with no hours yet, or a hospital with unknown ER status — and nobody has confirmed it by phone
const needsHours = q => q
  .or('schedule.is.null,schedule.eq.[],and(kind.eq.hospital,er24.is.null)')
  .or('hours_source.is.null,hours_source.neq.phone');

function placesQuery({ city, kind, view }, select, opts) {
  let q = supabase.from('places_staging').select(select, opts).eq('city', city);
  if (view === 'review') q = needsALook(q);
  if (view === 'low') q = q.eq('status', 'pending').eq('review_note', 'hidden: low confidence');
  if (view === 'auto') q = q.eq('status', 'approved').like('review_note', 'auto:*');
  if (kind !== 'all') q = q.eq('kind', kind);
  return q;
}

function hoursQuery({ cityName, kind, phoneOnly }, select, opts) {
  let q = needsHours(supabase.from('hospitals').select(select, opts)).eq('city', cityName ?? '').eq('kind', kind);
  if (phoneOnly) q = q.not('phone', 'is', null);
  return q;
}

async function countOf(request) {
  const { count, error } = await request;
  return error ? { error: toError(error) } : { data: count ?? 0 };
}

// "Load more" pages. A page's rows shrink as people act on them, so the next offset is the
// number of rows still loaded: everything acted on has left the query.
const pagedOptions = {
  initialPageParam: 0,
  getNextPageParam: (lastPage, allPages) => lastPage.full ? allPages.reduce((n, p) => n + p.rows.length, 0) : undefined,
};

// After an action succeeds, drop that row from the loaded pages
function removeRowOnSuccess(endpoint) {
  return async ({ id, listArgs }, { dispatch, queryFulfilled }) => {
    try {
      await queryFulfilled;
      dispatch(api.util.updateQueryData(endpoint, listArgs, data => {
        for (const page of data.pages) page.rows = page.rows.filter(r => r.id !== id);
      }));
    } catch { /* the caller reports the failure */ }
  };
}

const adminApi = api
  .enhanceEndpoints({ addTagTypes: ['AdminCounts', 'PendingReviews', 'Places', 'PlacesSummary', 'HoursSummary'] })
  .injectEndpoints({
    endpoints: build => ({

      isAdmin: build.query({
        async queryFn(userId) {
          const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
          return { data: Boolean(data) };
        },
      }),

      // The numbers on the tabs
      adminCounts: build.query({
        async queryFn() {
          const [reviews, places, hours] = await Promise.all([
            supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('proof_status', 'pending'),
            needsALook(supabase.from('places_staging').select('id', { count: 'exact', head: true })),
            needsHours(supabase.from('hospitals').select('id', { count: 'exact', head: true })),
          ]);
          return { data: { reviews: reviews.count ?? 0, places: places.count ?? 0, hours: hours.count ?? 0 } };
        },
        providesTags: ['AdminCounts'],
      }),

      adminCities: build.query({
        queryFn: () => run(supabase.from('cities').select('slug, name, launched').order('created_at')),
      }),

      // ---------- Review proofs ----------

      pendingReviews: build.query({
        queryFn: () => run(supabase
          .from('reviews')
          .select('*, doctors(name, hospital)')
          .eq('proof_status', 'pending')
          .order('proof_submitted_at', { ascending: true })),
        providesTags: ['PendingReviews'],
      }),

      // Signed for 5 minutes; dropped from the cache before then
      proofUrl: build.query({
        async queryFn(path) {
          const { data, error } = await supabase.storage.from('review-proofs').createSignedUrl(path, 300);
          return error ? { error: toError(error) } : { data: data?.signedUrl ?? null };
        },
        keepUnusedDataFor: 240,
      }),

      decideReview: build.mutation({
        queryFn: ({ id, approve }) => run(supabase.from('reviews')
          .update(approve ? { verified: true, proof_status: 'approved' } : { proof_status: 'rejected' })
          .eq('id', id)),
        invalidatesTags: (_r, error) => error ? [] : ['PendingReviews', 'AdminCounts'],
      }),

      // ---------- Imported places ----------
      // Rows come from scripts/import-places.mjs. "Auto-review" applies the rules in auto_review_places():
      // clear cases are published or merged, the rest is held with a reason. People only see what's held.

      placesSummary: build.query({
        queryFn: args => countOf(placesQuery(args, 'id', { count: 'exact', head: true })),
        providesTags: ['PlacesSummary'],
      }),

      placesPages: build.infiniteQuery({
        infiniteQueryOptions: pagedOptions,
        async queryFn({ queryArg, pageParam }) {
          const order = queryArg.view === 'auto' ? ['reviewed_at', { ascending: false }] : ['confidence', { ascending: false }];
          const { data, error } = await placesQuery(queryArg, '*').order(...order).order('id')
            .range(pageParam, pageParam + PLACES_PAGE - 1);
          if (error) return { error: toError(error) };

          // Names of the live listings these might duplicate
          const matchIds = [...new Set(data.map(p => p.match_id).filter(Boolean))];
          const names = {};
          if (matchIds.length) {
            const { data: rows } = await supabase.from('hospitals').select('id, name').in('id', matchIds);
            for (const r of rows || []) names[r.id] = r.name;
          }
          return { data: { rows: data.map(p => ({ ...p, match_name: names[p.match_id] ?? null })), full: data.length === PLACES_PAGE } };
        },
        providesTags: ['Places'],
      }),

      // decision: approve (publish), merge (into the existing listing) or reject
      reviewPlace: build.mutation({
        queryFn: ({ id, decision }) => run(supabase.rpc('review_places', { place_ids: [id], decision })),
        onQueryStarted: removeRowOnSuccess('placesPages'),
        invalidatesTags: (_r, error) => error ? [] : ['PlacesSummary', 'AdminCounts'],
      }),

      // The undo for auto-review: take a published place off the site
      unpublishPlace: build.mutation({
        queryFn: ({ publishedId }) => run(supabase.rpc('unpublish_place', { place_id: publishedId })),
        onQueryStarted: removeRowOnSuccess('placesPages'),
        invalidatesTags: (_r, error) => error ? [] : ['PlacesSummary', 'AdminCounts'],
      }),

      autoReview: build.mutation({
        queryFn: ({ city, dryRun }) => run(supabase.rpc('auto_review_places', { city_slug: city, dry_run: dryRun })),
        invalidatesTags: (_r, error, { dryRun }) => error || dryRun ? [] : ['Places', 'PlacesSummary', 'AdminCounts'],
      }),

      // ---------- Hours: phone queue ----------
      // Saving goes through update_place_hours(); phone-confirmed hours are never overwritten by a script.

      hoursSummary: build.query({
        queryFn: args => countOf(hoursQuery(args, 'id', { count: 'exact', head: true })),
        providesTags: ['HoursSummary'],
      }),

      // Places nobody has tried come first
      hoursPages: build.infiniteQuery({
        infiniteQueryOptions: pagedOptions,
        async queryFn({ queryArg, pageParam }) {
          const { data, error } = await hoursQuery(queryArg, 'id, name, kind, address, phone, lat, lng, er24, schedule, hours_source, hours_checked_at')
            .order('hours_checked_at', { ascending: true, nullsFirst: true }).order('name')
            .range(pageParam, pageParam + HOURS_PAGE - 1);
          if (error) return { error: toError(error) };
          return { data: { rows: data, full: data.length === HOURS_PAGE } };
        },
      }),

      // outcome: 'verified' (with a schedule and/or ER answer) or 'unreachable'
      saveHours: build.mutation({
        queryFn: ({ id, outcome, schedule, er24 }) => run(supabase.rpc('update_place_hours', { place_id: id, outcome, new_schedule: schedule, has_er24: er24 })),
        onQueryStarted: removeRowOnSuccess('hoursPages'),
        invalidatesTags: (_r, error) => error ? [] : ['HoursSummary', 'AdminCounts'],
      }),
    }),
  });

export const {
  useIsAdminQuery,
  useAdminCountsQuery,
  useAdminCitiesQuery,
  usePendingReviewsQuery,
  useProofUrlQuery,
  useDecideReviewMutation,
  usePlacesSummaryQuery,
  usePlacesPagesInfiniteQuery,
  useReviewPlaceMutation,
  useUnpublishPlaceMutation,
  useAutoReviewMutation,
  useHoursSummaryQuery,
  useHoursPagesInfiniteQuery,
  useSaveHoursMutation,
} = adminApi;
