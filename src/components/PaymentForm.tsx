import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, ChevronsUpDown, Camera, Upload, X, Image, Users2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from 'zod';
import { mirrorWorkshopFileToDrive } from '@/lib/mirror-workshop-file';

const paymentSchema = z.object({
  paid_to: z.string().trim().min(1, 'Paid to is required').max(200, 'Paid to must be less than 200 characters'),
  reason: z.string().trim().min(1, 'Reason is required').max(1000, 'Reason must be less than 1000 characters'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Date is required').refine((date) => {
    const d = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return d <= today;
  }, 'Date cannot be in the future'),
});

interface Payment {
  id?: string;
  paid_to: string;
  reason: string;
  amount: number;
  payment_date: string;
  status?: string;
  created_by?: string;
}

interface ExistingFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
}

interface PaymentFormProps {
  workshopId: string;
  workshopName?: string;
  payment?: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentForm({ workshopId, workshopName, payment, open, onOpenChange }: PaymentFormProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paidToOpen, setPaidToOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState<string>('none');
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>(workshopId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Payment>({
    paid_to: '',
    reason: '',
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
  });

  const { data: previousPayees = [] } = useQuery({
    queryKey: ['previous-payees'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_payees');
      if (error) throw error;
      return data?.map((p: { paid_to: string }) => p.paid_to) || [];
    },
  });

  // Fetch all users (profiles) for admin creator reassignment
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: role === 'admin',
  });

  // Fetch contractors for linking
  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const [selectedContractId, setSelectedContractId] = useState<string>('none');

