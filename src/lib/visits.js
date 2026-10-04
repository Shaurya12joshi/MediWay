// "Did you visit?": when someone takes directions to a doctor or a place, remember it on this
// device, and ask for a rating when they come back later (see components/VisitPrompt.jsx).

const KEY = 'mw.visit';
const ASK_AFTER_MS = 30 * 60 * 1000;          // time to get there and be seen
const FORGET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// kind: 'doctor' | 'place'
export function rememberVisit(kind, id, name) {
  try { localStorage.setItem(KEY, JSON.stringify({ kind, id: String(id), name, at: Date.now() })); } catch { /* storage blocked */ }
}

// The visit to ask about now, if any
export function visitToAskAbout(now = Date.now()) {
  try {
    const visit = JSON.parse(localStorage.getItem(KEY));
    if (!visit) return null;
    const age = now - visit.at;
    if (age > FORGET_AFTER_MS) { forgetVisit(); return null; }
    return age >= ASK_AFTER_MS ? visit : null;
  } catch {
    return null;
  }
}

export function forgetVisit() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

// "Not yet": ask again tomorrow
export function askLater(visit) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...visit, at: Date.now() - ASK_AFTER_MS + 24 * 60 * 60 * 1000 })); } catch { /* storage blocked */ }
}

export const reviewLink = visit => visit.kind === 'doctor' ? `/review?id=${visit.id}` : `/review?place=${visit.id}`;
