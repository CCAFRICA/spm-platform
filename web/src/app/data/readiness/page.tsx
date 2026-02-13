'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Database, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';

export default function DataReadinessRedirectPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : (currentTenant?.locale === 'es-MX');

  // Auto-redirect to full data readiness page
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/operations/data-readiness');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="p-6">
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="pt-6 text-center">
          <Database className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">
            {isSpanish ? 'Preparación de Datos' : 'Data Readiness'}
          </h1>
          <p className="text-muted-foreground mb-4">
            {isSpanish
              ? 'Redirigiendo a la configuración de preparación de datos...'
              : 'Redirecting to data readiness configuration...'}
          </p>
          <Button onClick={() => router.push('/operations/data-readiness')}>
            {isSpanish ? 'Ir ahora' : 'Go now'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
