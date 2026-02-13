'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Users2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/tenant-context';

export default function ConfigurationTeamsPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  // Auto-redirect to full teams management
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/workforce/teams');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="p-6">
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="pt-6 text-center">
          <Users2 className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">
            {isSpanish ? 'Gestión de Equipos' : 'Team Management'}
          </h1>
          <p className="text-muted-foreground mb-4">
            {isSpanish
              ? 'Redirigiendo a la gestión completa de equipos...'
              : 'Redirecting to full team management...'}
          </p>
          <Button onClick={() => router.push('/workforce/teams')}>
            {isSpanish ? 'Ir ahora' : 'Go now'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
