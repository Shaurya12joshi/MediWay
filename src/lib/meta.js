// Each page's description for search results and link previews (WhatsApp, X, Facebook…). English, as search
// engines index the site's default language. scripts/prerender.mjs writes the same text into the static HTML,
// so crawlers and previews see it without running the app.

export const SITE_DESCRIPTION = 'Healthcare for travellers in India: hospitals, clinics, pharmacies and English-speaking doctors near you, 24/7 emergency rooms, and emergency help that works offline.';

export const PAGE_DESCRIPTIONS = {
  home: SITE_DESCRIPTION,
  search: 'Search hospitals, clinics, pharmacies, labs and doctors near you in India. Filter by open now, 24/7 emergency room, English-speaking staff, card payment and international travel insurance.',
  emergency: 'Emergency help in India: call 112 or 108, share your location, and find the nearest 24/7 emergency rooms. Works offline once you have opened it.',
  join: 'Doctors and clinics in India: list your practice on MediWay for free and reach travellers who need care in their own language.',
  review: 'Rate a doctor, hospital or clinic you visited in India and help the next traveller find good care.',
  auth: 'Sign in to MediWay, or join the waitlist for early access to new features for travellers.',
  admin: 'MediWay admin.',
  notFound: 'This page does not exist on MediWay. Search for doctors and hospitals near you in India, or get emergency help.',
};

// "Hospitals in Varanasi": the city pages (/varanasi/hospitals)
export const cityPageDescription = (what, city) =>
  `${what} in ${city}, India, with opening hours, phone numbers and directions. Built for travellers: filter by English-speaking staff, card payment and international insurance.`;

// A doctor's profile
export function doctorDescription(d) {
  const specialty = Array.isArray(d.specialty) ? d.specialty.join(', ') : d.specialty;
  return [
    `${d.name}${specialty ? `, ${specialty}` : ''}${d.hospital ? ` at ${d.hospital}` : ''}${d.city ? `, ${d.city}` : ''}.`,
    d.languages?.length ? `Speaks ${d.languages.join(', ')}.` : '',
    d.walk_in ? 'Walk-ins welcome.' : '',
    'Hours, directions and patient reviews on MediWay.',
  ].filter(Boolean).join(' ');
}

// Sets the title and description, and the matching link-preview tags, in the page head
export function setPageMeta(title, description) {
  document.title = title;
  for (const [attr, key, value] of [['name', 'description', description], ['property', 'og:description', description], ['property', 'og:title', title]]) {
    let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, key); document.head.appendChild(tag); }
    tag.setAttribute('content', value);
  }
}
