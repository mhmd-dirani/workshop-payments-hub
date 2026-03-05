import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { UserPlus, Loader2, Shield, User, FolderOpen, Eye, EyeOff, Trash2, Edit, MoreVertical } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import WorkshopAssignments from '@/components/WorkshopAssignments';
import { useAuth } from '@/lib/auth';
import { z } from 'zod';

// Validation schema
const createUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password must be less than 72 characters'),
});

interface UserRole {
  role: string;
}

interface ProfileWithRoles {
  id: string;
  user_id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
  user_roles: UserRole[];
}

export default function Users() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [assignmentUser, setAssignmentUser] = useState<{ id: string; name: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // Fetch profiles and roles separately
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesError) throw rolesError;

      // Combine the data
      return profiles.map(profile => ({
        ...profile,
        user_roles: roles.filter(r => r.user_id === profile.user_id).map(r => ({ role: r.role }))
      })) as ProfileWithRoles[];
    },
  });

  // Fetch workshop assignment counts per user
  const { data: assignmentCounts } = useQuery({
    queryKey: ['workshop-assignment-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshop_assignments')
        .select('user_id');
      if (error) throw error;
      
      // Count assignments per user
      const counts: Record<string, number> = {};
      data.forEach(a => {
        counts[a.user_id] = (counts[a.user_id] || 0) + 1;
      });
      return counts;
    },
  });

  const createUser = useMutation({
    mutationFn: async (data: { full_name: string; email: string; password: string }) => {
      const { data: response, error } = await supabase.functions.invoke('create-user', {
        body: data,
      });
      
      if (error) throw error;
      if (response.error) throw new Error(response.error);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDialogOpen(false);
      setNewUserForm({ full_name: '', email: '', password: '' });
      toast({
        title: t('users.userCreated'),
        description: t('users.userCreatedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateUser = () => {
    const result = createUserSchema.safeParse(newUserForm);
    if (!result.success) {
      toast({
        title: t('validation.validationError'),
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    createUser.mutate(newUserForm);
  };

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'co_admin' | 'user' }) => {
      // First try to update existing role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert([{ user_id: userId, role }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('users.roleUpdated'),
        description: t('users.roleUpdatedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getRoleBadge = (roles: UserRole[]) => {
    const role = roles?.[0]?.role;
    if (role === 'admin') {
      return (
        <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
          <Shield className="w-3 h-3" />
          {t('roles.admin')}
        </Badge>
      );
    }
    if (role === 'co_admin') {
      return (
        <Badge className="gap-1 bg-accent/50 text-accent-foreground border-accent/30">
          <Shield className="w-3 h-3" />
          {t('roles.coAdmin')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        <User className="w-3 h-3" />
        {t('roles.user')}
      </Badge>
    );
  };

  const getWorkshopCount = (userId: string, role: string) => {
    if (role === 'admin') {
      return <span className="text-muted-foreground">{t('users.allAdmin')}</span>;
    }
    const count = assignmentCounts?.[userId] || 0;
    return count === 0 
      ? <span className="text-destructive">{t('common.none')}</span>
      : <span>{t('users.workshopsSelected', { count })}</span>;
  };

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-bold tracking-tight">{t('users.title')}</h2>
            <p className="text-xs md:text-sm text-muted-foreground truncate">
              {t('users.description')}
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 md:gap-2 gradient-primary text-primary-foreground shrink-0">
                <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{t('users.addUser')}</span>
                <span className="sm:hidden">{t('common.add')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('users.addNewUser')}</DialogTitle>
                <DialogDescription>
                  {t('users.createUserDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">{t('auth.fullName')} *</Label>
                  <Input
                    id="full_name"
                    placeholder={t('users.enterFullName')}
                    value={newUserForm.full_name}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('users.enterEmail')}
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')} *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('users.enterPassword')}
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm(prev => ({ ...prev, password: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleCreateUser}
                  disabled={createUser.isPending}
                  className="gradient-primary text-primary-foreground"
                >
                  {createUser.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('users.createUser')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="shadow-card">
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">{t('users.allUsers')}</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {t('users.manageRolesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 md:px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !users || users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>{t('users.noUsersFound')}</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {users.map((user) => {
                    const userRole = user.user_roles?.[0]?.role || 'user';
                    return (
                      <div key={user.id} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">
                              {user.full_name || t('users.noNameSet')}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {t('users.joined')} {format(new Date(user.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          {getRoleBadge(user.user_roles)}
                        </div>
                        
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="text-xs text-muted-foreground">
                            <FolderOpen className="w-3 h-3 inline mr-1" />
                            {getWorkshopCount(user.user_id, userRole)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {userRole !== 'admin' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => setAssignmentUser({ 
                                  id: user.user_id, 
                                  name: user.full_name || t('roles.user')
                                })}
                              >
                                <FolderOpen className="w-3 h-3 mr-1" />
                                {t('users.assign')}
                              </Button>
                            )}
                            <Select
                              defaultValue={userRole}
                              onValueChange={(value) => updateRole.mutate({ 
                                userId: user.user_id, 
                                role: value as 'admin' | 'co_admin' | 'user' 
                              })}
                            >
                              <SelectTrigger className="w-24 h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">{t('roles.user')}</SelectItem>
                                <SelectItem value="co_admin">{t('roles.coAdmin')}</SelectItem>
                                <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('users.role')}</TableHead>
                        <TableHead>{t('users.workshops')}</TableHead>
                        <TableHead>{t('users.joined')}</TableHead>
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => {
                        const userRole = user.user_roles?.[0]?.role || 'user';
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.full_name || t('users.noNameSet')}
                            </TableCell>
                            <TableCell>
                              {getRoleBadge(user.user_roles)}
                            </TableCell>
                            <TableCell>
                              {getWorkshopCount(user.user_id, userRole)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(user.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {userRole !== 'admin' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => setAssignmentUser({ 
                                      id: user.user_id, 
                                      name: user.full_name || t('roles.user')
                                    })}
                                  >
                                    <FolderOpen className="w-3 h-3" />
                                    {t('users.workshops')}
                                  </Button>
                                )}
                                <Select
                                  defaultValue={userRole}
                                  onValueChange={(value) => updateRole.mutate({ 
                                    userId: user.user_id, 
                                    role: value as 'admin' | 'co_admin' | 'user' 
                                  })}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">{t('roles.user')}</SelectItem>
                                    <SelectItem value="co_admin">{t('roles.coAdmin')}</SelectItem>
                                    <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workshop Assignment Dialog */}
      {assignmentUser && (
        <WorkshopAssignments
          userId={assignmentUser.id}
          userName={assignmentUser.name}
          open={!!assignmentUser}
          onOpenChange={(open) => !open && setAssignmentUser(null)}
        />
      )}
    </Layout>
  );
}