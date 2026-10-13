// Envoi du résultat au site principal, sur le modèle du dépôt « Potions » :
// requête GET signée vers l'API + postMessage « sid-quest-resultat » au parent.
export const REPORT = {
  API_URL: 'https://sid-quest.vercel.app/api',
  SEL: 'sid-quest-v2',
  EPREUVE: 'mondes-vivants', // slug de l'épreuve côté site principal
  EPREUVE_NUM: 4, // Potions = 1, Énigmes = 2, Problème = 3
};

// Champs fixés par le jeu : un paramètre d'URL du même nom est ignoré.
const RESERVES = ['epreuve', 'epreuve_num', 'niveau', 'statut', 'reussi', 'score', 'raison', 'details', 'session', 'debut', 'fin', 'duree_s', 'source', 'origine', 'parent', 'integre', 'ts', 'sig', 'story'];

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function urlParent() {
  if (window === window.top) return 'direct';
  try { if (document.referrer) return document.referrer; } catch { /* rien */ }
  try { if (location.ancestorOrigins && location.ancestorOrigins.length) return location.ancestorOrigins[0]; } catch { /* rien */ }
  return 'inconnu';
}

// Paramètres d'URL à transmettre (identifiant du joueur, etc.).
export function passthroughParams() {
  const p = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(location.search)) if (!RESERVES.includes(k)) p.set(k, v);
  return p;
}

const SENT_KEY = 'mv-envoyes';
function alreadySent(session) {
  try { return (JSON.parse(localStorage.getItem(SENT_KEY)) || []).includes(session); } catch { return sentMem.has(session); }
}
function markSent(session) {
  sentMem.add(session);
  try {
    const l = JSON.parse(localStorage.getItem(SENT_KEY)) || [];
    l.push(session);
    localStorage.setItem(SENT_KEY, JSON.stringify(l.slice(-200)));
  } catch { /* stockage indisponible */ }
}
const sentMem = new Set();

// r : { niveau, statut ('reussi' | 'echoue'), score (0-100), raison, details, session, debut, fin }
export function sendResult(r) {
  if (!r.session || sentMem.has(r.session) || alreadySent(r.session)) return null;
  markSent(r.session);
  const p = passthroughParams();
  const data = {
    epreuve: REPORT.EPREUVE, epreuve_num: REPORT.EPREUVE_NUM, niveau: r.niveau,
    statut: r.statut, reussi: r.statut === 'reussi' ? 1 : 0, score: r.score,
    raison: r.raison || '', details: r.details || '', session: r.session,
    debut: new Date(r.debut).toISOString(), fin: new Date(r.fin).toISOString(),
    duree_s: Math.round((r.fin - r.debut) / 1000),
    source: location.href, origine: location.origin, parent: urlParent(),
    integre: window === window.top ? 0 : 1, ts: Date.now(),
  };
  for (const k in data) p.set(k, String(data[k]));
  const canon = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join('&');
  p.set('sig', fnv(REPORT.SEL + '|' + canon));
  const url = REPORT.API_URL + '?' + p.toString();
  try { fetch(url, { method: 'GET', mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => { new Image().src = url; }); }
  catch { new Image().src = url; }
  try { window.parent.postMessage({ type: 'sid-quest-resultat', ...data, sig: p.get('sig'), url }, '*'); } catch { /* parent inaccessible */ }
  return url;
}
