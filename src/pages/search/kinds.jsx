import { getStatus } from '../../lib/hours';
import { t } from '../../i18n';

// Facilities in the `hospitals` table, by `kind`. Icons are Lucide (ISC licence), as SVG markup
// so the same icon serves React cards and the map's HTML markers. Names are in the visitor's language.
export const KINDS = {
  hospital: { get label() { return t('kind.hospital'); }, get plural() { return t('kind.hospitals'); }, color: '#D0423A', icon: '<path d="M12 5v14M5 12h14"/>' },
  clinic:   { get label() { return t('kind.clinic'); }, get plural() { return t('kind.clinics'); }, color: '#2563EB', icon: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>' },
  pharmacy: { get label() { return t('kind.pharmacy'); }, get plural() { return t('kind.pharmacies'); }, color: '#16A34A', icon: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>' },
  lab:      { get label() { return t('kind.lab'); }, get plural() { return t('kind.labs'); }, color: '#7C3AED', icon: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>' },
};

export const kindOf = h => KINDS[h.kind] ?? KINDS.hospital;

// ER status for hospitals that record it; otherwise opening hours when known
export function placeStatus(h) {
  const isHospital = kindOf(h) === KINDS.hospital;
  if (isHospital && h.er24 === true)  return { text: t('place.erOpen'), cls: 'text-[#16A34A]' };
  if (isHospital && h.er24 === false) return { text: t('place.noEr'), cls: 'text-[#64748B]' };
  const status = getStatus(h);
  if (status.unknown) return { text: t('hours.notListed'), cls: 'text-[#94A3B8]' };
  return { text: `${status.open ? '●' : '○'} ${status.label}`, cls: status.open ? 'text-[#16A34A]' : 'text-[#64748B]' };
}

// A named place is friendlier in Google Maps; without an address, the exact point is more reliable
export function placeDestination(h) {
  return h.address ? `${h.name} ${h.address}` : `${h.lat},${h.lng}`;
}

export function telHref(phone) { return 'tel:' + phone.replace(/[^\d+]/g, ''); }

export function KindIcon({ kind, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: kind.icon }} />
  );
}

// What foreign travellers ask about, when we know it (columns on `hospitals`; null = not known)
export const DETAILS = [
  { key: 'intl_insurance', filter: 'intlInsurance', icon: '🛡️' },
  { key: 'accepts_cards', filter: 'cards', icon: '💳' },
  { key: 'english_desk', filter: 'english', icon: '💬' },
  { key: 'travel_clinic', filter: 'travelClinic', icon: '💉' },
  { key: 'female_doctor', filter: 'femaleDoctor', icon: '👩‍⚕️' },
];

export function TravellerBadges({ place, className = '' }) {
  const known = DETAILS.filter(d => place[d.key] === true);
  if (!known.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {known.map(d => (
        <span key={d.key} className="text-[10.5px] font-medium px-[7px] py-[2px] rounded-[6px] bg-[#EFF6FF] text-[#1D4ED8] whitespace-nowrap">
          <span aria-hidden="true">{d.icon}</span> {t(`detail.${d.key}`)}
        </span>
      ))}
    </div>
  );
}
