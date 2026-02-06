'use client';

/**
 * User Role Assignments Component
 *
 * Displays and manages user role assignments for a specific role.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  UserPlus,
  UserMinus,
  Search,
  Mail,
  Calendar,
} from 'lucide-react';
import type { Role, UserRoleAssignment } from '@/types/rbac';
import { useLocale } from '@/contexts/locale-context';

interface UserRoleAssignmentsProps {
  role: Role;
  assignments: UserRoleAssignment[];
  onAssign: (userId: string, userName: string, userEmail: string) => void;
  onRevoke: (userId: string) => void;
}

export function UserRoleAssignments({
  role,
  assignments,
  onAssign,
  onRevoke,
}: UserRoleAssignmentsProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredAssignments = assignments.filter((a) =>
    a.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddUser = () => {
    if (newUserName && newUserEmail) {
      const userId = `user-${Date.now()}`;
      onAssign(userId, newUserName, newUserEmail);
      setNewUserName('');
      setNewUserEmail('');
      setShowAddDialog(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              {isSpanish ? 'Usuarios con este Rol' : 'Users with this Role'}
              <Badge variant="secondary">{assignments.length}</Badge>
            </CardTitle>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Agregar Usuario' : 'Add User'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isSpanish ? 'Buscar usuarios...' : 'Search users...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* User List */}
          <ScrollArea className="h-[300px]">
            {filteredAssignments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm
                  ? isSpanish
                    ? 'No se encontraron usuarios'
                    : 'No users found'
                  : isSpanish
                    ? 'No hay usuarios asignados a este rol'
                    : 'No users assigned to this role'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAssignments.map((assignment) => (
                  <div
                    key={assignment.userId}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {assignment.userName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{assignment.userName}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {assignment.userEmail}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(assignment.assignedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(assignment.userId)}
                      className="text-destructive hover:text-destructive"
                    >
                      <UserMinus className="h-4 w-4 mr-1" />
                      {isSpanish ? 'Revocar' : 'Revoke'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Agregar Usuario al Rol' : 'Add User to Role'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? `Asignar el rol "${role.name}" a un nuevo usuario.`
                : `Assign the "${role.name}" role to a new user.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="userName">{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                id="userName"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder={isSpanish ? 'Nombre del usuario' : 'User name'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userEmail">{isSpanish ? 'Correo' : 'Email'}</Label>
              <Input
                id="userEmail"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder={isSpanish ? 'correo@ejemplo.com' : 'email@example.com'}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={!newUserName.trim() || !newUserEmail.trim()}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Agregar' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
