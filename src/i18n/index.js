// The site's languages. Pages call t('key') for their text; the language follows the phone's
// unless the visitor picks another, and is remembered on this device.
import { useSelector } from 'react-redux';
import en from './locales/en';
import fr from './locales/fr';
import de from './locales/de';
import es from './locales/es';
import ja from './locales/ja';
import ru from './locales/ru';
import he from './locales/he';

// [code, name in that language]
export const LANGUAGES = [
  ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'],
  ['ja', '日本語'], ['ru', 'Русский'], ['he', 'עברית'],
];
const DICTIONARIES = { en, fr, de, es, ja, ru, he };
const RIGHT_TO_LEFT = new Set(['he']);
const KEY = 'mw.lang';

let current = 'en';

export function detectLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (DICTIONARIES[saved]) return saved;
  } catch { /* storage blocked */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (code === 'iw') return 'he'; // old code for Hebrew
    if (DICTIONARIES[code]) return code;
  }
  return 'en';
}

// Switches the text, the page's lang/dir, and remembers the choice. Re-rendering is the store's job.
export function applyLanguage(lang, remember = false) {
  current = DICTIONARIES[lang] ? lang : 'en';
  document.documentElement.lang = current;
  document.documentElement.dir = RIGHT_TO_LEFT.has(current) ? 'rtl' : 'ltr';
  if (remember) {
    try { localStorage.setItem(KEY, current); } catch { /* storage blocked */ }
  }
}

export const currentLanguage = () => current;

export function t(key, vars) {
  const text = DICTIONARIES[current][key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m)) : text;
}

// Components that show text call this, so they re-render when the language changes
export function useT() {
  useSelector(s => s.prefs.lang);
  return t;
}
