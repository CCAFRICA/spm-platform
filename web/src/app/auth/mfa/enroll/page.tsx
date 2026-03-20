'use client';

/**
 * MFA Enrollment — OB-178 / DS-019 Section 5
 *
 * Shown when platform/admin users log in without MFA enrolled.
 * QR code + manual secret + 6-digit verification.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logAuthEventClient } from '@/lib/auth/auth-logger';
import { Shield, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function MFAEnrollPage() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Vialuce Authenticator',
      });
      if (enrollErr) throw enrollErr;
      if (data?.totp) {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA enrollment');
    } finally {
      setEnrolling(false);
    }
  };

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

      logAuthEventClient('auth.mfa.enroll', { method: 'totp' });
      // HF-153: Full page navigation after MFA state change.
      window.location.href = '/';
    } catch (err) {
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
          <h1 className="text-xl font-semibold text-zinc-100">Set Up Two-Factor Authentication</h1>
          <p className="text-sm text-zinc-500 mt-1">Scan the QR code with your authenticator app</p>
        </div>

        {!qrCode ? (
          <div className="text-center">
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Begin Setup
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* QR Code */}
            <div className="bg-white rounded-lg p-4 mx-auto w-fit">
              <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
            </div>

            {/* Manual secret */}
            {secret && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                <p className="text-xs text-zinc-500 mb-1">Manual entry key:</p>
                <code className="text-xs text-zinc-300 break-all font-mono">{secret}</code>
              </div>
            )}

            {/* Verification input */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Enter 6-digit code</label>
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Verify and Enable
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <p className="text-xs text-zinc-600 text-center">
          Two-factor authentication adds an extra layer of security to your account.
        </p>
      </div>
    </div>
  );
}
