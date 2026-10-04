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
const returning = () => /access_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search);
const hasSession = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; } };

async function client() {
  if (sb) return sb;
  loading ||= import('@supabase/supabase-js').then(({ createClient }) => {
    // implicit: el enlace del correo funciona aunque se abra en otro navegador del teléfono
    sb = createClient(SUPA.url, SUPA.key, { auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
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
    const c = await client();
    const { data } = await c.auth.getSession();
    user = data.session?.user || null;
    if (returning()) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]code=[^&]*/, ''));
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
