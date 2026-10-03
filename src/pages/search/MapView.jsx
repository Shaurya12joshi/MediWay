import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { getStatus } from '../../lib/hours';
import { openDirections, routeFound, setMapSort } from '../../store/searchSlice';
import { Stars } from '../../components/ui';
import { KindIcon, kindOf, placeStatus } from './kinds';
import { hasCoords, sortDoctors, specialtyText } from './filtering';
import {
  addRouteLayers, boundsOf, doctorPinHtml, doctorPopupHtml, emptyFeatureCollection,
  fetchRoute, loadMappls, placePinHtml, placePopupHtml,
} from './mappls';

const SORTS = [['rating', 'Top rated'], ['distance', 'Nearest'], ['name', 'A–Z']];
const SORT_BTN = 'px-[11px] py-[5px] rounded-[7px] text-[12px] font-medium border-[1.5px] cursor-pointer font-sans transition-all';
const CARD = 'map-card bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex gap-3 cursor-pointer hover:border-[#D0423A] hover:shadow-[0_2px_12px_rgba(208,66,58,.12)] transition-all';

// Keep the route clear of the directions drawer: a floating panel on the left from md,
// a bottom sheet below that. offset* ignores the slide-in transform, so this is safe mid-animation.
function routePadding(map) {
  const pad = { top: 100, right: 72, bottom: 60, left: 60 }; // top: room for the ~44px destination pin
  const drawer = document.getElementById('dirDrawer');
  const rect = map.getContainer().getBoundingClientRect();
  const { offsetLeft: left, offsetTop: top, offsetWidth: w } = drawer;
  if (window.matchMedia('(min-width: 768px)').matches) {
    pad.left = Math.max(pad.left, left + w - rect.left + 40);
  } else {
    pad.bottom = Math.max(pad.bottom, rect.bottom - top + 40);
  }
  // fitBounds refuses padding that leaves no room; fall back to the defaults then
  if (pad.left + pad.right > rect.width - 80) pad.left = 60;
  // Give up pin headroom before giving up the sheet's clearance
  if (pad.top + pad.bottom > rect.height - 80) pad.top = 40;
  if (pad.top + pad.bottom > rect.height - 80) pad.bottom = 60;
  return pad;
}

// One map for the whole visit. The SDK can't build a second map once the first one's container
// has left the page, so the map and its container live here and are re-attached when the search
// page comes back — which also makes returning from a profile instant.
// { container, map, userMarker, markers: { 'd<id>' | 'h<id>': Marker }, styleLoaded, fitted, lastOrigin, hint }
let kept = null;

