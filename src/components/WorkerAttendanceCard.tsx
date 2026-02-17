import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

interface WorkerAttendanceCardProps {
  worker: Worker;
  isAttended: boolean;
  isSaved: boolean;
  isPending: boolean;
  onToggleAttendance: (workerId: string) => void;
}

export default function WorkerAttendanceCard({
  worker,
  isAttended,
  isSaved,
  isPending,
  onToggleAttendance,
}: WorkerAttendanceCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "border rounded-lg transition-colors",
        isAttended && "border-success bg-success/5",
        isSaved && "border-success bg-success/10"
      )}
    >
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
          <span className="text-xs text-muted-foreground font-mono">
            {worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.perDay')}
          </span>
        </div>
        
        <Button
          size="sm"
          variant={isAttended ? "outline" : "default"}
          onClick={() => onToggleAttendance(worker.id)}
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
  );
}
