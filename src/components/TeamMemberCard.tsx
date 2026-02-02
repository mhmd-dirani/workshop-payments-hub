import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, User, Wallet } from 'lucide-react';

interface TeamMember {
  user_id: string;
  full_name: string | null;
  totalReceived: number;
  totalSpent: number;
  balance: number;
}

interface TeamMemberCardProps {
  member: TeamMember;
  onClick: () => void;
  onAddMoney: () => void;
}

export default function TeamMemberCard({ member, onClick, onAddMoney }: TeamMemberCardProps) {
  const isNegative = member.balance < 0;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow border-border/50"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {member.full_name || 'Unnamed User'}
              </h3>
              <p className="text-xs text-muted-foreground">Team Member</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onAddMoney();
            }}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <span className="text-xs">Balance</span>
          </div>
          <span className={`font-mono font-bold ${
            isNegative ? 'text-destructive' : 'text-success'
          }`}>
            {member.balance >= 0 ? '+' : ''}{member.balance.toLocaleString('fr-FR')} CFA
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
