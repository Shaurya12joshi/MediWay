import{n as e,r as t,t as n}from"./supabase-D_nnYTw3.js";var r=t((()=>{n();var t=[`Sun`,`Mon`,`Tue`,`Wed`,`Thu`,`Fri`,`Sat`];function r(e){let[t,n]=e.split(`:`).map(Number);return t*60+n}function i(e){let[t,n]=e.split(`:`).map(Number),r=t<12?`AM`:`PM`,i=t%12||12;return n===0?`${i} ${r}`:`${i}:${String(n).padStart(2,`0`)} ${r}`}function a(){let e=new Date,t=e.getTime()+e.getTimezoneOffset()*6e4,n=new Date(t+330*6e4);return{day:n.getDay(),mins:n.getHours()*60+n.getMinutes()}}function o(e){let n=e.schedule||[],{day:o,mins:s}=a();for(let e of n)if(e.days.includes(o)){let t=r(e.open),n=r(e.close);if(s>=t&&s<n)return{open:!0,label:`Open · closes ${i(e.close)}`,nextSlot:`Today ${i(e.open)}`}}let c=n.filter(e=>e.days.includes(o)&&r(e.open)>s).sort((e,t)=>r(e.open)-r(t.open));if(c.length){let e=c[0];return{open:!1,label:`Closed · opens ${i(e.open)}`,nextSlot:`Today ${i(e.open)}`}}for(let e=1;e<=7;e++){let a=(o+e)%7,s=n.filter(e=>e.days.includes(a)).sort((e,t)=>r(e.open)-r(t.open));if(s.length){let n=s[0],r=e===1?`Tomorrow`:t[a];return{open:!1,label:`Closed · opens ${r} ${i(n.open)}`,nextSlot:`${r} ${i(n.open)}`}}}return{open:!1,label:`Closed today`,nextSlot:`Check back later`}}function s(e){let n=e.schedule||[];if(!n.length)return`Timings not listed`;let r=[];for(let e of n){let t=e.days.join(`,`),n=r.find(e=>e.key===t),a=`${i(e.open)} – ${i(e.close)}`;n?n.ranges.push(a):r.push({key:t,days:e.days,ranges:[a]})}return r.map(e=>{let n=[...e.days].sort((e,t)=>e-t),r;return r=n.length===1?t[n[0]]:n.every((e,t)=>t===0||e===n[t-1]+1)?`${t[n[0]]}–${t[n[n.length-1]]}`:n.map(e=>t[e]).join(`, `),`${r}: ${e.ranges.join(`, `)}`}).join(` · `)}var c=25.31668,l=83.01041;function u(e){let t=`${e.hospital||``} ${e.hospital_address||``}`.trim();return`https://www.google.com/maps/dir/?api=1&origin=${c},${l}&destination=${encodeURIComponent(t)}`}function d(e,t=14){let n=`<span class="inline-flex gap-[1px] leading-[1]">`;for(let r=1;r<=5;r++)n+=`<span style="font-size:${t}px;color:${r<=Math.round(e)?`#F59E0B`:`#D1D5DB`}">★</span>`;return n+`</span>`}function f(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}async function p(t){let{data:n,error:r}=await e.from(`doctors`).select(`*`).eq(`id`,t).single();return r?(console.error(`fetchDoctor error:`,r),null):n}async function m(t){let{data:n,error:r}=await e.from(`reviews`).select(`*`).eq(`doctor_id`,t).order(`created_at`,{ascending:!1});return r?(console.warn(`No reviews table, or error fetching reviews:`,r.message),[]):n||[]}async function h(t,n){let r=`helpful_`+n,i=localStorage.getItem(r)===`1`,a=t.querySelector(`.hcnt`);t.disabled=!0;let{data:o,error:s}=await e.rpc(i?`decrement_helpful`:`increment_helpful`,{review_id:n});if(t.disabled=!1,s){console.error(`helpful vote failed:`,s);return}i?(localStorage.removeItem(r),t.classList.remove(`liked`)):(localStorage.setItem(r,`1`),t.classList.add(`liked`)),a.textContent=o??(i?Math.max(0,a.textContent-1):+a.textContent+1)}var g=`recent`,_=`all`,v=[];function y(e){if(!e)return``;let t=new Date(e);return isNaN(t)?``:t.toLocaleDateString(`en-US`,{month:`short`,year:`numeric`})}function b(){let e=v;_===`verified`&&(e=e.filter(e=>e.verified)),_===`5`&&(e=e.filter(e=>e.rating===5)),_===`4`&&(e=e.filter(e=>e.rating===4)),_===`low`&&(e=e.filter(e=>e.rating<=3)),g===`recent`&&(e=[...e].sort((e,t)=>new Date(t.created_at)-new Date(e.created_at))),g===`helpful`&&(e=[...e].sort((e,t)=>(t.helpful_count||0)-(e.helpful_count||0))),g===`highest`&&(e=[...e].sort((e,t)=>t.rating-e.rating)),g===`lowest`&&(e=[...e].sort((e,t)=>e.rating-t.rating));let t=document.getElementById(`reviewsList`);if(t){if(!e.length){t.innerHTML=`<div class="text-center py-[40px] text-[14px] text-faint">No reviews match this filter.</div>`;return}t.innerHTML=e.map((e,t)=>`
    <div class="bg-white rounded-[16px] border border-border p-[22px] transition-all duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,.07)] hover:translate-y-[-1px] animate-fade-up ${e.verified?`border-l-[3px] border-l-red`:``}" style="animation-delay:${t*.05}s">
      <div class="flex items-start justify-between gap-[12px] mb-[14px]">
        <div class="flex items-center gap-[12px]">
          <div class="w-[40px] h-[40px] rounded-full bg-[linear-gradient(135deg,#94A3B8,#64748B)] flex items-center justify-center font-semibold text-[15px] text-white shrink-0">${f((e.author||`?`).charAt(0))}</div>
          <div>
            <div class="font-semibold text-[14px] text-text flex items-center gap-[6px] flex-wrap">
              ${f(e.author)}
              ${e.verified?`<span class="inline-flex items-center gap-[3px] text-[10px] font-semibold bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] py-[2px] px-[7px] rounded-[5px]"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>Visited</span>`:``}
            </div>
            <div class="text-[11px] text-faint mt-[2px]">${f(e.origin||``)}${e.origin&&e.created_at?` · `:``}${y(e.created_at)}</div>
          </div>
        </div>
      ${d(e.rating,13)}
      </div>
      ${e.recommend!==null&&e.recommend!==void 0?`
        <div class="inline-flex items-center gap-[5px] text-[11px] font-semibold py-[4px] px-[10px] rounded-[6px] mb-[10px] ${e.recommend?`bg-[#F0FDF4] text-[#16A34A]`:`bg-[#FEF2F2] text-[#DC2626]`}">
          ${e.recommend?`👍 Recommends this doctor`:`👎 Would not recommend`}
        </div>`:``}
      ${e.title?`<div class="font-semibold text-[14px] text-text mb-[6px]">${f(e.title)}</div>`:``}
      ${e.body?`<div class="text-[13px] text-muted leading-[1.65] mb-[4px]">${f(e.body)}</div>`:``}
      ${e.stood_out?.length?`
        <div class="mt-[10px]">
          <div class="text-[10px] font-bold tracking-[.06em] uppercase text-[#16A34A] mb-[6px]">Stood out</div>
          <div class="flex flex-wrap gap-[5px]">${e.stood_out.map(e=>`<span class="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]">${f(e)}</span>`).join(``)}</div>
        </div>`:``}
      ${e.could_improve?.length?`
        <div class="mt-[10px]">
          <div class="text-[10px] font-bold tracking-[.06em] uppercase text-[#B45309] mb-[6px]">Could improve</div>
          <div class="flex flex-wrap gap-[5px]">${e.could_improve.map(e=>`<span class="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309]">${f(e)}</span>`).join(``)}</div>
        </div>`:``}
      ${e.tags?.length?`<div class="flex flex-wrap gap-[5px] mt-[10px]">${e.tags.map(e=>`<span class="text-[11px] font-medium py-[3px] px-[10px] rounded-[6px] bg-[#F2F1ED] border border-border text-faint">${f(e)}</span>`).join(``)}</div>`:``}
      ${e.visit_date?`<div class="text-[11px] text-faint mt-[8px]">Visited: ${f(e.visit_date)}</div>`:``}
      <div class="flex items-center gap-[10px] mt-[14px] pt-[12px] border-t border-border">
        <button class="like-btn flex items-center gap-[5px] text-[12px] text-faint border-[1.5px] border-border rounded-[8px] py-[5px] px-[11px] bg-white cursor-pointer transition-colors duration-150 hover:border-red hover:text-red [&.liked]:text-red [&.liked]:border-[#F5C6C2] [&.liked]:bg-[#FDECEA] ${localStorage.getItem(`helpful_`+e.id)===`1`?`liked`:``}" onclick="toggleHelpful(this,'${e.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="${localStorage.getItem(`helpful_`+e.id)===`1`?`#D0423A`:`none`}" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          Helpful <span class="hcnt">${e.helpful_count||0}</span>
        </button>
        <div class="w-[1px] h-[14px] bg-border"></div>
        <span class="text-[11px] text-faint">${e.verified?`Verified visit`:`Unverified`}</span>
      </div>
    </div>`).join(``)}}function x(e,t){g=e,document.querySelectorAll(`.sort-tab`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`),b()}function S(e,t){_=e,document.querySelectorAll(`.filter-chip`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`),b()}function C(e){e.id;let t=v.length,n=t?(v.reduce((e,t)=>e+t.rating,0)/t).toFixed(1):`0.0`,r=e.rating_breakdown;r||(r={5:0,4:0,3:0,2:0,1:0},v.forEach(e=>{r[Math.round(e.rating)]=(r[Math.round(e.rating)]||0)+1}));let i=Object.values(r).reduce((e,t)=>e+t,0)||1,a=o(e),c=s(e),l=Array.isArray(e.specialty)?e.specialty.join(`, `):e.specialty||``,p=e.languages||[],m=(e.name||``).split(` `).slice(1).join(` `),h=t?n:`—`,g=t;document.getElementById(`profileContent`).innerHTML=`
<div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[24px] items-start">
  <div class="flex flex-col gap-[20px] min-w-0">

    <div class="bg-white rounded-[18px] border border-border overflow-hidden">
      <div class="h-[4px] bg-[linear-gradient(90deg,#D0423A_0%,#E87040_60%,#F4A261_100%)]"></div>
      <div class="p-[28px] flex gap-[24px] items-start">
        <div class="relative shrink-0">
          <div class="w-[96px] h-[96px] rounded-[22px] flex items-center justify-center font-serif text-[30px] text-white shadow-[0_0_0_3px_#F5F0EB,0_0_0_5px_rgba(208,66,58,.15)]" style="background:${e.avatar_bg||`linear-gradient(135deg,#94A3B8,#64748B)`}">${f(e.initials||``)}</div>
          ${a.open?`<div class="absolute bottom-[-2px] right-[-2px] w-[20px] h-[20px] rounded-full bg-[#22C55E] border-[3px] border-white"></div>`:``}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-[16px] flex-wrap">
            <div>
              ${e.featured?`<div class="inline-block bg-red text-white text-[10px] font-bold tracking-[.08em] uppercase py-[3px] px-[10px] rounded-[6px] mb-[8px]">⭐ Top Pick</div>`:``}
              <h1 class="font-serif text-[30px] leading-[1.1] text-text">${f(e.name)}</h1>
              <div class="text-[14px] font-semibold text-red mt-[4px]">${f(l)}</div>
              ${e.qualification?`<div class="text-[12px] text-faint mt-[2px]">${f(e.qualification)}</div>`:``}
            </div>
            <div class="bg-bg border border-border rounded-[14px] py-[12px] px-[18px] text-center shrink-0 min-w-[110px]">
              <div class="font-serif text-[36px] leading-[1] text-text">${h}</div>
              <div style="margin-top:6px">${d(+h||0,14)}</div>
              <div class="text-[11px] text-faint mt-[4px]">${g} reviews</div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-[20px] mt-[20px] pt-[18px] border-t border-border">
            <div class="flex items-center gap-[6px] text-[13px] text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
              ${f(e.hospital||``)} · <strong class="text-text font-semibold">${e.distance_km??`—`} km away</strong>
            </div>
            <div class="flex items-center gap-[6px] text-[13px] text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <strong class="text-text font-semibold">${e.experience??`—`} yrs</strong> experience
            </div>
            <div class="flex items-center gap-[6px] text-[13px] text-muted ${a.open?`text-[#16A34A] font-semibold`:``}">
              <div class="w-[8px] h-[8px] rounded-full inline-block ${a.open?`bg-[#22C55E]`:`bg-faint`}"></div>
              ${a.label}
            </div>
          </div>
          <div class="flex flex-wrap gap-[6px] mt-[14px]">
            ${e.walk_in?`<span class="inline-flex items-center gap-[5px] text-[11px] font-semibold py-[5px] px-[12px] rounded-[100px] bg-[#EFF6FF] border-[1.5px] border-[#BFDBFE] text-[#1D4ED8]"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Walk-ins welcome</span>`:``}
            ${e.insurance?`<span class="inline-flex items-center gap-[5px] text-[11px] font-semibold py-[5px] px-[12px] rounded-[100px] bg-[#EFF6FF] border-[1.5px] border-[#BFDBFE] text-[#1D4ED8]"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Insurance accepted</span>`:``}
            ${p.map(e=>`<span class="inline-flex items-center gap-[5px] text-[11px] font-medium py-[5px] px-[12px] rounded-[100px] bg-[#F2F1ED] border-[1.5px] border-border text-muted">${f(e)}</span>`).join(``)}
          </div>
        </div>
      </div>
    </div>

    ${e.about||e.specialties&&e.specialties.length?`
    <div class="bg-white rounded-[18px] border border-border overflow-hidden p-[28px]">
      ${e.about?`<div class="text-[10px] font-bold tracking-[.1em] uppercase text-faint mb-[14px]">About</div><p class="text-[14px] text-muted leading-[1.7]">${f(e.about)}</p>`:``}
      ${e.specialties?.length?`
        <div class="text-[10px] font-bold tracking-[.1em] uppercase text-faint mb-[14px] mt-[20px]">Specialises in</div>
        <div class="flex flex-wrap gap-[8px] mt-[16px]">${e.specialties.map(e=>`<span class="text-[12px] font-medium py-[6px] px-[14px] rounded-[9px] bg-[#F2F1ED] border border-border text-muted cursor-default transition-all duration-150 hover:bg-[#FDECEA] hover:border-[#F3C9C6] hover:text-[#C83930]">${f(e)}</span>`).join(``)}</div>`:``}
    </div>`:``}

    <div class="bg-white rounded-[18px] border border-border overflow-hidden p-[28px]">
      <div class="flex items-start justify-between gap-[16px] flex-wrap mb-[24px]">
        <div>
          <h2 class="font-serif text-[22px] text-text">Patient reviews</h2>
          <p class="text-[12px] text-faint mt-[4px]">${t} review${t===1?``:`s`} collected</p>
        </div>
        <a href="review.html?id=${e.id}" class="inline-flex items-center gap-[7px] bg-red text-white text-[13px] font-semibold py-[10px] px-[18px] rounded-[10px] no-underline transition-colors duration-150 hover:bg-red-dark shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Write a review
        </a>
      </div>
      <div class="flex items-center gap-[40px]">
        <div class="text-center shrink-0">
          <div class="font-serif text-[68px] leading-[1] text-text">${n}</div>
          <div style="margin-top:8px">${d(+n||0,17)}</div>
          <div class="text-[11px] text-faint mt-[8px]">out of 5.0</div>
        </div>
        <div class="flex-1 flex flex-col gap-[9px]">
          ${[5,4,3,2,1].map(e=>`
            <div class="flex items-center gap-[10px]">
              <span class="text-[12px] text-muted w-[10px] text-right shrink-0">${e}</span>
              <span class="text-[13px] text-[#F59E0B] shrink-0">★</span>
              <div class="flex-1 h-[8px] bg-[#F2F1ED] rounded-[100px] overflow-hidden"><div class="h-full rounded-[100px] transition-[width] duration-700 ease-[cubic-bezier(.4,0,.2,1)] ${e>=4?`bg-red`:`bg-[#E6C4C1]`}" style="width:${Math.round((r[e]||0)/i*100)}%"></div></div>
              <span class="text-[12px] text-faint w-[28px] text-right shrink-0">${r[e]||0}</span>
            </div>`).join(``)}
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between flex-wrap gap-[10px]">
      <div class="flex items-center gap-[6px] flex-wrap">
        <span class="text-[12px] text-faint mr-[2px]">Sort:</span>
        <button class="sort-tab active py-[6px] px-[14px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-text [&.active]:border-text [&.active]:text-white" onclick="setSort('recent',this)">Recent</button>
        <button class="sort-tab py-[6px] px-[14px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-text [&.active]:border-text [&.active]:text-white" onclick="setSort('helpful',this)">Most helpful</button>
        <button class="sort-tab py-[6px] px-[14px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-text [&.active]:border-text [&.active]:text-white" onclick="setSort('highest',this)">Highest</button>
        <button class="sort-tab py-[6px] px-[14px] rounded-[8px] text-[12px] font-medium border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-text [&.active]:border-text [&.active]:text-white" onclick="setSort('lowest',this)">Lowest</button>
      </div>
      <div class="flex items-center gap-[6px] flex-wrap">
        <button class="filter-chip active py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold" onclick="setFilter('all',this)">All</button>
        <button class="filter-chip py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold" onclick="setFilter('verified',this)">✓ Verified</button>
        <button class="filter-chip py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold" onclick="setFilter('5',this)">5★ only</button>
        <button class="filter-chip py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold" onclick="setFilter('4',this)">4★ only</button>
        <button class="filter-chip py-[5px] px-[12px] rounded-[100px] text-[12px] border-[1.5px] border-border bg-white text-faint cursor-pointer transition-all duration-150 hover:border-[#94A3B8] hover:text-text [&.active]:bg-[#FDECEA] [&.active]:border-[#F3C9C6] [&.active]:text-red [&.active]:font-semibold" onclick="setFilter('low',this)">1–3★</button>
      </div>
    </div>

    <div class="flex flex-col gap-[14px]" id="reviewsList"></div>

  </div>

  <div class="sticky top-[76px] flex flex-col gap-[16px]">

    <div class="bg-white rounded-[18px] border border-border overflow-hidden">
      <div class="p-[20px_22px_16px] border-b border-border">
        <h3 class="font-serif hidden text-[20px] text-text">Book appointment</h3>
        <p class="text-[12px] text-faint mt-[3px]">Confirm your slot in seconds</p>
      </div>
      <div class="p-[20px_22px] flex flex-col gap-[14px]">
        <div class="bg-[#F0FDF4] border border-[#BBF7D0] rounded-[12px] p-[11px_14px] flex items-center justify-between">
          <div class="flex items-center gap-[7px] text-[12px] text-muted font-medium"><div class="w-[7px] h-[7px] rounded-full bg-[#22C55E] shrink-0"></div>Next available</div>
          <div class="text-[13px] font-bold text-[#16A34A]">${a.nextSlot}</div>
        </div>
        ${e.consult_fee==null?``:`
        <div class="flex items-center justify-between py-[14px] border-y border-border">
          <span class="text-[12px] text-faint">Consultation fee</span>
          <div class="flex items-baseline gap-[3px]">
            <span class="font-serif text-[26px] text-text">₹${e.consult_fee}</span>
            <span class="text-[11px] text-faint">/ visit</span>
          </div>
        </div>`}
        <button class="w-full  hidden bg-red text-white border-none p-[14px] rounded-[11px] text-[14px] font-semibold cursor-pointer transition-all duration-150 hover:bg-red-dark active:scale-[.98] flex items-center justify-center gap-[7px] font-sans">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Book appointment →
        </button>
        <a href="${u(e)}" target="_blank" class="w-full bg-white text-text border-[1.5px] border-border p-[12px] rounded-[11px] text-[13px] font-semibold cursor-pointer transition-all duration-150 hover:border-red hover:text-red flex items-center justify-center gap-[7px] no-underline font-sans">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Get directions
        </a>
      </div>
    </div>

    <div class="bg-white rounded-[18px] border border-border overflow-hidden">
      <div class="p-[22px]">
        <div class="text-[10px] font-bold tracking-[.1em] uppercase text-faint mb-[14px]">Clinic info</div>
        <div class="flex flex-col gap-[16px] mt-[4px]">
          <div class="flex gap-[12px] items-start">
            <div class="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></div>
            <div><div class="text-[13px] font-semibold text-text">${f(e.hospital||``)}</div><div class="text-[12px] text-faint mt-[2px] leading-[1.5]">${f(e.hospital_address||``)}</div></div>
          </div>
          <div class="flex gap-[12px] items-start">
            <div class="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <div><div class="text-[13px] font-semibold text-text">Timings</div><div class="text-[12px] text-faint mt-[2px] leading-[1.5]">${f(c)}</div></div>
          </div>
          <div class="flex gap-[12px] items-start">
            <div class="w-[36px] h-[36px] rounded-[10px] bg-[#F2F1ED] flex items-center justify-center shrink-0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <div>
              <div class="text-[13px] font-semibold text-text">Languages</div>
              <div class="flex flex-wrap gap-[5px] mt-[6px]">${p.map(e=>`<span class="text-[11px] font-medium py-[3px] px-[9px] rounded-[6px] bg-[#F2F1ED] border border-border text-muted">${f(e)}</span>`).join(``)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-[18px] overflow-hidden bg-[#1a1a1a] p-[22px]">
      <div class="w-[40px] h-[40px] rounded-[10px] bg-[rgba(255,255,255,.1)] flex items-center justify-center mb-[16px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </div>
      <div class="font-serif text-[17px] text-white mb-[6px]">Visited ${f(m)}?</div>
      <div class="text-[12px] text-[rgba(255,255,255,.45)] mb-[16px] leading-[1.55]">Your review helps other patients find the right care.</div>
      <a href="review.html?id=${e.id}" class="flex items-center justify-center gap-[7px] bg-red text-white text-[13px] font-semibold py-[11px] rounded-[10px] no-underline transition-colors duration-150 hover:bg-red-dark font-sans">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Write a review
      </a>
    </div>

  </div>
</div>`,document.getElementById(`ctaBar`).style.display=`block`,document.getElementById(`ctaName`).textContent=e.name,document.getElementById(`ctaSpec`).textContent=`${l} · ${e.hospital||``}`,document.getElementById(`ctaDir`).onclick=()=>window.open(u(e),`_blank`),b()}async function w(){let e=new URLSearchParams(location.search).get(`id`);if(!e){document.getElementById(`profileContent`).innerHTML=`<div class="text-center py-[64px]"><p class="font-serif text-[22px] mb-[12px]">No doctor specified</p><a href="searchResult.html" class="text-red text-[14px] hover:underline">← Back to results</a></div>`;return}let t=await p(e);if(!t){document.getElementById(`profileContent`).innerHTML=`<div class="text-center py-[64px]"><p class="font-serif text-[22px] mb-[12px]">Doctor not found</p><a href="searchResult.html" class="text-red text-[14px] hover:underline">← Back to results</a></div>`;return}v=await m(e),document.title=`MediWay — ${t.name}`,C(t)}window.toggleHelpful=h,window.setSort=x,window.setFilter=S,w()})),i=t((()=>{n();async function t(){var t=document.getElementById(`signOutBtn`),{data:n}=await e.auth.getSession();n.session?(t.textContent=`Sign Out`,t.onclick=async function(){await e.auth.signOut(),window.location.reload()}):(t.textContent=`Join Waitlist`,t.onclick=function(){window.location.href=`auth.html`})}t()}));r(),i();