import { createSlice } from '@reduxjs/toolkit';
import { applyLanguage, detectLanguage } from '../i18n';

// The visitor's own settings. The language starts as the phone's (see detectLanguage) and is
// applied before the first render so the page never flashes in English.
const initialLang = detectLanguage();
applyLanguage(initialLang);

const prefsSlice = createSlice({
  name: 'prefs',
  initialState: { lang: initialLang },
  reducers: {
    languageChanged(state, { payload }) { state.lang = payload; },
  },
});

// Switch text and page direction first, then re-render everything that shows text
export const setLanguage = lang => dispatch => {
  applyLanguage(lang, true);
  dispatch(prefsSlice.actions.languageChanged(lang));
};

export default prefsSlice.reducer;
