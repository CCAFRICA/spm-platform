import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

/** Mint a session cookie header for a user WITHOUT touching their password:
 * admin.generateLink(magiclink) -> verifyOtp(token_hash) -> @supabase/ssr 0.8
 * cookie format (base64- prefix, chunked at 3180 chars). */
export async function getCookieFor(email: string): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) throw new Error(`generateLink failed: ${linkErr?.message}`);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (otpErr || !sess.session) throw new Error(`verifyOtp failed: ${otpErr?.message}`);
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1] || '';
  const name = `sb-${projectRef}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(sess.session), 'utf8').toString('base64url');
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const chunks: string[] = [];
  for (let i = 0; i * MAX < value.length; i++) chunks.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return chunks.join('; ');
}
