import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Trash2, Upload, Camera, Search, ChevronDown, ChevronUp, Edit2, DollarSign, Link } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const PAYMENT_TYPES = ['advance', 'product', 'material_budget'];

export default function ContractorPayments() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [contractId, setContractId] = useState('');
  const [workshopId, setWorkshopId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('advance');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterContractor, setFilterContractor] = useState('all');
  const [filterWorkshop, setFilterWorkshop] = useState('all');
  const [filterPaymentType, setFilterPaymentType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPaymentType, setEditingPaymentType] = useState<any>(null);
  const [editPaymentTypeValue, setEditPaymentTypeValue] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Budget-related states
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);
  const [showPurchaseForm, setShowPurchaseForm] = useState<string | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [purchaseReceipt, setPurchaseReceipt] = useState<File | null>(null);
  const purchaseFileRef = useRef<HTMLInputElement>(null);
  const purchaseCameraRef = useRef<HTMLInputElement>(null);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [editBudgetAmount, setEditBudgetAmount] = useState('');
  const [markAdvancePayment, setMarkAdvancePayment] = useState<any>(null);
  const [purchaseWorkshopId, setPurchaseWorkshopId] = useState('');
  const [advanceWorkshopId, setAdvanceWorkshopId] = useState('');
  const [purchaseMode, setPurchaseMode] = useState<'new' | 'existing'>('new');
  const [selectedExistingPaymentId, setSelectedExistingPaymentId] = useState('');
  const [existingPaymentSearch, setExistingPaymentSearch] = useState('');

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: workshops = [] } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workshops').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', contractorId],
    queryFn: async () => {
      if (!contractorId) return [];
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('contractor_id', contractorId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contractorId,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['contractor-payments', filterContractor, filterWorkshop],
    queryFn: async () => {
      let query = supabase
        .from('contractor_payments')
        .select('*')
        .order('payment_date', { ascending: false });
      if (filterContractor !== 'all') {
        query = query.eq('contractor_id', filterContractor);
      }
      if (filterWorkshop !== 'all') {
        // Don't filter material_budgets by workshop (they have null workshop_id)
        // We'll filter them client-side based on their purchases
        query = query.or(`workshop_id.eq.${filterWorkshop},payment_type.eq.material_budget`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch approved payments for linking to budget purchases
  const { data: approvedPayments = [] } = useQuery({
    queryKey: ['approved-payments-for-budget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'approved')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch budget purchases for expanded budgets
  const { data: budgetPurchases = [] } = useQuery({
    queryKey: ['budget-purchases', expandedBudget],
    queryFn: async () => {
      if (!expandedBudget) return [];
      const { data, error } = await supabase
        .from('contractor_budget_purchases')
        .select('*')
        .eq('contractor_payment_id', expandedBudget)
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedBudget,
  });

  // Fetch all budget purchase sums for display
  const budgetPaymentIds = payments.filter(p => p.payment_type === 'material_budget').map(p => p.id);
  const { data: budgetSumsData = { allBudgetSums: {}, advanceBudgetSums: {}, budgetWorkshops: {}, advanceBudgetWorkshops: {} } } = useQuery({
    queryKey: ['budget-sums', budgetPaymentIds.join(',')],
    queryFn: async () => {
      if (budgetPaymentIds.length === 0) return { allBudgetSums: {}, advanceBudgetSums: {}, budgetWorkshops: {}, advanceBudgetWorkshops: {} };
      const { data, error } = await supabase
        .from('contractor_budget_purchases')
        .select('contractor_payment_id, amount, description')
        .in('contractor_payment_id', budgetPaymentIds);
      if (error) throw error;

      const workshopMap: Record<string, Set<string>> = {};
      const advanceWorkshopMap: Record<string, Set<string>> = {};
      const allMap: Record<string, number> = {};
      const advanceMap: Record<string, number> = {};
      data?.forEach(p => {
        allMap[p.contractor_payment_id] = (allMap[p.contractor_payment_id] || 0) + Number(p.amount);
        const isAdvancePurchase = (p.description || '').includes(t('contractors.budgetRemaining'));
        if (isAdvancePurchase) {
          advanceMap[p.contractor_payment_id] = (advanceMap[p.contractor_payment_id] || 0) + Number(p.amount);
        }
        // Extract workshop name from description pattern [WorkshopName]
        const wsMatch = (p.description || '').match(/^\[(.+?)\]/);
        if (wsMatch) {
          const wsName = wsMatch[1];
          const ws = workshops.find(w => w.name === wsName);
          if (ws) {
            if (!workshopMap[p.contractor_payment_id]) workshopMap[p.contractor_payment_id] = new Set();
            workshopMap[p.contractor_payment_id].add(ws.id);
            if (isAdvancePurchase) {
              if (!advanceWorkshopMap[p.contractor_payment_id]) advanceWorkshopMap[p.contractor_payment_id] = new Set();
              advanceWorkshopMap[p.contractor_payment_id].add(ws.id);
            }
          }
        }
      });
      return { 
        allBudgetSums: allMap, 
        advanceBudgetSums: advanceMap, 
        budgetWorkshops: Object.fromEntries(Object.entries(workshopMap).map(([k, v]) => [k, [...v]])),
        advanceBudgetWorkshops: Object.fromEntries(Object.entries(advanceWorkshopMap).map(([k, v]) => [k, [...v]])),
      };
    },
    enabled: budgetPaymentIds.length > 0,
  });
  const allBudgetSums = budgetSumsData.allBudgetSums;
  const advanceBudgetSums = budgetSumsData.advanceBudgetSums;
  const budgetWorkshops: Record<string, string[]> = budgetSumsData.budgetWorkshops;
  const advanceBudgetWorkshops: Record<string, string[]> = budgetSumsData.advanceBudgetWorkshops;

  const uploadReceipt = async (paymentId: string, workshopForPayment: string, workshopName: string, file: File) => {
    const fileExt = file.name.split('.').pop();
    const safeName = (workshopName || workshopForPayment).replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').trim();
    const fileName = `${safeName}/receipts/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('workshop-files')
      .upload(fileName, file);
    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase.from('workshop_files').insert({
      workshop_id: workshopForPayment,
      file_type: file.type,
      file_name: file.name,
      file_path: fileName,
      uploaded_by: user!.id,
      payment_id: paymentId,
    });
    if (dbError) throw dbError;

    return fileName;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const workshopForPayment = workshopId || (contracts.find(c => c.id === contractId)?.workshop_id);
      if (!workshopForPayment) throw new Error('No workshop');

      const contractorName = contractors.find(c => c.id === contractorId)?.name || '';
      const typeLabelMap: Record<string, string> = { advance: 'Advance', product: 'Product/Material', material_budget: 'Material Budget' };
      const typeLabel = typeLabelMap[paymentType] || paymentType;
      const reason = `[Contractor] ${contractorName} - ${typeLabel}${description ? ': ' + description : ''}`;

      if (paymentType === 'material_budget') {
        // Material budget does NOT go to main payments dashboard, no workshop needed
        const { error } = await supabase.from('contractor_payments').insert({
          contractor_id: contractorId,
          contract_id: contractId || null,
          workshop_id: null,
          amount: Number(amount),
          payment_type: 'material_budget',
          description: description || null,
          payment_date: paymentDate,
          payment_id: null,
          created_by: user!.id,
        });
        if (error) throw error;
      } else {
        // advance and product go to main payments dashboard
        const { data: paymentRecord, error: paymentError } = await supabase
          .from('payments')
          .insert({
            workshop_id: workshopForPayment,
            amount: Number(amount),
            payment_date: paymentDate,
            paid_to: contractorName,
            reason,
            created_by: user!.id,
            status: 'approved',
          })
          .select()
          .single();
        if (paymentError) throw paymentError;

        if (paymentType === 'product' && receiptFile) {
          const workshopName = workshops.find(w => w.id === workshopForPayment)?.name || '';
          await uploadReceipt(paymentRecord.id, workshopForPayment, workshopName, receiptFile);
        }

        const { error } = await supabase.from('contractor_payments').insert({
          contractor_id: contractorId,
          contract_id: contractId || null,
          workshop_id: workshopForPayment,
          amount: Number(amount),
          payment_type: paymentType,
          description: description || null,
          payment_date: paymentDate,
          payment_id: paymentRecord.id,
          created_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      toast({ title: t('contractors.paymentAdded') });
      resetForm();
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const addPurchaseMutation = useMutation({
    mutationFn: async (budgetPayment: any) => {
      if (purchaseMode === 'existing') {
        // Link an existing payment as a purchase
        if (!selectedExistingPaymentId) throw new Error('No payment selected');
        const existingPayment = approvedPayments.find(p => p.id === selectedExistingPaymentId);
        if (!existingPayment) throw new Error('Payment not found');

        const workshopName = getWorkshopName(existingPayment.workshop_id);

        // Check for receipt files attached to this payment
        const { data: receiptFiles } = await supabase
          .from('workshop_files')
          .select('file_path, file_name')
          .eq('payment_id', existingPayment.id)
          .limit(1);
        const receiptPath = receiptFiles?.[0]?.file_path || null;
        const receiptName = receiptFiles?.[0]?.file_name || null;

        const { error } = await supabase.from('contractor_budget_purchases').insert({
          contractor_payment_id: budgetPayment.id,
          amount: Number(existingPayment.amount),
          purchase_date: existingPayment.payment_date,
          description: `[${workshopName}] ${existingPayment.paid_to} - ${existingPayment.reason}`,
          receipt_file_path: receiptPath,
          receipt_file_name: receiptName,
          created_by: user!.id,
        });
        if (error) throw error;

        // Remove standalone contractor_payments record if it exists, replace with budget_purchase link
        await supabase
          .from('contractor_payments')
          .delete()
          .eq('payment_id', existingPayment.id);

        // Create a budget_purchase link so the payment stays linked to the contractor
        await supabase.from('contractor_payments').insert({
          contractor_id: budgetPayment.contractor_id,
          contract_id: budgetPayment.contract_id || null,
          workshop_id: existingPayment.workshop_id,
          amount: Number(existingPayment.amount),
          payment_type: 'budget_purchase',
          description: `[${workshopName}] ${existingPayment.paid_to} - ${existingPayment.reason}`,
          payment_date: existingPayment.payment_date,
          payment_id: existingPayment.id,
          created_by: user!.id,
        });

        return;
      }

      // New purchase flow
      if (!purchaseWorkshopId) throw new Error('No workshop selected');
      const workshopName = workshops.find(w => w.id === purchaseWorkshopId)?.name || '';
      const contractorName = contractors.find(c => c.id === budgetPayment.contractor_id)?.name || '';
      let receiptPath: string | null = null;
      let receiptName: string | null = null;

      const reason = `[Contractor] ${contractorName} - Product/Material${purchaseDescription ? ': ' + purchaseDescription : ''}`;
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          workshop_id: purchaseWorkshopId,
          amount: Number(purchaseAmount),
          payment_date: purchaseDate,
          paid_to: contractorName,
          reason,
          created_by: user!.id,
          status: 'approved',
        })
        .select()
        .single();
      if (paymentError) throw paymentError;

      if (purchaseReceipt) {
        const fileExt = purchaseReceipt.name.split('.').pop();
        const safeName = workshopName.replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').trim();
        const fileName = `${safeName}/receipts/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('workshop-files').upload(fileName, purchaseReceipt);
        if (uploadError) throw uploadError;
        receiptPath = fileName;
        receiptName = purchaseReceipt.name;

        await supabase.from('workshop_files').insert({
          workshop_id: purchaseWorkshopId,
          file_type: purchaseReceipt.type,
          file_name: purchaseReceipt.name,
          file_path: fileName,
          uploaded_by: user!.id,
          payment_id: paymentRecord.id,
        });
      }

      const purchaseDesc = purchaseDescription 
        ? `[${workshopName}] ${purchaseDescription}` 
        : `[${workshopName}]`;

      const { error } = await supabase.from('contractor_budget_purchases').insert({
        contractor_payment_id: budgetPayment.id,
        amount: Number(purchaseAmount),
        purchase_date: purchaseDate,
        description: purchaseDesc,
        receipt_file_path: receiptPath,
        receipt_file_name: receiptName,
        created_by: user!.id,
      });
      if (error) throw error;

      // Link the payment to the contractor (so it shows linked in main dashboard)
      await supabase.from('contractor_payments').insert({
        contractor_id: budgetPayment.contractor_id,
        contract_id: budgetPayment.contract_id || null,
        workshop_id: purchaseWorkshopId,
        amount: Number(purchaseAmount),
        payment_type: 'budget_purchase',
        description: purchaseDesc,
        payment_date: purchaseDate,
        payment_id: paymentRecord.id,
        created_by: user!.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['approved-payments-for-budget'] });
      toast({ title: t('contractors.purchaseAdded') });
      resetPurchaseForm();
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const deletePurchaseMutation = useMutation({
    mutationFn: async (purchase: any) => {
      if (purchase.receipt_file_path) {
        await supabase.storage.from('workshop-files').remove([purchase.receipt_file_path]);
      }
      const { error } = await supabase.from('contractor_budget_purchases').delete().eq('id', purchase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      toast({ title: t('contractors.purchaseDeleted') });
    },
  });

  const editBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!editingBudget) return;
      const { error } = await supabase.from('contractor_payments')
        .update({ amount: Number(editBudgetAmount) })
        .eq('id', editingBudget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      toast({ title: t('contractors.budgetUpdated') });
      setEditingBudget(null);
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const editPaymentTypeMutation = useMutation({
    mutationFn: async () => {
      if (!editingPaymentType) return;
      const { error } = await supabase.from('contractor_payments')
        .update({ payment_type: editPaymentTypeValue })
        .eq('id', editingPaymentType.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      toast({ title: t('contractors.paymentTypeUpdated') });
      setEditingPaymentType(null);
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const markRemainingAsAdvanceMutation = useMutation({
    mutationFn: async (budgetPayment: any) => {
      const spent = allBudgetSums[budgetPayment.id] || 0;
      const remaining = Number(budgetPayment.amount) - spent;
      if (remaining <= 0) return;

      const contractorName = contractors.find(c => c.id === budgetPayment.contractor_id)?.name || '';
      const reason = `[Contractor] ${contractorName} - Advance (Budget remaining)`;

      if (!advanceWorkshopId) throw new Error('No workshop selected');
      
      // Create main dashboard payment for the advance
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          workshop_id: advanceWorkshopId,
          amount: remaining,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          paid_to: contractorName,
          reason,
          created_by: user!.id,
          status: 'approved',
        })
        .select()
        .single();
      if (paymentError) throw paymentError;

      // Add as a purchase within the budget (NOT a separate contractor_payment)
      const workshopName = workshops.find(w => w.id === advanceWorkshopId)?.name || '';
      const { error } = await supabase.from('contractor_budget_purchases').insert({
        contractor_payment_id: budgetPayment.id,
        amount: remaining,
        purchase_date: format(new Date(), 'yyyy-MM-dd'),
        description: `[${workshopName}] ${t('contractors.budgetRemaining')}: ${remaining.toLocaleString('fr-FR')} CFA`,
        created_by: user!.id,
      });
      if (error) throw error;

      // Link the payment to the contractor (so it shows linked in main dashboard)
      await supabase.from('contractor_payments').insert({
        contractor_id: budgetPayment.contractor_id,
        contract_id: budgetPayment.contract_id || null,
        workshop_id: advanceWorkshopId,
        amount: remaining,
        payment_type: 'budget_purchase',
        description: `[${workshopName}] ${t('contractors.budgetRemaining')}`,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_id: paymentRecord.id,
        created_by: user!.id,
      });
      
      // Do NOT change the material budget amount - the advance is part of it
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: t('contractors.advanceCreated') });
      setMarkAdvancePayment(null);
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payment: any) => {
      if (payment.payment_id) {
        const { data: files } = await supabase
          .from('workshop_files')
          .select('*')
          .eq('payment_id', payment.payment_id);
        if (files && files.length > 0) {
          await supabase.storage.from('workshop-files').remove(files.map(f => f.file_path));
          await supabase.from('workshop_files').delete().eq('payment_id', payment.payment_id);
        }
        await supabase.from('payments').delete().eq('id', payment.payment_id);
      }
      // For budgets, cascade deletes purchases
      const { error } = await supabase.from('contractor_payments').delete().eq('id', payment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      queryClient.invalidateQueries({ queryKey: ['budget-purchases'] });
      toast({ title: t('contractors.paymentDeleted') });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setContractorId('');
    setContractId('');
    setWorkshopId('');
    setAmount('');
    setPaymentType('advance');
    setDescription('');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReceiptFile(null);
  };

  const resetPurchaseForm = () => {
    setShowPurchaseForm(null);
    setPurchaseAmount('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setPurchaseDescription('');
    setPurchaseReceipt(null);
    setPurchaseWorkshopId('');
    setPurchaseMode('new');
    setSelectedExistingPaymentId('');
    setExistingPaymentSearch('');
  };

  const getContractorName = (id: string) => contractors.find(c => c.id === id)?.name || '?';
  const getWorkshopName = (id: string) => workshops.find(w => w.id === id)?.name || '?';

  const handleContractorChange = (id: string) => {
    setContractorId(id);
    setContractId('');
    setWorkshopId('');
  };

  const handleContractChange = (id: string) => {
    setContractId(id);
    const contract = contracts.find(c => c.id === id);
    if (contract) setWorkshopId(contract.workshop_id);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: (f: File | null) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast({ title: t('payments.invalidFileType'), variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t('payments.fileTooLarge'), variant: 'destructive' });
      return;
    }
    setter(file);
    e.target.value = '';
  };

  const toggleBudgetExpand = (id: string) => {
    setExpandedBudget(expandedBudget === id ? null : id);
    setShowPurchaseForm(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('contractors.searchPayments')}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 md:flex md:gap-2">
            <Select value={filterContractor} onValueChange={setFilterContractor}>
              <SelectTrigger className="h-8 md:h-9 text-[11px] md:text-sm md:w-[140px]">
                <SelectValue placeholder={t('contractors.filterByContractor')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {contractors.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterWorkshop} onValueChange={setFilterWorkshop}>
              <SelectTrigger className="h-8 md:h-9 text-[11px] md:text-sm md:w-[140px]">
                <SelectValue placeholder={t('contractors.filterByWorkshop')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {workshops.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPaymentType} onValueChange={setFilterPaymentType}>
              <SelectTrigger className="h-8 md:h-9 text-[11px] md:text-sm md:w-[140px]">
                <SelectValue placeholder={t('contractors.filterByPaymentType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {PAYMENT_TYPES.map(pt => (
                  <SelectItem key={pt} value={pt}>{t(`contractors.paymentTypes.${pt}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
          <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); else setShowForm(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                {t('contractors.addPayment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('contractors.addPayment')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t('contractors.contractor')}</Label>
                  <Select value={contractorId} onValueChange={handleContractorChange}>
                    <SelectTrigger><SelectValue placeholder={t('contractors.selectContractor')} /></SelectTrigger>
                    <SelectContent>
                      {contractors.filter(c => c.is_active).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} - {String(t(`contractors.specialties.${c.specialty}`, { defaultValue: c.specialty }))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {contractorId && contracts.length > 0 && (
                  <div>
                    <Label>{t('contractors.contract')} ({t('common.optional')})</Label>
                    <Select value={contractId} onValueChange={handleContractChange}>
                      <SelectTrigger><SelectValue placeholder={t('contractors.selectContract')} /></SelectTrigger>
                      <SelectContent>
                        {contracts.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {getWorkshopName(c.workshop_id)} {c.total_amount ? `(${Number(c.total_amount).toLocaleString('fr-FR')} CFA)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(!contractId || contracts.length === 0) && paymentType !== 'material_budget' && (
                  <div>
                    <Label>{t('common.workshop')}</Label>
                    <Select value={workshopId} onValueChange={setWorkshopId}>
                      <SelectTrigger><SelectValue placeholder={t('dashboard.selectWorkshop')} /></SelectTrigger>
                      <SelectContent>
                        {workshops.map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>{t('contractors.paymentType')}</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map(pt => (
                        <SelectItem key={pt} value={pt}>{t(`contractors.paymentTypes.${pt}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {paymentType === 'material_budget' && (
                  <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    {t('contractors.budgetHint')}
                  </p>
                )}

                <div>
                  <Label>{t('common.amount')}</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                </div>

                <div>
                  <Label>{t('common.date')}</Label>
                  <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                </div>

                <div>
                  <Label>{t('common.description')} ({t('common.optional')})</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('contractors.paymentDescPlaceholder')} rows={2} />
                </div>

                {paymentType === 'product' && (
                  <div>
                    <Label>{t('payments.invoiceReceipt')}</Label>
                    <p className="text-xs text-muted-foreground mb-1.5">{t('payments.fileHint')}</p>
                    {receiptFile ? (
                      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                        <span className="text-xs truncate flex-1">{receiptFile.name}</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setReceiptFile(null)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFileSelect(e, setReceiptFile)} />
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e, setReceiptFile)} />
                        <Button type="button" variant="outline" size="sm" className="gap-1 flex-1" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="w-3.5 h-3.5" />
                          {t('payments.uploadFile')}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="gap-1 flex-1" onClick={() => cameraInputRef.current?.click()}>
                          <Camera className="w-3.5 h-3.5" />
                          {t('payments.capturePhoto')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!contractorId || (paymentType !== 'material_budget' && !(workshopId || contractId)) || !amount || Number(amount) <= 0 || createMutation.isPending}
                >
                  {t('common.save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {/* Edit Budget Amount Dialog */}
      <Dialog open={!!editingBudget} onOpenChange={(open) => { if (!open) setEditingBudget(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('contractors.editBudget')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('common.amount')}</Label>
              <Input type="number" value={editBudgetAmount} onChange={e => setEditBudgetAmount(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => editBudgetMutation.mutate()} disabled={!editBudgetAmount || Number(editBudgetAmount) <= 0 || editBudgetMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Remaining as Advance Confirmation */}
      <Dialog open={!!markAdvancePayment} onOpenChange={(open) => { if (!open) setMarkAdvancePayment(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('contractors.markAsAdvance')}</DialogTitle>
          </DialogHeader>
          {markAdvancePayment && (() => {
            const spent = allBudgetSums[markAdvancePayment.id] || 0;
            const remaining = Number(markAdvancePayment.amount) - spent;
            return (
              <div className="space-y-3">
                <p className="text-sm">{t('contractors.markAsAdvanceDesc')}</p>
                <div className="text-sm font-medium">
                  {t('contractors.remaining')}: {remaining.toLocaleString('fr-FR')} CFA
                </div>
                <div>
                  <Label className="text-xs">{t('common.workshop')}</Label>
                  <Select value={advanceWorkshopId} onValueChange={setAdvanceWorkshopId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t('dashboard.selectWorkshop')} /></SelectTrigger>
                    <SelectContent>
                      {workshops.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => markRemainingAsAdvanceMutation.mutate(markAdvancePayment)}
                  disabled={remaining <= 0 || !advanceWorkshopId || markRemainingAsAdvanceMutation.isPending}
                >
                  {t('common.confirm')}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Payment Type Dialog */}
      <Dialog open={!!editingPaymentType} onOpenChange={(open) => { if (!open) setEditingPaymentType(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('contractors.changePaymentType')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('contractors.paymentType')}</Label>
              <Select value={editPaymentTypeValue} onValueChange={setEditPaymentTypeValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(pt => (
                    <SelectItem key={pt} value={pt}>{t(`contractors.paymentTypes.${pt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => editPaymentTypeMutation.mutate()} disabled={!editPaymentTypeValue || editPaymentTypeMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (() => {
        const filteredPayments = payments.filter(p => {
          // Hide budget_purchase entries - they are shown under their parent budget
          if (p.payment_type === 'budget_purchase') return false;
          
          if (p.payment_type === 'material_budget') {
            const spent = allBudgetSums[p.id] || 0;
            const remaining = Number(p.amount) - spent;
            const wsIds = budgetWorkshops[p.id] || [];
            const advanceWsIds = advanceBudgetWorkshops[p.id] || [];
            const advanceFromBudget = advanceBudgetSums[p.id] || 0;
            
            // Workshop filter: budget must have activity in that workshop
            if (filterWorkshop !== 'all' && !wsIds.includes(filterWorkshop)) return false;
            
            // Payment type filter for budgets
            if (filterPaymentType === 'advance') {
              // Only show if remaining > 0 OR has advance purchases
              const hasRelevantAdvance = filterWorkshop !== 'all'
                ? (advanceWsIds.includes(filterWorkshop)) // advance in this specific workshop
                : (advanceFromBudget > 0);
              const hasRemaining = remaining > 0;
              if (!hasRelevantAdvance && !hasRemaining) return false;
              // If workshop filter active AND remaining > 0 but no activity in workshop, hide
              if (filterWorkshop !== 'all' && !hasRelevantAdvance && hasRemaining && !wsIds.includes(filterWorkshop)) return false;
            } else if (filterPaymentType === 'product') {
              return false; // Hide budgets in product filter
            } else if (filterPaymentType === 'material_budget') {
              // Show only if has actual product purchases (spent - advances > 0)
              if (Math.max(0, spent - advanceFromBudget) <= 0) return false;
            }
          } else {
            // When filtering by workshop, only show payments in that workshop
            if (filterWorkshop !== 'all' && p.workshop_id !== filterWorkshop) return false;
            
            if (filterPaymentType !== 'all') {
              if (filterPaymentType === 'advance') {
                if (p.payment_type !== 'advance') return false;
              } else if (filterPaymentType === 'product') {
                if (p.payment_type !== 'product') return false;
              } else {
                if (p.payment_type !== filterPaymentType) return false;
              }
            }
          }
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return getContractorName(p.contractor_id).toLowerCase().includes(q)
            || (p.workshop_id && getWorkshopName(p.workshop_id).toLowerCase().includes(q))
            || (p.description || '').toLowerCase().includes(q);
        });
        const filteredTotal = filteredPayments.reduce((sum, p) => {
          if (p.payment_type === 'material_budget') {
            if (filterPaymentType === 'all') {
              // In overall view, budget amount is added to total (the given amount)
              return sum + Number(p.amount);
            } else if (filterPaymentType === 'material_budget') {
              // When filtering by material_budget, only show actual product purchases (not advance, not remaining)
              const spent = allBudgetSums[p.id] || 0;
              const advanceFromBudget = advanceBudgetSums[p.id] || 0;
              return sum + Math.max(0, spent - advanceFromBudget);
            } else if (filterPaymentType === 'advance') {
              // In advance filter, remaining balance + advance purchases from budget
              const spent = allBudgetSums[p.id] || 0;
              const advanceFromBudget = advanceBudgetSums[p.id] || 0;
              return sum + Math.max(0, Number(p.amount) - spent) + advanceFromBudget;
            }
            return sum;
          }
          return sum + Number(p.amount);
        }, 0);
        // When filtering by product, also add budget purchase totals (excluding advance purchases)
        const productBudgetTotal = filterPaymentType === 'product'
          ? Object.entries(allBudgetSums as Record<string, number>).reduce((s, [id, v]) => {
              const advanceAmount = (advanceBudgetSums as Record<string, number>)[id] || 0;
              return s + v - advanceAmount;
            }, 0)
          : 0;
        const displayTotal = filteredTotal + productBudgetTotal;
        return (
          <>
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="py-3 px-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-destructive/10">
                    <DollarSign className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-destructive font-medium">{t('common.total')} ({filteredPayments.length})</p>
                    <p className="text-base font-bold font-mono text-destructive">{displayTotal.toLocaleString('fr-FR')} CFA</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            {filteredPayments.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">{t('contractors.noPayments')}</CardContent></Card>
        ) : (
          <div className="grid gap-2">
            {filteredPayments.map(p => {
              const isBudget = p.payment_type === 'material_budget';
              const isExpanded = expandedBudget === p.id;
              const budgetSpent = allBudgetSums[p.id] || 0;
              const budgetTotal = Number(p.amount);
              const budgetRemaining = budgetTotal - budgetSpent;
              const budgetProgress = budgetTotal > 0 ? Math.min((budgetSpent / budgetTotal) * 100, 100) : 0;

              return (
                <Card key={p.id} className={isBudget ? 'border-primary/30' : ''}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`min-w-0 flex-1 ${isBudget ? 'cursor-pointer' : ''}`} onClick={() => isBudget && toggleBudgetExpand(p.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{getContractorName(p.contractor_id)}</span>
                          {p.workshop_id && <Badge variant="outline" className="text-xs">{getWorkshopName(p.workshop_id)}</Badge>}
                          <Badge variant={isBudget ? 'default' : 'secondary'} className="text-xs">
                            {t(`contractors.paymentTypes.${p.payment_type}`)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{p.payment_date}</span>
                          {p.description && <span>· {p.description}</span>}
                        </div>
                        {isBudget && (
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{t('contractors.spent')}: {budgetSpent.toLocaleString('fr-FR')} / {budgetTotal.toLocaleString('fr-FR')} CFA</span>
                              <span>{t('contractors.remaining')}: {budgetRemaining.toLocaleString('fr-FR')}</span>
                            </div>
                            <Progress value={budgetProgress} className="h-1.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm whitespace-nowrap">{budgetTotal.toLocaleString('fr-FR')} CFA</span>
                        {isBudget && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleBudgetExpand(p.id)}>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        {role === 'admin' && isBudget && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingBudget(p); setEditBudgetAmount(String(p.amount)); }}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            {budgetRemaining > 0 && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMarkAdvancePayment(p)} title={t('contractors.markAsAdvance')}>
                                <DollarSign className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            )}
                          </>
                        )}
                        {role === 'admin' && !isBudget && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingPaymentType(p); setEditPaymentTypeValue(p.payment_type); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {role === 'admin' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(p)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded budget purchases */}
                    {isBudget && isExpanded && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">{t('contractors.purchases')}</p>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowPurchaseForm(showPurchaseForm === p.id ? null : p.id)}>
                            <Plus className="w-3 h-3" />
                            {t('contractors.addPurchase')}
                          </Button>
                        </div>

                        {/* Purchase form */}
                        {showPurchaseForm === p.id && (
                          <div className="p-2 bg-muted/50 rounded-md space-y-2">
                            {/* Mode toggle */}
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={purchaseMode === 'new' ? 'default' : 'outline'}
                                className="flex-1 h-7 text-xs"
                                onClick={() => { setPurchaseMode('new'); setSelectedExistingPaymentId(''); }}
                              >
                                {t('contractors.newPurchase')}
                              </Button>
                              <Button
                                size="sm"
                                variant={purchaseMode === 'existing' ? 'default' : 'outline'}
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={() => { setPurchaseMode('existing'); setPurchaseWorkshopId(''); }}
                              >
                                <Link className="w-3 h-3" />
                                {t('contractors.linkExistingPayment')}
                              </Button>
                            </div>

                            {purchaseMode === 'existing' ? (
                              <div className="space-y-2">
                                <Input
                                  value={existingPaymentSearch}
                                  onChange={e => setExistingPaymentSearch(e.target.value)}
                                  placeholder={t('contractors.searchExistingPayments')}
                                  className="h-8 text-sm"
                                />
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {approvedPayments
                                    .filter(ap => {
                                       // Only show payments linked to this contractor via contractor_payments
                                       const contractorPaymentIds = payments
                                         .filter(cp => cp.contractor_id === p.contractor_id && cp.payment_id)
                                         .map(cp => cp.payment_id);
                                       if (!contractorPaymentIds.includes(ap.id)) return false;
                                       if (!existingPaymentSearch) return true;
                                       const q = existingPaymentSearch.toLowerCase();
                                       return ap.paid_to.toLowerCase().includes(q)
                                         || ap.reason.toLowerCase().includes(q)
                                         || getWorkshopName(ap.workshop_id).toLowerCase().includes(q);
                                     })
                                    .slice(0, 20)
                                    .map(ap => (
                                      <div
                                        key={ap.id}
                                        className={`p-2 rounded text-xs cursor-pointer border transition-colors ${selectedExistingPaymentId === ap.id ? 'border-primary bg-primary/10' : 'border-transparent bg-background hover:bg-muted'}`}
                                        onClick={() => setSelectedExistingPaymentId(ap.id)}
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-medium">{ap.paid_to}</span>
                                          <span className="font-bold">{Number(ap.amount).toLocaleString('fr-FR')} CFA</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground mt-0.5">
                                          <span className="truncate flex-1">{ap.reason}</span>
                                          <span className="ml-2 whitespace-nowrap">{ap.payment_date}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] mt-1">{getWorkshopName(ap.workshop_id)}</Badge>
                                      </div>
                                    ))}
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full h-8"
                                  onClick={() => addPurchaseMutation.mutate(p)}
                                  disabled={!selectedExistingPaymentId || addPurchaseMutation.isPending}
                                >
                                  {t('contractors.linkPayment')}
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <Label className="text-xs">{t('common.workshop')}</Label>
                                  <Select value={purchaseWorkshopId} onValueChange={setPurchaseWorkshopId}>
                                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t('dashboard.selectWorkshop')} /></SelectTrigger>
                                    <SelectContent>
                                      {workshops.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">{t('common.amount')}</Label>
                                    <Input type="number" value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="0" className="h-8 text-sm" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">{t('common.date')}</Label>
                                    <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="h-8 text-sm" />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs">{t('common.description')}</Label>
                                  <Input value={purchaseDescription} onChange={e => setPurchaseDescription(e.target.value)} placeholder={t('contractors.purchaseDescPlaceholder')} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('payments.invoiceReceipt')}</Label>
                                  {purchaseReceipt ? (
                                    <div className="flex items-center gap-2 p-1.5 border rounded bg-background">
                                      <span className="text-xs truncate flex-1">{purchaseReceipt.name}</span>
                                      <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setPurchaseReceipt(null)}>✕</Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2">
                                      <input ref={purchaseFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFileSelect(e, setPurchaseReceipt)} />
                                      <input ref={purchaseCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e, setPurchaseReceipt)} />
                                      <Button type="button" variant="outline" size="sm" className="gap-1 flex-1 h-7 text-xs" onClick={() => purchaseFileRef.current?.click()}>
                                        <Upload className="w-3 h-3" />
                                        {t('payments.uploadFile')}
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" className="gap-1 flex-1 h-7 text-xs" onClick={() => purchaseCameraRef.current?.click()}>
                                        <Camera className="w-3 h-3" />
                                        {t('payments.capturePhoto')}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <Button size="sm" className="w-full h-8" onClick={() => addPurchaseMutation.mutate(p)} disabled={!purchaseWorkshopId || !purchaseAmount || Number(purchaseAmount) <= 0 || addPurchaseMutation.isPending}>
                                  {t('common.save')}
                                </Button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Purchase list */}
                        {budgetPurchases.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">{t('contractors.noPurchases')}</p>
                        ) : (
                          budgetPurchases.map(purchase => (
                            <div key={purchase.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-muted-foreground">{purchase.purchase_date}</span>
                                {purchase.description && <span className="truncate">{purchase.description}</span>}
                                {purchase.receipt_file_path && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1 text-[10px] gap-0.5"
                                    onClick={async () => {
                                      const { data } = await supabase.storage.from('workshop-files').createSignedUrl(purchase.receipt_file_path!, 3600);
                                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                    }}
                                  >
                                    📎 {purchase.receipt_file_name || t('payments.viewReceipt')}
                                  </Button>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-medium whitespace-nowrap">{Number(purchase.amount).toLocaleString('fr-FR')} CFA</span>
                                {role === 'admin' && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deletePurchaseMutation.mutate(purchase)}>
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
