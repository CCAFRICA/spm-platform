'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Users, Building, Settings, DollarSign, Check } from 'lucide-react';
import { useAuth, DEMO_USERS } from '@/contexts/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleLogin = () => {
    if (selectedId) {
      login(selectedId);
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
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-navy-600 to-sky-500 text-white mb-4">
            <DollarSign className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">ClearComp</h1>
          <p className="text-muted-foreground">Sales Performance Management</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Select Demo User</CardTitle>
            <CardDescription>
              Choose a persona to explore different permission levels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* User Selection */}
            <div className="grid gap-3">
              {DEMO_USERS.map((demoUser) => (
                <button
                  key={demoUser.id}
                  onClick={() => setSelectedId(demoUser.id)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedId === demoUser.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${getRoleColor(demoUser.role)}`}>
                      {getRoleIcon(demoUser.role)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate">{demoUser.name}</h3>
                        <Badge variant="outline">{demoUser.role}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {demoUser.email}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {demoUser.region}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {demoUser.dataAccessLevel} access
                        </Badge>
                      </div>
                    </div>
                    {selectedId === demoUser.id && (
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Login Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleLogin}
              disabled={!selectedId}
            >
              Continue as {DEMO_USERS.find((u) => u.id === selectedId)?.name || '...'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Demo environment • Azure AD B2C in production
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
