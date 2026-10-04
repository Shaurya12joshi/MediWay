import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { useT } from '../i18n';

// "Sign In" or "Sign Out" in the nav, once Supabase has said whether anyone is signed in
export default function AuthButton({ className = 'text-slate-600 hover:text-[#D6453A] text-sm font-semibold whitespace-nowrap shrink-0' }) {
  const t = useT();
  const { ready, user } = useSelector(s => s.auth);
  const navigate = useNavigate();
  if (!ready) return null;

  return user
    ? <button className={className} onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</button>
    : <button className={className} onClick={() => navigate('/auth')}>{t('common.signIn')}</button>;
}
