import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Camera, Upload, X, Image } from 'lucide-react';
import { z } from 'zod';

const incomeSchema = z.object({
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0'),
  income_date: z.string()
    .min(1, 'Date is required')
    .refine((date) => {
      const d = new Date(date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return d <= today;
    }, 'Date cannot be in the future'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
});

interface IncomeFormProps {
  workshopId: string;
  workshopName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function IncomeForm({ workshopId, workshopName, open, onOpenChange }: IncomeFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    amount: 0,
    income_date: new Date().toISOString().split('T')[0],
    description: '',
  });

  useEffect(() => {
    if (open) {
      setFormData({
        amount: 0,
        income_date: new Date().toISOString().split('T')[0],
        description: '',
      });
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast({
          title: t('errors.error'),
          description: t('payments.invalidFileType'),
          variant: 'destructive',
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t('errors.error'),
          description: t('payments.fileTooLarge'),
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
      
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const uploadFile = async (incomeId: string): Promise<void> => {
    if (!selectedFile || !user?.id) return;
    
    const fileExt = selectedFile.name.split('.').pop();
    const safeName = (workshopName || workshopId).replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').trim();
    const fileName = `${safeName}/checks/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('workshop-files')
      .upload(fileName, selectedFile);
    
    if (uploadError) throw uploadError;
    
    const { error: dbError } = await supabase
      .from('workshop_files')
      .insert({
        workshop_id: workshopId,
        file_name: selectedFile.name,
        file_path: fileName,
        file_type: selectedFile.type,
        uploaded_by: user.id,
        income_id: incomeId,
      });
    
    if (dbError) throw dbError;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      setIsUploading(true);
      
      const { data: insertedData, error } = await supabase
        .from('income')
        .insert([{
          workshop_id: workshopId,
          amount: data.amount,
          income_date: data.income_date,
          description: data.description || null,
          created_by: user?.id,
        }])
        .select()
        .single();
      if (error) throw error;
      
      // Upload file if selected and link to income
      if (selectedFile && insertedData) {
        await uploadFile(insertedData.id);
      }
    },
    onSuccess: () => {
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['income', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['income-files', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-files-all', workshopId] });
      onOpenChange(false);
      toast({
        title: t('income.incomeAdded'),
        description: t('income.incomeAddedDesc'),
      });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = incomeSchema.safeParse(formData);
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast({
        title: t('validation.validationError'),
        description: firstError.message,
        variant: 'destructive',
      });
      return;
    }
    
    saveMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('income.addIncome')}</DialogTitle>
          <DialogDescription>
            {t('income.recordIncome')}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="income_amount">{t('common.amount')} *</Label>
              <Input
                id="income_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="income_date">{t('common.date')} *</Label>
              <Input
                id="income_date"
                type="date"
                value={formData.income_date}
                onChange={(e) => setFormData(prev => ({ ...prev, income_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="income_description">{t('common.description')} ({t('common.optional')})</Label>
            <Textarea
              id="income_description"
              placeholder={t('payments.whatWasPaymentFor')}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* Bank Check Upload Section */}
          <div className="space-y-3">
            <Label>{t('income.bankCheck')}</Label>
            
            {selectedFile && (
              <div className="relative">
                {previewUrl ? (
                  <div className="relative rounded-md overflow-hidden border">
                    <img src={previewUrl} alt="Preview" className="w-full h-32 object-cover" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={removeSelectedFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={removeSelectedFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!selectedFile && (
              <div className="flex gap-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {t('payments.capturePhoto')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('payments.uploadFile')}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('income.bankCheckHint')}
            </p>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={saveMutation.isPending || isUploading}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {(saveMutation.isPending || isUploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('income.addIncome')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
