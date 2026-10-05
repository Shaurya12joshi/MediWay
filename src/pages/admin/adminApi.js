import { supabase } from '../../lib/supabase';
import { api, run, toError } from '../../store/api';

// Admin-only endpoints, added to the shared API when the admin page loads

export const PLACES_PAGE = 40, HOURS_PAGE = 20;
// Questions for travellers, asked on the same call as the hours
export const DETAIL_COLUMNS = ['intl_insurance', 'accepts_cards', 'english_desk', 'travel_clinic', 'female_doctor'];

// Imported places: never auto-reviewed, or held back by the rules in auto_review_places()
const needsALook = q => q.eq('status', 'pending').or('review_note.is.null,review_note.like."held:*"');

// Live places with no hours yet, or a hospital with unknown ER status — and nobody has confirmed it by phone
const needsHours = q => q
  .or('schedule.is.null,schedule.eq.[],and(kind.eq.hospital,er24.is.null)')
  .or('hours_source.is.null,hours_source.neq.phone');

// Doctors read from websites by scripts/import-doctors.mjs (20261006_doctor_import.sql)
function doctorsQuery({ city, view }, select, opts) {
  let q = supabase.from('doctors_staging').select(select, opts).eq('city', city);
  if (view === 'review') q = q.eq('status', 'pending').or('review_note.is.null,review_note.like."held:*"');
  if (view === 'auto') q = q.eq('status', 'approved').like('review_note', 'auto:*');
  return q;
}

function placesQuery({ city, kind, view }, select, opts) {
  let q = supabase.from('places_staging').select(select, opts).eq('city', city);
  if (view === 'review') q = needsALook(q);
  if (view === 'low') q = q.eq('status', 'pending').eq('review_note', 'hidden: low confidence');
  if (view === 'auto') q = q.eq('status', 'approved').like('review_note', 'auto:*');
  if (kind !== 'all') q = q.eq('kind', kind);
  return q;
}

// Filled automatically by scripts/enrich-hours.mjs (hours, or a hospital's ER answer on its own)
const AUTO_SOURCES = ['osm', 'website', 'website-ai', 'name'];

// Hours views: 'suggestions' (the script found something but wasn't sure), 'call' (nothing found:
// the phone queue) and 'auto' (live automatic hours, to spot-check or remove)
// Hospitals this close to a tourist area (cities.areas) are the ones worth a phone call
export const NEAR_TOURISTS_KM = 2; // same as scripts/lib/city.mjs

// `tourist`: use hospitals.tourist_km (20261005_city_launch.sql); false before that migration is run
function hoursQuery({ cityName, kind, phoneOnly, nearTourists, view }, select, opts, tourist = true) {
  let q = supabase.from('hospitals').select(select, opts).eq('city', cityName ?? '').eq('kind', kind);
  if (view === 'suggestions') return needsHours(q).or('suggested_schedule.not.is.null,suggested_er24.not.is.null');
  if (view === 'auto') return q.or(`hours_source.in.(${AUTO_SOURCES.join(',')}),er24_auto.is.true`);
  q = needsHours(q).is('suggested_schedule', null).is('suggested_er24', null);
  if (tourist && nearTourists && kind === 'hospital') q = q.lte('tourist_km', NEAR_TOURISTS_KM);
  return phoneOnly ? q.not('phone', 'is', null) : q;
}

