'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User, Users, Building2, Shield, DollarSign, Check,
  Building, Utensils
} from 'lucide-react';
import { useAuth, ALL_USERS, CC_ADMIN_USERS, TECHCORP_USERS, RESTAURANTMX_USERS } from '@/contexts/auth-context';
import { containerVariants, itemVariants } from '@/lib/animations';
import { LoadingButton } from '@/components/ui/loading-button';
import { useLocale } from '@/contexts/locale-context';
import type { User as UserType } from '@/types/auth';
import { isCCAdmin } from '@/types/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    const email = selectedEmail || emailInput;
    if (!email) return;

    setIsLoading(true);
    setLoginError(null);
    await new Promise(r => setTimeout(r, 800));

    const success = await login(email);

    if (success) {
      const user = ALL_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      toast.success(t('auth.welcomeBack', { name: user?.name || '' }), {
        description: isCCAdmin(user!) ? 'Platform Administrator' : `Logged in as ${user?.role}`,
      });
    } else {
      setLoginError('Invalid email. Please try one of the demo accounts.');
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  const getRoleIcon = (user: UserType) => {
    if (isCCAdmin(user)) return <Shield className="h-5 w-5" />;
    switch (user.role) {
      case 'admin': return <Building2 className="h-5 w-5" />;
      case 'manager': return <Users className="h-5 w-5" />;
      case 'sales_rep': return <User className="h-5 w-5" />;
      default: return <User className="h-5 w-5" />;
    }
  };

  const getRoleColor = (user: UserType) => {
    if (isCCAdmin(user)) return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
    switch (user.role) {
      case 'admin': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      case 'manager': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'sales_rep': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getRoleLabel = (user: UserType) => {
    if (isCCAdmin(user)) return 'Platform Admin';
    switch (user.role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      case 'sales_rep': return 'Sales Rep';
      default: return user.role;
    }
  };

  const UserCard = ({ user, selected }: { user: UserType; selected: boolean }) => (
    <motion.button
      variants={itemVariants}
      onClick={() => {
        setSelectedEmail(user.email);
        setEmailInput(user.email);
        setLoginError(null);
      }}
      disabled={isLoading}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full p-3 rounded-lg border-2 transition-all text-left disabled:opacity-50 ${
        selected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-transparent bg-muted/50 hover:bg-muted'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full flex-shrink-0 ${getRoleColor(user)}`}>
          {getRoleIcon(user)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold truncate text-sm">{user.name}</h3>
            <Badge variant="outline" className="text-xs">{getRoleLabel(user)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="flex-shrink-0"
            >
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );

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
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">
            Entity B Platform
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Sales Performance Management
          </p>
        </motion.div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="px-4 md:px-6">
            <CardTitle className="text-lg md:text-xl">{t('auth.selectUser')}</CardTitle>
            <CardDescription>
              Choose a demo account or enter an email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 md:px-6">
            {/* Email Input Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setSelectedEmail(null);
                    setLoginError(null);
                  }}
                  disabled={isLoading}
                />
                {loginError && (
                  <p className="text-sm text-destructive">{loginError}</p>
                )}
              </div>
            </form>

            {/* User Selection Tabs */}
            <Tabs defaultValue="platform" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="platform" className="text-xs sm:text-sm">
                  <Shield className="h-3 w-3 mr-1 hidden sm:inline" />
                  Platform
                </TabsTrigger>
                <TabsTrigger value="techcorp" className="text-xs sm:text-sm">
                  <Building className="h-3 w-3 mr-1 hidden sm:inline" />
                  TechCorp
                </TabsTrigger>
                <TabsTrigger value="restaurant" className="text-xs sm:text-sm">
                  <Utensils className="h-3 w-3 mr-1 hidden sm:inline" />
                  RestaurantMX
                </TabsTrigger>
              </TabsList>

              <TabsContent value="platform" className="mt-4">
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-2"
                >
                  {CC_ADMIN_USERS.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      selected={selectedEmail === user.email}
                    />
                  ))}
                </motion.div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Platform admins can access all tenants
                </p>
              </TabsContent>

              <TabsContent value="techcorp" className="mt-4">
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-2"
                >
                  {TECHCORP_USERS.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      selected={selectedEmail === user.email}
                    />
                  ))}
                </motion.div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Technology company • USD • English
                </p>
              </TabsContent>

              <TabsContent value="restaurant" className="mt-4">
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-2"
                >
                  {RESTAURANTMX_USERS.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      selected={selectedEmail === user.email}
                    />
                  ))}
                </motion.div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Hospitality • MXN • Spanish
                </p>
              </TabsContent>
            </Tabs>

            {/* Login Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <LoadingButton
                className="w-full"
                size="lg"
                onClick={handleLogin}
                disabled={!emailInput && !selectedEmail}
                loading={isLoading}
                loadingText="Signing in..."
              >
                Sign In
              </LoadingButton>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
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
