'use client';

/**
 * MFA Challenge — OB-178 / DS-019 Section 5
 *
 * Shown on login when user has MFA enrolled but hasn't verified this session.
 * User enters 6-digit TOTP code from authenticator app.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAuthEventClient } from '@/lib/auth/auth-logger';
import { Shield, Loader2, AlertCircle } from 'lucide-react';

export default function MFAVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    // Get the user's TOTP factor
    const loadFactor = async () => {
      const supabase = createClient();
      const { data, error: factorErr } = await supabase.auth.mfa.listFactors();
      if (factorErr || !data?.totp?.length) {
        router.push('/auth/mfa/enroll');
        return;
      }
      setFactorId(data.totp[0].id);
    };
    loadFactor();
  }, [router]);

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyErr) throw verifyErr;

      logAuthEventClient('auth.mfa.verify.success', { method: 'totp' });
      router.push('/');
    } catch (err) {
      logAuthEventClient('auth.mfa.verify.failure', { error: err instanceof Error ? err.message : 'unknown' });
      setError(err instanceof Error ? err.message : 'Verification failed. Check your code and try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Shield className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-zinc-100">Two-Factor Verification</h1>
          <p className="text-sm text-zinc-500 mt-1">Enter the code from your authenticator app</p>
        </div>

        <div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            className="w-full h-12 text-center text-2xl tracking-[0.5em] font-mono bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="000000"
            autoFocus
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify
        </button>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