// The map, its controls and the results pane beside it. Mounted the first time the map view
// opens and then kept (hidden in list view), so the map isn't rebuilt on every switch.
// `doctors` and `places` must be memoised by the caller: a new array rebuilds every marker.
export default function MapView({ visible, doctors, places, showDoctorCards }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { origin, mapSortBy, dirDoctor } = useSelector(s => s.search);

  const hostEl = useRef(null), hintEl = useRef(null), lastDir = useRef(null);
  const latest = useRef({ doctors, origin });
  const [ready, setReady] = useState(false);   // the map is on the page
  const [loaded, setLoaded] = useState(false); // ...and its style has loaded
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState(null); // 'd<id>' or 'h<id>'

  useEffect(() => { latest.current = { doctors, origin }; });

  function setActivePin(key) {
    if (!kept) return;
    Object.entries(kept.markers).forEach(([k, m]) =>
      m.getElement().querySelector('.mw-pin')?.classList.toggle('is-active', k === key));
  }

  // Highlight a result card (and a doctor's pin), scrolled into view
  function select(key) {
    setActiveKey(key);
    if (key.startsWith('d')) setActivePin(key);
    requestAnimationFrame(() => document.querySelector(`[data-map-card="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  // From a result card: fly to its marker and open only its popup
  function focus(key) {
    const marker = kept?.markers[key];
    if (!ready || !marker) return;
    const { lng, lat } = marker.getLngLat();
    kept.map.flyTo({ center: [lng, lat], zoom: Math.max(kept.map.getZoom(), 15), duration: 700 });
    Object.entries(kept.markers).forEach(([k, x]) => {
      if ((k === key) !== !!x.getPopup()?.isOpen()) x.togglePopup();
    });
    select(key);
  }

  function fitToResults({ animate = true } = {}) {
    const o = latest.current.origin;
    if (!kept || !o) return;
    const points = Object.values(kept.markers).map(x => { const p = x.getLngLat(); return [p.lng, p.lat]; });
    // Pins are anchored at their tip and stand ~44px tall; the legend and controls sit on top / right
    kept.map.fitBounds(boundsOf([[o.lng, o.lat], ...points]), { padding: { top: 100, bottom: 40, left: 48, right: 72 }, maxZoom: 15, animate });
  }

  // Put the map on the page: the kept one, or a new one once there's somewhere to centre it
  const hasOrigin = Boolean(origin);
  useEffect(() => {
    if (!hasOrigin) return;
    const host = hostEl.current;
    let cancelled = false;
    const whenLoaded = () => kept.styleLoaded.then(() => { if (!cancelled) setLoaded(true); });

    if (kept) {
      host.appendChild(kept.container);
      kept.hint = hintEl.current;
      kept.map.resize();
      setReady(true);
      whenLoaded();
    } else {
      // Styles target #map (popups in src/index.css)
      const container = document.createElement('div');
      container.id = 'map';
      container.className = 'w-full h-full';
      host.appendChild(container);

      loadMappls().then(mappls => {
        if (cancelled) return;
        const o = latest.current.origin;
        const map = new mappls.Map('map', {
          center: { lat: o.lat, lng: o.lng },
          zoom: 13,
          backgroundColor: '#F3ECE4',
          // Our own controls sit on top of the map
          zoomControl: false,
          fullscreenControl: false,
          rotateControl: false,
          scaleControl: false,
          traffic: false,
          geolocation: false,
          location: false,
          clickableIcons: false,
        });

        // Phones: the map is stacked in a scrolling page, so pan with two fingers only
        // (what MapLibre's cooperativeGestures does internally).
        if (window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches) {
          const touchPan = map.handlers?._handlersById?.touchPan;
          if (touchPan) {
            touchPan._minTouches = 2;
            let hideHint;
            map.getContainer().addEventListener('touchmove', e => {
              if (e.touches.length !== 1) return;
              kept?.hint?.classList.remove('opacity-0');
              clearTimeout(hideHint);
              hideHint = setTimeout(() => kept?.hint?.classList.add('opacity-0'), 1200);
            }, { passive: true });
          }
        }

        const userMarker = new mappls.Marker({
          map,
          position: { lat: o.lat, lng: o.lng },
          html: '<div class="mw-user"></div>',
          width: 22,
          height: 22,
          popupHtml: '<div class="text-[13px] font-semibold text-[#1E293B]">You are here</div>',
          popupOptions: { offset: [0, -14], closeButton: false },
        });

        // Zoomed out past city level, full pins pile into one blob over the region: shrink them to dots
        const syncPinScale = () => map.getContainer().classList.toggle('mw-far', map.getZoom() < 10);
        map.addListener('zoom', syncPinScale);
        syncPinScale();

        const styleLoaded = new Promise(res => {
          if (map.loaded()) res(); else map.addListener('load', res);
        }).then(() => addRouteLayers(map));

        kept = { container, map, userMarker, markers: {}, styleLoaded, fitted: false, lastOrigin: `${o.lat},${o.lng}`, hint: hintEl.current };
        setReady(true);
        whenLoaded();
      }).catch(err => {
        console.error('Map failed to load:', err);
        if (!cancelled) setFailed(true);
      });
    }

    // Off the page, not destroyed: the next visit re-attaches it
    return () => {
      cancelled = true;
      host.replaceChildren();
      setReady(false);
      setLoaded(false);
    };
  }, [hasOrigin]);

  // Markers for the current results
  useEffect(() => {
    if (!ready) return;
    const { map } = kept, mappls = window.mappls;
    Object.values(kept.markers).forEach(x => mappls.remove({ map, layer: x }));
    kept.markers = {};

    places.forEach(h => {
      const key = 'h' + h.id;
      kept.markers[key] = new mappls.Marker({
        map,
        position: { lat: +h.lat, lng: +h.lng },
        html: placePinHtml(h),
        width: 30,
        height: 30,
        popupHtml: placePopupHtml(h, origin),
        popupOptions: { offset: [0, -18], maxWidth: 'none' },
      });
      kept.markers[key].getElement().addEventListener('click', () => select(key));
    });

    doctors.filter(hasCoords).forEach(d => {
      const key = 'd' + d.id;
      // Markers are centre-anchored: shift up by half the 44px height so the tip sits on the spot
      kept.markers[key] = new mappls.Marker({
        map,
        position: { lat: +d.lat, lng: +d.lng },
        html: doctorPinHtml(d),
        width: 38,
        height: 44,
        offset: [0, -22],
        popupHtml: doctorPopupHtml(d),
        popupOptions: { offset: [0, -48], maxWidth: 'none' },
      });
      kept.markers[key].getElement().addEventListener('click', () => select(key));
    });

    // The first time results appear, frame them all (unless a route is about to be framed instead)
    if (!kept.fitted) {
      kept.fitted = true;
      if (!dirDoctor) fitToResults({ animate: false });
    }
  }, [ready, doctors, places, origin]); // not dirDoctor: opening directions mustn't rebuild the markers

  // A new origin (location detected, city changed): move "you are here" and go there
  useEffect(() => {
    if (!ready || !origin) return;
    const key = `${origin.lat},${origin.lng}`;
    if (kept.lastOrigin === key) return;
    kept.lastOrigin = key;
    kept.userMarker.setPosition({ lat: origin.lat, lng: origin.lng });
    kept.map.flyTo({ center: [origin.lng, origin.lat], zoom: 14 });
  }, [ready, origin]);

  // The container was display:none in list view
  useEffect(() => {
    if (visible && ready) kept.map.resize();
  }, [visible, ready]);

  // Directions drawer open: draw the road route to that doctor
  useEffect(() => {
    if (!ready) return;
    const { map, styleLoaded } = kept;
    if (!dirDoctor) {
      lastDir.current = null;
      styleLoaded.then(() => map.getSource('route')?.setData(emptyFeatureCollection()));
      return;
    }
    const justOpened = lastDir.current !== dirDoctor.id;
    lastDir.current = dirDoctor.id;
    if (!visible || !origin || !hasCoords(dirDoctor)) return;

    if (justOpened && !window.matchMedia('(min-width: 768px)').matches) {
      // Phones: the map is stacked in the page, so bring it up under the sticky nav before
      // measuring how much of it the bottom sheet covers.
      const navBottom = document.querySelector('nav').getBoundingClientRect().bottom;
      window.scrollTo({ top: window.scrollY + map.getContainer().getBoundingClientRect().top - navBottom, behavior: 'instant' });
    }
    Object.values(kept.markers).forEach(x => x.getPopup()?.isOpen() && x.togglePopup());

    let cancelled = false;
    Promise.all([fetchRoute(origin, dirDoctor), styleLoaded]).then(([route]) => {
      if (cancelled) return; // drawer closed or switched meanwhile
      map.getSource('route').setData({ type: 'Feature', properties: { approx: route.approx }, geometry: route.geometry });
      if (route.minutes != null) dispatch(routeFound({ doctorId: dirDoctor.id, minutes: route.minutes, km: route.km }));
      map.fitBounds(boundsOf(route.geometry.coordinates), { padding: routePadding(map), maxZoom: 16 });
      setActivePin('d' + dirDoctor.id);
    });
    return () => { cancelled = true; };
  }, [ready, visible, dirDoctor, origin, dispatch]);

  // Popups are HTML strings: handle their buttons here
  useEffect(() => {
    const el = hostEl.current;
    function onClick(e) {
      const dir = e.target.closest('[data-open-dir]');
      if (dir) {
        const d = latest.current.doctors.find(x => String(x.id) === dir.dataset.openDir);
        if (d) dispatch(openDirections(d));
        return;
      }
      const link = e.target.closest('a[data-spa]');
      if (link) {
        e.preventDefault();
        navigate(link.getAttribute('href'));
      }
    }
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [dispatch, navigate]);

  const legendKinds = [...new Set(places.map(kindOf))];
  const doctorCards = useMemo(() => sortDoctors(doctors, mapSortBy), [doctors, mapSortBy]);

  return (
    <div className={`${visible ? '' : 'hidden'} grid grid-cols-1 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_420px] md:h-[calc(100vh-160px)] lg:h-[calc(100vh-112px)] md:overflow-hidden -mx-4 sm:-mx-6 -mt-5 -mb-12 border-t border-[#E2E8F0]`}>
      <div className="relative h-[320px] sm:h-[420px] md:h-full bg-[#F3ECE4]">
        {/* The map's own #map container goes in here */}
        <div ref={hostEl} className="w-full h-full"></div>

        <div ref={hintEl} className="absolute inset-0 z-[6] flex items-center justify-center bg-[#1E293B]/45 text-white text-[14px] font-medium pointer-events-none opacity-0 transition-opacity duration-300">
          Use two fingers to move the map
        </div>

        <div className={`absolute inset-0 z-[5] flex items-center justify-center bg-[#F3ECE4] transition-opacity duration-500 ${loaded ? 'opacity-0 pointer-events-none' : ''}`}>
          {failed
            ? <p className="text-[13px] text-[#64748B]">Map couldn’t load. Check your connection and try again.</p>
            : <div className="flex items-center gap-2.5 text-[13px] text-[#64748B]">
                <div className="w-4 h-4 rounded-full border-2 border-[#E2E8F0] border-t-[#D0423A] animate-spin"></div>
                Loading map…
              </div>}
        </div>

        <div className="absolute top-3 right-3 z-[4] flex flex-col gap-2">
          <div className="mw-ctrl-group">
            <button type="button" className="mw-ctrl" onClick={() => ready && kept.map.easeTo({ zoom: kept.map.getZoom() + 1, duration: 250 })} aria-label="Zoom in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" className="mw-ctrl" onClick={() => ready && kept.map.easeTo({ zoom: kept.map.getZoom() - 1, duration: 250 })} aria-label="Zoom out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
          </div>
          <div className="mw-ctrl-group">
            <button type="button" className="mw-ctrl" onClick={() => ready && origin && kept.map.flyTo({ center: [origin.lng, origin.lat], zoom: 14 })} aria-label="Center on my location" title="My location">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            </button>
            <button type="button" className="mw-ctrl" onClick={() => ready && fitToResults()} aria-label="Show all results" title="Show all results">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>
            </button>
          </div>
        </div>

        <div className="absolute top-3 left-3 z-[4] flex items-center gap-3 bg-white/90 backdrop-blur-md border border-[#E2E8F0] rounded-full px-3 py-1.5 text-[11px] font-medium text-[#64748B] shadow-[0_2px_10px_rgba(15,23,42,.06)]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#D0423A]"></span>Open</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#94A3B8]"></span>Closed</span>
          {legendKinds.map(k => (
            <span key={k.label} className="hidden sm:flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-white border-[1.5px]" style={{ borderColor: k.color }}></span>{k.label}</span>
          ))}
        </div>
      </div>

      <div className="bg-[#F8F2ED] border-t md:border-t-0 md:border-l border-[#E2E8F0] max-h-[70vh] md:max-h-none md:h-full overflow-y-auto">
        <div className="px-4 py-3.5 pb-2.5 bg-white border-b border-[#E2E8F0] sticky top-0 z-10">
          <div className="font-serif text-[17px] mb-2">Results near you</div>
          <div className="flex gap-1.5">
            {SORTS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => dispatch(setMapSort(key))}
                className={`${SORT_BTN} ${mapSortBy === key ? 'bg-[#1E293B] border-[#1E293B] text-white' : 'bg-white border-[#E2E8F0] text-[#64748B]'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="p-3 flex flex-col gap-2.5">
          {/* With a facility chip on, the pane lists the same places as the map, nearest first */}
          {(showDoctorCards ? doctorCards.length : places.length) === 0 && (
            <div className="p-6 text-center text-[#64748B] text-[13px]">No results match your filters</div>
          )}
          {showDoctorCards
            ? doctorCards.map(d => {
                const status = getStatus(d), key = 'd' + d.id;
                return (
                  <div key={key} data-map-card={key} className={`${CARD} ${activeKey === key ? 'active' : ''}`}
                    onClick={() => focus(key)} onMouseEnter={() => setActivePin(key)} onMouseLeave={() => setActivePin(null)}>
                    <div className="w-11 h-11 rounded-[10px] shrink-0 flex items-center justify-center text-[14px] font-serif text-white" style={{ background: d.avatar_bg }}>{d.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] text-[#1E293B] leading-[1.3] mb-[1px]">{d.name}</div>
                      <div className="text-[12px] text-[#D0423A] font-medium">{specialtyText(d)}</div>
                      <div className={`text-[11px] mt-1 ${status.open ? 'text-[#16A34A]' : 'text-[#64748B]'}`}>
                        {status.open ? '●' : '○'} {status.label}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] mt-[2px]">Next: {status.nextSlot}</div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-[3px] text-[11px] text-[#64748B]"><Stars rating={d.rating} size={12} className="gap-0" /><span className="ml-[3px]">{d.rating}</span></div>
                        <Link to={`/profile?id=${d.id}`} onClick={e => e.stopPropagation()} className="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] text-[12px] font-medium px-2.5 py-[5px] rounded-[9px] cursor-pointer flex items-center gap-[5px] hover:border-[#D0423A] hover:text-[#D0423A] transition-all font-sans no-underline">View</Link>
                      </div>
                    </div>
                  </div>
                );
              })
            : places.map(h => {
                const k = kindOf(h), status = placeStatus(h), key = 'h' + h.id;
                return (
                  <div key={key} data-map-card={key} className={`${CARD} ${activeKey === key ? 'active' : ''}`} onClick={() => focus(key)}>
                    <div className="w-11 h-11 rounded-[10px] shrink-0 flex items-center justify-center" style={{ background: `${k.color}14`, color: k.color }}>
                      <KindIcon kind={k} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] text-[#1E293B] leading-[1.3] mb-[1px] break-words">{h.name}</div>
                      <div className="text-[12px] font-medium" style={{ color: k.color }}>{k.label}{h.distance_km != null ? ` · ${h.distance_km} km` : ''}</div>
                      <div className={`text-[11px] mt-1 ${status.cls}`}>{status.text}</div>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
