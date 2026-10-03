import { useDispatch, useSelector } from 'react-redux';
import { setFilter, toggleOption } from '../../store/searchSlice';

const TYPES = [['all', 'All'], ['doctor', 'Doctors'], ['hospital', 'Hospitals'], ['clinic', 'Clinics'], ['pharmacy', 'Pharmacies'], ['lab', 'Labs']];
const SPECIALTIES = [
  ['all', 'All'], ['General Physician', 'General'], ['Delhi Belly', 'Delhi Belly'], ['Respiratory Illness', 'Respiratory Illness'],
  ['Fever', 'Fever'], ['Dengue', 'Dengue'], ['Typhoid', 'Typhoid'], ['Malaria', 'Malaria'], ['Animal Bites', 'Animal Bites'],
  ['Hepatitis', 'Hepatitis'], ['Heat-Related', 'Heat-Related'], ['Cardiologist', 'Cardiologist'], ['Dermatologist', 'Dermatologist'],
  ['ENT', 'ENT'], ['Orthopedic', 'Orthopedic'], ['Pediatric', 'Pediatric'],
];
const OPTIONS = [['openNow', 'Open now'], ['walkIn', 'Accepts walk-ins'], ['english', 'English-speaking'], ['insurance', 'Accepts insurance']];
const RATINGS = [[0, 'Any'], [4, '4★+'], [4.5, '4.5★+']];
const LANGUAGES = [['all', 'All'], ['English', 'English'], ['Hindi', 'Hindi'], ['Kannada', 'Kannada'], ['Tamil', 'Tamil']];

const CHIP = 'px-3 py-1.5 rounded-lg text-[13px] border-[1.5px] cursor-pointer font-sans transition-all';
const CHIP_ON = `${CHIP} border-[#D0423A] bg-[#FDECEA] text-[#D0423A] font-medium`;
const CHIP_OFF = `${CHIP} border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#D0423A] hover:text-[#D0423A]`;
const CARD = 'bg-white border border-[#E2E8F0] rounded-2xl p-[18px] mb-3';
const HEADING = 'text-[11px] font-semibold uppercase tracking-[.08em] text-[#94A3B8] mb-3';

function ChipGroup({ title, filterKey, choices }) {
  const dispatch = useDispatch();
  const current = useSelector(s => s.search.filters[filterKey]);
  return (
    <div className={CARD}>
      <p className={HEADING}>{title}</p>
      <div className="flex flex-wrap gap-[7px]">
        {choices.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={current === value} className={current === value ? CHIP_ON : CHIP_OFF}
            onClick={() => dispatch(setFilter({ key: filterKey, value }))}>{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function FilterSidebar({ open, onReset }) {
  const dispatch = useDispatch();
  const filters = useSelector(s => s.search.filters);

  return (
    // Collapsed by default below md, where it would otherwise push the results a full screen down
    <aside id="filterSidebar" className={open ? 'block' : 'hidden md:block'}>
      <ChipGroup title="Type" filterKey="type" choices={TYPES} />
      <ChipGroup title="Specialty" filterKey="specialty" choices={SPECIALTIES} />

      <div className={CARD}>
        <p className={HEADING}>Options</p>
        {OPTIONS.map(([key, label], i) => (
          <button key={key} type="button" role="switch" aria-checked={filters[key]} onClick={() => dispatch(toggleOption(key))}
            className={`w-full flex items-center justify-between py-2.5 text-[14px] text-[#1E293B] cursor-pointer select-none bg-transparent font-sans ${i < OPTIONS.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
            <span>{label}</span>
            <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${filters[key] ? 'bg-[#D0423A]' : 'bg-[#E2E8F0]'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${filters[key] ? 'translate-x-4' : ''}`} />
            </span>
          </button>
        ))}
      </div>

      <div className={CARD}>
        <p className={HEADING}>Max distance</p>
        <div className="flex justify-between text-xs text-[#94A3B8] mb-2"><span>0 km</span><span>{filters.distance} km</span></div>
        <input type="range" min="1" max="20" value={filters.distance} aria-label="Max distance in km" className="w-full cursor-pointer accent-[#D0423A]"
          onChange={e => dispatch(setFilter({ key: 'distance', value: +e.target.value }))} />
      </div>

      <ChipGroup title="Min rating" filterKey="rating" choices={RATINGS} />
      <ChipGroup title="Language" filterKey="language" choices={LANGUAGES} />

      <button type="button" onClick={onReset}
        className="w-full py-2.5 border-[1.5px] border-[#E2E8F0] rounded-xl bg-white text-[#64748B] text-[13px] cursor-pointer font-sans hover:border-[#1E293B] hover:text-[#1E293B] transition-all">
        Reset all filters
      </button>
    </aside>
  );
}
