import { useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSiteStats } from '../store/siteStats';
import AuthButton from '../components/AuthButton';
import EmergencyCard from '../components/EmergencyCard';
import LanguagePicker from '../components/LanguagePicker';
import Footer from '../components/Footer';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';
import heroMap from '../assets/hero-map.webp';

const NAV_LINKS = [['#features', 'Features'], ['#how-it-works', 'How it Works'], ['#emergency', 'Emergency']];

export default function Home() {
  useTitle('MediWay');
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { placesListed, citiesLive, liveIn } = useSiteStats();

  // Section links (#features…) glide on this page; route changes elsewhere should jump.
  // A layout effect, so the class is gone before the next page restores its scroll position.
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.add('scroll-smooth');
    return () => html.classList.remove('scroll-smooth');
  }, []);

  return (
    <>
    <nav className="bg-[#F5F5F4] w-full border sticky top-0 z-50 px-4 sm:px-6 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3 lg:gap-2">
                    <div className="bg-[#D6453A] w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 lg:w-11 lg:h-11">
                        <PinIcon size={25} />
                    </div>
                    <Link to="/" className="font-semibold text-xl hover:text-[#D6453A] font-custom lg:text-4xl">MediWay</Link>
                </div>
                <div className="hidden md:flex items-center gap-6 text-slate-600 lg:gap-10">
                    {NAV_LINKS.map(([href, label]) => <a key={href} href={href} className="hover:text-[#D6453A]">{label}</a>)}
                </div>
                <div className="flex items-center gap-3">
                    <LanguagePicker className="hidden sm:flex" />
                    <AuthButton className="text-slate-600 hover:text-[#D6453A] text-sm font-semibold" />
                    <Link to="/search" className="bg-[#D6453A] px-3 py-1.5 rounded-3xl text-slate-50 cursor-pointer hover:bg-[#c2483f] font-semibold hidden md:block">
                        Find Care Now
                    </Link>
                    <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="text-3xl md:hidden leading-none">☰</button>
                </div>
            </div>
        </div>
    </nav>

    <div onClick={() => setMenuOpen(false)}
        className={`fixed z-50 inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 z-40 md:hidden ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div onClick={e => e.stopPropagation()}
            className={`fixed top-0 right-0 h-full w-[70%] max-w-[320px] bg-[#F5F5F4] shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-50 ${menuOpen ? '' : 'translate-x-full opacity-0'}`}>
            <div className="flex flex-col gap-8 p-10">
                <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="self-end text-5xl leading-none">×</button>
                {/* Jumping to a section closes the drawer so the target is visible */}
                {NAV_LINKS.map(([href, label]) => (
                    <a key={href} href={href} onClick={() => setMenuOpen(false)} className="text-3xl font-semibold hover:text-[#D6453A] transition">{label}</a>
                ))}
                <LanguagePicker className="text-lg" />
                <Link to="/search" className="bg-[#D6453A] text-white p-3 text-center rounded-3xl mt-6 font-semibold text-xl hover:bg-[#c2483f] transition">
                    Find Care Now
                </Link>
            </div>
        </div>
    </div>

    <div className="md:px-12 lg:px-16">
    <div className="max-w-7xl mx-auto">

    <div id="headerText" className="mx-4 sm:mx-6 md:mx-0 mt-10 max-w-max">
        <div className="bg-white rounded-3xl flex items-center gap-3 border border-black/5 py-3 px-4 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-emerald-600 flex-shrink-0"></div>
            <p className="text-sm text-[#3F3F46]">{liveIn} · more cities coming soon</p>
        </div>
    </div>

    <div className="flex flex-row lg:items-start lg:justify-between lg:gap-12 xl:gap-20">

        <div id="headlineText" className="flex flex-col min-w-0">


            <div className="mx-5 my-2 md:mx-0 font-custom">
                {/* From lg the headline shares the row with the map card: size it to the room it has */}
                <div className="flex gap-6 flex-col text-3xl md:text-4xl lg:text-[length:clamp(3.75rem,6.5vw,6rem)] lg:leading-none">
                    <h1 className="font-bold">Trusted healthcare,</h1>
                </div>
                <div className="flex gap-4 text-3xl md:text-4xl lg:text-[length:clamp(3.75rem,6.5vw,6rem)] lg:leading-none font-semibold">
                    <em className="text-[#D84B3E]">wherever</em>
                    <h1>you travel</h1>
                </div>
                <div className="font-sans text-sm text-stone-500 lg:text-xl xl:text-2xl 2xl:text-3xl lg:max-w-screen-md mt-1">
                    <p>Find doctors, hospitals, and pharmacies near you in seconds, with opening hours and 24/7 emergency rooms. Built for travelers, tourists, and anyone far from home.</p>
                </div>
            </div>
            <div className="flex flex-col p-5 md:px-0 lg:pt-6 lg:pb-0 gap-3">

                <div className="flex flex-row items-center gap-3 flex-wrap">
                    <button onClick={() => navigate('/search')} className="bg-[#BE332B] font-bold w-[220px] p-3 rounded-full text-slate-50 hover:bg-red-700 hover:-translate-y-1 transition-all duration-300 shadow-md shadow-red-800">
                        Find Doctor Near Me
                    </button>
                    <a href="#how-it-works" className="border-[#E6E6E1] border-2 px-6 py-3 rounded-3xl hover:bg-white hover:border-black transition-all duration-200">
                        Learn More
                    </a>
                </div>

                

                


                

            </div>
        </div>

        <div id="mainCard" className="hidden lg:block lg:w-[380px] xl:w-[450px] lg:shrink-0 lg:bg-white lg:shadow-xl lg:rounded-t-3xl rounded-b-3xl lg:overflow-hidden">
            {/* Static render of Lanka, Varanasi (OpenFreeMap / OpenStreetMap data) with a real driving route;
                 markers are positioned in % of the image so they stay on their streets. The box keeps the
                 image's aspect ratio at every card width, so object-cover never crops them off. */}
            <div className="relative aspect-[45/32] overflow-hidden bg-[#F3ECE4]">
                <img src={heroMap} width="450" height="320" loading="lazy" decoding="async"
                    alt="Street map of Lanka, Varanasi with a route to the nearest hospital"
                    className="absolute inset-0 w-full h-full object-cover select-none" />
                {/* Illustration of the search, not live data */}
                <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-600 bg-white/90 rounded-full px-2 py-1 shadow-sm">Example</span>

                <div className="absolute left-[20%] top-[30%] -translate-x-1/2 -translate-y-full">
                    <div className="mw-pin"><span>PS</span></div>
                </div>
                <div className="absolute left-[12%] top-[58%] -translate-x-1/2 -translate-y-full">
                    <div className="mw-pin"><span>RI</span></div>
                </div>
                <div className="absolute left-[50%] top-[62%] -translate-x-1/2 -translate-y-1/2">
                    <div className="mw-hospital !text-[#16A34A] !border-[#16A34A] text-[11px] font-bold">Rx</div>
                </div>

                <div className="absolute left-[66.5%] top-[36.5%] -translate-x-1/2 -translate-y-1/2">
                    <div className="mw-hospital text-[14px] font-bold">H</div>
                </div>
                <div className="absolute left-[66.5%] top-[36.5%] -translate-x-1/2 -translate-y-[calc(100%+22px)]">
                    <div className="animate-[float_3s_ease-in-out_infinite] flex items-center gap-2 bg-white rounded-xl shadow-[0_10px_28px_rgba(15,23,42,.16)] px-3 py-1.5 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-[#D0423A]"></span>
                        <span className="text-[13px] font-semibold text-slate-800">Apollo Hospital</span>
                        <span className="text-[12px] text-slate-400">0.4 km</span>
                    </div>
                </div>

                <div className="absolute left-[30.9%] top-[74.4%] -translate-x-1/2 -translate-y-1/2">
                    <div className="mw-user"></div>
                </div>

                <p className="absolute bottom-1.5 right-2 text-[9px] leading-none text-slate-500 bg-white/75 rounded px-1.5 py-1">&copy; OpenStreetMap contributors</p>
            </div>

            <div className="py-1">
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-[#D0423A] to-[#E87040] text-white font-custom text-lg">PS</div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 leading-tight">Dr. Priya Sharma</p>
                        <p className="text-sm text-slate-500">General Physician · English</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-slate-700">0.4 km</p>
                        <p className="text-sm text-slate-500"><span className="text-amber-500">★</span> 4.9</p>
                    </div>
                </div>
                <div className="mx-4 border-t border-slate-100"></div>
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-[#1E293B] to-[#475569] text-white font-custom text-lg">RI</div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 leading-tight">Dr. Rahul Iyer</p>
                        <p className="text-sm text-slate-500">Cardiologist · Hindi, Tamil</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-slate-700">1.1 km</p>
                        <p className="inline-block mt-0.5 text-xs font-semibold text-[#15803D] bg-[#DCFCE7] rounded-full px-2 py-0.5">Open</p>
                    </div>
                </div>
                <div className="mx-4 border-t border-slate-100"></div>
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-[#EAF4F0] text-[#16A34A] font-bold text-sm">Rx</div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 leading-tight">MedPlus Pharmacy</p>
                        <p className="text-sm text-slate-500">24/7 · All medications</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-slate-700">1.1 km</p>
                        <p className="inline-block mt-0.5 text-xs font-semibold text-[#15803D] bg-[#DCFCE7] rounded-full px-2 py-0.5">Open</p>
                    </div>
                </div>
            </div>
        </div>

    </div>

    </div>
    </div>

    <div id="statsArea" className="w-full mt-6 md:px-12 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <div className="px-6 md:px-0">
            <div className="border-t border-slate-300 w-full"></div>
        </div>
        <div className="flex items-center justify-between w-full pt-2">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 py-3 sm:px-6 md:px-12 md:py-4 lg:px-16 flex-1 justify-center text-center sm:text-left">
                <h1 className="font-custom font-bold text-xl md:text-2xl lg:text-4xl text-slate-900">{placesListed}</h1>
                <div className="text-xs md:text-sm lg:text-lg text-slate-500 leading-tight">
                    <p>Places</p><p>listed</p>
                </div>
            </div>
            <div className="self-stretch w-px bg-slate-300 my-3"></div>
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 py-3 sm:px-6 md:px-12 md:py-4 lg:px-16 flex-1 justify-center text-center sm:text-left">
                <h1 className="font-custom font-bold text-xl md:text-2xl lg:text-4xl text-slate-900">{citiesLive}</h1>
                <div className="text-xs md:text-sm lg:text-lg text-slate-500 leading-tight">
                    <p>{citiesLive === '1' ? 'City live' : 'Cities live'}</p><p>more soon</p>
                </div>
            </div>
            <div className="self-stretch w-px bg-slate-300 my-3"></div>
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-2 py-3 sm:px-6 md:px-12 md:py-4 lg:px-16 flex-1 justify-center text-center sm:text-left">
                <h1 className="font-custom font-bold text-xl md:text-2xl lg:text-4xl text-slate-900">112</h1>
                <div className="text-xs md:text-sm lg:text-lg text-slate-500 leading-tight">
                    <p>One-tap</p><p>emergency call</p>
                </div>
            </div>
        </div>

        <div className="px-6 md:px-0">
            <div className="border-t border-slate-300 w-full"></div>
        </div>
      </div>
    </div>

    
     <div id="emergency" className="scroll-mt-20 px-4 sm:px-6 md:px-12 lg:px-16 py-6 lg:py-10">

<div className="mx-auto max-w-6xl flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-20">

        <EmergencyCard showPageLink className="max-w-sm xl:max-w-md mx-auto lg:mx-0 lg:justify-self-end" />

        <div id="how-it-works" className="scroll-mt-20 flex flex-col justify-center gap-6 w-full max-w-sm xl:max-w-md mx-auto lg:mx-0 lg:justify-self-start min-w-0">

            <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-[#D0423A] mb-2">How it works</p>
            <h2 className="font-custom font-bold text-3xl md:text-4xl text-slate-900 leading-tight">
                Healthcare found in<br className="hidden lg:block" /> three simple steps
            </h2>
            <p className="text-slate-500 text-sm mt-2 max-w-sm">
                No app download needed. Works in any browser. {liveIn}, with more cities coming soon.
            </p>
            </div>

            <div className="flex flex-col gap-5">

            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#D0423A] flex items-center justify-center shrink-0 shadow-md shadow-red-200">
                <span className="text-white font-bold text-sm">01</span>
                </div>
                <div>
                <p className="font-semibold text-slate-800 text-sm">Share your location</p>
                <p className="text-slate-500 text-xs mt-0.5 max-w-xs">Allow location access, or browse a city where MediWay is live. No account needed.</p>
                </div>
            </div>

            <div className="w-px h-4 bg-slate-200 ml-5"></div>

            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">02</span>
                </div>
                <div>
                <p className="font-semibold text-slate-800 text-sm">Filter your need</p>
                <p className="text-slate-500 text-xs mt-0.5 max-w-xs">Pick specialty, language and distance, or show only hospitals with a 24/7 emergency room.</p>
                </div>
            </div>

            <div className="w-px h-4 bg-slate-200 ml-5"></div>

            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">03</span>
                </div>
                <div>
                <p className="font-semibold text-slate-800 text-sm">Get there instantly</p>
                <p className="text-slate-500 text-xs mt-0.5 max-w-xs">See opening hours and ratings, call the clinic, or open directions in Google Maps.</p>
                </div>
            </div>

            </div>

            <div className="mt-2">
            <button onClick={() => navigate('/search')} className="bg-[#D0423A] text-white font-semibold text-sm px-6 py-3 rounded-3xl hover:bg-red-700 hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-red-200">
                Find Doctors Near Me →
            </button>
            </div>

        </div>

</div>





     </div>

<div className="bg-[#1a1a1a] mt-4 px-6 py-12 md:px-12 lg:px-16 lg:py-16">
<div className="max-w-7xl mx-auto">

  <div className="mb-8">
    <p className="text-xs font-semibold tracking-widest uppercase text-[#D0423A] mb-3">The Problem</p>
    <h2 className="font-custom font-bold text-3xl md:text-4xl lg:text-5xl text-white leading-tight max-w-xl">
      Travelers deserve better than a Google search during a health crisis
    </h2>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

    <div className="bg-[#2a2a2a] rounded-2xl p-6 flex flex-col gap-4 border border-white/5 hover:border-white/10 transition-colors">
      <span className="text-4xl">
<svg xmlns="http://www.w3.org/2000/svg" 
     width="52" 
     height="52" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="#FFFFFF" 
     strokeWidth="2.5" 
     strokeLinecap="round" 
     strokeLinejoin="round" 
     className="lucide lucide-compass-icon lucide-compass">
     
  <circle cx="12" cy="12" r="10"/>
  <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>
</svg>      </span>
      <div>
        <h3 className="text-white font-bold text-lg mb-2">Unfamiliar city, no contacts</h3>
        <p className="text-white/50 text-sm leading-relaxed">When you fall ill far from home, you have no idea which hospital to trust or which doctor to call.</p>
      </div>
    </div>

    <div className="bg-[#2a2a2a] rounded-2xl p-6 flex flex-col gap-4 border border-white/5 hover:border-white/10 transition-colors">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-languages-icon lucide-languages"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg></span>
      <div>
        <h3 className="text-white font-bold text-lg mb-2">Language barriers</h3>
        <p className="text-white/50 text-sm leading-relaxed">Foreign tourists and inter-state travelers struggle to communicate symptoms to local doctors.</p>
      </div>
    </div>

    <div className="bg-[#2a2a2a] rounded-2xl p-6 flex flex-col gap-4 border border-white/5 hover:border-white/10 transition-colors">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock-icon lucide-clock"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span>
      <div>
        <h3 className="text-white font-bold text-lg mb-2">Critical time lost</h3>
        <p className="text-white/50 text-sm leading-relaxed">In emergencies, minutes matter. Finding an ER shouldn't involve scrolling through reviews.</p>
      </div>
    </div>

    <div className="bg-[#2a2a2a] rounded-2xl p-6 flex flex-col gap-4 border border-white/5 hover:border-white/10 transition-colors md:col-span-3 lg:col-span-3">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check-icon lucide-shield-check"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg></span>
      <div>
        <h3 className="text-white font-bold text-3xl mb-2 ">No way to verify trust</h3>
        <p className="text-white/50 text-xl leading-relaxed">Generic maps show clinics but offer no insight into quality, specialization, or wait times.</p>
      </div>
    </div>

  </div>
</div>
</div>

<div id="features" className="scroll-mt-20 bg-[#F8F2ED] px-6 py-12 md:px-12 lg:px-16 lg:py-16">
<div className="max-w-7xl mx-auto">

  <div className="mb-10">
    <div className="flex items-center gap-2 mb-3">
      <p className="text-sm font-semibold tracking-widest uppercase text-[#D0423A] font-custom2">Features</p>
    </div>
    <h2 className="font-custom font-bold text-4xl md:text-5xl text-slate-900 leading-tight max-w-lg mb-4">
        <i>Everything you need, exactly when you need it</i>
      
    </h2>
    <p className="text-slate-500 text-sm md:text-base max-w-md leading-relaxed">
      From finding a general physician to locating a 24-hour emergency room, MediWay puts complete healthcare discovery in your hands.
    </p>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#D0423A] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#c62f2f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pinned-icon lucide-map-pinned"><path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">01</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Location-Aware Search</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Uses your location, or the city centre, to show the closest hospitals, clinics, pharmacies and labs, nearest first.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Your location</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Google Maps</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Map & list</span>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#1A7A52] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#2f7dc6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-earth-icon lucide-earth"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">02</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Language Filters</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Filter doctors by the languages they speak. Especially useful for foreign tourists and inter-state travelers.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">English</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Hindi</span>
        <span className="text-xs border border-dashed border-amber-300 text-amber-700 bg-amber-50 rounded-full px-3 py-1">More languages · coming soon</span>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#2563EB] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ff8a8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-compass-icon lucide-compass"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">03</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Directions</h3>
        <p className="text-slate-500 text-sm leading-relaxed">See the route and travel time on the map, then open turn-by-turn directions in Google Maps.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Route preview</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Google Maps</span>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#D97706] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#69c8f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-id-card-icon lucide-id-card"><path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">04</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Smart Doctor Cards</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Profiles with ratings, specialties, opening hours, languages and the clinic's address.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Ratings</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Timings</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Specialties</span>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#D0423A] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffdd00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pill-icon lucide-pill"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">05</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Pharmacy Locator</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Find nearby pharmacies and see which are open right now. Never be stuck needing medication at 2am again.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Open now filter</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Nearby</span>
        <span className="text-xs border border-dashed border-amber-300 text-amber-700 bg-amber-50 rounded-full px-3 py-1">Stock info · coming soon</span>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#1A7A52] rounded-t-2xl"></div>
      <div className="flex items-start justify-between">
        <span className="text-3xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star-icon lucide-star"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg></span>
        <span className="text-5xl font-bold text-slate-100 leading-none">06</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Ratings & Reviews</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Reviews from patients, with a Verified visit badge when they show proof of their visit. Know what to expect before you walk in.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Verified visits</span>
        <span className="text-xs border border-slate-200 text-slate-600 rounded-full px-3 py-1">Star ratings</span>
      </div>
    </div>

  </div>
</div>
</div>

<div className="bg-[#F8F2ED] px-6 py-12 md:px-12 lg:px-16 lg:py-16">
<div className="max-w-7xl mx-auto">

  <div className="mb-10">
    <div className="flex items-center gap-2 mb-3">
      <p className="text-sm font-semibold tracking-widest uppercase font-custom2 text-[#D0423A]">Built For</p>
    </div>
    <h2 className="font-custom font-bold text-4xl md:text-5xl lg:text-6xl text-slate-900 leading-tight">
     <i>Whoever needs care,</i> <br className="hidden md:block " /> <i>wherever they are</i>
    </h2>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#00d5ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plane-icon lucide-plane"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg></span>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Foreign Tourists</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Find English-speaking doctors and 24/7 emergency rooms. Insurance and international payment details are coming soon.</p>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#6734c5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-train-front-icon lucide-train-front"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg></span>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Domestic Travelers</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Visiting an unfamiliar city? Find trusted local doctors without relying on word-of-mouth.</p>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-graduation-cap-icon lucide-graduation-cap"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg></span>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Students & Professionals</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Relocated to a new city for college or work? Build a healthcare network quickly.</p>
      </div>
    </div>

    <div className="bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:shadow-md transition-shadow">
      <span className="text-4xl"><svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ff0000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-siren-icon lucide-siren"><path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/></svg></span>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">Emergency Situations</h3>
        <p className="text-slate-500 text-sm leading-relaxed">Anyone needing care fast: one tap to call 112 or 108, share your location, or find the nearest 24/7 emergency room.</p>
      </div>
    </div>

  </div>
</div>
</div>

<div className="relative bg-[#111111] px-6 py-20 md:px-12 lg:px-16 lg:py-28 overflow-hidden">

  <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full bg-[#D0423A] opacity-20 blur-[120px] pointer-events-none"></div>

  <div className="absolute -bottom-20 -right-20 w-[500px] h-[500px] rounded-full bg-[#1A7A52] opacity-20 blur-[120px] pointer-events-none"></div>

  

  <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-2xl mx-auto">

    <h2 className="font-custom font-bold text-4xl md:text-5xl lg:text-6xl text-white leading-tight">
     <i>Your health shouldn't depend on where you are</i> 
    </h2>

    <p className="text-white/50 text-sm md:text-base leading-relaxed max-w-md font-custom2">
      Join the waitlist and be the first to access trusted healthcare discovery across India.
    </p>

    <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
      <Link to="/auth" className="font-custom2 bg-white text-slate-900 font-semibold text-sm px-6 py-3 rounded-full hover:bg-slate-100 hover:-translate-y-0.5 transition-all duration-200">
         Join the Waitlist
      </Link>
    </div>

  </div>

</div>

    <Footer links="flex items-center gap-6" />
    </>
  );
}
