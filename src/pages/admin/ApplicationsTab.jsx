import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { showToast } from '../../store/toastSlice';
import { ClinicPicker } from '../Join';
import { useApplicationsQuery, useDecideApplicationMutation } from './adminApi';
import { BTN_APPROVE, BTN_PLAIN, Empty, TabLoading, fmtShortDate } from './shared';

// Doctors and clinics who filled in the public "Join MediWay" form (/join).
// Check the registration number with the medical council before approving: approval puts the
// doctor on the map at the listed place picked here.

const yesNo = v => v === true ? 'Yes' : v === false ? 'No' : '–';

function Row({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex gap-[10px] text-[13px] py-[3px]">
      <span className="text-[#94A3B8] w-[150px] shrink-0">{label}</span>
      <span className="text-[#1E293B] min-w-0 break-words">{children}</span>
    </div>
  );
}

function ApplicationCard({ application: a }) {
  const dispatch = useDispatch();
  const [decide, { isLoading: busy }] = useDecideApplicationMutation();
  const [place, setPlace] = useState(a.place_id ? { id: a.place_id, name: a.hospitals?.name ?? a.place_id, address: a.hospitals?.address } : null);
  const [error, setError] = useState('');

  async function act(approve) {
    setError('');
    if (approve && !place) return setError('Pick the listed place they work at first.');
    const { error } = await decide({ id: a.id, approve, placeId: place?.id });
    if (error) { console.error(error); setError(error.message || 'Something went wrong. Try again'); return; }
    dispatch(showToast(approve ? `${a.name} is now listed` : 'Application rejected'));
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[16px] p-[16px] sm:p-[20px]">
      <div className="flex items-start justify-between gap-[10px] flex-wrap mb-[10px]">
        <div>
          <div className="font-serif text-[18px] text-[#1E293B]">{a.name}</div>
          <div className="text-[13px] text-[#64748B]">{a.specialty}{a.qualification ? ` · ${a.qualification}` : ''}</div>
        </div>
        <span className="text-[11px] text-[#94A3B8]">Sent {fmtShortDate(a.created_at)}</span>
      </div>

      <Row label="Registration no.">{a.registration_number}</Row>
      <Row label="Experience">{a.experience_years != null ? `${a.experience_years} years` : null}</Row>
      <Row label="Gender">{a.gender}</Row>
      <Row label="Languages">{a.languages?.join(', ')}</Row>
      <Row label="Clinic">{[a.clinic_name, a.clinic_address].filter(Boolean).join(', ')}</Row>
      <Row label="City">{a.city}</Row>
      <Row label="Phone">{a.phone && <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} className="text-[#D0423A] underline">{a.phone}</a>}</Row>
      <Row label="Email">{a.email && <a href={`mailto:${a.email}`} className="text-[#D0423A] underline">{a.email}</a>}</Row>
      <Row label="Website">{a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-[#D0423A] underline">{a.website}</a>}</Row>
      <Row label="Fee">{a.consult_fee != null ? `₹${a.consult_fee}` : null}</Row>
      <Row label="Hours">{a.hours_text}</Row>
      <Row label="Walk-ins / Intl insurance / Cards">{`${yesNo(a.walk_in)} / ${yesNo(a.intl_insurance)} / ${yesNo(a.accepts_cards)}`}</Row>
      <Row label="Notes">{a.notes}</Row>

      <div className="mt-[14px] pt-[14px] border-t border-[#F0EFEA]">
        <div className="text-[12px] font-semibold text-[#3F3F46] mb-[6px]">Works at (listed place)</div>
        <ClinicPicker city={a.city} value={place} onPick={setPlace}
          hint={place ? '' : 'Not listed yet? Add the place under Imported places first, then pick it here.'} />
      </div>

      <div className="mt-[14px] flex gap-[8px] flex-wrap items-center">
        <button type="button" disabled={busy} onClick={() => act(true)} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>✓ Approve and list this doctor</button>
        <button type="button" disabled={busy} onClick={() => act(false)} className={`${BTN_PLAIN} px-[16px] py-[9px] text-[13px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Reject</button>
        {error && <span role="alert" className="text-[12px] text-[#D0423A]">{error}</span>}
      </div>
    </div>
  );
}

export default function ApplicationsTab() {
  const { data: applications, isLoading, isError } = useApplicationsQuery();
  if (isLoading) return <TabLoading />;
  if (isError) return <p className="text-[13px] text-[#D0423A]">Couldn't load applications. Has 20261004_tourist_features.sql been run?</p>;
  if (!applications?.length) return <Empty title="No applications">New sign-ups from the “Join MediWay” page show up here.</Empty>;

  return (
    <>
      <div className="mb-[20px]">
        <h1 className="font-serif text-[24px]">Doctor applications</h1>
        <p className="text-[13px] text-[#94A3B8] mt-[3px]">{applications.length} waiting · check each registration number with the state medical council before approving</p>
      </div>
      <div className="flex flex-col gap-[16px]">
        {applications.map(a => <ApplicationCard key={a.id} application={a} />)}
      </div>
    </>
  );
}
