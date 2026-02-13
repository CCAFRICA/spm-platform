'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, ALL_USERS } from '@/contexts/auth-context';
import { LoadingButton } from '@/components/ui/loading-button';
import { useLocale } from '@/contexts/locale-context';
import { isCCAdmin } from '@/types/auth';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showDemoHint, setShowDemoHint] = useState(false);

  const handleLogin = async () => {
    if (!emailInput) return;

    setIsLoading(true);
    setLoginError(null);
    await new Promise(r => setTimeout(r, 800));

    const success = await login(emailInput);

    if (success) {
      const user = ALL_USERS.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
      toast.success(t('auth.welcomeBack', { name: user?.name || '' }), {
        description: isCCAdmin(user!) ? 'Platform Administrator' : `Logged in as ${user?.role}`,
      });
    } else {
      setLoginError('Invalid credentials. Please check your email address.');
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  const handleDemoSelect = (email: string) => {
    setEmailInput(email);
    setLoginError(null);
  };

  // Demo account emails (just emails, no tenant info exposed)
  const demoEmails = [
    'admin@entityb.com',
    'admin@retailcgmx.com',
    'admin@techcorp.com',
    'sarah.chen@techcorp.com',
    'admin@restaurantmx.com',
  ];

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
              Enter your email address to sign in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 md:px-6">
            {/* Email Input Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                {loginError && (
                  <p className="text-sm text-destructive">{loginError}</p>
                )}
              </div>

              {/* Login Button */}
              <LoadingButton
                type="submit"
                className="w-full"
                size="lg"
                disabled={!emailInput}
                loading={isLoading}
                loadingText="Signing in..."
              >
                Sign In
              </LoadingButton>
            </form>

            {/* Demo Accounts Hint (collapsible) */}
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground text-xs"
                onClick={() => setShowDemoHint(!showDemoHint)}
              >
                Demo accounts
                {showDemoHint ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>

              {showDemoHint && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 p-3 bg-muted/50 rounded-lg"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    Click to use a demo account:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {demoEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => handleDemoSelect(email)}
                        className="text-xs px-2 py-1 rounded bg-background hover:bg-primary/10 border transition-colors"
                        disabled={isLoading}
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xs text-center text-muted-foreground pt-2"
            >
              Demo environment • Azure AD B2C in production
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
