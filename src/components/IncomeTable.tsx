import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Trash2, TrendingUp, Pencil, Loader2, Eye, Download, Paperclip } from 'lucide-react';

interface IncomeTableProps {
  workshopId: string;
}

interface Income {
  id: string;
  amount: number;
  income_date: string;
  description: string | null;
  workshop_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface WorkshopFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  income_id: string | null;
}

export default function IncomeTable({ workshopId }: IncomeTableProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');

  const { data: incomeRecords, isLoading } = useQuery({
    queryKey: ['income', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('income_date', { ascending: false });
      
      if (error) throw error;
      return data as Income[];
    },
    enabled: !!workshopId,
  });

  // Fetch files linked to income records
  const { data: incomeFiles } = useQuery({
    queryKey: ['income-files', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshop_files')
        .select('id, file_name, file_path, file_type, income_id')
        .eq('workshop_id', workshopId)
        .not('income_id', 'is', null);
      
      if (error) throw error;
      return data as WorkshopFile[];
    },
    enabled: !!workshopId,
  });

  const getFilesForIncome = (incomeId: string) => {
    return incomeFiles?.filter(f => f.income_id === incomeId) || [];
  };

  const handlePreview = async (file: WorkshopFile) => {
    const { data } = await supabase.storage
      .from('workshop-files')
      .createSignedUrl(file.file_path, 3600);
    
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewType(file.file_type);
    }
  };

  const handleDownload = async (file: WorkshopFile) => {
    const { data } = await supabase.storage
      .from('workshop-files')
      .createSignedUrl(file.file_path, 3600);
    
    if (data?.signedUrl) {
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = file.file_name;
      link.click();
    }
  };

  const updateIncome = useMutation({
    mutationFn: async () => {
      if (!editingIncome) return;
      
      const numAmount = parseFloat(editAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error(t('validation.amountPositive'));
      }

      const { error } = await supabase
        .from('income')
        .update({
          amount: numAmount,
          income_date: editDate,
          description: editDescription.trim() || null,
        })
        .eq('id', editingIncome.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      setEditingIncome(null);
      toast({ title: t('income.incomeUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteIncome = useMutation({
    mutationFn: async (incomeId: string) => {
      // First, get the associated files
      const files = getFilesForIncome(incomeId);
      
      // Delete files from storage
      for (const file of files) {
        await supabase.storage
          .from('workshop-files')
          .remove([file.file_path]);
      }
      
      // Delete file records from database (this will cascade due to ON DELETE CASCADE)
      // But we still delete from storage first
      
      // Delete the income record (cascade will handle workshop_files)
      const { error } = await supabase
        .from('income')
        .delete()
        .eq('id', incomeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['income-files', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-files-all', workshopId] });
      toast({
        title: t('income.incomeDeleted'),
        description: t('income.incomeDeletedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const openEditDialog = (income: Income) => {
    setEditingIncome(income);
    setEditAmount(String(income.amount));
    setEditDate(income.income_date);
    setEditDescription(income.description || '');
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!incomeRecords || incomeRecords.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-card border-success/20">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2 text-success">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
            {t('income.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2">
            {incomeRecords.map((income) => {
              const files = getFilesForIncome(income.id);
              return (
                <div key={income.id} className="flex items-center justify-between p-3 rounded-lg border bg-success/5 border-success/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground truncate">
                        {income.description || t('income.noDescription')}
                      </p>
                      {files.length > 0 && (
                        <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(income.income_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <span className="font-mono font-bold text-sm text-success">
                      +{Number(income.amount).toLocaleString('fr-FR')}
                    </span>
                    {files.length > 0 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreview(files[0])}
                          className="h-7 w-7"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(files[0])}
                          className="h-7 w-7"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {role === 'admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(income)}
                          className="h-7 w-7"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteIncome.mutate(income.id)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-success/5">
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead className="text-right">{t('common.amount')}</TableHead>
                  <TableHead className="text-center">{t('income.bankCheck')}</TableHead>
                  {role === 'admin' && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeRecords.map((income) => {
                  const files = getFilesForIncome(income.id);
                  return (
                    <TableRow key={income.id} className="animate-fade-in">
                      <TableCell className="font-mono text-sm">
                        {format(new Date(income.income_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {income.description || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-success">
                        +{Number(income.amount).toLocaleString('fr-FR')} CFA
                      </TableCell>
                      <TableCell className="text-center">
                        {files.length > 0 ? (
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(files[0])}
                              className="h-8 w-8"
                              title={t('common.preview')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(files[0])}
                              className="h-8 w-8"
                              title={t('common.download')}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      {role === 'admin' && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(income)}
                              className="h-8 w-8"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteIncome.mutate(income.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingIncome} onOpenChange={(open) => !open && setEditingIncome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('income.editIncome')}</DialogTitle>
            <DialogDescription>
              {t('income.updateDetails')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_income_amount">{t('common.amount')} *</Label>
              <Input
                id="edit_income_amount"
                type="number"
                step="1"
                min="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_income_date">{t('common.date')} *</Label>
              <Input
                id="edit_income_date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_income_description">{t('common.description')}</Label>
              <Textarea
                id="edit_income_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIncome(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => updateIncome.mutate()}
              disabled={updateIncome.isPending}
              className="gradient-primary text-primary-foreground"
            >
              {updateIncome.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t('income.bankCheck')}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center items-center overflow-auto">
            {previewType.startsWith('image/') ? (
              <img src={previewUrl!} alt="Check" className="max-w-full max-h-[70vh] object-contain" />
            ) : (
              <iframe src={previewUrl!} className="w-full h-[70vh]" title="PDF Preview" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}