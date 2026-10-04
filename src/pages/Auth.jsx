import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase, authLinkType } from '../lib/supabase';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';
import { useSiteStats } from '../store/siteStats';

const INPUT = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#D0423A] focus:ring-2 focus:ring-[#D0423A]/10 transition-all';
const LABEL = 'text-xs font-semibold text-slate-600 mb-1.5 block';
const TAB = 'flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors';
const TAB_ON = `${TAB} bg-[#D0423A] text-white shadow-sm`;
const TAB_OFF = `${TAB} text-slate-500 hover:text-slate-800`;

function FormError({ message }) {
  if (!message) return null;
  return <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{message}</div>;
}

// Sign in with an invite-approved account
function LoginPanel({ onSwitch }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) {
      setError("We couldn't sign you in. Check your email and password, or join the waitlist if you haven't been invited yet.");
      return;
    }
    navigate('/');
  }

  return (
    <div className="bg-white border-slate-100 rounded-3xl p-10 shadow-sm">
      <h2 className="font-custom font-bold text-2xl text-slate-900 mb-1">Welcome back</h2>
      <p className="text-slate-500 text-sm mb-6">Sign in with the email your invite was sent to.</p>

      <form className="flex flex-col gap-4" onSubmit={handleLogin}>
        <div>
          <label htmlFor="loginEmail" className={LABEL}>Email</label>
          <input type="email" id="loginEmail" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="loginPassword" className={LABEL}>Password</label>
          <input type="password" id="loginPassword" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={INPUT} />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={busy} className="mt-1 bg-[#D0423A] text-white font-semibold text-sm py-3 rounded-xl hover:bg-red-700 hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-red-100">
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="text-xs text-slate-400 mt-5 text-center leading-relaxed">
        Not approved yet? <button type="button" onClick={onSwitch} className="text-[#D0423A] font-semibold hover:underline">Join the waitlist</button> instead.
      </p>

      <div className="mt-5 pt-5 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 text-center">Accounts are created by the MediWay team once you're approved off the waitlist.</p>
      </div>
    </div>
  );
}

function SignupPanel({ onSwitch }) {
  const [form, setForm] = useState({ name: '', email: '', context: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinedEmail, setJoinedEmail] = useState(null);
  const field = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const email = form.email.trim().toLowerCase();
    const { error } = await supabase.from('waitlist').insert({ name: form.name.trim(), email, context: form.context.trim() });
    setBusy(false);
    if (error) {
      setError(error.code === '23505'
        ? "That email is already on the waitlist — we'll be in touch soon."
        : 'Something went wrong submitting that. Please try again.');
      return;
    }
    setJoinedEmail(email);
  }

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-10 shadow-sm">
      {joinedEmail ? (
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h2 className="font-custom font-bold text-xl text-slate-900 mb-1">You're on the list</h2>
          <p className="text-slate-500 text-sm mb-4 leading-relaxed">
            We'll email <span className="font-semibold text-slate-700">{joinedEmail}</span> the moment a spot opens up for you.
          </p>
          <button type="button" onClick={onSwitch} className="text-sm text-[#D0423A] font-semibold hover:underline">Already have access? Sign in</button>
        </div>
      ) : (
        <div>
          <h2 className="font-custom font-bold text-2xl text-slate-900 mb-1">Request access</h2>
          <p className="text-slate-500 text-sm mb-6">Tell us a little about you. We'll email you the moment a spot opens up.</p>

          <form className="flex flex-col gap-4" onSubmit={handleSignup}>
            <div>
              <label htmlFor="signupName" className={LABEL}>Full name</label>
              <input type="text" id="signupName" required placeholder="Anika Kapoor" value={form.name} onChange={field('name')} className={INPUT} />
            </div>
            <div>
              <label htmlFor="signupEmail" className={LABEL}>Email</label>
              <input type="email" id="signupEmail" required placeholder="you@example.com" value={form.email} onChange={field('email')} className={INPUT} />
            </div>
            <div>
              <label htmlFor="signupContext" className={LABEL}>Where are you traveling from / to? <span className="text-slate-300 font-normal">(optional)</span></label>
              <input type="text" id="signupContext" placeholder="e.g. Berlin → Bengaluru" value={form.context} onChange={field('context')} className={INPUT} />
            </div>

            <FormError message={error} />

            <button type="submit" disabled={busy} className="mt-1 bg-slate-900 text-white font-semibold text-sm py-3 rounded-xl hover:bg-slate-800 hover:-translate-y-0.5 transition-all duration-200">
              {busy ? 'Joining…' : 'Join the Waitlist'}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-5 text-center">
            Already invited? <button type="button" onClick={onSwitch} className="text-[#D0423A] font-semibold hover:underline">Sign in</button>
          </p>
        </div>
      )}
    </div>
  );
}

