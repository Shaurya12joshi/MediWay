// MediWay's specialty names (what doctors.specialty stores) and which of them treat each condition chip.
// CONDITIONS mirrors specialties_for() in supabase/migrations/20261006_doctor_import.sql: keep the two in step.

export const SPECIALTIES = [
  'General Physician', 'Internal Medicine', 'Gastroenterologist', 'Pulmonologist', 'Cardiologist', 'Dermatologist',
  'ENT', 'Orthopedic', 'Pediatric', 'Gynecologist', 'Ophthalmologist', 'Dentist', 'Neurologist', 'Psychiatrist',
  'Urologist', 'Nephrologist', 'General Surgeon', 'Oncologist', 'Endocrinologist',
];

// A condition chip finds doctors tagged with the condition itself and the specialists who treat it
const CONDITIONS = {
  'General Physician': ['Internal Medicine'],
  'Delhi Belly': ['General Physician', 'Internal Medicine', 'Gastroenterologist'],
  Fever: ['General Physician', 'Internal Medicine'],
  Dengue: ['General Physician', 'Internal Medicine'],
  Typhoid: ['General Physician', 'Internal Medicine'],
  Malaria: ['General Physician', 'Internal Medicine'],
  'Respiratory Illness': ['General Physician', 'Internal Medicine', 'Pulmonologist'],
  'Animal Bites': ['General Physician', 'Internal Medicine'],
  Hepatitis: ['Gastroenterologist', 'Internal Medicine'],
  'Heat-Related': ['General Physician', 'Internal Medicine'],
};

export const specialtiesFor = choice => [choice, ...(CONDITIONS[choice] ?? [])];

// Does a doctor or place match the chosen chip?
export const treats = (row, choice) => {
  const list = Array.isArray(row.specialty) ? row.specialty : [];
  return specialtiesFor(choice).some(s => list.includes(s));
};

// A specialty in the visitor's language: the full name ("Pediatrician"), else the chip's label ("Delhi Belly"),
// else as stored
export function specialtyLabel(t, s) {
  for (const key of [`spec.${s}`, `specialty.${s}`]) { const v = t(key); if (v !== key) return v; }
  return s;
}
export const specialtyLabels = (t, row) => (Array.isArray(row.specialty) ? row.specialty : [row.specialty]).filter(Boolean)
  .map(s => specialtyLabel(t, s)).join(', ');
