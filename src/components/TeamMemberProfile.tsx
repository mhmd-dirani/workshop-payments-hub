import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowDownCircle, ArrowUpCircle, Plus, User, Wallet } from 'lucide-react';
import TeamTransferHistory from './TeamTransferHistory';
import TeamSpendingHistory from './TeamSpendingHistory';

interface TeamMember {
  user_id: string;
  full_name: string | null;
  totalReceived: number;
  totalSpent: number;
  balance: number;
}

interface TeamMemberProfileProps {
  member: TeamMember;
  onAddMoney: () => void;
}

export default function TeamMemberProfile({ member, onAddMoney }: TeamMemberProfileProps) {
  const isNegative = member.balance < 0;

  return (
    <div className="space-y-6">
      {/* Header with name and add money button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{member.full_name || 'Unnamed User'}</h1>
            <p className="text-muted-foreground">Team Member Profile</p>
          </div>
        </div>
        <Button onClick={onAddMoney} className="gap-2 gradient-primary text-primary-foreground">
          <Plus className="w-4 h-4" />
          Add Money
        </Button>
      </div>

      {/* Balance Summary Card */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-4 rounded-lg bg-success/5 border border-success/20">
              <div className="flex items-center justify-center gap-2 text-success mb-2">
                <ArrowDownCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Total Received</span>
              </div>
              <p className="text-2xl font-bold font-mono text-success">
                +{member.totalReceived.toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">CFA</p>
            </div>
            
            <div className="text-center p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center justify-center gap-2 text-destructive mb-2">
                <ArrowUpCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Total Spent</span>
              </div>
              <p className="text-2xl font-bold font-mono text-destructive">
                -{member.totalSpent.toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">CFA</p>
            </div>
            
            <div className={`text-center p-4 rounded-lg border ${
              isNegative 
                ? 'bg-destructive/5 border-destructive/20' 
                : 'bg-primary/5 border-primary/20'
            }`}>
              <div className={`flex items-center justify-center gap-2 mb-2 ${
                isNegative ? 'text-destructive' : 'text-primary'
              }`}>
                <Wallet className="w-5 h-5" />
                <span className="text-sm font-medium">Current Balance</span>
              </div>
              <p className={`text-2xl font-bold font-mono ${
                isNegative ? 'text-destructive' : 'text-primary'
              }`}>
                {member.balance >= 0 ? '+' : ''}{member.balance.toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">CFA</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      <TeamTransferHistory userId={member.user_id} />

      {/* Spending History */}
      <TeamSpendingHistory userId={member.user_id} />
    </div>
  );
}
