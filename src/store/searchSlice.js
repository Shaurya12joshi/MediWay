import { createSlice } from '@reduxjs/toolkit';
import { readOrigin } from '../lib/origin';
import { KINDS } from '../pages/search/kinds';

// Search page state. It lives in the store so filters, sort and paging are still there after
// opening a profile and coming back.

export const DEFAULT_FILTERS = {
  type: 'all', specialty: 'all', language: 'all',
  distance: 20, rating: 0,
  openNow: false, walkIn: false, english: false, insurance: false,
};

// Both lists show a page at a time so neither takes over the screen. "All" previews only a few
// places so the doctors below stay in view; choosing a kind starts with a full page of it.
export const PLACES_PREVIEW = 6, PLACES_PAGE = 12, DOCTORS_PAGE = 10;
export const initialPlaces = type => KINDS[type] ? PLACES_PAGE : PLACES_PREVIEW;

function resetPaging(state) {
  state.placesShown = initialPlaces(state.filters.type);
  state.doctorsShown = DOCTORS_PAGE;
}

const searchSlice = createSlice({
  name: 'search',
  initialState: {
    // Where distances are measured from: the user's position once detected, else a city centre
    origin: readOrigin(),
    filters: DEFAULT_FILTERS,
    query: '',
    sortBy: 'rating',
    mapSortBy: 'rating',
    view: 'list',
    placesShown: PLACES_PREVIEW,
    doctorsShown: DOCTORS_PAGE,
    // Directions drawer: the doctor it's open for (a copy, so changing filters doesn't empty it),
    // the travel mode, and the road route once known
    dirDoctor: null,
    dirMode: 'drive',
    route: null,
    saved: [],
  },
  reducers: {
    setOrigin(state, { payload }) {
      state.origin = payload;
      resetPaging(state);
    },
    setFilter(state, { payload: { key, value } }) {
      state.filters[key] = value;
      resetPaging(state);
    },
    toggleOption(state, { payload: key }) {
      state.filters[key] = !state.filters[key];
      resetPaging(state);
    },
    resetFilters(state) {
      state.filters = DEFAULT_FILTERS;
      state.query = '';
      resetPaging(state);
    },
    setQuery(state, { payload }) {
      state.query = payload;
      resetPaging(state);
    },
    setSort(state, { payload }) { state.sortBy = payload; },
    setMapSort(state, { payload }) { state.mapSortBy = payload; },
    setView(state, { payload }) { state.view = payload; },
    morePlaces(state) { state.placesShown += PLACES_PAGE; },
    fewerPlaces(state) { state.placesShown = initialPlaces(state.filters.type); },
    moreDoctors(state) { state.doctorsShown += DOCTORS_PAGE; },
    fewerDoctors(state) { state.doctorsShown = DOCTORS_PAGE; },
    openDirections(state, { payload: doctor }) {
      state.dirDoctor = doctor;
      state.dirMode = 'drive';
      state.route = null;
    },
    closeDirections(state) {
      state.dirDoctor = null;
      state.route = null;
    },
    setDirMode(state, { payload }) { state.dirMode = payload; },
    // Travel time and distance on real roads, for the doctor the drawer is open for
    routeFound(state, { payload }) {
      if (payload.doctorId === state.dirDoctor?.id) state.route = payload;
    },
    toggleSaved(state, { payload: id }) {
      const i = state.saved.indexOf(id);
      if (i === -1) state.saved.push(id); else state.saved.splice(i, 1);
    },
  },
});

export const {
  setOrigin, setFilter, toggleOption, resetFilters, setQuery, setSort, setMapSort, setView,
  morePlaces, fewerPlaces, moreDoctors, fewerDoctors,
  openDirections, closeDirections, setDirMode, routeFound, toggleSaved,
} = searchSlice.actions;
export default searchSlice.reducer;
