'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