// Someone opened their invite email: choose a username and password
function InviteSetupPanel({ email, onDone }) {
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleInviteSetup(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);

    const { data: userData, error: passError } = await supabase.auth.updateUser({ password: form.password });
    if (passError) {
      setBusy(false);
      setError('Something went wrong setting your password. Try again.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({ id: userData.user.id, username: form.username.trim() });
    setBusy(false);
    if (profileError) {
      setError(profileError.code === '23505'
        ? 'That username is taken. Please choose another.'
        : 'Something went wrong creating your profile. Try again.');
      return;
    }

    // Account ready: they sign in with the new password
    await supabase.auth.signOut();
    onDone();
  }

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-10 shadow-sm">
      <h2 className="font-custom font-bold text-2xl text-slate-900 mb-1">Welcome to MediWay</h2>
      <p className="text-slate-500 text-sm mb-6">You've been invited! Set up your account to get started.</p>

      <form className="flex flex-col gap-4" onSubmit={handleInviteSetup}>
        <div>
          <label htmlFor="inviteEmail" className={LABEL}>Email</label>
          <input type="email" id="inviteEmail" disabled value={email} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 text-slate-500" />
        </div>
        <div>
          <label htmlFor="inviteUsername" className={LABEL}>Username</label>
          <input type="text" id="inviteUsername" required minLength={3} placeholder="anika_k" value={form.username} onChange={field('username')} className={INPUT} />
        </div>
        <div>
          <label htmlFor="invitePassword" className={LABEL}>Password</label>
          <input type="password" id="invitePassword" required minLength={6} placeholder="••••••••" value={form.password} onChange={field('password')} className={INPUT} />
        </div>
        <div>
          <label htmlFor="inviteConfirmPassword" className={LABEL}>Confirm password</label>
          <input type="password" id="inviteConfirmPassword" required minLength={6} placeholder="••••••••" value={form.confirm} onChange={field('confirm')} className={INPUT} />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={busy} className="mt-1 bg-[#D0423A] text-white font-semibold text-sm py-3 rounded-xl hover:bg-red-700 hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-red-100">
          {busy ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

export default function Auth() {
  useTitle('MediWay — Alpha Access');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'signup' ? 'signup' : 'login');
  const [inviteEmail, setInviteEmail] = useState(null);
  const stats = useSiteStats();

  // Arriving from an invite email: set up the account. Already signed in: nothing to do here.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      if (authLinkType === 'invite') setInviteEmail(data.session.user.email);
      else navigate('/', { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

            <div className="hidden lg:flex lg:w-1/2 bg-[#111111] relative overflow-hidden flex-col justify-between p-12 xl:p-16 2xl:p-20">
    
                <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-[#D0423A] opacity-20 blur-[120px] pointer-events-none"></div>
                <div className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full bg-[#1A7A52] opacity-20 blur-[120px] pointer-events-none"></div>
    
                <div className="relative z-10 flex items-center gap-3">
                    <div className="bg-[#D6453A] w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <PinIcon size={22} />
                    </div>
                    <span className="font-bold text-2xl hover:text-[#D6453A] text-white font-custom">MediWay</span>
                </div>
    
                <div className="relative z-10 max-w-md 2xl:max-w-xl">
                    <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 py-1.5 mb-6">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                        <span className="text-white text-xs font-custom2 font-semibold tracking-widest uppercase">Alpha · Invite only</span>
                    </div>
                    <h1 className="font-custom font-bold text-4xl xl:text-5xl 2xl:text-6xl text-white leading-tight mb-4">
                        We're letting people in a few at a time
                    </h1>
                    <p className="text-white/50 text-sm xl:text-base 2xl:text-lg leading-relaxed">
                        MediWay is still early. To keep every provider on the map verified and every review real, we're opening access gradually starting with our waitlist.
                    </p>
                </div>
    
                <div className="relative z-10 flex items-center gap-8 pt-8 border-t border-white/10">
                    <div>
                        <p className="font-custom font-bold text-2xl text-white">{stats.placesListed}</p>
                        <p className="text-slate-600 font-semibold text-xs mt-0.5">Places listed</p>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div>
                        <p className="font-custom font-bold text-2xl text-white">{stats.citiesLive}</p>
                        <p className="text-slate-600 font-semibold text-xs mt-0.5">{stats.citiesLive === '1' ? 'City live' : 'Cities live'} · more coming soon</p>
                    </div>
                </div>
            </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">

            <div className="flex lg:hidden items-center gap-3 mb-8">
                <div className="bg-[#D6453A] w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0">
                    <PinIcon size={20} />
                </div>
                <span className="font-semibold text-xl font-custom">MediWay</span>
            </div>

            <div className="w-full max-w-[420px]">

                <div className="lg:hidden inline-flex items-center gap-2 bg-white border border-black/8 rounded-full px-3 py-1.5 mb-6 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span className="text-xs text-[#3F3F46] font-semibold">Alpha · Invite only, waitlist open</span>
                </div>

                {inviteEmail ? (
                    <InviteSetupPanel email={inviteEmail} onDone={() => { setInviteEmail(null); setTab('login'); }} />
                ) : (
                    <>
                        <div className="flex bg-white border border-slate-200 rounded-2xl p-1 mb-6 shadow-sm">
                            <button type="button" onClick={() => setTab('login')} className={tab === 'login' ? TAB_ON : TAB_OFF}>
                                Sign In
                            </button>
                            <button type="button" onClick={() => setTab('signup')} className={tab === 'signup' ? TAB_ON : TAB_OFF}>
                                Join Waitlist
                            </button>
                        </div>

                        {tab === 'login'
                            ? <LoginPanel onSwitch={() => setTab('signup')} />
                            : <SignupPanel onSwitch={() => setTab('login')} />}
                    </>
                )}

                <p className="text-xs text-slate-400 mt-6 text-center">
                    MediWay is in alpha testing. Access is limited while we work with our first providers and testers.
                </p>
                <div className="border-t border-slate-200 mt-12 mb-6"></div>
                <p className="text-xs text-slate-400 text-center font-custom2"> MediWay team member?{' '}
                    <Link to="/admin" className="text-slate-500 hover:text-[#D0423A] underline underline-offset-2">Log in or sign up here</Link>
                </p>
            </div>
        </div>
    </div>
  );
}
