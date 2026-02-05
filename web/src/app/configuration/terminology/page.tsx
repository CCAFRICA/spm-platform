'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Settings, Edit, RotateCcw, Save, Building, Users, ShoppingCart, Target, DollarSign } from 'lucide-react';
import { useConfig } from '@/contexts/config-context';
import { usePermissions } from '@/hooks/use-permissions';

const CATEGORIES = [
  { key: 'organizational', label: 'Organizational', icon: Building },
  { key: 'roles', label: 'Roles', icon: Users },
  { key: 'transactions', label: 'Transactions', icon: ShoppingCart },
  { key: 'performance', label: 'Performance', icon: Target },
  { key: 'compensation', label: 'Compensation', icon: DollarSign },
];

export default function TerminologyPage() {
  const { terminology, updateTerm, resetToDefaults, t } = useConfig();
  const { canEditConfig } = usePermissions();
  const [activeTab, setActiveTab] = useState('organizational');
  const [editing, setEditing] = useState<{ category: string; key: string; singular: string; plural: string } | null>(null);

  const handleEdit = (category: string, key: string) => {
    const cat = terminology[category as keyof typeof terminology];
    if (!cat) return;
    const term = cat[key as keyof typeof cat] as { singular: string; plural: string };
    if (!term) return;
    setEditing({ category, key, singular: term.singular, plural: term.plural });
  };

  const handleSave = () => {
    if (editing) {
      updateTerm(editing.category, editing.key, editing.singular, editing.plural);
      setEditing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Settings className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Terminology</h1>
                <p className="text-muted-foreground text-sm">Customize platform terms to match your organization</p>
              </div>
            </div>
            {canEditConfig && (
              <Button variant="outline" onClick={() => confirm('Reset all terminology to defaults?') && resetToDefaults()}>
                <RotateCcw className="mr-2 h-4 w-4" />Reset to Defaults
              </Button>
            )}
          </div>

          {!canEditConfig && (
            <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950 border-0 shadow-md">
              <CardContent className="py-3 text-sm text-yellow-800 dark:text-yellow-200">
                View only mode. Contact an administrator to make changes.
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30 border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <span className="text-muted-foreground">Example usage: </span>
              &quot;{t('organizational.region', true)} Performance Report&quot; • &quot;Top {t('roles.salesRep', true)} by {t('compensation.commission')}&quot;
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 w-full">
              {CATEGORIES.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="flex items-center gap-1">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <TabsContent key={key} value={key} className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {label} Terms
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(terminology[key as keyof typeof terminology]).map(([termKey, term]) => (
                        <div key={termKey} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div>
                            <p className="text-xs text-muted-foreground font-mono mb-1">{termKey}</p>
                            <p className="font-medium">
                              {term.singular}
                              <span className="text-muted-foreground font-normal"> / {term.plural}</span>
                            </p>
                          </div>
                          {canEditConfig && (
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(key, termKey)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Term</DialogTitle>
              </DialogHeader>
              {editing && (
                <div className="space-y-4">
                  <p className="font-mono text-sm text-muted-foreground bg-muted px-2 py-1 rounded w-fit">
                    {editing.category}.{editing.key}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Singular</Label>
                      <Input
                        value={editing.singular}
                        onChange={e => setEditing({ ...editing, singular: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plural</Label>
                      <Input
                        value={editing.plural}
                        onChange={e => setEditing({ ...editing, plural: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave}>
                  <Save className="mr-2 h-4 w-4" />Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
