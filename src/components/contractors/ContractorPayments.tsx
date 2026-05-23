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
import { Plus, Trash2, Upload, Camera, Search, ChevronDown, ChevronUp, Edit2, DollarSign, Link, Wallet, Package, HandCoins, X, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { mirrorWorkshopFileToDrive } from '@/lib/mirror-workshop-file';

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
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [editPurchaseAmount, setEditPurchaseAmount] = useState('');
  const [editPurchaseDate, setEditPurchaseDate] = useState('');
  const [editPurchaseDescription, setEditPurchaseDescription] = useState('');

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
      const { fetchAllPages } = await import('@/lib/paginate');
      return await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('contractor_payments')
          .select('*')
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false });
        if (filterContractor !== 'all') q = q.eq('contractor_id', filterContractor);
        if (filterWorkshop !== 'all') {
          q = q.or(`workshop_id.eq.${filterWorkshop},payment_type.eq.material_budget`);
        }
        return q.range(from, to);
      });
    },
  });

  // Fetch approved payments for linking to budget purchases
  const { data: approvedPayments = [] } = useQuery({
    queryKey: ['approved-payments-for-budget'],
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/paginate');
      return await fetchAllPages<any>((from, to) =>
        supabase
          .from('payments')
          .select('*')
          .eq('status', 'approved')
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
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

    mirrorWorkshopFileToDrive({
      workshopId: workshopForPayment,
      workshopName,
      storagePath: fileName,
      fileName: file.name,
      fileType: file.type,
    });

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
          payment_id: existingPayment.id,
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

        mirrorWorkshopFileToDrive({
          workshopId: purchaseWorkshopId,
          workshopName,
          storagePath: fileName,
          fileName: purchaseReceipt.name,
          fileType: purchaseReceipt.type,
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
        payment_id: paymentRecord.id,
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
      // Cascade: if this purchase is linked to a main dashboard payment, remove that
      // payment and its contractor_payments(budget_purchase) row so the dashboard
      // total and balances stay in sync.
      if (purchase.payment_id) {
        await supabase.from('contractor_payments')
          .delete()
          .eq('payment_id', purchase.payment_id)
          .eq('payment_type', 'budget_purchase');
        await supabase.from('workshop_files').delete().eq('payment_id', purchase.payment_id);
        await supabase.from('payments').delete().eq('id', purchase.payment_id);
      }
      const { error } = await supabase.from('contractor_budget_purchases').delete().eq('id', purchase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['approved-payments-for-budget'] });
      toast({ title: t('contractors.purchaseDeleted') });
    },
  });

  const editPurchaseMutation = useMutation({
    mutationFn: async () => {
      if (!editingPurchase) return;
      const newAmount = Number(editPurchaseAmount);

      // Resolve the linked main-dashboard payment id. Legacy / "mark remaining
      // as advance" purchases were created without payment_id on the purchase
      // row itself, but the link still exists via the matching
      // contractor_payments(budget_purchase) row.
      let linkedPaymentId: string | null = editingPurchase.payment_id || null;
      if (!linkedPaymentId) {
        const { data: cpRow } = await supabase
          .from('contractor_payments')
          .select('payment_id')
          .eq('payment_type', 'budget_purchase')
          .eq('payment_date', editingPurchase.purchase_date)
          .eq('amount', editingPurchase.amount)
          .not('payment_id', 'is', null)
          .limit(1)
          .maybeSingle();
        linkedPaymentId = cpRow?.payment_id || null;
      }

      // Update the purchase row (and persist the resolved link for next time)
      const { error } = await supabase.from('contractor_budget_purchases')
        .update({
          amount: newAmount,
          purchase_date: editPurchaseDate,
          description: editPurchaseDescription,
          ...(linkedPaymentId && !editingPurchase.payment_id ? { payment_id: linkedPaymentId } : {}),
        })
        .eq('id', editingPurchase.id);
      if (error) throw error;

      // Cascade to the linked main dashboard payment + contractor_payments(budget_purchase) row
      if (linkedPaymentId) {
        await supabase.from('payments')
          .update({
            amount: newAmount,
            payment_date: editPurchaseDate,
          })
          .eq('id', linkedPaymentId);
        await supabase.from('contractor_payments')
          .update({
            amount: newAmount,
            payment_date: editPurchaseDate,
            description: editPurchaseDescription,
          })
          .eq('payment_id', linkedPaymentId)
          .eq('payment_type', 'budget_purchase');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['budget-sums'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['approved-payments-for-budget'] });
      toast({ title: t('contractors.purchaseUpdated') });
      setEditingPurchase(null);
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
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
        payment_id: paymentRecord.id,
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
      <Card className="border-border/60 bg-card/50 backdrop-blur">
        <CardContent className="p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('contractors.searchPayments')}
              className="pl-8 pr-8 h-9 text-sm bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
          <div className="flex items-center justify-between gap-2 pt-1">
            {(filterContractor !== 'all' || filterWorkshop !== 'all' || filterPaymentType !== 'all') ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground gap-1"
                onClick={() => { setFilterContractor('all'); setFilterWorkshop('all'); setFilterPaymentType('all'); }}
              >
                <X className="w-3 h-3" />
                {t('common.clear', { defaultValue: 'Clear filters' })}
              </Button>
            ) : <span />}
          <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); else setShowForm(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 shadow-sm">
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
                  disabled={!contractorId || (paymentType !== 'material_budget' && !(workshopId || contractId)) || amount === '' || Number(amount) < 0 || createMutation.isPending}
                >
                  {t('common.save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </CardContent>
      </Card>

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

      {/* Edit Purchase Dialog */}
      <Dialog open={!!editingPurchase} onOpenChange={(open) => { if (!open) setEditingPurchase(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('contractors.editPurchase')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('common.amount')}</Label>
              <Input type="number" inputMode="decimal" value={editPurchaseAmount} onChange={e => setEditPurchaseAmount(e.target.value)} />
            </div>
            <div>
              <Label>{t('common.date')}</Label>
              <Input type="date" value={editPurchaseDate} onChange={e => setEditPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('common.description')}</Label>
              <Textarea rows={2} value={editPurchaseDescription} onChange={e => setEditPurchaseDescription(e.target.value)} />
            </div>
            <Button
              className="w-full"
              onClick={() => editPurchaseMutation.mutate()}
              disabled={editPurchaseAmount === '' || Number(editPurchaseAmount) < 0 || !editPurchaseDate || editPurchaseMutation.isPending}
            >
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
            const productSpent = Math.max(0, spent - advanceFromBudget);

            // Workshop filter: a budget with NO purchases yet is an unallocated pool —
            // show it for any workshop. Once it has purchases, only show if any
            // purchase was tagged to that workshop.
            if (filterWorkshop !== 'all' && wsIds.length > 0 && !wsIds.includes(filterWorkshop)) return false;

            // Payment type filter for budgets
            if (filterPaymentType === 'advance') {
              // Only show budgets that actually have a portion marked as advance
              const hasRelevantAdvance = filterWorkshop !== 'all'
                ? advanceWsIds.includes(filterWorkshop)
                : advanceFromBudget > 0;
              if (!hasRelevantAdvance) return false;
            } else if (filterPaymentType === 'product') {
              // Show budgets that have actual product purchases (the
              // productBudgetTotal is added to the displayed total, so they
              // must appear in the list too — otherwise total ≠ list).
              if (productSpent <= 0) return false;
            }
            // material_budget filter: always show every budget, whether
            // unspent, partially spent, or fully consumed (as products or
            // advance). The total above reflects budget − advance portion.
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
            } else if (filterPaymentType === 'material_budget' || filterPaymentType === 'product') {
              // For product/material filter: total = budget amount - advance-marked portion
              // (i.e. the part of the budget not converted to a contractor advance)
              const advanceFromBudget = advanceBudgetSums[p.id] || 0;
              return sum + Math.max(0, Number(p.amount) - advanceFromBudget);
            } else if (filterPaymentType === 'advance') {
              // Only the portion that was actually marked as advance counts
              const advanceFromBudget = advanceBudgetSums[p.id] || 0;
              return sum + advanceFromBudget;
            }
            return sum;
          }
          return sum + Number(p.amount);
        }, 0);
        // Budget product purchases are now counted inside filteredTotal for the
        // displayed (filtered) budgets, so list and total stay consistent.
        const displayTotal = filteredTotal;
        const totalIcon = filterPaymentType === 'advance' ? HandCoins
          : filterPaymentType === 'product' ? Package
          : filterPaymentType === 'material_budget' ? Wallet
          : DollarSign;
        const TotalIcon = totalIcon;
        const totalLabel = filterPaymentType === 'advance' ? t('contractors.paymentTypes.advance')
          : filterPaymentType === 'product' ? t('contractors.paymentTypes.product')
          : filterPaymentType === 'material_budget' ? t('contractors.paymentTypes.material_budget')
          : t('common.total');
        return (
          <>
            <Card className="overflow-hidden border-destructive/30 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-destructive/15 ring-1 ring-destructive/20">
                      <TotalIcon className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-destructive/80 font-semibold">
                        {totalLabel}
                      </p>
                      <p className="text-lg font-bold font-mono text-destructive leading-tight truncate">
                        {displayTotal.toLocaleString('fr-FR')} <span className="text-xs font-medium">CFA</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-background/60 border-destructive/30 text-destructive text-[10px] font-semibold whitespace-nowrap">
                    {filteredPayments.length} {t('contractors.records', { defaultValue: 'records' })}
                  </Badge>
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
              const budgetAdvancePortion = advanceBudgetSums[p.id] || 0;
              const budgetMaterialsPortion = Math.max(0, budgetTotal - budgetAdvancePortion);
              const budgetProductSpent = Math.max(0, budgetSpent - budgetAdvancePortion);
              // Headline value depends on the active filter
              const headlineAmount = !isBudget
                ? budgetTotal
                : filterPaymentType === 'advance'
                  ? budgetAdvancePortion
                  : (filterPaymentType === 'product' || filterPaymentType === 'material_budget')
                    ? budgetMaterialsPortion
                    : budgetTotal;

              return (
                <Card key={p.id} className={`transition-shadow hover:shadow-md ${isBudget ? 'border-primary/30 bg-gradient-to-br from-primary/[0.03] to-transparent' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`min-w-0 flex-1 ${isBudget ? 'cursor-pointer' : ''}`} onClick={() => isBudget && toggleBudgetExpand(p.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate max-w-[140px]">{getContractorName(p.contractor_id)}</span>
                          {p.workshop_id && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{getWorkshopName(p.workshop_id)}</Badge>}
                          <Badge variant={isBudget ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 gap-1">
                            {p.payment_type === 'advance' && <HandCoins className="w-2.5 h-2.5" />}
                            {p.payment_type === 'product' && <Package className="w-2.5 h-2.5" />}
                            {p.payment_type === 'material_budget' && <Wallet className="w-2.5 h-2.5" />}
                            {t(`contractors.paymentTypes.${p.payment_type}`)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{p.payment_date}</span>
                          {p.description && <span>· {p.description}</span>}
                        </div>
                        {isBudget && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex justify-between text-[11px] font-mono">
                              <span className="text-muted-foreground">{budgetSpent.toLocaleString('fr-FR')} / {budgetTotal.toLocaleString('fr-FR')} CFA</span>
                              <span className={budgetRemaining > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                                {t('contractors.remaining')} {budgetRemaining.toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <Progress value={budgetProgress} className="h-1.5" />
                            {(budgetAdvancePortion > 0 || budgetProductSpent > 0) && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {budgetProductSpent > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    <Package className="w-2.5 h-2.5" />
                                    {budgetProductSpent.toLocaleString('fr-FR')}
                                  </span>
                                )}
                                {budgetAdvancePortion > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                    <HandCoins className="w-2.5 h-2.5" />
                                    {budgetAdvancePortion.toLocaleString('fr-FR')}
                                  </span>
                                )}
                              </div>
                            )}
                            {(filterPaymentType === 'advance' || filterPaymentType === 'product' || filterPaymentType === 'material_budget') && (
                              <p className="text-[10px] text-muted-foreground italic pt-0.5">
                                {filterPaymentType === 'advance'
                                  ? t('contractors.budgetAdvanceNote', {
                                      defaultValue: 'Budget {{total}} CFA — only {{part}} CFA marked as advance',
                                      total: budgetTotal.toLocaleString('fr-FR'),
                                      part: budgetAdvancePortion.toLocaleString('fr-FR'),
                                    })
                                  : t('contractors.budgetMaterialsNote', {
                                      defaultValue: 'Budget {{total}} CFA — only {{part}} CFA for materials',
                                      total: budgetTotal.toLocaleString('fr-FR'),
                                      part: budgetMaterialsPortion.toLocaleString('fr-FR'),
                                    })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-bold text-sm font-mono whitespace-nowrap">
                            {headlineAmount.toLocaleString('fr-FR')} <span className="text-[10px] font-medium text-muted-foreground">CFA</span>
                          </span>
                          {isBudget && headlineAmount !== budgetTotal && (
                            <span className="text-[9px] text-muted-foreground font-mono">
                              / {budgetTotal.toLocaleString('fr-FR')}
                            </span>
                          )}
                        </div>
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
                      <div className="mt-4 -mx-1 sm:-mx-2 rounded-xl border border-border/60 bg-gradient-to-b from-secondary/40 to-card/40 p-3 sm:p-4 space-y-3 animate-fade-in">
                        {/* Section header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                              <Receipt className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{t('contractors.purchases')}</p>
                              <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                                {budgetPurchases.length} {budgetPurchases.length === 1 ? 'item' : 'items'}
                              </p>
                            </div>
                          </div>
                          {showPurchaseForm !== p.id && (
                            <Button size="sm" className="h-8 text-xs gap-1 shadow-sm rounded-lg" onClick={() => setShowPurchaseForm(p.id)}>
                              <Plus className="w-3.5 h-3.5" />
                              {t('contractors.addPurchase')}
                            </Button>
                          )}
                        </div>

                        {/* Spent vs budget mini-summary */}
                        {(() => {
                          const spent = budgetPurchases.reduce((s, x) => s + Number(x.amount || 0), 0);
                          const total = Number(p.amount || 0);
                          const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
                          const remaining = Math.max(0, total - spent);
                          return (
                            <div className="rounded-lg border border-border/60 bg-card/70 backdrop-blur-sm px-3 py-2.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Spent</p>
                                  <p className="font-mono text-sm font-bold text-foreground">
                                    {spent.toLocaleString('fr-FR')} <span className="text-[10px] text-muted-foreground">CFA</span>
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Remaining</p>
                                  <p className="font-mono text-sm font-bold text-primary">
                                    {remaining.toLocaleString('fr-FR')} <span className="text-[10px] text-muted-foreground">CFA</span>
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div className="h-full gradient-prestige transition-[width] duration-500" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                                <span>{pct}% used</span>
                                <span className="font-mono">/ {total.toLocaleString('fr-FR')} CFA</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Purchase form */}
                        {showPurchaseForm === p.id && (
                          <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.04] to-background overflow-hidden shadow-sm">
                            {/* Header */}
                            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-background/60">
                              <div className="flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-semibold">{t('contractors.addPurchase')}</span>
                              </div>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={resetPurchaseForm} aria-label="close">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            {/* Segmented mode toggle */}
                            <div className="px-3 pt-3">
                              <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-muted rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => { setPurchaseMode('new'); setSelectedExistingPaymentId(''); }}
                                  className={`flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-medium transition-all ${purchaseMode === 'new' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                  <Plus className="w-3 h-3" />
                                  {t('contractors.newPurchase')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setPurchaseMode('existing'); setPurchaseWorkshopId(''); }}
                                  className={`flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-medium transition-all ${purchaseMode === 'existing' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                  <Link className="w-3 h-3" />
                                  {t('contractors.linkExistingPayment')}
                                </button>
                              </div>
                            </div>
                            <div className="px-3 pb-3 pt-3 space-y-2.5">

                            {purchaseMode === 'existing' ? (
                              <div className="space-y-2">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                  <Input
                                    value={existingPaymentSearch}
                                    onChange={e => setExistingPaymentSearch(e.target.value)}
                                    placeholder={t('contractors.searchExistingPayments')}
                                    className="h-8 text-xs pl-7 bg-background"
                                  />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border/60 bg-background/60 p-1">
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
                                        className={`p-2 rounded-md text-xs cursor-pointer border transition-all ${selectedExistingPaymentId === ap.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border/40 bg-background hover:bg-muted/60'}`}
                                        onClick={() => setSelectedExistingPaymentId(ap.id)}
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-semibold truncate">{ap.paid_to}</span>
                                          <span className="font-bold font-mono whitespace-nowrap ml-2">{Number(ap.amount).toLocaleString('fr-FR')}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground mt-0.5 text-[10px]">
                                          <span className="truncate flex-1">{ap.reason}</span>
                                          <span className="ml-2 whitespace-nowrap">{ap.payment_date}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 mt-1">{getWorkshopName(ap.workshop_id)}</Badge>
                                      </div>
                                    ))}
                                  {approvedPayments.filter(ap => {
                                    const ids = payments.filter(cp => cp.contractor_id === p.contractor_id && cp.payment_id).map(cp => cp.payment_id);
                                    return ids.includes(ap.id);
                                  }).length === 0 && (
                                    <p className="text-[11px] text-center text-muted-foreground py-4">{t('contractors.noPayments')}</p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full h-8 gap-1"
                                  onClick={() => addPurchaseMutation.mutate(p)}
                                  disabled={!selectedExistingPaymentId || addPurchaseMutation.isPending}
                                >
                                  <Link className="w-3.5 h-3.5" />
                                  {t('contractors.linkPayment')}
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <div>
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('common.workshop')}</Label>
                                  <Select value={purchaseWorkshopId} onValueChange={setPurchaseWorkshopId}>
                                    <SelectTrigger className="h-9 text-sm mt-1 bg-background"><SelectValue placeholder={t('dashboard.selectWorkshop')} /></SelectTrigger>
                                    <SelectContent>
                                      {workshops.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('common.amount')}</Label>
                                    <div className="relative mt-1">
                                      <Input type="number" inputMode="decimal" value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="0" className="h-9 text-sm pr-10 font-mono bg-background" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">CFA</span>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('common.date')}</Label>
                                    <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="h-9 text-sm mt-1 bg-background" />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('common.description')}</Label>
                                  <Input value={purchaseDescription} onChange={e => setPurchaseDescription(e.target.value)} placeholder={t('contractors.purchaseDescPlaceholder')} className="h-9 text-sm mt-1 bg-background" />
                                </div>
                                <div>
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('payments.invoiceReceipt')}</Label>
                                  {purchaseReceipt ? (
                                    <div className="flex items-center gap-2 mt-1 px-2 py-1.5 border border-primary/30 rounded-md bg-primary/5">
                                      <Receipt className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                      <span className="text-xs truncate flex-1">{purchaseReceipt.name}</span>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPurchaseReceipt(null)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2 mt-1">
                                      <input ref={purchaseFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFileSelect(e, setPurchaseReceipt)} />
                                      <input ref={purchaseCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e, setPurchaseReceipt)} />
                                      <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1 h-8 text-xs bg-background" onClick={() => purchaseFileRef.current?.click()}>
                                        <Upload className="w-3.5 h-3.5" />
                                        {t('payments.uploadFile')}
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1 h-8 text-xs bg-background" onClick={() => purchaseCameraRef.current?.click()}>
                                        <Camera className="w-3.5 h-3.5" />
                                        {t('payments.capturePhoto')}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" variant="outline" className="flex-1 h-9" onClick={resetPurchaseForm}>
                                    {t('common.cancel')}
                                  </Button>
                                  <Button size="sm" className="flex-1 h-9 gap-1 shadow-sm" onClick={() => addPurchaseMutation.mutate(p)} disabled={!purchaseWorkshopId || purchaseAmount === '' || Number(purchaseAmount) < 0 || addPurchaseMutation.isPending}>
                                    <Plus className="w-3.5 h-3.5" />
                                    {t('common.save')}
                                  </Button>
                                </div>
                              </div>
                            )}
                            </div>
                          </div>
                        )}

                        {/* Purchase list */}
                        {budgetPurchases.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/60 bg-card/40 py-6 text-center">
                            <Package className="w-5 h-5 mx-auto mb-1.5 text-muted-foreground/60" />
                            <p className="text-xs text-muted-foreground">{t('contractors.noPurchases')}</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {budgetPurchases.map(purchase => {
                              const d = purchase.purchase_date ? new Date(purchase.purchase_date + 'T00:00:00') : null;
                              const day = d ? d.getDate() : '--';
                              const mon = d ? d.toLocaleDateString('en', { month: 'short' }) : '';
                              return (
                                <div
                                  key={purchase.id}
                                  className="group flex items-center gap-2.5 rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm px-2.5 py-2 transition-all hover:border-primary/30 hover:shadow-sm"
                                >
                                  {/* Date chip */}
                                  <div className="flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-md bg-primary/5 border border-primary/15 text-primary">
                                    <span className="text-[14px] font-bold leading-none font-mono">{day}</span>
                                    <span className="text-[8px] uppercase tracking-wider mt-0.5 opacity-80">{mon}</span>
                                  </div>
                                  {/* Description + receipt */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate leading-tight">
                                      {purchase.description || <span className="text-muted-foreground italic">No description</span>}
                                    </p>
                                    {purchase.receipt_file_path && (
                                      <button
                                        type="button"
                                        className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 hover:underline truncate max-w-full"
                                        onClick={async () => {
                                          const { data } = await supabase.storage.from('workshop-files').createSignedUrl(purchase.receipt_file_path!, 3600);
                                          if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                        }}
                                      >
                                        <Receipt className="w-2.5 h-2.5" />
                                        <span className="truncate">{purchase.receipt_file_name || t('payments.viewReceipt')}</span>
                                      </button>
                                    )}
                                  </div>
                                  {/* Amount + delete */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="text-right">
                                      <p className="font-mono text-xs font-bold text-foreground leading-none whitespace-nowrap">
                                        {Number(purchase.amount).toLocaleString('fr-FR')}
                                      </p>
                                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">CFA</p>
                                    </div>
                                    {role === 'admin' && (
                                      <>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
                                          onClick={() => {
                                            setEditingPurchase(purchase);
                                            setEditPurchaseAmount(String(purchase.amount));
                                            setEditPurchaseDate(purchase.purchase_date);
                                            setEditPurchaseDescription(purchase.description || '');
                                          }}
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                          onClick={() => deletePurchaseMutation.mutate(purchase)}
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
