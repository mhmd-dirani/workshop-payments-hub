import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const isNegative = member.balance < 0;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow border-border/50"
      onClick={onClick}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between mb-2 md:mb-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm md:text-base">
                {member.full_name || t('team.unnamedUser')}
              </h3>
              <p className="text-[10px] md:text-xs text-muted-foreground">{t('roles.teamMember')}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 md:h-8 md:w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onAddMoney();
            }}
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wallet className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">{t('dashboard.balance')}</span>
          </div>
          <span className={`font-mono font-bold text-sm md:text-base ${
            isNegative ? 'text-destructive' : 'text-success'
          }`}>
            {member.balance >= 0 ? '+' : ''}{member.balance.toLocaleString('fr-FR')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}