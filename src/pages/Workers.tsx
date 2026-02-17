import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { getEffectivePay, buildWorkerPaymentReason } from "@/lib/worker-payment-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Users } from "lucide-react";
import WorkerDetails from "@/components/WorkerDetails";
import WorkerCard from "@/components/WorkerCard";
import WorkshopSelector from "@/components/WorkshopSelector";
import { format, startOfWeek } from "date-fns";

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
  category: string;
}

const WORKER_CATEGORIES = ["coffreur", "ferrailleur", "travailleur", "macon", "carreleur"] as const;

// Helper function to get week range (Sunday to Saturday) for a given date
function getWeekRange(date: Date): { weekLabel: string; sunday: Date } {
  const sunday = startOfWeek(date, { weekStartsOn: 0 });
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const weekLabel = `${format(sunday, "dd/MM")} - ${format(saturday, "dd/MM")}`;
  return { weekLabel, sunday };
}

// Group attendance entries by the week they were worked
function groupByWorkWeek(entries: any[]): Record<string, any[]> {
  return entries.reduce(
    (acc, entry) => {
      const workDate = new Date(entry.work_date);
      const { weekLabel } = getWeekRange(workDate);
      if (!acc[weekLabel]) {
        acc[weekLabel] = [];
      }
      acc[weekLabel].push(entry);
      return acc;
    },
    {} as Record<string, any[]>,
  );
}

