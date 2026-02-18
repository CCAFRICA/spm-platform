'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async () => {
    if (!emailInput || !passwordInput) return;

    setIsLoading(true);
    setLoginError(null);

    const result = await login(emailInput, passwordInput);

    if (result.success) {
      toast.success(t('auth.welcomeBack', { name: emailInput }), {
        description: 'Signed in',
      });
    } else {
      setLoginError(result.error || 'Login failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setLoginError(null);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) {
        setLoginError(error.message);
        setGoogleLoading(false);
      }
    } catch {
      setLoginError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ backgroundColor: '#020617' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-12"
        >
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#2D2F8F', letterSpacing: '-0.02em', margin: 0 }}>
            VIALUCE
          </h1>
          <p style={{ fontSize: '14px', color: '#E8A838', fontWeight: 600, marginTop: '6px', letterSpacing: '0.06em' }}>
            Intelligence. Acceleration. Performance.
          </p>
        </motion.div>

        {/* Login card */}
        <div className="rounded-2xl p-8"
             style={{
               backgroundColor: 'rgba(15,23,42,0.8)',
               border: '1px solid rgba(30,41,59,0.8)',
             }}>
          <h2 className="text-xl font-bold mb-6" style={{ color: '#F1F5F9' }}>
            {t('auth.signIn')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="font-medium" style={{ color: '#e2e8f0', fontSize: '14px' }}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setLoginError(null);
                }}
                disabled={isLoading}
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(51,65,85,0.5)',
                  color: '#F1F5F9',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="font-medium" style={{ color: '#e2e8f0', fontSize: '14px' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setLoginError(null);
                }}
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(51,65,85,0.5)',
                  color: '#F1F5F9',
                }}
              />
            </div>

            {loginError && (
              <p className="text-sm text-red-400">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={!emailInput || !passwordInput || isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2D2F8F' }}
              onMouseEnter={(e) => { if (!isLoading) (e.target as HTMLButtonElement).style.backgroundColor = '#3D3FAF'; }}
              onMouseLeave={(e) => (e.target as HTMLButtonElement).style.backgroundColor = '#2D2F8F'}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(51, 65, 85, 0.5)' }} />
            <span style={{ fontSize: '12px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(51, 65, 85, 0.5)' }} />
          </div>

          {/* Google SSO */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '10px',
              background: '#FFFFFF',
              color: '#333333',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid #DDDDDD',
              cursor: googleLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: googleLoading ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>
        </div>

        {/* Signup link */}
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#94A3B8' }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: '#E8A838', textDecoration: 'none', fontWeight: 600 }}>
            Start Free &rarr;
          </Link>
        </p>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-8"
          style={{ color: '#475569', fontSize: '13px' }}
        >
          vialuce.ai
        </motion.p>
      </motion.div>
    </div>
  );
}
