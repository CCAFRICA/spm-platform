'use client';

/**
 * Script Rehearsal Panel Component
 *
 * Provides script selection, rehearsal mode, and timing helpers.
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Clock,
  FileText,
  ChevronRight,
  MessageSquare,
  Plus,
  X,
  Timer,
  BookOpen,
} from 'lucide-react';
import type { DemoScript, RehearsalSession } from '@/types/demo';
import {
  getDemoScripts,
  getScript,
  startRehearsal,
  getActiveRehearsal,
  updateRehearsal,
  endRehearsal,
  addRehearsalNote,
} from '@/lib/demo/demo-service';
import { useLocale } from '@/contexts/locale-context';
import { useRouter } from 'next/navigation';

export function ScriptRehearsalPanel() {
  const { locale } = useLocale();
  const router = useRouter();
  const isSpanish = locale === 'es-MX';

  const [scripts, setScripts] = useState<DemoScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<DemoScript | null>(null);
  const [session, setSession] = useState<RehearsalSession | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [showScriptDetail, setShowScriptDetail] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setScripts(getDemoScripts());
    const active = getActiveRehearsal();
    if (active) {
      setSession(active);
      setElapsedTime(active.elapsedTime);
      const script = getScript(active.scriptId);
      setSelectedScript(script);
    }
  }, []);

  useEffect(() => {
    if (session && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const newTime = prev + 1;
          updateRehearsal({ elapsedTime: newTime });
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [session, isPaused]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (difficulty: DemoScript['difficulty']) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-amber-100 text-amber-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
    }
  };

  const handleStartRehearsal = (scriptId: string) => {
    const newSession = startRehearsal(scriptId);
    if (newSession) {
      setSession(newSession);
      setElapsedTime(0);
      setIsPaused(false);
      const script = getScript(scriptId);
      setSelectedScript(script);

      // Navigate to first section route
      if (script?.sections[0]?.route) {
        router.push(script.sections[0].route);
      }
    }
  };

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
  };

  const handleNextSection = () => {
    if (!session || !selectedScript) return;

    const nextSection = session.currentSection + 1;
    if (nextSection < selectedScript.sections.length) {
      updateRehearsal({ currentSection: nextSection, currentPoint: 0 });
      setSession({ ...session, currentSection: nextSection, currentPoint: 0 });

      const section = selectedScript.sections[nextSection];
      if (section.route) {
        router.push(section.route);
      }
    }
  };

  const handlePrevSection = () => {
    if (!session || !selectedScript) return;

    const prevSection = session.currentSection - 1;
    if (prevSection >= 0) {
      updateRehearsal({ currentSection: prevSection, currentPoint: 0 });
      setSession({ ...session, currentSection: prevSection, currentPoint: 0 });

      const section = selectedScript.sections[prevSection];
      if (section.route) {
        router.push(section.route);
      }
    }
  };

  const handleNextPoint = () => {
    if (!session || !selectedScript) return;

    const currentSection = selectedScript.sections[session.currentSection];
    const nextPoint = session.currentPoint + 1;

    if (nextPoint < currentSection.talkingPoints.length) {
      updateRehearsal({ currentPoint: nextPoint });
      setSession({ ...session, currentPoint: nextPoint });
    } else {
      // Move to next section
      handleNextSection();
    }
  };

  const handleAddNote = () => {
    if (noteInput.trim()) {
      addRehearsalNote(noteInput);
      setSession((prev) => prev ? { ...prev, notes: [...prev.notes, noteInput] } : null);
      setNoteInput('');
    }
  };

  const handleEndRehearsal = () => {
    endRehearsal();
    setSession(null);
    setSelectedScript(null);
    setElapsedTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const currentSection = session && selectedScript
    ? selectedScript.sections[session.currentSection]
    : null;

  const currentPoint = currentSection && session
    ? currentSection.talkingPoints[session.currentPoint]
    : null;

  const progress = session && selectedScript
    ? ((session.currentSection + 1) / selectedScript.sections.length) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Active Rehearsal */}
      {session && selectedScript && currentSection ? (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                {isSpanish ? 'Ensayo Activo' : 'Active Rehearsal'}
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-2xl font-mono">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  {formatTime(elapsedTime)}
                </div>
                <Badge variant="outline">
                  {session.currentSection + 1}/{selectedScript.sections.length}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress */}
            <Progress value={progress} className="h-2" />

            {/* Current Section */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium text-lg">
                {isSpanish ? currentSection.titleEs : currentSection.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {currentSection.duration} {isSpanish ? 'minutos' : 'minutes'}
              </p>
            </div>

            {/* Current Talking Point */}
            {currentPoint && (
              <div className={`p-4 rounded-lg border-2 ${currentPoint.emphasis ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-lg">
                      {isSpanish ? currentPoint.textEs : currentPoint.text}
                    </p>
                    {currentPoint.emphasis && (
                      <Badge variant="secondary" className="mt-2">
                        {isSpanish ? 'Punto clave' : 'Key point'}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {isSpanish ? 'Punto' : 'Point'} {session.currentPoint + 1}/{currentSection.talkingPoints.length}
                  </span>
                  <Button size="sm" onClick={handleNextPoint}>
                    {isSpanish ? 'Siguiente' : 'Next'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevSection}
                  disabled={session.currentSection === 0}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePauseResume}
                >
                  {isPaused ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNextSection}
                  disabled={session.currentSection === selectedScript.sections.length - 1}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="destructive" onClick={handleEndRehearsal}>
                <X className="h-4 w-4 mr-2" />
                {isSpanish ? 'Terminar' : 'End'}
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {isSpanish ? 'Notas' : 'Notes'}
              </p>
              <div className="flex gap-2">
                <Textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder={isSpanish ? 'Agregar nota...' : 'Add note...'}
                  rows={2}
                  className="flex-1"
                />
                <Button onClick={handleAddNote} disabled={!noteInput.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {session.notes.length > 0 && (
                <ScrollArea className="h-24">
                  <div className="space-y-1">
                    {session.notes.map((note, i) => (
                      <p key={i} className="text-sm p-2 bg-muted rounded">
                        {note}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Scripts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {isSpanish ? 'Scripts de Demo' : 'Demo Scripts'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scripts.map((script) => (
              <div
                key={script.id}
                className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">
                        {isSpanish ? script.nameEs : script.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={getDifficultyColor(script.difficulty)}
                      >
                        {script.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? script.descriptionEs : script.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {script.totalDuration} {isSpanish ? 'min' : 'min'}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {script.sections.length} {isSpanish ? 'secciones' : 'sections'}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {script.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedScript(script);
                        setShowScriptDetail(true);
                      }}
                    >
                      {isSpanish ? 'Ver' : 'View'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleStartRehearsal(script.id)}
                      disabled={!!session}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {isSpanish ? 'Ensayar' : 'Rehearse'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Script Detail Dialog */}
      <Dialog open={showScriptDetail} onOpenChange={setShowScriptDetail}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedScript && (isSpanish ? selectedScript.nameEs : selectedScript.name)}
            </DialogTitle>
          </DialogHeader>
          {selectedScript && (
            <div className="space-y-6">
              <p className="text-muted-foreground">
                {isSpanish ? selectedScript.descriptionEs : selectedScript.description}
              </p>

              <div className="space-y-4">
                {selectedScript.sections.map((section, index) => (
                  <div key={section.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <p className="font-medium">
                        {isSpanish ? section.titleEs : section.title}
                      </p>
                      <span className="text-sm text-muted-foreground ml-auto">
                        {section.duration} min
                      </span>
                    </div>
                    <div className="space-y-2 pl-8">
                      {section.talkingPoints.map((point, i) => (
                        <p
                          key={i}
                          className={`text-sm ${point.emphasis ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                        >
                          • {isSpanish ? point.textEs : point.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  setShowScriptDetail(false);
                  handleStartRehearsal(selectedScript.id);
                }}
                disabled={!!session}
              >
                <Play className="h-4 w-4 mr-2" />
                {isSpanish ? 'Comenzar Ensayo' : 'Start Rehearsal'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
