import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, role, loading: authLoading } = useAuth();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferToMember, setTransferToMember] = useState<TeamMember | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch total given to team
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

  // Fetch all team members (non-admin users) with their balances
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      // Get all roles to filter out admins
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      // Filter to only non-admin users
      const nonAdminProfiles = profiles?.filter(p => roleMap.get(p.user_id) !== 'admin') || [];

      // Get all team transfers
      const { data: transfers } = await supabase
        .from('team_transfers')
        .select('user_id, amount');

      // Get all approved payments
      const { data: payments } = await supabase
        .from('payments')
        .select('created_by, amount')
        .eq('status', 'approved');

      // Calculate balances for each member
      const members: TeamMember[] = nonAdminProfiles.map(profile => {
        const received = transfers
          ?.filter(t => t.user_id === profile.user_id)
          .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        const spent = payments
          ?.filter(p => p.created_by === profile.user_id)
          .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          totalReceived: received,
          totalSpent: spent,
          balance: received - spent,
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

  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const filteredMembers = teamMembers?.filter(m => 
    m.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleAddMoney = (member: TeamMember) => {
    setTransferToMember(member);
    setShowTransferForm(true);
  };

  if (selectedMember) {
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
              Back to Team
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

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Users2 className="w-5 h-5 md:w-6 md:h-6" />
            Team Finances
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage team member balances across all workshops
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
                <p className="text-xs md:text-sm font-medium text-success">Total Given to Team</p>
                <p className="text-lg md:text-2xl font-bold font-mono text-success">
                  {totalGiven !== undefined ? `+${totalGiven.toLocaleString('fr-FR')} CFA` : '...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-base md:text-lg">Team Members</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Click on a member to view their profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-3 md:px-6 pb-3 md:pb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search team members..."
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
                {searchTerm ? 'No members match your search' : 'No team members found'}
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
