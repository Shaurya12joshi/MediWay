import{n as e,r as t,t as n}from"./supabase-CBOYVQKp.js";var r=t((()=>{n();var t=new URLSearchParams(location.search).get(`id`),r=[`Bedside manner`,`Short wait time`,`Accurate diagnosis`,`Clear explanation`,`Friendly staff`,`Clean facility`,`Affordable`,`Followed up after visit`,`Walk-in friendly`,`On time`],i=[`Wait time`,`Communication`,`Front desk experience`,`Billing clarity`,`Appointment scheduling`,`Cleanliness`,`Parking / access`,`Follow-up care`],a=0,o=new Set,s=new Set,c=null;function l(e){let t=document.getElementById(`toast`);t.textContent=e,t.classList.remove(`opacity-0`,`pointer-events-none`),t.classList.add(`opacity-100`),setTimeout(()=>{t.classList.add(`opacity-0`,`pointer-events-none`),t.classList.remove(`opacity-100`)},2500)}function u(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}async function d(t){let{data:n,error:r}=await e.from(`doctors`).select(`id,name,hospital,specialty`).eq(`id`,t).single();return r?(console.error(r),null):n}function f(e,t){return e.map(e=>`<button type="button" data-val="${u(e)}" class="${t} text-[13px] font-medium py-[9px] px-[15px] rounded-[100px] border-[1.5px] border-border bg-white text-muted cursor-pointer transition-all font-sans">${u(e)}</button>`).join(``)}function p(t){document.getElementById(`backLink`).href=`profile.html?id=${t.id}`,document.getElementById(`pageBody`).innerHTML=`
    <div class="mb-[24px]">
      <h1 class="font-serif text-[26px] text-text leading-[1.15]">Rate your visit</h1>
      <p class="text-[13px] text-faint mt-[4px]">with <strong class="text-text">${u(t.name)}</strong> · takes about 20 seconds</p>
    </div>

    <form id="reviewForm" class="bg-white border border-border rounded-[18px] p-[26px] flex flex-col gap-[26px]">

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[12px]">Overall, how was it?</label>
        <div class="flex gap-[8px]" id="starPicker">
          ${[1,2,3,4,5].map(e=>`<button type="button" data-val="${e}" class="star-btn text-[38px] leading-none cursor-pointer bg-transparent border-none p-0" style="color:#D1D5DB">★</button>`).join(``)}
        </div>
        <p class="text-[12px] text-red mt-[8px] hidden" id="ratingError">Please select a star rating.</p>
      </div>

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[3px]">What stood out?</label>
        <p class="text-[12px] text-faint mb-[12px]">Tap all that apply — optional</p>
        <div class="flex flex-wrap gap-[8px]" id="stoodOutPicker">${f(r,`stood-btn`)}</div>
      </div>

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[3px]">What could be improved?</label>
        <p class="text-[12px] text-faint mb-[12px]">Tap all that apply — optional</p>
        <div class="flex flex-wrap gap-[8px]" id="improvePicker">${f(i,`improve-btn`)}</div>
      </div>

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[12px]">Would you recommend this doctor?</label>
        <div class="grid grid-cols-2 gap-[10px]">
          <button type="button" id="recYesBtn" class="rec-btn flex items-center justify-center gap-[8px] py-[13px] rounded-[12px] border-[1.5px] border-border bg-white text-muted text-[14px] font-semibold cursor-pointer transition-all font-sans">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            Yes
          </button>
          <button type="button" id="recNoBtn" class="rec-btn flex items-center justify-center gap-[8px] py-[13px] rounded-[12px] border-[1.5px] border-border bg-white text-muted text-[14px] font-semibold cursor-pointer transition-all font-sans">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:scaleY(-1)"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            No
          </button>
        </div>
        <p class="text-[12px] text-red mt-[8px] hidden" id="recError">Please let us know if you'd recommend them.</p>
      </div>

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[8px]">Your name</label>
        <input id="authorInput" type="text" placeholder="e.g. Priya S." required
          class="w-full border-[1.5px] border-border rounded-[10px] px-[14px] py-[10px] text-[14px] outline-none focus:border-red font-sans"/>
      </div>

      <div>
        <label class="block text-[13px] font-semibold text-text mb-[3px]">Proof of visit</label>
        <p class="text-[12px] text-faint mb-[12px]">Upload a photo of a prescription or bill to get a "Verified visit" badge on your review — optional, reviewed by our team, never shown publicly.</p>
        <label for="proofInput" class="flex flex-col items-center justify-center gap-[8px] border-[1.5px] border-dashed border-border rounded-[12px] py-[24px] cursor-pointer hover:border-red transition-all" id="proofDropzone">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span class="text-[13px] text-muted font-medium" id="proofLabel">Tap to upload photo</span>
        </label>
        <input id="proofInput" type="file" accept="image/*" class="hidden"/>
        <div class="hidden mt-[10px]" id="proofPreviewWrap">
          <img id="proofPreview" class="rounded-[10px] max-h-[160px] object-cover border border-border"/>
          <button type="button" id="proofRemoveBtn" class="text-[12px] text-red font-medium mt-[6px] bg-transparent border-none cursor-pointer p-0">Remove photo</button>
        </div>
      </div>

      <button type="submit" id="submitBtn" class="bg-red hover:bg-red-dark text-white border-none py-[14px] rounded-[12px] text-[14px] font-semibold cursor-pointer transition-colors font-sans">
        Submit review
      </button>
      <p class="text-[12px] text-red text-center hidden" id="submitError"></p>
    </form>
  `;let n=document.querySelectorAll(`.star-btn`);n.forEach(e=>{e.addEventListener(`click`,()=>{a=+e.dataset.val,n.forEach(e=>e.style.color=+e.dataset.val<=a?`#F59E0B`:`#D1D5DB`),document.getElementById(`ratingError`).classList.add(`hidden`)}),e.addEventListener(`mouseenter`,()=>{n.forEach(t=>t.style.color=+t.dataset.val<=+e.dataset.val?`#F59E0B`:`#D1D5DB`)})}),document.getElementById(`starPicker`).addEventListener(`mouseleave`,()=>{n.forEach(e=>e.style.color=+e.dataset.val<=a?`#F59E0B`:`#D1D5DB`)}),document.querySelectorAll(`.stood-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.val;o.has(t)?(o.delete(t),e.className=`stood-btn text-[13px] font-medium py-[9px] px-[15px] rounded-[100px] border-[1.5px] border-border bg-white text-muted cursor-pointer transition-all font-sans`):(o.add(t),e.className=`stood-btn text-[13px] font-semibold py-[9px] px-[15px] rounded-[100px] border-[1.5px] border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A] cursor-pointer transition-all font-sans`)})}),document.querySelectorAll(`.improve-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.val;s.has(t)?(s.delete(t),e.className=`improve-btn text-[13px] font-medium py-[9px] px-[15px] rounded-[100px] border-[1.5px] border-border bg-white text-muted cursor-pointer transition-all font-sans`):(s.add(t),e.className=`improve-btn text-[13px] font-semibold py-[9px] px-[15px] rounded-[100px] border-[1.5px] border-[#FDE68A] bg-[#FFFBEB] text-[#B45309] cursor-pointer transition-all font-sans`)})});let d=document.getElementById(`recYesBtn`),p=document.getElementById(`recNoBtn`);function m(){d.className=`rec-btn flex items-center justify-center gap-[8px] py-[13px] rounded-[12px] text-[14px] font-semibold cursor-pointer transition-all font-sans `+(c===!0?`border-[1.5px] border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]`:`border-[1.5px] border-border bg-white text-muted`),p.className=`rec-btn flex items-center justify-center gap-[8px] py-[13px] rounded-[12px] text-[14px] font-semibold cursor-pointer transition-all font-sans `+(c===!1?`border-[1.5px] border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]`:`border-[1.5px] border-border bg-white text-muted`)}d.addEventListener(`click`,()=>{c=!0,m(),document.getElementById(`recError`).classList.add(`hidden`)}),p.addEventListener(`click`,()=>{c=!1,m(),document.getElementById(`recError`).classList.add(`hidden`)});let h=null,g=document.getElementById(`proofInput`),_=document.getElementById(`proofPreviewWrap`),v=document.getElementById(`proofPreview`),y=document.getElementById(`proofLabel`),b=document.getElementById(`proofDropzone`);g.addEventListener(`change`,()=>{let e=g.files[0];if(e){if(e.size>8*1024*1024){l(`Photo is too large — please use one under 8MB`),g.value=``;return}h=e,v.src=URL.createObjectURL(e),_.classList.remove(`hidden`),b.classList.add(`hidden`),y.textContent=e.name}}),document.getElementById(`proofRemoveBtn`).addEventListener(`click`,()=>{h=null,g.value=``,_.classList.add(`hidden`),b.classList.remove(`hidden`)}),document.getElementById(`reviewForm`).addEventListener(`submit`,async n=>{n.preventDefault();let r=!1;if(a||(document.getElementById(`ratingError`).classList.remove(`hidden`),r=!0),c===null&&(document.getElementById(`recError`).classList.remove(`hidden`),r=!0),r)return;let i=document.getElementById(`submitBtn`),u=document.getElementById(`submitError`);u.classList.add(`hidden`),i.disabled=!0,i.textContent=h?`Uploading photo…`:`Submitting…`;let d=null;if(h){let n=(h.name.split(`.`).pop()||`jpg`).toLowerCase();d=`${t.id}/${crypto.randomUUID()}.${n}`;let{error:r}=await e.storage.from(`review-proofs`).upload(d,h,{upsert:!1});if(r){console.error(r),u.textContent=`Could not upload your photo. Please try again.`,u.classList.remove(`hidden`),i.disabled=!1,i.textContent=`Submit review`;return}}i.textContent=`Submitting…`;let f={doctor_id:t.id,author:document.getElementById(`authorInput`).value.trim()||`Anonymous`,rating:a,stood_out:[...o],could_improve:[...s],recommend:c,verified:!1,proof_photo_path:d,proof_status:d?`pending`:null,proof_submitted_at:d?new Date().toISOString():null},{error:p}=await e.from(`reviews`).insert(f);if(p){console.error(p),u.textContent=`Something went wrong submitting your review. Please try again.`,u.classList.remove(`hidden`),i.disabled=!1,i.textContent=`Submit review`;return}l(d?`Thanks! Your proof is pending review.`:`Thanks for your review!`),setTimeout(()=>{location.href=`profile.html?id=${t.id}`},800)})}async function m(){if(!t){document.getElementById(`pageBody`).innerHTML=`<div class="text-center py-[64px]"><p class="font-serif text-[20px] mb-[10px]">No doctor specified</p><a href="searchResult.html" class="text-red text-[14px] hover:underline">← Back to results</a></div>`;return}let e=await d(t);if(!e){document.getElementById(`pageBody`).innerHTML=`<div class="text-center py-[64px]"><p class="font-serif text-[20px] mb-[10px]">Doctor not found</p><a href="searchResult.html" class="text-red text-[14px] hover:underline">← Back to results</a></div>`;return}p(e)}m()})),i=t((()=>{n();async function t(){var t=document.getElementById(`signOutBtn`),{data:n}=await e.auth.getSession();n.session?(t.textContent=`Sign Out`,t.onclick=async function(){await e.auth.signOut(),window.location.reload()}):(t.textContent=`Join Waitlist`,t.onclick=function(){window.location.href=`auth.html`})}t()}));r(),i();