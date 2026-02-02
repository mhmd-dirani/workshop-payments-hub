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
import { ArrowLeft, Plus, Search, Users2 } from 'lucide-react';

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
              onClick={() => setSelectedMember(null)}
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
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users2 className="w-6 h-6" />
              Team Finances
            </h1>
            <p className="text-muted-foreground">
              Manage team member balances across all workshops
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Team Members</CardTitle>
            <CardDescription>
              Click on a member to view their full financial profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search team members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No members match your search' : 'No team members found'}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
