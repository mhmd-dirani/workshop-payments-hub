import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Check, X, ChevronDown, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

interface AttendanceData {
  extraAmount: string;
  extraReason: string;
  discountAmount: string;
  discountReason: string;
}

interface WorkerAttendanceCardProps {
  worker: Worker;
  isAttended: boolean;
  isSaved: boolean;
  isPending: boolean;
  onToggleAttendance: (workerId: string, data: AttendanceData) => void;
}

export default function WorkerAttendanceCard({
  worker,
  isAttended,
  isSaved,
  isPending,
  onToggleAttendance,
}: WorkerAttendanceCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const handleToggle = () => {
    onToggleAttendance(worker.id, {
      extraAmount,
      extraReason,
      discountAmount,
      discountReason,
    });
    // Clear fields after marking attendance
    if (!isAttended) {
      setExtraAmount('');
      setExtraReason('');
      setDiscountAmount('');
      setDiscountReason('');
      setIsOpen(false);
    }
  };

  const hasExtras = extraAmount || discountAmount;
  const netAmount = worker.hourly_rate + (Number(extraAmount) || 0) - (Number(discountAmount) || 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "border rounded-lg transition-colors",
          isAttended && "border-success bg-success/5",
          isSaved && "border-success bg-success/10"
        )}
      >
        {/* Main Row */}
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{worker.name}</span>
              {isAttended && !isSaved && (
                <Badge variant="secondary" className="text-[10px] bg-success/20 text-success">
                  <Check className="w-2.5 h-2.5 mr-1" />
                  {t('attendance.attended')}
                </Badge>
              )}
              {isSaved && (
                <Badge className="text-[10px] bg-success text-success-foreground">
                  <Check className="w-2.5 h-2.5 mr-1" />
                  {t('common.saved')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                {worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.perDay')}
              </span>
              {hasExtras && !isAttended && (
                <span className={cn(
                  "text-xs font-mono",
                  netAmount > worker.hourly_rate ? "text-success" : "text-destructive"
                )}>
                  → {netAmount.toLocaleString('fr-FR')} CFA
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {!isAttended && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    isOpen && "rotate-180"
                  )} />
                </Button>
              </CollapsibleTrigger>
            )}
            <Button
              size="sm"
              variant={isAttended ? "outline" : "default"}
              onClick={handleToggle}
              disabled={isPending}
              className={cn(
                "h-8 gap-1.5",
                isAttended 
                  ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" 
                  : "bg-success text-success-foreground hover:bg-success/90"
              )}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isAttended ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  {t('common.cancel')}
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {t('attendance.attended')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Expandable Extras Section */}
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
            {/* Bonus Section */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-success flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  {t('attendance.extraReason', { defaultValue: 'Bonus' })}
                </label>
                <Input
                  type="number"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  placeholder="0 CFA"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">
                  {t('attendance.enterExtraReason', { defaultValue: 'Why?' })}
                </label>
                <Input
                  type="text"
                  value={extraReason}
                  onChange={(e) => setExtraReason(e.target.value)}
                  placeholder={t('attendance.enterExtraReason', { defaultValue: 'Reason...' })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Discount Section */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-destructive flex items-center gap-1">
                  <Minus className="w-3 h-3" />
                  {t('attendance.discount', { defaultValue: 'Discount' })}
                </label>
                <Input
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0 CFA"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">
                  {t('attendance.enterDiscountReason', { defaultValue: 'Why?' })}
                </label>
                <Input
                  type="text"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder={t('attendance.enterDiscountReason', { defaultValue: 'Reason...' })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
