// Accounts: email magic links through Supabase Auth (no passwords), and the
// signed-in person's profile. Row Level Security decides what each person can read.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js';

let clientP = null;

export function client() {
  if (!clientP) {
    clientP = import(SUPABASE_JS).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'digestlit-auth' },
      }),
    );
    clientP.catch(() => {
      clientP = null;
    });
  }
  return clientP;
}

export const configured = () => !SUPABASE_URL.includes('YOUR-PROJECT');

/** The signed-in user, or null. */
export async function getUser() {
  if (!configured()) return null;
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

/** Call fn(user|null) whenever someone signs in or out. */
export async function onAuthChange(fn) {
  if (!configured()) return;
  const sb = await client();
  sb.auth.onAuthStateChange((_event, session) => fn(session ? session.user : null));
}

/** Email a sign-in link. New addresses get an account on first use. */
export async function sendMagicLink(email) {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}/`, shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
  profileCache = null;
}

// ---------- Profile ----------

let profileCache = null;

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function getProfile() {
  if (profileCache) return profileCache;
  const sb = await client();
  const user = await getUser();
  if (!user) return null;
  let row = must(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
  if (!row) row = must(await sb.from('profiles').insert({ id: user.id }).select().single());
  // Reports run overnight in the person's own time zone; keep it up to date.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && !row.time_zone) row = must(await sb.from('profiles').update({ time_zone: tz }).eq('id', user.id).select().single());
  profileCache = row;
  return row;
}

export async function updateProfile(patch) {
  const sb = await client();
  const user = await getUser();
  profileCache = must(await sb.from('profiles').update(patch).eq('id', user.id).select().single());
  return profileCache;
}
