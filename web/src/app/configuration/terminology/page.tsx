'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Edit, RotateCcw, Save, Building, Users, ShoppingCart, Target, DollarSign, AlertTriangle, Check } from 'lucide-react';
import { useConfig } from '@/contexts/config-context';
import { usePermissions } from '@/hooks/use-permissions';
import { pageVariants, containerVariants, itemVariants, modalVariants } from '@/lib/animations';
import { LoadingButton } from '@/components/ui/loading-button';
import { CardGridSkeleton } from '@/components/ui/skeleton-loaders';

const CATEGORIES = [
  { key: 'organizational', label: 'Organizational', icon: Building },
  { key: 'roles', label: 'Roles', icon: Users },
  { key: 'transactions', label: 'Transactions', icon: ShoppingCart },
  { key: 'performance', label: 'Performance', icon: Target },
  { key: 'compensation', label: 'Compensation', icon: DollarSign },
];

export default function TerminologyPage() {
  const { terminology, updateTerm, resetToDefaults, t, isLoading: configLoading } = useConfig();
  const { canEditConfig } = usePermissions();
  const [activeTab, setActiveTab] = useState('organizational');
  const [editing, setEditing] = useState<{ category: string; key: string; singular: string; plural: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleEdit = (category: string, key: string) => {
    const cat = terminology[category as keyof typeof terminology];
    if (!cat) return;
    const term = cat[key as keyof typeof cat] as { singular: string; plural: string };
    if (!term) return;
    setEditing({ category, key, singular: term.singular, plural: term.plural });
  };

  const handleSave = async () => {
    if (editing) {
      setIsSaving(true);
      await new Promise(r => setTimeout(r, 500));

      updateTerm(editing.category, editing.key, editing.singular, editing.plural);
      setIsSaving(false);
      setEditing(null);

      toast.success('Term Updated', {
        description: `${editing.key} has been updated successfully`
      });
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    await new Promise(r => setTimeout(r, 800));

    resetToDefaults();
    setIsResetting(false);
    setShowResetConfirm(false);

    toast.success('Reset Complete', {
      description: 'All terminology has been reset to defaults'
    });
  };

  if (configLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-muted rounded-lg animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <CardGridSkeleton count={2} />
            <CardGridSkeleton count={4} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="p-2 bg-primary/10 rounded-lg"
              >
                <Settings className="h-6 w-6 text-primary" />
              </motion.div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Terminology
                </h1>
                <p className="text-muted-foreground text-sm">
                  Customize platform terms to match your organization
                </p>
              </div>
            </div>
            {canEditConfig && (
              <LoadingButton
                variant="outline"
                onClick={() => setShowResetConfirm(true)}
                loading={isResetting}
                loadingText="Resetting..."
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to Defaults
              </LoadingButton>
            )}
          </div>

          {/* Permission Warning */}
          {!canEditConfig && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  View only mode. Contact an administrator to make changes.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Live Preview */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-0 shadow-md">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm px-4 pb-4">
                <span className="text-muted-foreground">Example usage: </span>
                <span className="font-medium">
                  &quot;{t('organizational.region', true)} Performance Report&quot;
                </span>
                <span className="text-muted-foreground"> • </span>
                <span className="font-medium">
                  &quot;Top {t('roles.salesRep', true)} by {t('compensation.commission')}&quot;
                </span>
              </CardContent>
            </Card>
          </motion.div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full overflow-x-auto flex-nowrap justify-start md:justify-center">
              {CATEGORIES.map(({ key, label, icon: Icon }) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center gap-1 min-w-fit"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <TabsContent key={key} value={key} className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader className="px-4 md:px-6">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Icon className="h-5 w-5" />
                      {label} Terms
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 md:px-6">
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="grid gap-3 md:grid-cols-2"
                    >
                      {Object.entries(terminology[key as keyof typeof terminology]).map(([termKey, term]) => (
                        <motion.div
                          key={termKey}
                          variants={itemVariants}
                          whileHover={canEditConfig ? { scale: 1.01 } : {}}
                          className={`flex items-center justify-between p-3 md:p-4 rounded-lg border bg-card transition-all ${
                            canEditConfig ? 'hover:shadow-md cursor-pointer' : ''
                          }`}
                          onClick={() => canEditConfig && handleEdit(key, termKey)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground font-mono mb-1 truncate">
                              {key}.{termKey}
                            </p>
                            <p className="font-medium truncate">
                              {term.singular}
                              <span className="text-muted-foreground font-normal">
                                {' / '}{term.plural}
                              </span>
                            </p>
                          </div>
                          {canEditConfig && (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              className="p-2 rounded-md hover:bg-muted ml-2 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(key, termKey);
                              }}
                            >
                              <Edit className="h-4 w-4 text-muted-foreground" />
                            </motion.button>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* Edit Dialog */}
          <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
            <DialogContent className="sm:max-w-md">
              <AnimatePresence mode="wait">
                {editing && (
                  <motion.div
                    variants={modalVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Edit className="h-5 w-5" />
                        Edit Term
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                      <p className="font-mono text-sm text-muted-foreground bg-muted px-2 py-1 rounded w-fit">
                        {editing.category}.{editing.key}
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="singular">Singular</Label>
                          <Input
                            id="singular"
                            value={editing.singular}
                            onChange={e => setEditing({ ...editing, singular: e.target.value })}
                            placeholder="e.g., Region"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="plural">Plural</Label>
                          <Input
                            id="plural"
                            value={editing.plural}
                            onChange={e => setEditing({ ...editing, plural: e.target.value })}
                            placeholder="e.g., Regions"
                          />
                        </div>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3 text-sm">
                        <p className="text-muted-foreground">Preview:</p>
                        <p className="font-medium mt-1">
                          &quot;View all {editing.plural}&quot; • &quot;Select a {editing.singular}&quot;
                        </p>
                      </div>
                    </div>

                    <DialogFooter className="mt-6 gap-2 sm:gap-0">
                      <LoadingButton
                        variant="outline"
                        onClick={() => setEditing(null)}
                        disabled={isSaving}
                      >
                        Cancel
                      </LoadingButton>
                      <LoadingButton
                        onClick={handleSave}
                        loading={isSaving}
                        loadingText="Saving..."
                        disabled={!editing.singular.trim() || !editing.plural.trim()}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </LoadingButton>
                    </DialogFooter>
                  </motion.div>
                )}
              </AnimatePresence>
            </DialogContent>
          </Dialog>

          {/* Reset Confirmation Dialog */}
          <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
            <DialogContent className="sm:max-w-md">
              <AnimatePresence mode="wait">
                <motion.div
                  variants={modalVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Reset Terminology?
                    </DialogTitle>
                  </DialogHeader>

                  <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                      This will reset all terminology to the default values. Any customizations you&apos;ve made will be lost.
                    </p>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <LoadingButton
                      variant="outline"
                      onClick={() => setShowResetConfirm(false)}
                      disabled={isResetting}
                    >
                      Cancel
                    </LoadingButton>
                    <LoadingButton
                      variant="destructive"
                      onClick={handleReset}
                      loading={isResetting}
                      loadingText="Resetting..."
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset to Defaults
                    </LoadingButton>
                  </DialogFooter>
                </motion.div>
              </AnimatePresence>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </motion.div>
  );
}
