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
    <div className="space-y-3 md:space-y-6">
      {/* Header with name and add money button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 md:w-7 md:h-7 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate">{member.full_name || 'Unnamed User'}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Team Member Profile</p>
          </div>
        </div>
        <Button 
          onClick={onAddMoney} 
          size="sm"
          className="gap-1.5 gradient-primary text-primary-foreground shrink-0 h-8 md:h-9 text-xs md:text-sm"
        >
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="hidden sm:inline">Add Money</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Balance Summary Card */}
      <Card className="shadow-card">
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Wallet className="w-4 h-4 md:w-5 md:h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          <div className="grid grid-cols-3 gap-2 md:gap-6">
            <div className="text-center p-2 md:p-4 rounded-lg bg-success/5 border border-success/20">
              <div className="flex items-center justify-center gap-1 text-success mb-1 md:mb-2">
                <ArrowDownCircle className="w-3 h-3 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-medium">Received</span>
              </div>
              <p className="text-sm md:text-2xl font-bold font-mono text-success truncate">
                +{member.totalReceived.toLocaleString('fr-FR')}
              </p>
            </div>
            
            <div className="text-center p-2 md:p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center justify-center gap-1 text-destructive mb-1 md:mb-2">
                <ArrowUpCircle className="w-3 h-3 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-medium">Spent</span>
              </div>
              <p className="text-sm md:text-2xl font-bold font-mono text-destructive truncate">
                -{member.totalSpent.toLocaleString('fr-FR')}
              </p>
            </div>
            
            <div className={`text-center p-2 md:p-4 rounded-lg border ${
              isNegative 
                ? 'bg-destructive/5 border-destructive/20' 
                : 'bg-primary/5 border-primary/20'
            }`}>
              <div className={`flex items-center justify-center gap-1 mb-1 md:mb-2 ${
                isNegative ? 'text-destructive' : 'text-primary'
              }`}>
                <Wallet className="w-3 h-3 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-medium">Balance</span>
              </div>
              <p className={`text-sm md:text-2xl font-bold font-mono truncate ${
                isNegative ? 'text-destructive' : 'text-primary'
              }`}>
                {member.balance >= 0 ? '+' : ''}{member.balance.toLocaleString('fr-FR')}
              </p>
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
