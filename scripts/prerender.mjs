// Runs after `vite build`. Writes real HTML for the pages search engines should index:
//   /<city>/hospitals, /clinics, /pharmacies, /labs, /doctors, /emergency   (every launched city)
//   /doctor/<id>                                                              (every doctor)
// as <path>.html files.
// plus sitemap.xml and robots.txt. Each page is the app's index.html with its own title,
// description, canonical link, JSON-LD and a plain list of the places, so it reads fine
// without JavaScript. React replaces that list with the live search page when it starts.
//
// Reads public data with the anon key, the same as the browser. Never fails the build:
// without Supabase it just leaves the single-page app as it is.
//
//   node scripts/prerender.mjs          (npm run build does this)
//   SITE_URL=https://example.com node scripts/prerender.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_DESCRIPTIONS, doctorDescription } from '../src/lib/meta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MAX_LISTED = 150; // places written into one category page

// Netlify sets URL to the site's main address; .env works locally
function readEnv() {
  const env = {};
  const file = join(ROOT, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...env, ...process.env };
}

const env = readEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SITE = (env.SITE_URL || env.URL || '').replace(/\/$/, '');

// The same categories as src/pages/search/CityPage.jsx
const CATEGORIES = {
  hospitals: { kind: 'hospital', title: 'Hospitals', about: 'hospitals' },
  clinics: { kind: 'clinic', title: 'Clinics', about: 'clinics' },
  pharmacies: { kind: 'pharmacy', title: 'Pharmacies', about: 'pharmacies and chemists' },
  labs: { kind: 'lab', title: 'Diagnostic labs', about: 'diagnostic and pathology labs' },
  doctors: { doctors: true, title: 'Doctors', about: 'doctors' },
  emergency: { er24: true, title: '24/7 emergency rooms', about: 'hospitals with a 24-hour emergency room' },
};
const SCHEMA_TYPE = { hospital: 'Hospital', clinic: 'MedicalClinic', pharmacy: 'Pharmacy', lab: 'DiagnosticLab' };
const DETAILS = {
  intl_insurance: 'International insurance / cashless', accepts_cards: 'Cards accepted',
  english_desk: 'English at front desk', travel_clinic: 'Travel clinic', female_doctor: 'Female doctor',
};

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Every row of a table, 1000 at a time (PostgREST's page limit)
async function all(path) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`${path}&limit=1000&offset=${from}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside <script> must not be able to close the tag
const ldJson = data => JSON.stringify(data).replace(/</g, '\\u003c');
const absolute = path => (SITE ? SITE + path : path);

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function hoursText(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return '';
  return schedule.map(s => `${(s.days ?? []).map(d => DAY[d]).join(', ')} ${s.open}–${s.close}`).join('; ');
}

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

// One page: the built index.html with this page's head and a readable body
function page({ path, title, description, jsonLd, body }) {
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    SITE && `<link rel="canonical" href="${esc(absolute(path))}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="MediWay">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    SITE && `<meta property="og:url" content="${esc(absolute(path))}">`,
    jsonLd && `<script type="application/ld+json">${ldJson(jsonLd)}</script>`,
  ].filter(Boolean).join('\n  ');

  // The app's default description goes; this page's comes in with the title
  let html = template
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace(/<title>[\s\S]*?<\/title>/, head);
  if (!html.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty #root');
  // App pages with no static content: just the head (the app draws the page)
  if (body) html = html.replace('<div id="root"></div>', `<div id="root"><main style="max-width:860px;margin:0 auto;padding:32px 20px;font-family:'DM Sans',system-ui,sans-serif;line-height:1.5">${body}</main></div>`);

  // /varanasi/hospitals.html: served at /varanasi/hospitals with no trailing-slash redirect
  const file = join(DIST, `${path}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const nav = city => `<nav style="font-size:14px;margin-bottom:18px"><a href="/">MediWay</a> › <a href="/${city.slug}/hospitals">${esc(city.name)}</a> · ${
  Object.entries(CATEGORIES).map(([slug, c]) => `<a href="/${city.slug}/${slug}">${esc(c.title)}</a>`).join(' · ')} · <a href="/emergency">Emergency help</a></nav>`;

const EMERGENCY_NOTE = '<p><strong>In an emergency call 112</strong> (police, fire, ambulance) or <strong>108</strong> (ambulance). Free from any phone in India.</p>';

function placeItem(p) {
  const badges = [
    p.er24 === true && '24/7 emergency room',
    ...Object.entries(DETAILS).filter(([k]) => p[k] === true).map(([, label]) => label),
  ].filter(Boolean);
  const hours = p.er24 === true ? 'Open 24/7' : hoursText(p.schedule);
  return `<li style="margin-bottom:14px"><strong>${esc(p.name)}</strong>${badges.length ? ` <small>(${esc(badges.join(' · '))})</small>` : ''}<br>
    ${esc(p.address || '')}${p.phone ? ` · <a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : ''}${hours ? `<br><small>${esc(hours)}</small>` : ''}</li>`;
}

function placeLd(p) {
  return {
    '@type': SCHEMA_TYPE[p.kind] ?? 'MedicalOrganization',
    name: p.name,
    ...(p.address && { address: p.address }),
    ...(p.phone && { telephone: p.phone }),
    ...(p.website && { url: p.website }),
    geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng },
    ...(p.er24 === true && { openingHours: 'Mo-Su 00:00-23:59' }),
  };
}

function doctorItem(d) {
  return `<li style="margin-bottom:14px"><a href="/doctor/${d.id}"><strong>${esc(d.name)}</strong></a> · ${esc((d.specialty ?? []).join(', '))}<br>
    ${esc([d.hospital, d.hospital_address].filter(Boolean).join(', '))}${d.languages?.length ? `<br><small>Speaks ${esc(d.languages.join(', '))}</small>` : ''}</li>`;
}

function doctorLd(d) {
  return {
    '@type': 'Physician',
    name: d.name,
    ...(SITE && { url: absolute(`/doctor/${d.id}`) }),
    ...(d.specialty?.length && { medicalSpecialty: d.specialty }),
    ...(d.hospital_address && { address: d.hospital_address }),
    ...(d.phone && { telephone: d.phone }),
    ...(d.languages?.length && { knowsLanguage: d.languages }),
    ...(d.lat && { geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng } }),
    ...(d.reviews > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: d.rating, reviewCount: d.reviews } }),
  };
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('Run vite build first');
  if (!SUPABASE_URL || !ANON_KEY) {
    console.warn('prerender: no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, skipping (the app still works)');
    return;
  }
  if (!SITE) console.warn('prerender: no SITE_URL or URL set, so no canonical links or sitemap');

  const cities = await rest('cities?select=slug,name,state&launched=eq.true&order=created_at');
  const urls = ['/', '/search', '/emergency', '/join'];
  let pages = 0;

  for (const city of cities) {
    const where = `city=eq.${encodeURIComponent(city.name)}`;
    // select=* so new columns (traveller details) appear once their migration is run
    const places = await all(`hospitals?select=*&${where}&order=name`);
    const doctors = await all(`doctors?select=*&${where}&order=rating.desc.nullslast`);
    const place = `${city.name}${city.state ? `, ${city.state}` : ''}`;

    for (const [slug, c] of Object.entries(CATEGORIES)) {
      const path = `/${city.slug}/${slug}`;
      const list = c.doctors ? doctors
        : c.er24 ? places.filter(p => p.er24 === true)
        : places.filter(p => p.kind === c.kind)
          // Places travellers can act on first: 24/7, then with hours, then with a phone
          .sort((a, b) => (b.er24 === true) - (a.er24 === true) || !!b.schedule - !!a.schedule || !!b.phone - !!a.phone);
      const shown = list.slice(0, MAX_LISTED);
      const title = `${c.title} in ${city.name} | MediWay`;
      const description = list.length
        ? `${list.length} ${c.about} in ${place}, with opening hours, phone numbers and directions. Built for travellers: filter by English-speaking staff, card payment and international insurance.`
        : `Find ${c.about} in ${place} on MediWay: opening hours, phone numbers and directions for travellers.`;

      page({
        path, title, description,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `${c.title} in ${city.name}`,
          numberOfItems: list.length,
          itemListElement: shown.map((x, i) => ({ '@type': 'ListItem', position: i + 1, item: c.doctors ? doctorLd(x) : placeLd(x) })),
        },
        body: `${nav(city)}<h1>${esc(c.title)} in ${esc(city.name)}</h1>
          <p>${esc(description)}</p>${c.er24 ? EMERGENCY_NOTE : ''}
          <ul style="padding-left:18px">${shown.map(c.doctors ? doctorItem : placeItem).join('')}</ul>
          ${list.length > shown.length ? `<p>And ${list.length - shown.length} more: <a href="/search">search all of ${esc(city.name)}</a>.</p>` : ''}`,
      });
      urls.push(path);
      pages++;
    }

    for (const d of doctors) {
      const path = `/doctor/${d.id}`;
      const specialty = (d.specialty ?? []).join(', ');
      const description = doctorDescription({ ...d, city: city.name });
      page({
        path,
        title: `${d.name}${specialty ? `, ${specialty}` : ''} in ${city.name} | MediWay`,
        description,
        jsonLd: { '@context': 'https://schema.org', ...doctorLd(d) },
        body: `${nav(city)}<h1>${esc(d.name)}</h1>
          <p>${esc(specialty)}${d.experience ? ` · ${esc(d.experience)} years' experience` : ''}</p>
          <p>${esc([d.hospital, d.hospital_address].filter(Boolean).join(', '))}</p>
          ${d.languages?.length ? `<p>Languages: ${esc(d.languages.join(', '))}</p>` : ''}
          ${hoursText(d.schedule) ? `<p>Hours: ${esc(hoursText(d.schedule))}</p>` : ''}
          ${d.reviews > 0 ? `<p>Rated ${esc(d.rating)} from ${esc(d.reviews)} reviews.</p>` : ''}
          ${d.phone ? `<p>Phone: <a href="tel:${esc(d.phone.replace(/[^\d+]/g, ''))}">${esc(d.phone)}</a></p>` : ''}`,
      });
      urls.push(path);
      pages++;
    }
  }

  // The app's own pages: their title and description in the static HTML, for link previews and crawlers
  for (const [path, title, key] of [
    ['/search', 'Find care · MediWay', 'search'],
    ['/emergency', 'Emergency help · MediWay', 'emergency'],
    ['/join', 'Join as a doctor or clinic · MediWay', 'join'],
  ]) { page({ path, title, description: PAGE_DESCRIPTIONS[key] }); pages++; }

  if (SITE) {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(absolute(u))}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
  }
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *
Disallow: /admin
Disallow: /auth
Disallow: /review
${SITE ? `\nSitemap: ${absolute('/sitemap.xml')}\n` : ''}`);

  console.log(`prerender: ${pages} pages for ${cities.map(c => c.name).join(', ') || 'no launched cities'}${SITE ? ' + sitemap.xml' : ''}`);
}

main().catch(error => {
  // A failed prerender leaves a working single-page app, so it never fails the deploy
  console.warn('prerender skipped:', error.message);
});
