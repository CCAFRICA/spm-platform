'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Users, Building, Settings, DollarSign, Check, Loader2 } from 'lucide-react';
import { useAuth, DEMO_USERS } from '@/contexts/auth-context';
import { containerVariants, itemVariants } from '@/lib/animations';
import { LoadingButton } from '@/components/ui/loading-button';
import { useLocale } from '@/contexts/locale-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (selectedId) {
      setIsLoading(true);
      await new Promise(r => setTimeout(r, 800));

      login(selectedId);
      const user = DEMO_USERS.find(u => u.id === selectedId);

      toast.success(t('auth.welcomeBack', { name: user?.name || '' }), {
        description: t('auth.loggedInAs', { role: user?.role || '' })
      });

      router.push('/');
    }
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, React.ReactNode> = {
      'Sales Rep': <User className="h-5 w-5" />,
      'Manager': <Users className="h-5 w-5" />,
      'VP': <Building className="h-5 w-5" />,
      'Admin': <Settings className="h-5 w-5" />,
    };
    return icons[role] || <User className="h-5 w-5" />;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'Sales Rep': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      'Manager': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'VP': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      'Admin': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
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
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{t('app.name')}</h1>
          <p className="text-muted-foreground text-sm md:text-base">{t('app.tagline')}</p>
        </motion.div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="px-4 md:px-6">
            <CardTitle className="text-lg md:text-xl">{t('auth.selectUser')}</CardTitle>
            <CardDescription>
              {t('auth.selectUserDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 md:px-6">
            {/* User Selection */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-3"
            >
              {DEMO_USERS.map((demoUser, index) => (
                <motion.button
                  key={demoUser.id}
                  variants={itemVariants}
                  custom={index}
                  onClick={() => setSelectedId(demoUser.id)}
                  disabled={isLoading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className={`w-full p-3 md:p-4 rounded-lg border-2 transition-all text-left disabled:opacity-50 ${
                    selectedId === demoUser.id
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <motion.div
                      animate={selectedId === demoUser.id ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.3 }}
                      className={`p-2 rounded-full flex-shrink-0 ${getRoleColor(demoUser.role)}`}
                    >
                      {getRoleIcon(demoUser.role)}
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate text-sm md:text-base">{demoUser.name}</h3>
                        <Badge variant="outline" className="hidden sm:flex">{demoUser.role}</Badge>
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">
                        {demoUser.email}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs sm:hidden">
                          {demoUser.role}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {demoUser.region}
                        </Badge>
                        <Badge variant="secondary" className="text-xs hidden sm:flex">
                          {demoUser.dataAccessLevel} access
                        </Badge>
                      </div>
                    </div>
                    <AnimatePresence>
                      {selectedId === demoUser.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          className="flex-shrink-0"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>
              ))}
            </motion.div>

            {/* Login Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <LoadingButton
                className="w-full"
                size="lg"
                onClick={handleLogin}
                disabled={!selectedId}
                loading={isLoading}
                loadingText="Signing in..."
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Continue as {DEMO_USERS.find((u) => u.id === selectedId)?.name || '...'}
              </LoadingButton>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-xs text-center text-muted-foreground"
            >
              Demo environment • Azure AD B2C in production
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
