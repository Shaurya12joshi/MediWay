// "Save MediWay to your phone". Chrome and Android offer an install prompt that the page can show
// when the visitor asks; iPhones have no prompt, so they get the Share -> Add to Home Screen hint.
// Imported once at startup (main.jsx) so the browser's early beforeinstallprompt event isn't missed.

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();     // keep it for our button rather than the browser's mini-bar
  deferred = e;
  notify();
});
window.addEventListener('appinstalled', () => { deferred = null; notify(); });

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const canPrompt = () => deferred !== null;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}
