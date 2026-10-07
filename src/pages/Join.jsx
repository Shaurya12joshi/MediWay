import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useApplyAsDoctorMutation, useFindPlacesQuery, useGetCitiesQuery } from '../store/api';
import Footer from '../components/Footer';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';
import { PAGE_DESCRIPTIONS } from '../lib/meta';

// Doctors and clinics add themselves. Nothing goes live until the MediWay team checks the
// registration number and approves it in Admin -> Applications.

const SPECIALTIES = ['General Physician', 'Cardiologist', 'Dermatologist', 'ENT', 'Orthopedic', 'Pediatric',
  'Gynecologist', 'Dentist', 'Ophthalmologist', 'Psychiatrist', 'Neurologist', 'Gastroenterologist', 'Pulmonologist', 'Other'];
const LANGUAGES = ['English', 'Hindi', 'French', 'German', 'Spanish', 'Italian', 'Russian', 'Japanese', 'Chinese', 'Korean', 'Hebrew', 'Tamil', 'Kannada', 'Bengali', 'Telugu', 'Marathi'];

const INPUT = 'w-full border-[1.5px] border-[#E2E8F0] rounded-[10px] px-3.5 py-2.5 text-[14px] bg-white outline-none focus:border-[#D0423A] font-sans';
const LABEL = 'block text-[13px] font-semibold text-[#1E293B] mb-1.5';
const HINT = 'text-[12px] text-[#94A3B8] mt-1';
const CHIP = 'px-3 py-1.5 rounded-lg text-[13px] border-[1.5px] cursor-pointer font-sans transition-all';