const HOURS_ORDER = {
  suggestions: [['name']],
  call: [['hours_checked_at', { ascending: true, nullsFirst: true }], ['name']], // places nobody has tried first
  auto: [['hours_checked_at', { ascending: false }], ['name']],                 // newest first
};
// Nearest to tourists first, then the order above
const TOURIST_ORDER = ['tourist_km', { ascending: true, nullsFirst: false }];

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
  .enhanceEndpoints({ addTagTypes: ['AdminCounts', 'PendingReviews', 'Places', 'PlacesSummary', 'HoursSummary', 'Applications', 'Doctors', 'DoctorsSummary'] })
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
          const [reviews, places, hours, applications, doctors] = await Promise.all([
            supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('proof_status', 'pending'),
            needsALook(supabase.from('places_staging').select('id', { count: 'exact', head: true })),
            needsHours(supabase.from('hospitals').select('id', { count: 'exact', head: true })),
            supabase.from('doctor_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('doctors_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending').or('review_note.is.null,review_note.like."held:*"'),
          ]);
          return { data: { reviews: reviews.count ?? 0, places: places.count ?? 0, hours: hours.count ?? 0, applications: applications.count ?? 0, doctors: doctors.count ?? 0 } };
        },
        providesTags: ['AdminCounts'],
      }),

      adminCities: build.query({
        queryFn: () => run(supabase.from('cities').select('slug, name, launched').order('created_at')),
      }),

      // ---------- Review proofs ----------

      // Reviews of doctors and of places (place reviews need 20261004_tourist_features.sql)
      pendingReviews: build.query({
        async queryFn() {
          const query = select => supabase.from('reviews').select(select)
            .eq('proof_status', 'pending').order('proof_submitted_at', { ascending: true });
          let result = await query('*, doctors(name, hospital), hospitals(name, address)');
          if (result.error) result = await query('*, doctors(name, hospital)'); // migration not run yet
          return result.error ? { error: toError(result.error) } : { data: result.data };
        },
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

      // ---------- Imported doctors ----------

      doctorsSummary: build.query({
        queryFn: args => countOf(doctorsQuery(args, 'id', { count: 'exact', head: true })),
        providesTags: ['DoctorsSummary'],
      }),

      doctorsPages: build.infiniteQuery({
        infiniteQueryOptions: pagedOptions,
        async queryFn({ queryArg, pageParam }) {
          const order = queryArg.view === 'auto' ? ['reviewed_at', { ascending: false }] : ['confidence', { ascending: false }];
          const { data, error } = await doctorsQuery(queryArg, '*').order(...order).order('id').range(pageParam, pageParam + PLACES_PAGE - 1);
          if (error) return { error: toError(error) };
          // Where they work, and the existing profile they may duplicate
          const placeIds = [...new Set(data.map(d => d.place_id))], matchIds = [...new Set(data.map(d => d.match_id).filter(Boolean))];
          const [places, matches] = await Promise.all([
            placeIds.length ? supabase.from('hospitals').select('id, name, address').in('id', placeIds) : { data: [] },
            matchIds.length ? supabase.from('doctors').select('id, name, hospital').in('id', matchIds) : { data: [] },
          ]);
          const placeOf = new Map((places.data ?? []).map(p => [p.id, p])), matchOf = new Map((matches.data ?? []).map(d => [d.id, d]));
          return { data: { rows: data.map(d => ({ ...d, place: placeOf.get(d.place_id) ?? null, match: matchOf.get(d.match_id) ?? null })), full: data.length === PLACES_PAGE } };
        },
        providesTags: ['Doctors'],
      }),

      // decision: approve (publish), merge (into the existing profile) or reject
      reviewDoctor: build.mutation({
        queryFn: ({ id, decision }) => run(supabase.rpc('review_doctors', { doctor_ids: [id], decision })),
        onQueryStarted: removeRowOnSuccess('doctorsPages'),
        invalidatesTags: (_r, error) => error ? [] : ['DoctorsSummary', 'AdminCounts'],
      }),

      unpublishDoctor: build.mutation({
        queryFn: ({ publishedId }) => run(supabase.rpc('unpublish_doctor', { doctor_id: publishedId })),
        onQueryStarted: removeRowOnSuccess('doctorsPages'),
        invalidatesTags: (_r, error) => error ? [] : ['DoctorsSummary', 'AdminCounts'],
      }),

      autoReviewDoctors: build.mutation({
        queryFn: ({ city, dryRun }) => run(supabase.rpc('auto_review_doctors', { city_slug: city, dry_run: dryRun })),
        invalidatesTags: (_r, error, { dryRun }) => error || dryRun ? [] : ['Doctors', 'DoctorsSummary', 'AdminCounts'],
      }),

      // ---------- Hours ----------
      // scripts/enrich-hours.mjs fills what it can (see 20261003_auto_hours.sql); people handle the rest.
      // Confirming goes through update_place_hours(); confirmed hours are never overwritten by a script.

      hoursSummary: build.query({
        async queryFn(args) {
          const result = await countOf(hoursQuery(args, 'id', { count: 'exact', head: true }));
          return result.error ? countOf(hoursQuery(args, 'id', { count: 'exact', head: true }, false)) : result;
        },
        providesTags: ['HoursSummary'],
      }),

      hoursPages: build.infiniteQuery({
        infiniteQueryOptions: pagedOptions,
        async queryFn({ queryArg, pageParam }) {
          const page = (columns, tourist) => {
            let q = hoursQuery(queryArg, 'id, name, kind, address, phone, website, lat, lng, er24, er24_auto, schedule, ' +
              'hours_source, hours_checked_at, hours_evidence, suggested_schedule, suggested_er24, suggestion_evidence' + columns, undefined, tourist);
            const order = HOURS_ORDER[queryArg.view];
            for (const [column, options] of tourist && queryArg.view !== 'auto' ? [TOURIST_ORDER, ...order] : order) q = q.order(column, options);
            return q.range(pageParam, pageParam + HOURS_PAGE - 1);
          };
          // Traveller details and tourist distances come with 20261004_tourist_features.sql and
          // 20261005_city_launch.sql; the queue works without them
          let { data, error } = await page(`, ${DETAIL_COLUMNS.join(', ')}, tourist_area, tourist_km`, true);
          if (error) ({ data, error } = await page(`, ${DETAIL_COLUMNS.join(', ')}`, false));
          if (error) ({ data, error } = await page('', false));
          if (error) return { error: toError(error) };
          return { data: { rows: data, full: data.length === HOURS_PAGE } };
        },
      }),

      // outcome: 'verified' (a person confirmed: by phone, by accepting a suggestion, or "looks right")
      // with a schedule and/or ER answer, or 'unreachable'
      saveHours: build.mutation({
        queryFn: ({ id, outcome, schedule, er24 }) => run(supabase.rpc('update_place_hours', { place_id: id, outcome, new_schedule: schedule, has_er24: er24 })),
        onQueryStarted: removeRowOnSuccess('hoursPages'),
        invalidatesTags: (_r, error) => error ? [] : ['HoursSummary', 'AdminCounts'],
      }),

      // Traveller details an admin got on the phone: { intl_insurance: true, accepts_cards: null, … }
      saveDetails: build.mutation({
        queryFn: ({ id, details }) => run(supabase.rpc('update_place_details', { place_id: id, details })),
      }),

      // ---------- Doctor applications (the public "Join MediWay" form) ----------

      applications: build.query({
        queryFn: () => run(supabase.from('doctor_applications').select('*, hospitals(name, address)')
          .eq('status', 'pending').order('created_at', { ascending: true })),
        providesTags: ['Applications'],
      }),

      // Approving creates the doctor at the chosen listed place
      decideApplication: build.mutation({
        queryFn: ({ id, approve, placeId }) => run(approve
          ? supabase.rpc('approve_doctor_application', { application_id: id, at_place: placeId })
          : supabase.rpc('reject_doctor_application', { application_id: id })),
        invalidatesTags: (_r, error) => error ? [] : ['Applications', 'AdminCounts'],
      }),

      // A wrong suggestion: drop it, the place moves to the phone queue
      dismissSuggestion: build.mutation({
        queryFn: ({ id }) => run(supabase.rpc('dismiss_hours_suggestion', { place_id: id })),
        onQueryStarted: removeRowOnSuccess('hoursPages'),
        invalidatesTags: (_r, error) => error ? [] : ['HoursSummary'],
      }),

      // Wrong automatic hours: off the site and back to the phone queue; scripts won't refill them
      removeAutoHours: build.mutation({
        queryFn: ({ id }) => run(supabase.rpc('remove_auto_hours', { place_id: id })),
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
  useDismissSuggestionMutation,
  useRemoveAutoHoursMutation,
  useSaveDetailsMutation,
  useDoctorsSummaryQuery,
  useDoctorsPagesInfiniteQuery,
  useReviewDoctorMutation,
  useUnpublishDoctorMutation,
  useAutoReviewDoctorsMutation,
  useApplicationsQuery,
  useDecideApplicationMutation,
} = adminApi;
