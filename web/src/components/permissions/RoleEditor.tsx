'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Save, X, Shield, Lock } from 'lucide-react';
import type { Role, Permission, PermissionCategory, ScopeType } from '@/types/permission';
import {
  PERMISSION_CATEGORIES,
  getPermissionsByCategory,
} from '@/types/permission';
import { SYSTEM_ROLE_TEMPLATES } from '@/lib/permissions/role-templates';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface RoleEditorProps {
  role?: Role;
  onSave: (data: {
    name: string;
    nameEs: string;
    description: string;
    descriptionEs: string;
    permissions: Permission[];
    defaultScopeType: ScopeType;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function RoleEditor({ role, onSave, onCancel, isLoading }: RoleEditorProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [name, setName] = useState(role?.name || '');
  const [nameEs, setNameEs] = useState(role?.nameEs || '');
  const [description, setDescription] = useState(role?.description || '');
  const [descriptionEs, setDescriptionEs] = useState(role?.descriptionEs || '');
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissions || []);
  const [defaultScopeType, setDefaultScopeType] = useState<ScopeType>(
    role?.defaultScope.type || 'own'
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const categories = useMemo(() => {
    return Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];
  }, []);

  const handleTogglePermission = (permission: Permission, checked: boolean) => {
    if (checked) {
      setPermissions([...permissions, permission]);
    } else {
      setPermissions(permissions.filter((p) => p !== permission));
    }
  };

  const handleToggleCategory = (category: PermissionCategory, checked: boolean) => {
    const categoryPermissions = getPermissionsByCategory(category).map((p) => p.id);

    if (checked) {
      const newPermissions = new Set([...permissions, ...categoryPermissions]);
      setPermissions(Array.from(newPermissions));
    } else {
      setPermissions(permissions.filter((p) => !categoryPermissions.includes(p)));
    }
  };

  const isCategoryFullySelected = (category: PermissionCategory) => {
    const categoryPermissions = getPermissionsByCategory(category).map((p) => p.id);
    return categoryPermissions.every((p) => permissions.includes(p));
  };

  const isCategoryPartiallySelected = (category: PermissionCategory) => {
    const categoryPermissions = getPermissionsByCategory(category).map((p) => p.id);
    const selected = categoryPermissions.filter((p) => permissions.includes(p));
    return selected.length > 0 && selected.length < categoryPermissions.length;
  };

  const handleApplyTemplate = (templateName: string) => {
    const template = SYSTEM_ROLE_TEMPLATES.find((t) => t.name === templateName);
    if (template) {
      setPermissions(template.permissions);
      setDefaultScopeType(template.defaultScopeType);
      if (!name) setName(template.name);
      if (!nameEs) setNameEs(template.nameEs);
      if (!description) setDescription(template.description);
      if (!descriptionEs) setDescriptionEs(template.descriptionEs);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      nameEs: nameEs.trim() || name.trim(),
      description: description.trim(),
      descriptionEs: descriptionEs.trim() || description.trim(),
      permissions,
      defaultScopeType,
    });
  };

  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {role
              ? isSpanish
                ? 'Editar Rol'
                : 'Edit Role'
              : isSpanish
                ? 'Nuevo Rol'
                : 'New Role'}
          </CardTitle>
          {role?.isSystem && (
            <CardDescription className="flex items-center gap-2 text-amber-600">
              <Lock className="h-4 w-4" />
              {isSpanish
                ? 'Los roles del sistema no pueden ser modificados'
                : 'System roles cannot be modified'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template Selector (for new roles only) */}
          {!role && (
            <div className="space-y-2">
              <Label>{isSpanish ? 'Iniciar desde plantilla' : 'Start from template'}</Label>
              <Select value={selectedTemplate} onValueChange={(v) => {
                setSelectedTemplate(v);
                handleApplyTemplate(v);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={isSpanish ? 'Seleccionar plantilla...' : 'Select template...'} />
                </SelectTrigger>
                <SelectContent>
                  {SYSTEM_ROLE_TEMPLATES.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {isSpanish ? template.nameEs : template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{isSpanish ? 'Nombre (Inglés)' : 'Name (English)'}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sales Manager"
                disabled={role?.isSystem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameEs">{isSpanish ? 'Nombre (Español)' : 'Name (Spanish)'}</Label>
              <Input
                id="nameEs"
                value={nameEs}
                onChange={(e) => setNameEs(e.target.value)}
                placeholder="e.g., Gerente de Ventas"
                disabled={role?.isSystem}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="description">
                {isSpanish ? 'Descripción (Inglés)' : 'Description (English)'}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Role description..."
                rows={2}
                disabled={role?.isSystem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descriptionEs">
                {isSpanish ? 'Descripción (Español)' : 'Description (Spanish)'}
              </Label>
              <Textarea
                id="descriptionEs"
                value={descriptionEs}
                onChange={(e) => setDescriptionEs(e.target.value)}
                placeholder="Descripción del rol..."
                rows={2}
                disabled={role?.isSystem}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{isSpanish ? 'Alcance Predeterminado' : 'Default Scope'}</Label>
            <Select
              value={defaultScopeType}
              onValueChange={(v) => setDefaultScopeType(v as ScopeType)}
              disabled={role?.isSystem}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="own">{isSpanish ? 'Propio' : 'Own'}</SelectItem>
                <SelectItem value="team">{isSpanish ? 'Equipo' : 'Team'}</SelectItem>
                <SelectItem value="store">{isSpanish ? 'Tienda' : 'Store'}</SelectItem>
                <SelectItem value="region">{isSpanish ? 'Región' : 'Region'}</SelectItem>
                <SelectItem value="global">{isSpanish ? 'Global' : 'Global'}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isSpanish
                ? 'Define el nivel de acceso a datos por defecto para este rol'
                : 'Defines the default data access level for this role'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Permisos' : 'Permissions'}</CardTitle>
          <CardDescription>
            {permissions.length}{' '}
            {isSpanish ? 'permisos seleccionados' : 'permissions selected'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {categories.map((category) => {
              const catInfo = PERMISSION_CATEGORIES[category];
              const categoryPermissions = getPermissionsByCategory(category);
              const isFullySelected = isCategoryFullySelected(category);
              const isPartiallySelected = isCategoryPartiallySelected(category);

              return (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isFullySelected}
                        ref={(ref) => {
                          if (ref) {
                            (ref as HTMLButtonElement).dataset.state = isPartiallySelected
                              ? 'indeterminate'
                              : isFullySelected
                                ? 'checked'
                                : 'unchecked';
                          }
                        }}
                        onCheckedChange={(checked) => {
                          handleToggleCategory(category, checked as boolean);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={role?.isSystem}
                        className={cn(isPartiallySelected && 'opacity-70')}
                      />
                      <span className="font-medium">
                        {isSpanish ? catInfo.nameEs : catInfo.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {categoryPermissions.filter((p) => permissions.includes(p.id)).length}/
                        {categoryPermissions.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pl-8">
                      {categoryPermissions.map((perm) => (
                        <div key={perm.id} className="flex items-start gap-3 py-1">
                          <Checkbox
                            id={perm.id}
                            checked={permissions.includes(perm.id)}
                            onCheckedChange={(checked) => {
                              handleTogglePermission(perm.id, checked as boolean);
                            }}
                            disabled={role?.isSystem}
                          />
                          <div className="space-y-0.5">
                            <Label
                              htmlFor={perm.id}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {isSpanish ? perm.nameEs : perm.name}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {isSpanish ? perm.descriptionEs : perm.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Actions */}
      {!role?.isSystem && (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            {isSpanish ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading
              ? isSpanish
                ? 'Guardando...'
                : 'Saving...'
              : isSpanish
                ? 'Guardar Rol'
                : 'Save Role'}
          </Button>
        </div>
      )}
    </div>
  );
}
