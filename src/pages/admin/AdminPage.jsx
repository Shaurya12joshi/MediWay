import { useState } from 'react';
import { Link } from 'react-router';
import { useSelector } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { supabase } from '../../lib/supabase';
import { PinIcon } from '../../components/icons';
import { Spinner, useTitle } from '../../components/ui';
import { useAdminCountsQuery, useIsAdminQuery } from './adminApi';
import { AdminLogin, NotAuthorized } from './AdminLogin';
import ReviewQueue from './ReviewQueue';
import PlacesTab from './PlacesTab';
import HoursTab from './HoursTab';
import ApplicationsTab from './ApplicationsTab';
import DoctorsTab from './DoctorsTab';

const TABS = [['reviews', 'Review proofs'], ['places', 'Imported places'], ['doctors', 'Imported doctors'], ['hours', 'Hours'], ['applications', 'Doctor applications']];
const TAB_KEY = 'mw.adminTab';
const TAB = 'whitespace-nowrap px-[14px] py-[7px] rounded-[9px] text-[13px] font-semibold border-none cursor-pointer font-sans transition-colors';

function readTab() {
  try { return sessionStorage.getItem(TAB_KEY) || 'reviews'; } catch { return 'reviews'; }
}

function AdminTabs() {
  const [tab, setTab] = useState(readTab);
  const { data: counts } = useAdminCountsQuery();
  // Kept here so each tab's filters survive switching away and back
  const [placesState, setPlacesState] = useState({ city: null, kind: 'all', view: 'review' });
  const [doctorsState, setDoctorsState] = useState({ city: null, view: 'review' });
  const [hoursState, setHoursState] = useState({ city: null, kind: 'hospital', phoneOnly: true, nearTourists: true, view: 'suggestions' });

  function show(t) {
    setTab(t);
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ }
  }

  return (
    <>
      <div className="flex gap-[6px] mb-[22px] bg-[#EFEDE8] p-[4px] rounded-[12px] w-fit max-w-full overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => show(key)}
            className={`${TAB} ${tab === key ? 'bg-white text-[#1E293B] shadow-sm' : 'bg-transparent text-[#94A3B8]'}`}>
            {label} {counts?.[key] ? <span className="opacity-60">({counts[key]})</span> : null}
          </button>
        ))}
      </div>
      {tab === 'places' ? <PlacesTab state={placesState} setState={setPlacesState} />
        : tab === 'hours' ? <HoursTab state={hoursState} setState={setHoursState} />
        : tab === 'applications' ? <ApplicationsTab />
        : tab === 'doctors' ? <DoctorsTab state={doctorsState} setState={setDoctorsState} />
        : <ReviewQueue />}
    </>
  );
}

export default function AdminPage() {
  useTitle('MediWay — Admin');
  const { ready, user } = useSelector(s => s.auth);
  const isAdmin = useIsAdminQuery(user ? user.id : skipToken);

  let body;
  if (!ready || (user && isAdmin.data === undefined)) body = <Spinner label="Loading…" />;
  else if (!user) body = <AdminLogin />;
  else if (!isAdmin.data) body = <NotAuthorized />;
  else body = <AdminTabs />;

  return (
    <div className="font-sans min-h-screen">
      <nav className="sticky top-0 z-[200] bg-[#F5F5F4] backdrop-blur-[12px] border-b border-[#E6E6E1] h-[60px] flex items-center px-[16px] sm:px-[24px]">
        <div className="max-w-[900px] w-full mx-auto flex items-center gap-[8px] sm:gap-[12px]">
          <div className="flex items-center gap-[9px] min-w-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#D0423A] flex items-center justify-center shrink-0">
              <PinIcon size={16} />
            </div>
            <span className="font-custom text-[20px] sm:text-[29px] font-bold hover:text-[#D6453A] text-[#1E293B] truncate">MediWay Admin</span>
          </div>
          <div style={{ flex: 1 }}></div>
          <Link to="/" className="text-[13px] text-[#94A3B8] bg-transparent border-none cursor-pointer hover:text-[#1E293B] font-sans whitespace-nowrap shrink-0 no-underline">Home Page</Link>
          {user && isAdmin.data && (
            <button type="button" onClick={() => supabase.auth.signOut()} className="text-[13px] text-[#94A3B8] bg-transparent border-none cursor-pointer hover:text-[#1E293B] font-sans whitespace-nowrap shrink-0">Sign out</button>
          )}
        </div>
      </nav>

      <div className="max-w-[900px] mx-auto px-[16px] sm:px-[24px] py-[28px] sm:py-[36px]">
        {body}
      </div>
    </div>
  );
}
