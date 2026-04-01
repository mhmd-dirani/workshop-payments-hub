import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MemberAssignmentsProps {
  coAdminUserId: string;
  coAdminName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MemberAssignments({
  coAdminUserId,
  coAdminName,
  open,
  onOpenChange,
}: MemberAssignmentsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch all non-admin, non-co-admin users as assignable members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['assignable-members'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      return (profiles || [])
        .filter(p => {
          const r = roleMap.get(p.user_id);
          return r !== 'admin' && r !== 'co_admin';
        })
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    },
    enabled: open,
  });

  // Fetch current assignments
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['co-admin-member-assignments', coAdminUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('co_admin_member_assignments')
        .select('member_user_id')
        .eq('co_admin_user_id', coAdminUserId);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  if (assignments && !initialized) {
    setSelectedMembers(new Set(assignments.map(a => a.member_user_id)));
    setInitialized(true);
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setInitialized(false);
    onOpenChange(newOpen);
  };

  const saveMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      const { error: deleteError } = await supabase
        .from('co_admin_member_assignments')
        .delete()
        .eq('co_admin_user_id', coAdminUserId);
      if (deleteError) throw deleteError;

      if (memberIds.length > 0) {
        const { error: insertError } = await supabase
          .from('co_admin_member_assignments')
          .insert(
            memberIds.map(mid => ({
              co_admin_user_id: coAdminUserId,
              member_user_id: mid,
              assigned_by: user?.id,
            }))
          );
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['co-admin-member-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['co-admin-member-assignment-counts'] });
      toast({
        title: t('users.memberAssignmentsUpdated'),
        description: t('users.memberAccessUpdated'),
      });
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const toggleMember = (memberId: string) => {
    const newSet = new Set(selectedMembers);
    if (newSet.has(memberId)) newSet.delete(memberId);
    else newSet.add(memberId);
    setSelectedMembers(newSet);
  };

  const selectAll = () => {
    if (members) setSelectedMembers(new Set(members.map(m => m.user_id)));
  };
  const selectNone = () => setSelectedMembers(new Set());

  const isLoading = membersLoading || assignmentsLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="w-5 h-5" />
            {t('users.memberAccess')}
          </DialogTitle>
          <DialogDescription>
            {t('users.selectMembers')} <span className="font-medium">{coAdminName}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                {t('users.selectAll')}
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                {t('users.selectNone')}
              </Button>
            </div>

            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-3">
                {members?.map(member => (
                  <div key={member.user_id} className="flex items-center space-x-3 rtl:space-x-reverse">
                    <Checkbox
                      id={`member-${member.user_id}`}
                      checked={selectedMembers.has(member.user_id)}
                      onCheckedChange={() => toggleMember(member.user_id)}
                    />
                    <Label
                      htmlFor={`member-${member.user_id}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {member.full_name || t('team.unnamedUser')}
                    </Label>
                  </div>
                ))}
                {(!members || members.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('users.noMembersAvailable')}
                  </p>
                )}
              </div>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              {t('users.membersSelected', { count: selectedMembers.size })}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => saveMutation.mutate(Array.from(selectedMembers))}
            disabled={saveMutation.isPending}
            className="gradient-primary text-primary-foreground"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 ltr:mr-2 rtl:ml-2 animate-spin" />}
            {t('users.saveAccess')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
