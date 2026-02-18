import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

interface WorkerAttendanceCardProps {
  worker: Worker;
  isAttended: boolean;
  isHalfDay: boolean;
  isSaved: boolean;
  isPending: boolean;
  otherWorkshopName?: string;
  isBlocked?: boolean;
  onToggleAttendance: (workerId: string, halfDay?: boolean) => void;
}

export default function WorkerAttendanceCard({
  worker,
  isAttended,
  isHalfDay,
  isSaved,
  isPending,
  otherWorkshopName,
  isBlocked = false,
  onToggleAttendance,
}: WorkerAttendanceCardProps) {
  const { t } = useTranslation();

  const displayRate = isHalfDay ? worker.hourly_rate * 0.5 : worker.hourly_rate;

  return (
    <div
      className={cn(
        "border rounded-lg transition-colors",
        isAttended && !isHalfDay && "border-success bg-success/5",
        isAttended && isHalfDay && "border-warning bg-warning/5",
        isSaved && "border-success bg-success/10"
      )}
    >
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{worker.name}</span>
            {isAttended && !isSaved && (
              <Badge variant="secondary" className={cn(
                "text-[10px]",
                isHalfDay 
                  ? "bg-warning/20 text-warning" 
                  : "bg-success/20 text-success"
              )}>
                {isHalfDay ? (
                  <>
                    <Clock className="w-2.5 h-2.5 mr-1" />
                    {t('attendance.halfDay')}
                  </>
                ) : (
                  <>
                    <Check className="w-2.5 h-2.5 mr-1" />
                    {t('attendance.attended')}
                  </>
                )}
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
              {displayRate.toLocaleString('fr-FR')} CFA/{t('attendance.perDay')}
            </span>
            {otherWorkshopName && !isAttended && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-warning text-warning">
                {otherWorkshopName}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          {isAttended ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleAttendance(worker.id)}
              disabled={isPending}
              className="h-8 gap-1.5 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  {t('common.cancel')}
                </>
              )}
            </Button>
          ) : isBlocked && otherWorkshopName ? (
            // Worker already has full day elsewhere — completely blocked
            <Badge variant="outline" className="text-[10px] px-2 py-1 border-destructive text-destructive">
              {t('attendance.fullDay')} @ {otherWorkshopName}
            </Badge>
          ) : otherWorkshopName ? (
            // Worker has half day in another workshop — only half day allowed
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleAttendance(worker.id, true)}
              disabled={isPending}
              className="h-8 gap-1.5 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  {t('attendance.halfDay')}
                </>
              )}
            </Button>
          ) : (
            // Worker not in any workshop — full day or half day
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() => onToggleAttendance(worker.id, false)}
                disabled={isPending}
                className="h-8 gap-1 text-xs px-2 bg-success text-success-foreground hover:bg-success/90"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('attendance.fullDay')}</span>
                    <span className="sm:hidden">1</span>
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleAttendance(worker.id, true)}
                disabled={isPending}
                className="h-8 gap-1 text-xs px-2 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('attendance.halfDay')}</span>
                    <span className="sm:hidden">½</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
