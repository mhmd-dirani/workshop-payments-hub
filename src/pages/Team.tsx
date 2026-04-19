import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllUserBalances } from '@/lib/balance-utils';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import TeamMemberCard from '@/components/TeamMemberCard';
import TeamMemberProfile from '@/components/TeamMemberProfile';
import TeamTransferForm from '@/components/TeamTransferForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Users2, Wallet } from 'lucide-react';

interface TeamMember {
  user_id: string;
  full_name: string | null;
  totalReceived: number;
  totalSpent: number;
  balance: number;
}

export default function Team() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading } = useAuth();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferToMember, setTransferToMember] = useState<TeamMember | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch total given to team (admin only)
  const { data: totalGiven } = useQuery({
    queryKey: ['total-team-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_transfers')
        .select('amount');
      
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    },
    enabled: role === 'admin',
  });

  // Fetch users assigned to this co-admin
  const { data: coAdminUsers = [] } = useQuery({
    queryKey: ['co-admin-users-list', user?.id],
    queryFn: async () => {
      // Get assigned member IDs for this co-admin
      const { data: assignments } = await supabase
        .from('co_admin_member_assignments')
        .select('member_user_id')
        .eq('co_admin_user_id', user!.id);

      const assignedIds = assignments?.map(a => a.member_user_id) || [];
      if (assignedIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', assignedIds);

      return (profiles || []).map(p => ({
        user_id: p.user_id,
        full_name: p.full_name,
      }));
    },
    enabled: role === 'co_admin' && !!user,
  });

  // Fetch all team members (non-admin users) with their balances
  // Uses the SAME util as UserBalanceCard so both views always agree.
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      const nonAdminProfiles = profiles?.filter(p => roleMap.get(p.user_id) !== 'admin') || [];

      const balances = await fetchAllUserBalances(nonAdminProfiles.map(p => p.user_id));

      const members: TeamMember[] = nonAdminProfiles.map(profile => {
        const b = balances.get(profile.user_id);
        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          totalReceived: b?.received ?? 0,
          totalSpent: b?.totalSpent ?? 0,
          balance: b?.balance ?? 0,
        };
      });

      return members;
    },
    enabled: role === 'admin',
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role !== 'admin' && role !== 'co_admin') {
    return <Navigate to="/" replace />;
  }

  const filteredMembers = teamMembers?.filter(m => 
    m.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredCoAdminUsers = coAdminUsers.filter(u => 
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddMoney = (member: TeamMember) => {
    setTransferToMember(member);
    setShowTransferForm(true);
  };

  const handleCoAdminTransfer = (u: { user_id: string; full_name: string | null }) => {
    setTransferToMember({ user_id: u.user_id, full_name: u.full_name } as TeamMember);
    setShowTransferForm(true);
  };

  // Admin: selected member profile view
  if (selectedMember && role === 'admin') {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSelectedMember(null);
                setTransferToMember(null);
              }}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('team.backToTeam')}
            </Button>
          </div>
          
          <TeamMemberProfile 
            member={selectedMember} 
            onAddMoney={() => handleAddMoney(selectedMember)}
          />

          <TeamTransferForm
            open={showTransferForm}
            onOpenChange={setShowTransferForm}
            member={transferToMember}
          />
        </div>
      </Layout>
    );
  }

  // Co-admin: simplified view - just give money to users
  if (role === 'co_admin') {
    return (
      <Layout>
        <div className="space-y-3 md:space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <Users2 className="w-5 h-5 md:w-6 md:h-6" />
              {t('team.giveMoneyTitle')}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {t('team.giveMoneyDesc')}
            </p>
          </div>

          <Card>
            <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-base md:text-lg">{t('team.teamMembers')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-3 md:px-6 pb-3 md:pb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={t('team.searchTeamMembers')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 md:h-10"
                />
              </div>

              {filteredCoAdminUsers.length === 0 ? (
                <div className="text-center py-6 md:py-8 text-muted-foreground text-sm">
                  {searchTerm ? t('team.noMembersMatchSearch') : t('team.noMembersFound')}
                </div>
              ) : (
                <div className="grid gap-2 md:gap-3 grid-cols-1 md:grid-cols-2">
                  {filteredCoAdminUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users2 className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{u.full_name || t('team.unnamedUser')}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => handleCoAdminTransfer(u)}
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        {t('team.giveMoney')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <TeamTransferForm
          open={showTransferForm}
          onOpenChange={setShowTransferForm}
          member={transferToMember}
          isCoAdminTransfer
        />
      </Layout>
    );
  }

  // Admin view
  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Users2 className="w-5 h-5 md:w-6 md:h-6" />
            {t('team.title')}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('team.description')}
          </p>
        </div>

        {/* Total Given to Team */}
        <Card className="shadow-card border-success/20">
          <CardContent className="p-3 md:pt-6 md:px-6">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 rounded-xl bg-success/10">
                <Wallet className="w-5 h-5 md:w-6 md:h-6 text-success" />
              </div>
              <div>
                <p className="text-xs md:text-sm font-medium text-success">{t('team.totalGivenToTeam')}</p>
                <p className="text-lg md:text-2xl font-bold font-mono text-success">
                  {totalGiven !== undefined ? `+${totalGiven.toLocaleString('fr-FR')} CFA` : '...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-base md:text-lg">{t('team.teamMembers')}</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {t('team.clickToViewProfile')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-3 md:px-6 pb-3 md:pb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder={t('team.searchTeamMembers')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9 md:h-10"
              />
            </div>

            {isLoading ? (
              <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 md:h-32" />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-muted-foreground text-sm">
                {searchTerm ? t('team.noMembersMatchSearch') : t('team.noMembersFound')}
              </div>
            ) : (
              <div className="grid gap-2 md:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredMembers.map((member) => (
                  <TeamMemberCard
                    key={member.user_id}
                    member={member}
                    onClick={() => setSelectedMember(member)}
                    onAddMoney={() => handleAddMoney(member)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TeamTransferForm
        open={showTransferForm}
        onOpenChange={setShowTransferForm}
        member={transferToMember}
      />
    </Layout>
  );
}