import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const INPUT = 'w-full border-[1.5px] border-[#E6E6E1] rounded-[10px] px-[14px] py-[10px] text-[14px] outline-none focus-within:border-[#D0423A] font-sans';

// Signing in updates the session in the store, and the admin page moves on from there
export function AdminLogin() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const isSignup = mode === 'signup';

  function switchMode(e) {
    e.preventDefault();
    setMode(isSignup ? 'signin' : 'signup');
    setError('');
    setInfo('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    const credentials = { email: email.trim(), password };
    const { error } = isSignup
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (isSignup) setInfo('Account created. Ask an existing admin to approve it, then sign in.');
  }

  return (
    <div className="max-w-[380px] mx-auto mt-[40px] sm:mt-[60px] bg-white border border-[#E6E6E1] rounded-[18px] p-[20px] sm:p-[28px]">
      <h1 className="font-serif text-[22px] mb-[4px]">{isSignup ? 'Create admin account' : 'Admin sign in'}</h1>
      <p className="text-[13px] text-[#94A3B8] mb-[20px]">{isSignup ? 'New accounts still need to be approved before they can verify reviews' : 'Verify review proof photos'}</p>
      <form className="flex flex-col gap-[14px]" onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" aria-label="Email" required value={email} onChange={e => setEmail(e.target.value)} className={INPUT} />
        <input type="password" placeholder="Password" aria-label="Password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={INPUT} />
        <button type="submit" disabled={busy} className="bg-[#D0423A] hover:bg-[#B8362F] text-white border-none py-[12px] rounded-[10px] text-[14px] font-semibold cursor-pointer font-sans">
          {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
        </button>
        {error && <p role="alert" className="text-[12px] text-[#D0423A] text-center">{error}</p>}
        {info && <p className="text-[12px] text-[#94A3B8] text-center">{info}</p>}
      </form>
      <p className="text-[13px] text-[#94A3B8] text-center mt-[16px]">
        {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
        <a href="#" onClick={switchMode} className="text-[#D0423A] font-medium">{isSignup ? 'Sign in' : 'Sign up'}</a>
      </p>
    </div>
  );
}

export function NotAuthorized() {
  return (
    <div className="max-w-[420px] mx-auto mt-[40px] sm:mt-[60px] text-center">
      <p className="font-serif text-[22px] mb-[10px]">Not authorized</p>
      <p className="text-[14px] text-[#94A3B8] mb-[20px]">This account isn't on the admin list. Ask whoever manages the database to add your user id to the <code>admins</code> table.</p>
      <button type="button" onClick={() => supabase.auth.signOut()} className="text-[#D0423A] text-[14px] bg-transparent border-none cursor-pointer">Sign out</button>
    </div>
  );
}