export default function Workers() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerToToggle, setWorkerToToggle] = useState<Worker | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [workerRate, setWorkerRate] = useState("1000");
  const [workerCategory, setWorkerCategory] = useState<string>("travailleur");
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);
  const [isPaySelectedOpen, setIsPaySelectedOpen] = useState(false);

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers", showInactive],
    queryFn: async () => {
      let query = supabase.from("workers").select("*").order("name");

      if (!showInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Worker[];
    },
  });

  // Fetch all unpaid attendance for all workers
  const { data: allUnpaidAttendance = [] } = useQuery({
    queryKey: ["all-unpaid-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select(`*, workshops:workshop_id(id, name)`)
        .eq("is_paid", false);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all unpaid adjustments
  const { data: allUnpaidAdjustments = [] } = useQuery({
    queryKey: ["all-worker-adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_adjustments").select("*").eq("is_paid", false);
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate owed amounts and weekly bonus/discount totals per worker
  const { owedTotalsByWorker, owedBreakdownByWorker, weeklyBonusByWorker, weeklyDiscountByWorker } = useMemo(() => {
    const totals: Record<string, number> = {};
    const breakdown: Record<string, Record<string, { amount: number; name: string }>> = {};
    const bonuses: Record<string, number> = {};
    const discounts: Record<string, number> = {};

    // Get current week boundaries (Sunday to Saturday)
    const now = new Date();
    const sunday = startOfWeek(now, { weekStartsOn: 0 });
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    allUnpaidAttendance.forEach((entry) => {
      const workerId = entry.worker_id;
      const workshopId = entry.workshop_id;
      const workshopName =
        (entry.workshops as any)?.name || t("workers.unknownWorkshop", { defaultValue: "Unknown workshop" });
      const amount = getEffectivePay(entry);

      totals[workerId] = (totals[workerId] || 0) + amount;

      if (!breakdown[workerId]) {
        breakdown[workerId] = {};
      }
      if (!breakdown[workerId][workshopId]) {
        breakdown[workerId][workshopId] = { amount: 0, name: workshopName };
      }
      breakdown[workerId][workshopId].amount += amount;
    });

    // Include adjustments in totals
    allUnpaidAdjustments.forEach((adj) => {
      const workerId = adj.worker_id;
      const adjAmount = Number(adj.amount);

      if (adj.adjustment_type === "bonus") {
        totals[workerId] = (totals[workerId] || 0) + adjAmount;
        bonuses[workerId] = (bonuses[workerId] || 0) + adjAmount;
      } else {
        totals[workerId] = (totals[workerId] || 0) - adjAmount;
        discounts[workerId] = (discounts[workerId] || 0) + adjAmount;
      }
    });

    return {
      owedTotalsByWorker: totals,
      owedBreakdownByWorker: breakdown,
      weeklyBonusByWorker: bonuses,
      weeklyDiscountByWorker: discounts,
    };
  }, [allUnpaidAttendance, allUnpaidAdjustments, t]);

  const workerIdsForSelectedWorkshop = useMemo(() => {
    if (!selectedWorkshopId) return null;
    const ids = new Set<string>();
    allUnpaidAttendance.forEach((entry) => {
      if (entry.workshop_id === selectedWorkshopId) {
        ids.add(entry.worker_id);
      }
    });
    return ids;
  }, [allUnpaidAttendance, selectedWorkshopId]);

  const displayedWorkers = useMemo(() => {
    let result = workers;
    if (selectedWorkshopId && workerIdsForSelectedWorkshop) {
      result = result.filter((worker) => workerIdsForSelectedWorkshop.has(worker.id));
    }
    if (filterCategory) {
      result = result.filter((worker) => worker.category === filterCategory);
    }
    return result;
  }, [workers, selectedWorkshopId, workerIdsForSelectedWorkshop, filterCategory]);

  const getWorkerOwedAmount = (workerId: string) => {
    if (selectedWorkshopId) {
      return owedBreakdownByWorker[workerId]?.[selectedWorkshopId]?.amount || 0;
    }
    return owedTotalsByWorker[workerId] || 0;
  };

  // Get attendance for selected workers (respecting workshop filter)
  const selectedWorkersAttendance = useMemo(() => {
    return allUnpaidAttendance.filter(
      (entry) =>
        selectedWorkerIds.has(entry.worker_id) && (!selectedWorkshopId || entry.workshop_id === selectedWorkshopId),
    );
  }, [allUnpaidAttendance, selectedWorkerIds, selectedWorkshopId]);

  // Total owed for the current selection/filter scope
  const selectedTotalOwed = useMemo(() => {
    return selectedWorkersAttendance.reduce((total, entry) => total + getEffectivePay(entry), 0);
  }, [selectedWorkersAttendance]);

  // Group selected workers' attendance by workshop for summary display
  const selectedByWorkshop = useMemo(() => {
    const result: Record<string, { name: string; total: number }> = {};
    selectedWorkersAttendance.forEach((entry) => {
      const workshopId = entry.workshop_id;
      const workshopName =
        (entry.workshops as any)?.name || t("workers.unknownWorkshop", { defaultValue: "Unknown workshop" });
      if (!result[workshopId]) {
        result[workshopId] = { name: workshopName, total: 0 };
      }
      result[workshopId].total += getEffectivePay(entry);
    });
    return result;
  }, [selectedWorkersAttendance, t]);

  const selectedWorkerIdsForDisplay = useMemo<Set<string>>(() => {
    if (!selectedWorkshopId) {
      return selectedWorkerIds;
    }
    return new Set(selectedWorkersAttendance.map((entry) => entry.worker_id));
  }, [selectedWorkerIds, selectedWorkersAttendance, selectedWorkshopId]);

  const selectedWorkerCount = selectedWorkerIdsForDisplay.size;

  const addWorker = useMutation({
    mutationFn: async ({ name, hourly_rate }: { name: string; hourly_rate: number }) => {
      const { error } = await supabase.from("workers").insert([
        {
          name: name.trim(),
          hourly_rate,
          category: workerCategory,
          created_by: user?.id,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      setIsAddOpen(false);
      setWorkerName("");
      setWorkerRate("1000");
      setWorkerCategory("travailleur");
      toast({ title: t("workers.added"), description: t("workers.addedDesc") });
    },
    onError: (error: Error) => {
      toast({ title: t("errors.error"), description: error.message, variant: "destructive" });
    },
  });

  const updateWorker = useMutation({
    mutationFn: async ({
      id,
      name,
      hourly_rate,
      category,
    }: {
      id: string;
      name: string;
      hourly_rate: number;
      category: string;
    }) => {
      const { error } = await supabase
        .from("workers")
        .update({ name: name.trim(), hourly_rate, category })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      setEditingWorker(null);
      setWorkerName("");
      setWorkerRate("1000");
      toast({ title: t("workers.updated"), description: t("workers.updatedDesc") });
    },
  });

  const toggleWorkerStatus = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("workers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      setWorkerToToggle(null);
      toast({
        title: vars.is_active ? t("workers.activated") : t("workers.deactivated"),
        description: vars.is_active ? t("workers.activatedDesc") : t("workers.deactivatedDesc"),
      });
    },
  });

  const deleteWorker = useMutation({
    mutationFn: async (id: string) => {
      const { error: attendanceError } = await supabase.from("attendance").delete().eq("worker_id", id);
      if (attendanceError) throw attendanceError;

      const { error } = await supabase.from("workers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["all-unpaid-attendance"] });
      setWorkerToDelete(null);
      toast({
        title: t("workers.deleted"),
        description: t("workers.deletedDesc"),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("errors.error"), description: error.message, variant: "destructive" });
    },
  });

  // Pay selected workers mutation
  const paySelectedWorkers = useMutation({
    mutationFn: async () => {
      const results: any[] = [];
      const workerNames: Record<string, string> = {};
      workers.forEach((w) => {
        workerNames[w.id] = w.name;
      });

      // Get adjustments for selected workers
      const selectedAdj = allUnpaidAdjustments.filter(
        (a) => selectedWorkerIds.has(a.worker_id) && (!selectedWorkshopId || a.workshop_id === selectedWorkshopId),
      );
      const adjByWorkshop: Record<string, any[]> = {};
      selectedAdj.forEach((a) => {
        if (!adjByWorkshop[a.workshop_id]) adjByWorkshop[a.workshop_id] = [];
        adjByWorkshop[a.workshop_id].push(a);
      });

      const byWeek = groupByWorkWeek(selectedWorkersAttendance);

      for (const [weekLabel, weekEntries] of Object.entries(byWeek)) {
        const byWorkshop = (weekEntries as any[]).reduce(
          (acc, entry) => {
            const workshopId = entry.workshop_id;
            if (!acc[workshopId]) acc[workshopId] = { entries: [], total: 0 };
            acc[workshopId].entries.push(entry);
            acc[workshopId].total += getEffectivePay(entry);
            return acc;
          },
          {} as Record<string, { entries: any[]; total: number }>,
        );

        for (const [workshopId, workshopData] of Object.entries(byWorkshop) as [
          string,
          { entries: any[]; total: number },
        ][]) {
          const { entries, total } = workshopData;
          const wAdj = adjByWorkshop[workshopId] || [];
          const adjB = wAdj.filter((a) => a.adjustment_type === "bonus").reduce((s, a) => s + Number(a.amount), 0);
          const adjD = wAdj.filter((a) => a.adjustment_type === "discount").reduce((s, a) => s + Number(a.amount), 0);
          const finalTotal = total + adjB - adjD;

          const reason = buildWorkerPaymentReason(entries, workerNames, wAdj);

          const { data: payment, error: paymentError } = await supabase
            .from("payments")
            .insert([
              {
                workshop_id: workshopId,
                paid_to: t('workers.categories.travailleur'),
                reason,
                amount: Math.max(finalTotal, 0),
                payment_date: format(new Date(), "yyyy-MM-dd"),
                created_by: user?.id,
                status: "pending",
              },
            ])
            .select()
            .single();
          if (paymentError) throw paymentError;

          const entryIds = entries.map((a: any) => a.id);
          if (entryIds.length > 0) {
            await supabase.from("attendance").update({ is_paid: true, payment_id: payment.id }).in("id", entryIds);
          }
          const adjIds = wAdj.map((a: any) => a.id);
          if (adjIds.length > 0) {
            await supabase
              .from("worker_adjustments")
              .update({ is_paid: true, payment_id: payment.id })
              .in("id", adjIds);
          }
          delete adjByWorkshop[workshopId];
          results.push({ workshopId, weekLabel, paymentId: payment.id, amount: finalTotal });
        }
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-unpaid-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["all-worker-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["worker-unpaid-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["worker-paid-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["worker-unpaid-adjustments"] });
      setSelectedWorkerIds(new Set());
      setIsPaySelectedOpen(false);
      toast({
        title: t("workers.paymentCreated"),
        description: t("workers.paymentCreatedDesc"),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("errors.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (workerName.trim() && workerRate) {
      addWorker.mutate({ name: workerName, hourly_rate: parseFloat(workerRate) });
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWorker && workerName.trim() && workerRate) {
      updateWorker.mutate({
        id: editingWorker.id,
        name: workerName,
        hourly_rate: parseFloat(workerRate),
        category: workerCategory,
      });
    }
  };

  const openEdit = (worker: Worker, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorker(worker);
    setWorkerName(worker.name);
    setWorkerRate(worker.hourly_rate.toString());
    setWorkerCategory(worker.category || "travailleur");
  };

  const toggleWorkerSelection = (workerId: string, isSelected: boolean) => {
    setSelectedWorkerIds((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(workerId);
      } else {
        newSet.delete(workerId);
      }
      return newSet;
    });
  };

  const selectAllWithOwed = () => {
    const workersWithOwed = displayedWorkers.filter((w) => w.is_active && getWorkerOwedAmount(w.id) > 0);
    setSelectedWorkerIds(new Set(workersWithOwed.map((w) => w.id)));
  };

  const clearSelection = () => {
    setSelectedWorkerIds(new Set());
  };

  // Count workers with owed amounts
  const workersWithOwedCount = displayedWorkers.filter((w) => w.is_active && getWorkerOwedAmount(w.id) > 0).length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (selectedWorker) {
    return (
      <Layout>
        <WorkerDetails worker={selectedWorker} onBack={() => setSelectedWorker(null)} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 md:w-6 md:h-6" />
              {t("workers.title")}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">{t("workers.manageDescription")}</p>
          </div>

          <Button
            onClick={() => setIsAddOpen(true)}
            size="sm"
            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 h-8 text-xs md:text-sm md:h-9"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            {t("workers.addWorker")}
          </Button>
        </div>

        {/* Workshop Filter */}
        <div className="space-y-2">
          <WorkshopSelector
            selectedWorkshop={selectedWorkshopId}
            onSelect={(workshopId) => setSelectedWorkshopId(workshopId)}
          />
          {selectedWorkshopId && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSelectedWorkshopId(null)} className="h-8 text-xs">
                {t("workers.clearWorkshopFilter")}
              </Button>
            </div>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={!filterCategory ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterCategory(null)}
            className="text-xs h-7 px-2"
          >
            {t("common.all")}
          </Button>
          {WORKER_CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              className="text-xs h-7 px-2"
            >
              {t(`workers.categories.${cat}`)}
            </Button>
          ))}
        </div>

        {/* Filters and Multi-Select Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="text-xs h-8"
          >
            {showInactive ? t("workers.hideInactive") : t("workers.showInactive")}
          </Button>

          {workersWithOwedCount > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              {selectedWorkerCount === 0 ? (
                <Button variant="outline" size="sm" onClick={selectAllWithOwed} className="text-xs h-8 gap-1">
                  {t("workers.selectAll")} ({workersWithOwedCount})
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={clearSelection} className="text-xs h-8">
                    {t("workers.clearSelection")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsPaySelectedOpen(true)}
                    className="text-xs h-8 gap-1 bg-success text-success-foreground hover:bg-success/90"
                  >
                    {t("workers.paySelected")} ({selectedWorkerCount})
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {/* Selected summary */}
        {selectedWorkerCount > 0 && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedWorkerCount} {t("workers.selected")}
                </span>
                <Badge variant="outline" className="font-mono text-warning border-warning">
                  {selectedTotalOwed.toLocaleString("fr-FR")} CFA
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workers Grid */}
        <Card className="shadow-card">
          <CardContent className="p-3 md:p-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : displayedWorkers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {selectedWorkshopId ? t("workers.noWorkersForWorkshop") : t("workers.noWorkers")}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {displayedWorkers.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    owedAmount={getWorkerOwedAmount(worker.id)}
                    isSelected={selectedWorkerIds.has(worker.id)}
                    onSelect={(checked) => toggleWorkerSelection(worker.id, checked)}
                    onClick={() => setSelectedWorker(worker)}
                    onEdit={(e) => openEdit(worker, e)}
                    onToggleStatus={(e) => {
                      e.stopPropagation();
                      setWorkerToToggle(worker);
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setWorkerToDelete(worker);
                    }}
                    workshopBreakdown={Object.entries(owedBreakdownByWorker[worker.id] || {}).map(
                      ([workshopId, info]) => ({
                        id: workshopId,
                        name: info.name,
                        amount: info.amount,
                      }),
                    )}
                    selectedWorkshopId={selectedWorkshopId}
                    weeklyBonus={weeklyBonusByWorker[worker.id] || 0}
                    weeklyDiscount={weeklyDiscountByWorker[worker.id] || 0}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Worker Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("workers.addWorker")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("workers.workerName")}</Label>
                <Input
                  id="name"
                  placeholder={t("workers.workerName")}
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">{t("attendance.dailyRate")} (CFA)</Label>
                <Input
                  id="rate"
                  type="number"
                  min="1"
                  placeholder="1000"
                  value={workerRate}
                  onChange={(e) => setWorkerRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workers.category")}</Label>
                <Select value={workerCategory} onValueChange={setWorkerCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKER_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {t(`workers.categories.${cat}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={!workerName.trim() || !workerRate || addWorker.isPending}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {addWorker.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("common.add")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Worker Dialog */}
        <Dialog open={!!editingWorker} onOpenChange={(open) => !open && setEditingWorker(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("workers.editWorker")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("workers.workerName")}</Label>
                <Input
                  id="edit-name"
                  placeholder={t("workers.workerName")}
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rate">{t("attendance.dailyRate")} (CFA)</Label>
                <Input
                  id="edit-rate"
                  type="number"
                  min="1"
                  placeholder="1000"
                  value={workerRate}
                  onChange={(e) => setWorkerRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workers.category")}</Label>
                <Select value={workerCategory} onValueChange={setWorkerCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKER_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {t(`workers.categories.${cat}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingWorker(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!workerName.trim() || !workerRate || updateWorker.isPending}>
                  {updateWorker.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Toggle Status Confirmation */}
        <AlertDialog open={!!workerToToggle} onOpenChange={(open) => !open && setWorkerToToggle(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {workerToToggle?.is_active ? t("workers.deactivateConfirm") : t("workers.activateConfirm")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {workerToToggle?.is_active
                  ? t("workers.deactivateWarning", { name: workerToToggle?.name })
                  : t("workers.activateWarning", { name: workerToToggle?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  workerToToggle &&
                  toggleWorkerStatus.mutate({
                    id: workerToToggle.id,
                    is_active: !workerToToggle.is_active,
                  })
                }
                className={
                  workerToToggle?.is_active
                    ? "bg-warning text-warning-foreground hover:bg-warning/90"
                    : "bg-success text-success-foreground hover:bg-success/90"
                }
              >
                {workerToToggle?.is_active ? t("workers.deactivate") : t("workers.activate")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Worker Confirmation */}
        <AlertDialog open={!!workerToDelete} onOpenChange={(open) => !open && setWorkerToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("workers.deleteConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("workers.deleteWarning", { name: workerToDelete?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => workerToDelete && deleteWorker.mutate(workerToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Pay Selected Workers Dialog */}
        <Dialog open={isPaySelectedOpen} onOpenChange={setIsPaySelectedOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("workers.paySelectedWorkers")}</DialogTitle>
              <DialogDescription>
                {t("workers.paySelectedDescription", { count: selectedWorkerCount })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Selected workers list */}
              <div className="text-sm">
                <p className="text-muted-foreground mb-2">{t("workers.workersIncluded")}:</p>
                <div className="flex flex-wrap gap-1">
                  {workers
                    .filter((w) => selectedWorkerIdsForDisplay.has(w.id))
                    .map((w) => (
                      <Badge key={w.id} variant="secondary" className="text-xs">
                        {w.name}
                      </Badge>
                    ))}
                </div>
              </div>

              {/* Breakdown by workshop */}
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">{t("workers.paymentSummary")}:</p>
                {Object.entries(selectedByWorkshop).map(([workshopId, { name, total }]) => (
                  <div key={workshopId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono font-medium">{total.toLocaleString("fr-FR")} CFA</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>{t("common.total")}</span>
                  <span className="font-mono text-warning">{selectedTotalOwed.toLocaleString("fr-FR")} CFA</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t("workers.weeklyPaymentNote")}</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPaySelectedOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => paySelectedWorkers.mutate()}
                disabled={paySelectedWorkers.isPending || selectedTotalOwed === 0}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {paySelectedWorkers.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("workers.confirmPayment")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
