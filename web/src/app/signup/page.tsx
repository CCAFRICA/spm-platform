'use client';

/**
 * Self-Service Signup Page
 *
 * 4-field form: email, password, org name, entity count.
 * Creates auth user → tenant → profile → metering via /api/auth/signup.
 * Auto-signs in and redirects to dashboard on success.
 *
 * OB-60 Phase 2: Frictionless 60-second signup.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export default function SignupPage() {
  const [signupEnabled, setSignupEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [entityCount, setEntityCount] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Check public_signup_enabled flag
  useEffect(() => {
    fetch('/api/platform/flags')
      .then(r => r.json())
      .then(flags => setSignupEnabled(flags.public_signup_enabled === true))
      .catch(() => setSignupEnabled(false));
  }, []);

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError('Google sign-up failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email || !email.includes('@') || !email.includes('.')) {
      errors.email = 'Please enter a valid email address';
    }
    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (!orgName || orgName.trim().length < 2) {
      errors.orgName = 'Organization name must be at least 2 characters';
    }
    if (entityCount && (Number(entityCount) < 1 || Number(entityCount) > 100000)) {
      errors.entityCount = 'Must be between 1 and 100,000';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          orgName: orgName.trim(),
          entityCount: Number(entityCount) || 50,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Auto-sign in with the created credentials
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        // Signup succeeded but auto-login failed — send to login page
        window.location.href = '/login';
        return;
      }

      // Redirect to the app
      window.location.href = '/';
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  // Loading state while flag resolves
  if (signupEnabled === null) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#020617',
      }}>
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Signup disabled — show coming soon
  if (!signupEnabled) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: '#020617',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#2D2F8F', margin: 0, letterSpacing: '-0.02em' }}>
            VIALUCE
          </h1>
          <p style={{ fontSize: '14px', color: '#E8A838', fontWeight: 600, marginTop: '6px', letterSpacing: '0.06em' }}>
            Intelligence. Acceleration. Performance.
          </p>
          <div style={{
            marginTop: '40px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(30, 41, 59, 0.8)',
            borderRadius: '16px',
            padding: '40px 32px',
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#F1F5F9', margin: '0 0 12px' }}>
              Coming Soon
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', margin: '0 0 24px', lineHeight: '1.6' }}>
              Self-service signup is not yet available. Contact us to get started with Vialuce.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                padding: '10px 24px',
                borderRadius: '10px',
                background: '#2D2F8F',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: '#020617',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#2D2F8F', margin: 0, letterSpacing: '-0.02em' }}>
            VIALUCE
          </h1>
          <p style={{ fontSize: '14px', color: '#E8A838', fontWeight: 600, marginTop: '6px', letterSpacing: '0.06em' }}>
            Intelligence. Acceleration. Performance.
          </p>
        </div>

        {/* Signup Card */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(30, 41, 59, 0.8)',
          borderRadius: '16px',
          padding: '32px',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F1F5F9', marginTop: 0, marginBottom: '24px' }}>
            Create Your Account
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#E2E8F0', fontWeight: 500, marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: '' })); setError(null); }}
                placeholder="you@company.com"
                autoFocus
                autoComplete="email"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: fieldErrors.email ? '1px solid #EF4444' : '1px solid rgba(51, 65, 85, 0.5)',
                  color: '#F1F5F9',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {fieldErrors.email && (
                <p style={{ fontSize: '13px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#E2E8F0', fontWeight: 500, marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: '' })); setError(null); }}
                  placeholder="8+ characters"
                  autoComplete="new-password"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '10px 44px 10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: fieldErrors.password ? '1px solid #EF4444' : '1px solid rgba(51, 65, 85, 0.5)',
                    color: '#F1F5F9',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: '4px',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <p style={{ fontSize: '13px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>{fieldErrors.password}</p>
              )}
            </div>

            {/* Organization Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#E2E8F0', fontWeight: 500, marginBottom: '6px' }}>
                Organization Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={e => { setOrgName(e.target.value); setFieldErrors(prev => ({ ...prev, orgName: '' })); setError(null); }}
                placeholder="Your company name"
                autoComplete="organization"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: fieldErrors.orgName ? '1px solid #EF4444' : '1px solid rgba(51, 65, 85, 0.5)',
                  color: '#F1F5F9',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {fieldErrors.orgName && (
                <p style={{ fontSize: '13px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>{fieldErrors.orgName}</p>
              )}
            </div>

            {/* Entity Count */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#E2E8F0', fontWeight: 500, marginBottom: '6px' }}>
                How many people or locations do you manage?
              </label>
              <input
                type="number"
                value={entityCount}
                onChange={e => { setEntityCount(e.target.value); setFieldErrors(prev => ({ ...prev, entityCount: '' })); setError(null); }}
                placeholder="e.g., 50"
                min={1}
                max={100000}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: fieldErrors.entityCount ? '1px solid #EF4444' : '1px solid rgba(51, 65, 85, 0.5)',
                  color: '#F1F5F9',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {fieldErrors.entityCount && (
                <p style={{ fontSize: '13px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>{fieldErrors.entityCount}</p>
              )}
            </div>

            {/* Global Error */}
            {error && (
              <p style={{ fontSize: '14px', color: '#EF4444', marginBottom: '16px', margin: '0 0 16px' }}>{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: isLoading ? '#1E293B' : '#2D2F8F',
                color: '#FFFFFF',
                fontSize: '16px',
                fontWeight: 600,
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'Creating your account...' : 'Create My Account \u2192'}
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
            onClick={handleGoogleSignUp}
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
            {googleLoading ? 'Redirecting...' : 'Sign up with Google'}
          </button>

          {/* Trial note */}
          <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', marginTop: '16px', marginBottom: 0 }}>
            14-day free trial. No credit card required.
          </p>
        </div>

        {/* Login link */}
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#94A3B8' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#7B7FD4', textDecoration: 'none', fontWeight: 500 }}>
            Log in &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
