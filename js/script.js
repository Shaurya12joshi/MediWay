const menuBtn = document.getElementById("menuBtn");
const closeBtn = document.getElementById("closeBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

menuBtn.addEventListener("click", () => {
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
    sidebar.classList.remove("translate-x-full");
    sidebar.classList.remove("opacity-0");
    });
    overlay.classList.remove("opacity-0");
    overlay.classList.remove("pointer-events-none");

});

function closeSidebar() {

    sidebar.classList.add("translate-x-full");
    sidebar.classList.add("opacity-0");
    overlay.classList.add("opacity-0");
    overlay.classList.add("pointer-events-none");
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 500);

}
closeBtn.addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

sidebar.addEventListener("click", (e) => {
    e.stopPropagation();
});
const testimonials = [
            { initials:'AK', bg:'bg-blue-100', color:'text-blue-900', quote:'Found an English-speaking doctor in Jaipur within 2 minutes. Absolute lifesaver during my solo trip.', name:'Anika K.', loc:'Tourist from Germany' },
            { initials:'RS', bg:'bg-green-100', color:'text-green-900', quote:'Was in Hyderabad for work, fell sick at midnight. MediWay showed me a 24/7 clinic 0.3 km away.', name:'Rahul S.', loc:'Business traveler, Delhi' },
            { initials:'MJ', bg:'bg-amber-100', color:'text-amber-900', quote:'As a foreign student in Pune, I had no idea where to go. This made healthcare feel less scary.', name:'Marco J.', loc:'Student from Italy' },
            { initials:'PL', bg:'bg-red-100', color:'text-red-900', quote:'Emergency mode found the nearest ER in seconds. I didn\'t have to think — just followed directions.', name:'Preethi L.', loc:'Domestic traveler, Kerala' },
        ];

        let current = 0; let timer;

        testimonials.forEach((_, i) => {
            const d = document.createElement('button');
            d.className = `h-1.5 rounded-full transition-all duration-200 ${i === 0 ? 'w-4 bg-[#D0423A]' : 'w-1.5 bg-slate-300'}`;
            d.addEventListener('click', () => { clearInterval(timer); show(i); startTimer(); });
        });

        function show(i) {
            current = i;
            const t = testimonials[i];
            const av = document.getElementById('t-avatar');
            av.textContent = t.initials;
            av.className = `w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${t.bg} ${t.color}`;
            document.getElementById('t-quote').textContent = t.quote;
            document.getElementById('t-name').textContent = t.name;
            document.getElementById('t-loc').textContent = '· ' + t.loc;
            dotsEl.querySelectorAll('button').forEach((d, idx) => {
                d.className = `h-1.5 rounded-full transition-all duration-200 ${idx === i ? 'w-4 bg-[#D0423A]' : 'w-1.5 bg-slate-300'}`;
            });
        }

        function startTimer() { timer = setInterval(() => show((current + 1) % testimonials.length), 3500); }
        startTimer();

function updateClock() {
    const now = new Date();
    document.getElementById('em-clock').textContent =
      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 1000);

  function sosActivate() {
    const statusBar = document.getElementById('em-status');
    const dot = document.getElementById('em-status-dot');
    const text = document.getElementById('em-status-text');

    statusBar.classList.replace('bg-red-50', 'bg-green-50');
    statusBar.classList.replace('border-red-100', 'border-green-100');
    dot.classList.replace('bg-red-500', 'bg-green-500');
    text.classList.replace('text-red-800', 'text-green-800');
    text.textContent = 'SOS sent! Emergency contact notified.';

    setTimeout(() => {
      statusBar.classList.replace('bg-green-50', 'bg-red-50');
      statusBar.classList.replace('border-green-100', 'border-red-100');
      dot.classList.replace('bg-green-500', 'bg-red-500');
      text.classList.replace('text-green-800', 'text-red-800');
      text.textContent = 'Locating nearest emergency services…';
    }, 3000);
  }


const testimonialsMd = [
    { initials:'AK', bg:'bg-blue-100', color:'text-blue-900', quote:'Found an English-speaking doctor in Jaipur within 2 minutes. Absolute lifesaver during my solo trip.', name:'Anika K.', loc:'Tourist from Germany' },
    { initials:'RS', bg:'bg-green-100', color:'text-green-900', quote:'Was in Hyderabad for work, fell sick at midnight. MediWay showed me a 24/7 clinic 0.3 km away.', name:'Rahul S.', loc:'Business traveler, Delhi' },
    { initials:'MJ', bg:'bg-amber-100', color:'text-amber-900', quote:'As a foreign student in Pune, I had no idea where to go. This made healthcare feel less scary.', name:'Marco J.', loc:'Student from Italy' },
    { initials:'PL', bg:'bg-red-100', color:'text-red-900', quote:"Emergency mode found the nearest ER in seconds. I didn't have to think — just followed directions.", name:'Preethi L.', loc:'Domestic traveler, Kerala' },
];

let currentMd = 0;
let timerMd;
const dotsElMd = document.getElementById('t-dotsMd');

testimonialsMd.forEach((_, i) => {
    const dMd = document.createElement('button'); 
    dMd.className = `h-1.5 rounded-full transition-all duration-200 ${i === 0 ? 'w-4 bg-[#D0423A]' : 'w-1.5 bg-slate-300'}`;
    dMd.addEventListener('click', () => { clearInterval(timerMd); showMd(i); startTimerMd(); });
    dotsElMd.appendChild(dMd);
});

function showMd(i) { 
    currentMd = i;
    const tMd = testimonialsMd[i];
    const avMd = document.getElementById('t-avatarMd');
    avMd.textContent = tMd.initials;
    avMd.className = `w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${tMd.bg} ${tMd.color}`;
    document.getElementById('t-quoteMd').textContent = tMd.quote;
    document.getElementById('t-nameMd').textContent = tMd.name;
    document.getElementById('t-locMd').textContent = '· ' + tMd.loc;
    dotsElMd.querySelectorAll('button').forEach((dMd, idx) => { 
        dMd.className = `h-1.5 rounded-full transition-all duration-200 ${idx === i ? 'w-4 bg-[#D0423A]' : 'w-1.5 bg-slate-300'}`;
    });
}

function startTimerMd() {  
    timerMd = setInterval(() => showMd((currentMd + 1) % testimonialsMd.length), 3500);
}

startTimerMd();

  function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.textContent = 'Saving your spot...';
    btn.disabled = true;
    btn.classList.add('opacity-60');
    setTimeout(() => {
      document.getElementById('waitlistForm').classList.add('hidden');
      const msg = document.getElementById('successMsg');
      msg.classList.remove('hidden');
      msg.style.opacity = '0';
      setTimeout(() => {
        msg.style.transition = 'opacity 0.4s ease';
        msg.style.opacity = '1';
      }, 50);
    }, 1000);
  }

 


