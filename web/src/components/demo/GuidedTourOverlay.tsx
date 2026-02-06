'use client';

/**
 * Guided Tour Overlay Component
 *
 * Displays tour steps with highlighting and navigation.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  MapPin,
} from 'lucide-react';
import type { GuidedTour } from '@/types/demo';
import { endTour, updateDemoState } from '@/lib/demo/demo-service';
import { useLocale } from '@/contexts/locale-context';
import { useRouter } from 'next/navigation';

interface GuidedTourOverlayProps {
  tour: GuidedTour;
  onComplete: () => void;
  onExit: () => void;
}

export function GuidedTourOverlay({ tour, onComplete, onExit }: GuidedTourOverlayProps) {
  const { locale } = useLocale();
  const router = useRouter();
  const isSpanish = locale === 'es-MX';

  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const step = tour.steps[currentStep];
  const progress = ((currentStep + 1) / tour.steps.length) * 100;
  const isLastStep = currentStep === tour.steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    // Navigate to step route if specified
    if (step.route) {
      router.push(step.route);
    }

    // Add highlight to target element
    const targetEl = document.querySelector(step.target);
    if (targetEl && step.target !== 'body') {
      targetEl.classList.add('tour-highlight');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return () => {
      // Remove highlight
      if (targetEl) {
        targetEl.classList.remove('tour-highlight');
      }
    };
  }, [currentStep, step, router]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        updateDemoState({ tourStep: currentStep + 1 });
        setIsAnimating(false);
      }, 200);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev - 1);
        updateDemoState({ tourStep: currentStep - 1 });
        setIsAnimating(false);
      }, 200);
    }
  };

  const handleComplete = () => {
    endTour();
    onComplete();
  };

  const handleExit = () => {
    endTour();
    onExit();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleExit} />

      {/* Tour Card */}
      <div className={`fixed z-50 ${step.position === 'center' ? 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2' : 'bottom-8 right-8'}`}>
        <Card className={`w-[400px] shadow-2xl transition-opacity duration-200 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {isSpanish ? tour.nameEs : tour.name}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {currentStep + 1} / {tour.steps.length}
                  </Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleExit}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Progress */}
            <Progress value={progress} className="h-1 mb-4" />

            {/* Content */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {isSpanish ? step.titleEs : step.title}
                </h3>
                <p className="text-muted-foreground mt-2">
                  {isSpanish ? step.descriptionEs : step.description}
                </p>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={handlePrev}
                  disabled={isFirstStep}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {isSpanish ? 'Anterior' : 'Previous'}
                </Button>
                <Button onClick={handleNext}>
                  {isLastStep
                    ? isSpanish ? 'Finalizar' : 'Finish'
                    : isSpanish ? 'Siguiente' : 'Next'}
                  {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CSS for highlighting */}
      <style jsx global>{`
        .tour-highlight {
          position: relative;
          z-index: 51;
          box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 0 8px hsl(var(--primary) / 0.2);
          border-radius: 8px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 0 8px hsl(var(--primary) / 0.2);
          }
          50% {
            box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 0 12px hsl(var(--primary) / 0.1);
          }
        }
      `}</style>
    </>
  );
}