function YesNo({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#F1F5F9] last:border-b-0">
      <span className="text-[14px] text-[#1E293B]">{label}</span>
      <div className="flex gap-1.5 shrink-0">
        {[[true, 'Yes'], [false, 'No']].map(([v, text]) => (
          <button key={text} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}
            className={`${CHIP} ${value === v ? 'border-[#1E293B] bg-[#1E293B] text-white' : 'border-[#E2E8F0] bg-white text-[#64748B]'}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

// "Is your clinic already on MediWay?": linking it puts the doctor at the right spot on the map
export function ClinicPicker({ city, value, onPick, hint = 'Optional. If you can’t find it, fill in the name and address below and we’ll add it.' }) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(text), 250); return () => clearTimeout(id); }, [text]);
  const { data: found = [] } = useFindPlacesQuery(city && debounced.trim().length >= 3 ? { city, text: debounced } : skipToken);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[10px] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1E293B]">{value.name}</p>
          <p className="text-[12px] text-[#64748B] truncate">{value.address || 'Address not listed'}</p>
        </div>
        <button type="button" onClick={() => onPick(null)} className="text-[13px] text-[#D0423A] bg-transparent border-none cursor-pointer font-sans shrink-0">Change</button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" placeholder={city ? 'Start typing your clinic or hospital name' : 'Choose your city first'} disabled={!city}
        value={text} onChange={e => setText(e.target.value)} className={INPUT} aria-label="Find your clinic on MediWay" />
      {found.length > 0 && (
        <ul className="mt-1.5 bg-white border border-[#E2E8F0] rounded-[10px] overflow-hidden">
          {found.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setText(''); }} className="w-full text-start px-3.5 py-2 hover:bg-[#F8FAFC] bg-white border-none border-b border-[#F1F5F9] cursor-pointer font-sans">
                <span className="text-[14px] text-[#1E293B]">{p.name}</span>
                <span className="block text-[12px] text-[#94A3B8] truncate">{p.address || p.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

export default function Join() {
  useTitle('Join as a doctor or clinic · MediWay', PAGE_DESCRIPTIONS.join);
  const { data: cities = [] } = useGetCitiesQuery();
  const [apply, { isLoading: sending }] = useApplyAsDoctorMutation();
  const [form, setForm] = useState({
    name: '', gender: null, specialty: '', qualification: '', registration_number: '', experience_years: '',
    languages: ['English'], city: '', clinic_name: '', clinic_address: '', phone: '', email: '', website: '',
    consult_fee: '', hours_text: '', walk_in: null, intl_insurance: null, accepts_cards: null, notes: '',
  });
  const [clinic, setClinic] = useState(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const toggleLanguage = l => setForm(f => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter(x => x !== l) : [...f.languages, l] }));

  function pickClinic(p) {
    setClinic(p);
    if (p) setForm(f => ({ ...f, clinic_name: p.name, clinic_address: p.address || f.clinic_address }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.languages.length) return setError('Pick at least one language you consult in.');
    const n = v => (String(v).trim() === '' ? null : Number(v));
    const s = v => (String(v).trim() || null);
    const { error } = await apply({
      name: form.name.trim(), gender: form.gender, specialty: form.specialty, qualification: s(form.qualification),
      registration_number: s(form.registration_number), experience_years: n(form.experience_years), languages: form.languages,
      city: form.city, place_id: clinic?.id ?? null, clinic_name: form.clinic_name.trim(), clinic_address: form.clinic_address.trim(),
      phone: form.phone.trim(), email: s(form.email), website: s(form.website), consult_fee: n(form.consult_fee),
      hours_text: s(form.hours_text), walk_in: form.walk_in, intl_insurance: form.intl_insurance, accepts_cards: form.accepts_cards,
      notes: s(form.notes),
    });
    if (error) { console.error(error); setError('Something went wrong sending this. Please try again.'); return; }
    setSent(true);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="font-sans min-h-screen flex flex-col">
      <nav className="sticky top-0 z-[200] bg-[#F5F5F4] border-b border-[#E2E8F0] h-[60px] flex items-center px-4 sm:px-6">
        <div className="max-w-[720px] w-full mx-auto flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 no-underline shrink-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#D6453A] flex items-center justify-center shrink-0"><PinIcon size={16} /></div>
            <span className="font-custom text-[24px] font-bold text-[#1E293B]">MediWay</span>
          </Link>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[720px] mx-auto px-4 sm:px-6 py-8">
        {sent ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h1 className="font-serif text-[24px] text-[#1E293B] mb-2">Thank you, we’ve got it</h1>
            <p className="text-[14px] text-[#64748B] leading-relaxed">We’ll check your registration and call {form.phone} before your profile goes live. That usually takes a few days.</p>
            <Link to="/" className="inline-block mt-5 text-[14px] text-[#D0423A] font-semibold">Back to MediWay</Link>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-[28px] text-[#1E293B] leading-tight">List your practice on MediWay</h1>
            <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
              Travellers and tourists use MediWay to find a doctor they can trust, in a language they speak.
              Listing is free. We check every registration number before a profile goes live.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
              <section className="bg-white border border-[#E2E8F0] rounded-[18px] p-5 sm:p-6 flex flex-col gap-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8]">About you</h2>
                <div>
                  <label htmlFor="j-name" className={LABEL}>Full name</label>
                  <input id="j-name" required placeholder="Dr. Anika Kapoor" value={form.name} onChange={set('name')} className={INPUT} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="j-specialty" className={LABEL}>Specialty</label>
                    <select id="j-specialty" required value={form.specialty} onChange={set('specialty')} className={INPUT}>
                      <option value="" disabled>Choose…</option>
                      {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className={LABEL}>Gender</span>
                    <div className="flex gap-1.5">
                      {[['female', 'Female'], ['male', 'Male']].map(([v, text]) => (
                        <button key={v} type="button" aria-pressed={form.gender === v} onClick={() => set('gender')(form.gender === v ? null : v)}
                          className={`${CHIP} flex-1 ${form.gender === v ? 'border-[#D0423A] bg-[#FDECEA] text-[#D0423A]' : 'border-[#E2E8F0] bg-white text-[#64748B]'}`}>{text}</button>
                      ))}
                    </div>
                    <p className={HINT}>Many women travellers ask for a female doctor.</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="j-reg" className={LABEL}>Medical council registration no.</label>
                    <input id="j-reg" required placeholder="e.g. UPMC 12345" value={form.registration_number} onChange={set('registration_number')} className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="j-exp" className={LABEL}>Years of practice</label>
                    <input id="j-exp" type="number" min="0" max="70" value={form.experience_years} onChange={set('experience_years')} className={INPUT} />
                  </div>
                </div>
                <div>
                  <label htmlFor="j-qual" className={LABEL}>Qualifications</label>
                  <input id="j-qual" placeholder="MBBS, MD (Medicine)" value={form.qualification} onChange={set('qualification')} className={INPUT} />
                </div>
                <div>
                  <span className={LABEL}>Languages you consult in</span>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map(l => (
                      <button key={l} type="button" aria-pressed={form.languages.includes(l)} onClick={() => toggleLanguage(l)}
                        className={`${CHIP} ${form.languages.includes(l) ? 'border-[#D0423A] bg-[#FDECEA] text-[#D0423A]' : 'border-[#E2E8F0] bg-white text-[#64748B]'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="bg-white border border-[#E2E8F0] rounded-[18px] p-5 sm:p-6 flex flex-col gap-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8]">Where patients find you</h2>
                <div>
                  <label htmlFor="j-city" className={LABEL}>City</label>
                  <select id="j-city" required value={form.city} onChange={e => { set('city')(e); setClinic(null); }} className={INPUT}>
                    <option value="" disabled>Choose…</option>
                    {cities.map(c => <option key={c.slug} value={c.name}>{c.name}</option>)}
                  </select>
                  <p className={HINT}>MediWay is live in these cities so far.</p>
                </div>
                <div>
                  <span className={LABEL}>Is your clinic already on MediWay?</span>
                  <ClinicPicker city={form.city} value={clinic} onPick={pickClinic} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="j-clinic" className={LABEL}>Clinic or hospital name</label>
                    <input id="j-clinic" required value={form.clinic_name} onChange={set('clinic_name')} className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="j-phone" className={LABEL}>Phone for appointments</label>
                    <input id="j-phone" type="tel" required placeholder="+91 …" value={form.phone} onChange={set('phone')} className={INPUT} />
                  </div>
                </div>
                <div>
                  <label htmlFor="j-address" className={LABEL}>Address</label>
                  <input id="j-address" required value={form.clinic_address} onChange={set('clinic_address')} className={INPUT} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="j-hours" className={LABEL}>Consultation hours</label>
                    <input id="j-hours" placeholder="Mon–Sat 10–2 & 5–8" value={form.hours_text} onChange={set('hours_text')} className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="j-fee" className={LABEL}>Consultation fee (₹)</label>
                    <input id="j-fee" type="number" min="0" value={form.consult_fee} onChange={set('consult_fee')} className={INPUT} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="j-email" className={LABEL}>Email</label>
                    <input id="j-email" type="email" value={form.email} onChange={set('email')} className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="j-web" className={LABEL}>Website</label>
                    <input id="j-web" type="url" placeholder="https://" value={form.website} onChange={set('website')} className={INPUT} />
                  </div>
                </div>
              </section>

              <section className="bg-white border border-[#E2E8F0] rounded-[18px] p-5 sm:p-6">
                <h2 className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] mb-2">For travellers</h2>
                <YesNo label="Walk-ins welcome" value={form.walk_in} onChange={set('walk_in')} />
                <YesNo label="International travel insurance / cashless" value={form.intl_insurance} onChange={set('intl_insurance')} />
                <YesNo label="Card payment" value={form.accepts_cards} onChange={set('accepts_cards')} />
                <div className="mt-3">
                  <label htmlFor="j-notes" className={LABEL}>Anything else travellers should know?</label>
                  <textarea id="j-notes" rows="3" value={form.notes} onChange={set('notes')} className={INPUT} />
                </div>
              </section>

              {error && <p role="alert" className="text-[13px] text-[#D0423A]">{error}</p>}
              <button type="submit" disabled={sending} className="bg-[#D0423A] hover:bg-[#B8362F] text-white border-none py-3.5 rounded-[12px] text-[15px] font-semibold cursor-pointer font-sans disabled:opacity-60">
                {sending ? 'Sending…' : 'Send for review'}
              </button>
              <p className="text-[12px] text-[#94A3B8] text-center">We use these details only to list and verify your practice.</p>
            </form>
          </>
        )}
      </main>
      <Footer inner="max-w-[720px] mx-auto" />
    </div>
  );
}