  // Fetch active contracts for selected contractor
  const { data: contractorContracts = [] } = useQuery({
    queryKey: ['contractor-contracts', selectedContractorId !== 'none' ? selectedContractorId : null, selectedContractorId],
    queryFn: async () => {
      if (!selectedContractorId || selectedContractorId === 'none') return [];
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('contractor_id', selectedContractorId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedContractorId && selectedContractorId !== 'none',
  });

  // Fetch existing contract link for editing
  const { data: existingContractLink } = useQuery({
    queryKey: ['payment-contract-link', payment?.id],
    queryFn: async () => {
      if (!payment?.id) return null;
      const { data, error } = await supabase
        .from('contractor_payments')
        .select('id, contract_id')
        .eq('payment_id', payment.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!payment?.id && open,
  });

  // Fetch workshops for contract display
  const { data: workshopsList = [] } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workshops').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const fetchExistingFiles = async () => {
      if (payment?.id) {
        const { data, error } = await supabase
          .from('workshop_files')
          .select('id, file_name, file_path, file_type')
          .eq('payment_id', payment.id);
        
        if (!error && data) {
          setExistingFiles(data);
        }
      } else {
        setExistingFiles([]);
      }
    };
    
    if (open) {
      fetchExistingFiles();
    }
  }, [payment?.id, open]);

  // Fetch existing contractor link for editing
  const { data: existingContractorLink } = useQuery({
    queryKey: ['payment-contractor-link', payment?.id],
    queryFn: async () => {
      if (!payment?.id) return null;
      const { data, error } = await supabase
        .from('contractor_payments')
        .select('id, contractor_id')
        .eq('payment_id', payment.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!payment?.id && open,
  });

  useEffect(() => {
    if (payment) {
      setFormData({
        paid_to: payment.paid_to,
        reason: payment.reason,
        amount: payment.amount,
        payment_date: payment.payment_date,
      });
      setSelectedCreatorId(payment.created_by || null);
      setSelectedWorkshopId(workshopId);
      // Pre-select contractor if linked
      setSelectedContractorId(existingContractorLink?.contractor_id || 'none');
      setSelectedContractId(existingContractLink?.contract_id || 'none');
    } else {
      setFormData({
        paid_to: '',
        reason: '',
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
      });
      setSelectedCreatorId(null);
      setSelectedWorkshopId(workshopId);
      setSelectedContractorId('none');
      setSelectedContractId('none');
    }
    setSelectedFile(null);
    setPreviewUrl(null);
  }, [payment, open, existingContractorLink, existingContractLink, workshopId]);

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

  const removeExistingFile = async (fileId: string, filePath: string) => {
    try {
      await supabase.storage.from('workshop-files').remove([filePath]);
      await supabase.from('workshop_files').delete().eq('id', fileId);
      setExistingFiles(prev => prev.filter(f => f.id !== fileId));
      toast({
        title: t('common.success'),
        description: t('payments.fileRemoved'),
      });
    } catch {
      toast({
        title: t('errors.error'),
        description: t('payments.fileRemoveFailed'),
        variant: 'destructive',
      });
    }
  };

  const uploadFile = async (paymentId: string): Promise<void> => {
    if (!selectedFile || !user?.id) return;
    
    const fileExt = selectedFile.name.split('.').pop();
    const safeName = (workshopName || workshopId).replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').trim();
    const fileName = `${safeName}/receipts/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('workshop-files')
      .upload(fileName, selectedFile);
    
    if (uploadError) throw uploadError;
    
    const { error: dbError } = await supabase
      .from('workshop_files')
      .insert({
        workshop_id: workshopId,
        payment_id: paymentId,
        file_name: selectedFile.name,
        file_path: fileName,
        file_type: selectedFile.type,
        uploaded_by: user.id,
      });
    
    if (dbError) throw dbError;

    mirrorWorkshopFileToDrive({
      workshopId,
      workshopName,
      storagePath: fileName,
      fileName: selectedFile.name,
      fileType: selectedFile.type,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Payment) => {
      setIsUploading(true);
      
      if (payment?.id) {
        const originalCreatorId = payment.created_by;
        const newCreatorId = selectedCreatorId && role === 'admin' ? selectedCreatorId : originalCreatorId;
        const workshopChanged = role === 'admin' && selectedWorkshopId && selectedWorkshopId !== workshopId;

        const { error } = await supabase
          .from('payments')
          .update({
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
            ...(role === 'admin' && newCreatorId ? { created_by: newCreatorId } : {}),
            ...(workshopChanged ? { workshop_id: selectedWorkshopId } : {}),
            ...(role !== 'admin' && { status: 'pending' }),
          })
          .eq('id', payment.id);
        if (error) throw error;

        // If admin moved the payment to a different workshop, sync linked records
        if (workshopChanged) {
          await supabase
            .from('user_transfers')
            .update({ workshop_id: selectedWorkshopId })
            .eq('payment_id', payment.id);
          await supabase
            .from('contractor_payments')
            .update({ workshop_id: selectedWorkshopId })
            .eq('payment_id', payment.id);
          await supabase
            .from('workshop_files')
            .update({ workshop_id: selectedWorkshopId })
            .eq('payment_id', payment.id);
        }

        // If admin changed the creator, update linked user_transfers
        if (role === 'admin' && newCreatorId && originalCreatorId && newCreatorId !== originalCreatorId) {
          await supabase
            .from('user_transfers')
            .update({ user_id: newCreatorId })
            .eq('payment_id', payment.id);
        }

        // Handle contractor link changes
        const hadLink = !!existingContractorLink;
        const wantsLink = selectedContractorId && selectedContractorId !== 'none';
        const contractIdToUse = selectedContractId && selectedContractId !== 'none' ? selectedContractId : null;
        
        if (hadLink && !wantsLink) {
          // Remove existing link
          await supabase.from('contractor_payments').delete().eq('id', existingContractorLink.id);
        } else if (hadLink && wantsLink && existingContractorLink.contractor_id !== selectedContractorId) {
          // Update existing link to new contractor
          await supabase.from('contractor_payments')
            .update({ contractor_id: selectedContractorId, contract_id: contractIdToUse, amount: data.amount, description: data.reason, payment_date: data.payment_date })
            .eq('id', existingContractorLink.id);
        } else if (hadLink && wantsLink) {
          // Same contractor, update amount/description/contract
          await supabase.from('contractor_payments')
            .update({ contract_id: contractIdToUse, amount: data.amount, description: data.reason, payment_date: data.payment_date })
            .eq('id', existingContractorLink.id);
        } else if (!hadLink && wantsLink) {
          // Create new link
          const creatorId = (role === 'admin' && newCreatorId) ? newCreatorId : user?.id;
          await supabase.from('contractor_payments').insert({
            contractor_id: selectedContractorId,
            contract_id: contractIdToUse,
            workshop_id: workshopId,
            amount: data.amount,
            payment_type: 'advance',
            description: data.reason,
            payment_date: data.payment_date,
            payment_id: payment.id,
            created_by: creatorId,
          });
        }
        
        if (selectedFile) {
          await uploadFile(payment.id);
        }
      } else {
        const creatorId = (role === 'admin' && selectedCreatorId) ? selectedCreatorId : user?.id;
        const { data: newPayment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: workshopId,
            paid_to: data.paid_to,
            reason: data.reason,
            amount: data.amount,
            payment_date: data.payment_date,
            created_by: creatorId,
            status: role === 'admin' ? 'approved' : 'pending',
          }])
          .select('id')
          .single();
          
        if (paymentError) throw paymentError;
        
        if (selectedFile && newPayment?.id) {
          await uploadFile(newPayment.id);
        }

        // If linked to a contractor, create contractor_payments record
        if (selectedContractorId && selectedContractorId !== 'none' && newPayment?.id) {
          const contractIdToUse = selectedContractId && selectedContractId !== 'none' ? selectedContractId : null;
          const { error: cpError } = await supabase.from('contractor_payments').insert({
            contractor_id: selectedContractorId,
            contract_id: contractIdToUse,
            workshop_id: workshopId,
            amount: data.amount,
            payment_type: 'advance',
            description: data.reason,
            payment_date: data.payment_date,
            payment_id: newPayment.id,
            created_by: creatorId,
          });
          if (cpError) throw cpError;
        }
      }
    },
    onSuccess: () => {
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      if (selectedWorkshopId && selectedWorkshopId !== workshopId) {
        queryClient.invalidateQueries({ queryKey: ['payments', selectedWorkshopId] });
        queryClient.invalidateQueries({ queryKey: ['workshop-stats', selectedWorkshopId] });
      }
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-files', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['user-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['global-wealth-stats'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['payment-contractor-link'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payment-contract-link'] });
      onOpenChange(false);
      toast({
        title: payment?.id ? t('payments.paymentUpdated') : t('payments.paymentAdded'),
        description: role === 'admin' ? t('payments.paymentSaved') : t('payments.pendingApproval'),
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
    
    const result = paymentSchema.safeParse(formData);
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
          <DialogTitle>{payment?.id ? t('payments.editPayment') : t('payments.addNewPayment')}</DialogTitle>
          <DialogDescription>
            {role === 'admin' ? t('payments.addPaymentRecord') : t('payments.submitForApproval')}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('payments.paidTo')} *</Label>
            <Popover open={paidToOpen} onOpenChange={setPaidToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={paidToOpen}
                  className="w-full justify-between font-normal"
                >
                  {formData.paid_to || t('payments.selectOrTypeName')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={true}>
                  <CommandInput 
                    placeholder={t('common.search')}
                    value={formData.paid_to}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, paid_to: value }))}
                  />
                  <CommandList 
                    className="max-h-[200px] overflow-y-auto overscroll-contain touch-pan-y"
                  >
                    <CommandEmpty>
                      <div className="py-2 px-2 text-sm">
                        {t('payments.pressEnterToUse')} "<span className="font-medium">{formData.paid_to}</span>"
                      </div>
                    </CommandEmpty>
                    <CommandGroup heading={t('payments.previousRecipients')}>
                      {previousPayees.map((payee) => (
                        <CommandItem
                          key={payee}
                          value={payee}
                          onSelect={(value) => {
                            setFormData(prev => ({ ...prev, paid_to: value }));
                            setPaidToOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.paid_to === payee ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {payee}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Creator selector - admin only */}
          {role === 'admin' && (
            <div className="space-y-2">
              <Label>{t('payments.changeCreator')}</Label>
              <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={creatorOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedCreatorId
                      ? allProfiles.find(p => p.user_id === selectedCreatorId)?.full_name || t('payments.selectUser')
                      : t('payments.selectUser')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput placeholder={t('common.search')} />
                    <CommandList className="max-h-[200px] overflow-y-auto overscroll-contain touch-pan-y">
                      <CommandEmpty>{t('common.none')}</CommandEmpty>
                      <CommandGroup>
                        {allProfiles.map((profile) => (
                          <CommandItem
                            key={profile.user_id}
                            value={profile.full_name || profile.user_id}
                            onSelect={() => {
                              setSelectedCreatorId(profile.user_id);
                              setCreatorOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCreatorId === profile.user_id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {profile.full_name || profile.user_id}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Workshop selector - admin only, when editing */}
          {role === 'admin' && payment?.id && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {t('payments.changeWorkshop')}
              </Label>
              <Select value={selectedWorkshopId} onValueChange={setSelectedWorkshopId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('payments.selectWorkshop')} />
                </SelectTrigger>
                <SelectContent>
                  {workshopsList.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contractor selector - admin only */}
          {role === 'admin' && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users2 className="w-3.5 h-3.5" />
                  {t('payments.linkToContractor')}
                </Label>
                <Select value={selectedContractorId} onValueChange={(val) => {
                  setSelectedContractorId(val);
                  setSelectedContractId('none');
                  if (val !== 'none') {
                    const contractor = contractors.find(c => c.id === val);
                    if (contractor) {
                      setFormData(prev => ({ ...prev, paid_to: contractor.name }));
                    }
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('payments.selectContractorOptional')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('payments.noContractor')}</SelectItem>
                    {contractors.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} - {c.specialty}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedContractorId && selectedContractorId !== 'none' && contractorContracts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">{t('contractors.selectContract')} ({t('common.optional')})</Label>
                  <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('contractors.selectContract')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none')}</SelectItem>
                      {contractorContracts.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {workshopsList.find(w => w.id === c.workshop_id)?.name || '?'} {c.total_amount ? `(${Number(c.total_amount).toLocaleString('fr-FR')} CFA)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="reason">{t('common.reason')} *</Label>
            <Textarea
              id="reason"
              placeholder={t('payments.whatWasPaymentFor')}
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('common.amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment_date">{t('common.date')} *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Invoice/Receipt Upload Section */}
          <div className="space-y-3">
            <Label>{t('payments.invoiceReceipt')}</Label>
            
            {existingFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('payments.attachedFiles')}</p>
                {existingFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{file.file_name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeExistingFile(file.id, file.file_path)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

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
            <p className="text-xs text-muted-foreground">{t('payments.fileHint')}</p>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={saveMutation.isPending || isUploading}
              className="gradient-primary text-primary-foreground"
            >
              {(saveMutation.isPending || isUploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {payment?.id ? t('payments.saveChanges') : t('payments.addPayment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
