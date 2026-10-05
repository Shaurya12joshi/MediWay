import { useDispatch, useSelector } from 'react-redux';
import { useT } from '../../i18n';
import { setFilter, toggleOption } from '../../store/searchSlice';

const TYPES = [['all', 'filter.all'], ['doctor', 'kind.doctors'], ['hospital', 'kind.hospitals'], ['clinic', 'kind.clinics'], ['pharmacy', 'kind.pharmacies'], ['lab', 'kind.labs']];
// Values are what the database stores; labels are translated
const SPECIALTIES = [
  'General Physician', 'Delhi Belly', 'Respiratory Illness', 'Fever', 'Dengue', 'Typhoid', 'Malaria', 'Animal Bites',
  'Hepatitis', 'Heat-Related', 'Cardiologist', 'Dermatologist', 'ENT', 'Orthopedic', 'Pediatric', 'Gynecologist',
  'Ophthalmologist', 'Dentist',
];
const OPTIONS = [['openNow', 'filter.openNow'], ['er24', 'filter.er24'], ['walkIn', 'filter.walkIn'], ['insurance', 'filter.insurance']];
const TRAVELLER_OPTIONS = [
  ['english', 'filter.english'], ['intlInsurance', 'filter.intlInsurance'], ['cards', 'filter.cards'],
  ['travelClinic', 'filter.travelClinic'], ['femaleDoctor', 'filter.femaleDoctor'],
];
const RATINGS = [[0, 'filter.any'], [4, null, '4★+'], [4.5, null, '4.5★+']];
// Languages doctors list (stored in English)
const LANGUAGES = ['English', 'Hindi', 'French', 'German', 'Spanish', 'Italian', 'Russian', 'Japanese', 'Chinese', 'Korean', 'Hebrew', 'Tamil', 'Kannada'];

const CHIP = 'px-3 py-1.5 rounded-lg text-[13px] border-[1.5px] cursor-pointer font-sans transition-all';
const CHIP_ON = `${CHIP} border-[#D0423A] bg-[#FDECEA] text-[#D0423A] font-medium`;
const CHIP_OFF = `${CHIP} border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#D0423A] hover:text-[#D0423A]`;
const CARD = 'bg-white border border-[#E2E8F0] rounded-2xl p-[18px] mb-3';
const HEADING = 'text-[11px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] mb-3';

// choices: [value, translation key | null, literal label]
function ChipGroup({ title, filterKey, choices }) {
  const t = useT();
  const dispatch = useDispatch();
  const current = useSelector(s => s.search.filters[filterKey]);
  return (
    <div className={CARD}>
      <p className={HEADING}>{title}</p>
      <div className="flex flex-wrap gap-[7px]">
        {choices.map(([value, key, literal]) => (
          <button key={value} type="button" aria-pressed={current === value} className={current === value ? CHIP_ON : CHIP_OFF}
            onClick={() => dispatch(setFilter({ key: filterKey, value }))}>{key ? t(key) : literal}</button>
        ))}
      </div>
    </div>
  );
}

function Switches({ title, hint, options }) {
  const t = useT();
  const dispatch = useDispatch();
  const filters = useSelector(s => s.search.filters);
  return (
    <div className={CARD}>
      <p className={`${HEADING} ${hint ? '!mb-0.5' : ''}`}>{title}</p>
      {hint && <p className="text-[11px] text-[#94A3B8] mb-2">{hint}</p>}
      {options.map(([key, label], i) => (
        <button key={key} type="button" role="switch" aria-checked={filters[key]} onClick={() => dispatch(toggleOption(key))}
          className={`w-full flex items-center justify-between gap-3 py-2.5 text-[14px] text-start text-[#1E293B] cursor-pointer select-none bg-transparent font-sans ${i < options.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
          <span>{t(label)}</span>
          <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${filters[key] ? 'bg-[#D0423A]' : 'bg-[#E2E8F0]'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${filters[key] ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      ))}
    </div>
  );
}

// Used beside the list (id "filterSidebar") and in the map's results pane (id "mapFilters")
export default function FilterSidebar({ open, onReset, id = 'filterSidebar' }) {
  const t = useT();
  const dispatch = useDispatch();
  const distance = useSelector(s => s.search.filters.distance);

  return (
    // Collapsed by default below md, where it would otherwise push the results a full screen down
    <aside id={id} className={open ? 'block' : 'hidden md:block'}>
      <ChipGroup title={t('filter.type')} filterKey="type" choices={TYPES} />
      <Switches title={t('filter.options')} options={OPTIONS} />
      <Switches title={t('filter.travellers')} hint={t('filter.travellersHint')} options={TRAVELLER_OPTIONS} />
      <ChipGroup title={t('filter.specialty')} filterKey="specialty"
        choices={[['all', 'filter.all'], ...SPECIALTIES.map(s => [s, `specialty.${s}`])]} />

      <div className={CARD}>
        <p className={HEADING}>{t('filter.maxDistance')}</p>
        <div className="flex justify-between text-xs text-[#94A3B8] mb-2"><span>0 km</span><span>{distance} km</span></div>
        <input type="range" min="1" max="20" value={distance} aria-label={t('filter.maxDistanceLabel')} className="w-full cursor-pointer accent-[#D0423A]"
          onChange={e => dispatch(setFilter({ key: 'distance', value: +e.target.value }))} />
      </div>

      <ChipGroup title={t('filter.minRating')} filterKey="rating" choices={RATINGS} />
      <ChipGroup title={t('filter.language')} filterKey="language"
        choices={[['all', 'filter.all'], ...LANGUAGES.map(l => [l, `lang.${l}`])]} />

      <button type="button" onClick={onReset}
        className="w-full py-2.5 border-[1.5px] border-[#E2E8F0] rounded-xl bg-white text-[#64748B] text-[13px] cursor-pointer font-sans hover:border-[#1E293B] hover:text-[#1E293B] transition-all">
        {t('filter.reset')}
      </button>
    </aside>
  );
}
