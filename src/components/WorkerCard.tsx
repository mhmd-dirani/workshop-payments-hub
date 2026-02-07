import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, UserX, UserCheck, Trash2, ChevronRight, Wallet, Sparkles, MinusCircle } from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

interface WorkerCardProps {
  worker: Worker;
  owedAmount: number;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onToggleStatus: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  workshopBreakdown?: { id: string; name: string; amount: number }[];
  selectedWorkshopId?: string | null;
  weeklyBonus?: number;
  weeklyDiscount?: number;
}

export default function WorkerCard({
  worker,
  owedAmount,
  isSelected,
  onSelect,
  onClick,
  onEdit,
  onToggleStatus,
  onDelete,
  workshopBreakdown = [],
  selectedWorkshopId = null,
  weeklyBonus = 0,
  weeklyDiscount = 0,
}: WorkerCardProps) {
  const { t } = useTranslation();
  const otherWorkshopBreakdown = selectedWorkshopId
    ? workshopBreakdown
        .filter((entry) => entry.id !== selectedWorkshopId)
        .sort((a, b) => b.amount - a.amount)
    : [];
  const showWorkshopBreakdown = worker.is_active && otherWorkshopBreakdown.length > 0;

  return (
    <div
      onClick={() => worker.is_active && onClick()}
      className={`border rounded-lg p-3 transition-colors ${
        worker.is_active 
          ? 'cursor-pointer hover:bg-muted/50' 
          : 'opacity-60 bg-muted/50'
      } ${isSelected ? 'border-primary bg-primary/5' : ''}`}
    >
      <div className="flex items-center gap-2">
        {/* Checkbox for selection - only for active workers with owed amount */}
        {worker.is_active && owedAmount > 0 && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              onSelect(!!checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${worker.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
              <div className="min-w-0">
                <span className="font-medium text-sm block truncate">{worker.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">
                    {worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.day')}
                  </span>
                  {weeklyBonus > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1 py-0 bg-success/15 text-success">
                      <Sparkles className="w-2.5 h-2.5" />
                      +{weeklyBonus.toLocaleString('fr-FR')}
                    </Badge>
                  )}
                  {weeklyDiscount > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1 py-0 bg-destructive/15 text-destructive">
                      <MinusCircle className="w-2.5 h-2.5" />
                      -{weeklyDiscount.toLocaleString('fr-FR')}
                    </Badge>
                  )}
                </div>
              </div>
              {!worker.is_active && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {t('workers.inactive')}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Owed amount */}
          {worker.is_active && (
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Wallet className={`w-3.5 h-3.5 ${owedAmount > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-mono font-medium ${owedAmount > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                  {owedAmount.toLocaleString('fr-FR')} CFA
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  className="h-7 w-7"
                  title={t('common.edit')}
                >
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleStatus}
                  className="h-7 w-7"
                  title={worker.is_active ? t('workers.deactivate') : t('workers.activate')}
                >
                  {worker.is_active ? (
                    <UserX className="w-3.5 h-3.5 text-warning" />
                  ) : (
                    <UserCheck className="w-3.5 h-3.5 text-success" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="h-7 w-7"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
                {worker.is_active && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          )}
          {showWorkshopBreakdown && (
            <div className="mt-2 flex flex-wrap gap-1">
              {otherWorkshopBreakdown.map(({ id, name, amount }) => (
                <Badge key={id} variant="outline" className="text-[10px] font-mono">
                  {name}: {amount.toLocaleString('fr-FR')} CFA
                </Badge>
              ))}
            </div>
          )}
          
          {/* Actions for inactive workers */}
          {!worker.is_active && (
            <div className="mt-2 flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onEdit}
                className="h-7 w-7"
                title={t('common.edit')}
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleStatus}
                className="h-7 w-7"
                title={t('workers.activate')}
              >
                <UserCheck className="w-3.5 h-3.5 text-success" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-7 w-7"
                title={t('common.delete')}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
