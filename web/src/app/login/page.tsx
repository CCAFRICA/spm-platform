'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { LoadingButton } from '@/components/ui/loading-button';
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

    const success = await login(emailInput, passwordInput);

    if (success) {
      toast.success(t('auth.welcomeBack', { name: emailInput }), {
        description: 'Signed in',
      });
    } else {
      setLoginError('Invalid email or password. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-slate-700 to-sky-500 text-white mb-4 shadow-lg">
            <DollarSign className="h-8 w-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">
            ViaLuce
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Sales Performance Management
          </p>
        </motion.div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="px-4 md:px-6">
            <CardTitle className="text-lg md:text-xl">{t('auth.signIn')}</CardTitle>
            <CardDescription>
              Enter your email and password to sign in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 md:px-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
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
                />
              </div>

              {loginError && (
                <p className="text-sm text-destructive">{loginError}</p>
              )}

              <LoadingButton
                type="submit"
                className="w-full"
                size="lg"
                disabled={!emailInput || !passwordInput}
                loading={isLoading}
                loadingText="Signing in..."
              >
                Sign In
              </LoadingButton>
            </form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xs text-center text-muted-foreground pt-2"
            >
              Secured by Supabase Auth
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
