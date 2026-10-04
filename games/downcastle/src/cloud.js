/* Cuentas opcionales (Supabase: Auth + Postgres con RLS). supabase-js se carga solo si hay
   una sesión guardada, si se vuelve de un enlace de inicio de sesión o al tocar «Iniciar
   sesión»: quien juega de invitado nunca lo descarga. Nada del juego depende de la nube.
   Esquema en server/supabase/001_profiles.sql. */
import { SUPA } from './config.js';

const REF = new URL(SUPA.url).hostname.split('.')[0];
const TOKEN_KEY = `sb-${REF}-auth-token`;
let sb = null, user = null, loading = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(user));

export const onAuth = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const currentUser = () => user;

const redirectTo = () => location.origin + location.pathname;
/* Los tokens del enlace (#access_token=…) se leen al cargar el módulo: el arranque del juego
   reescribe la URL (toTitle → setUrl) antes de que supabase-js termine de cargarse. */
const linkHash = new URLSearchParams(location.hash.slice(1));
const returning = () => linkHash.has('access_token') || linkHash.has('error_description');
const hasSession = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; } };

async function client() {
  if (sb) return sb;
  loading ||= import('@supabase/supabase-js').then(({ createClient }) => {
    // implicit: el enlace del correo funciona aunque se abra en otro navegador del teléfono
    sb = createClient(SUPA.url, SUPA.key, { auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: false, autoRefreshToken: true } });
    sb.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user || null;
      if (u?.id !== user?.id) { user = u; emit(); }
    });
    return sb;
  });
  return loading;
}

/* Al arrancar: recupera la sesión (o la del enlace recién abierto) sin bloquear el juego. */
export async function initCloud() {
  if (!hasSession() && !returning()) return null;
  try {
    if (/access_token=|refresh_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    const c = await client();
    if (linkHash.has('access_token')) {
      const { error } = await c.auth.setSession({ access_token: linkHash.get('access_token'), refresh_token: linkHash.get('refresh_token') });
      linkHash.delete('access_token');
      if (error) console.warn('[cloud] enlace inválido o vencido', error);
    }
    const { data } = await c.auth.getSession();
    user = data.session?.user || null;
    emit();
  } catch (e) { console.warn('[cloud] sin sesión', e); }
  return user;
}

export async function signInEmail(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signInGoogle() {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  user = null;
  emit();
}

/* ¿Está habilitado Google en el proyecto? (endpoint público de ajustes de Auth) */
let providers = null;
export async function googleEnabled() {
  if (!providers) {
    providers = fetch(`${SUPA.url}/auth/v1/settings`, { headers: { apikey: SUPA.key } })
      .then((r) => r.json()).then((s) => s.external || {}).catch(() => ({}));
  }
  return !!(await providers).google;
}

export async function pullProfile() {
  const c = await client();
  const { data, error } = await c.from('profiles').select('data').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data?.data || null;
}

export async function pushProfile(d) {
  const c = await client();
  const { error } = await c.from('profiles').upsert({ id: user.id, data: d, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function pullEntitlements() {
  const c = await client();
  const { data, error } = await c.from('entitlements').select('sku, source, created_at');
  if (error) throw error;
  return data || [];
}
