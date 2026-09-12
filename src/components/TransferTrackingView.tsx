import React, { useState } from 'react';
import {
  TransferIn,
  TransferOutOrder,
  Material,
  District,
  DISTRICTS,
  DISTRICT_LABELS,
  TransferInStatus,
  DistrictAllocation,
} from '../types';
import {
  createTransferIn,
  createTransferInMulti,
  updateTransferInStep,
  deleteTransferIn,
  deleteTransferInByDdoc,
  createTransferOutOrder,
  updateTransferOutInline,
  dispatchTransferOut,
  deleteTransferOutOrder,
  exportDataToExcel,
} from '../lib/storage';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Truck,
  Trash2,
  X,
  Building2,
  Send,
  Check,
  AlertTriangle,
  RefreshCw,
  Search,
  Calendar,
  Layers,
  FileText,
  Edit3,
} from 'lucide-react';

interface TransferTrackingViewProps {
  transfersIn: TransferIn[];
  transfersOut: TransferOutOrder[];
  materials: Material[];
  onRefresh: () => Promise<void>;
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

export const TransferTrackingView: React.FC<TransferTrackingViewProps> = ({
  transfersIn,
  transfersOut,
  materials,
  onRefresh,
  showNotification,
}) => {
  const [subTab, setSubTab] = useState<'incoming' | 'outgoing'>('incoming');

  // --- Incoming (Part 1: Transfer In) States ---
  const [showAddInModal, setShowAddInModal] = useState(false);
  const [inDdocNo, setInDdocNo] = useState('');
  const [inItems, setInItems] = useState<Array<{ material_id: string; demand_qty: number }>>([
    { material_id: materials[0]?.id || '', demand_qty: 100 },
  ]);
  const [inSearchQuery, setInSearchQuery] = useState('');
  const [inStatusFilter, setInStatusFilter] = useState<'all' | 'pending' | 'received'>('all');

  // Multi-district & STO & Transport Modal for Incoming Material
  const [activeInTransfer, setActiveInTransfer] = useState<TransferIn | null>(null);
  const [allocationsList, setAllocationsList] = useState<
    Array<{
      district: District;
      quantity: number;
      sto_no: string;
      transport_method: string;
      transport_date: string;
    }>
  >([]);
  const [isProcessingIn, setIsProcessingIn] = useState(false);

  // Delete DDOC Confirmation State
  const [ddocToDelete, setDdocToDelete] = useState<string | null>(null);
  const [isDeletingDdoc, setIsDeletingDdoc] = useState(false);

  // --- Outgoing (Part 2: Transfer Out) States ---
  const [showAddOutModal, setShowAddOutModal] = useState(false);
  const [outDocNo, setOutDocNo] = useState('');
  const [outDocDate, setOutDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [outCoordinator, setOutCoordinator] = useState('');
  const [outDestinationDistrict, setOutDestinationDistrict] = useState<District>('ต2');
  const [outStoNo, setOutStoNo] = useState('');
  const [outItems, setOutItems] = useState<Array<{ material_id: string; transfer_qty: number }>>([
    { material_id: materials[0]?.id || '', transfer_qty: 10 },
  ]);
  const [isProcessingOut, setIsProcessingOut] = useState(false);

  // STO Inline editing state for Outgoing
  const [editingStoId, setEditingStoId] = useState<string | null>(null);
  const [inlineStoVal, setInlineStoVal] = useState('');
  const [dispatchingOrderId, setDispatchingOrderId] = useState<string | null>(null);

  // Delete Confirmation Modal States
  const [transferInToDelete, setTransferInToDelete] = useState<TransferIn | null>(null);
  const [isDeletingIn, setIsDeletingIn] = useState(false);
  const [transferOutToDelete, setTransferOutToDelete] = useState<TransferOutOrder | null>(null);
  const [isDeletingOut, setIsDeletingOut] = useState(false);

  // ==========================================
  // INCOMING TRANSFERS HANDLERS (Multi-Item & Multi-District)
  // ==========================================
  const handleOpenAddInModal = (presetDdoc?: string) => {
    setInDdocNo(presetDdoc || '');
    setInItems([{ material_id: materials[0]?.id || '', demand_qty: 100 }]);
    setShowAddInModal(true);
  };

  const handleAddInItemRow = () => {
    const used = new Set(inItems.map((it) => it.material_id));
    const nextMat = materials.find((m) => !used.has(m.id)) || materials[0];
    setInItems([...inItems, { material_id: nextMat?.id || '', demand_qty: 100 }]);
  };

  const handleRemoveInItemRow = (index: number) => {
    if (inItems.length <= 1) {
      showNotification('ต้องมีรายการพัสดุอย่างน้อย 1 รายการ', 'error');
      return;
    }
    setInItems(inItems.filter((_, i) => i !== index));
  };

  const handleUpdateInItem = (index: number, field: 'material_id' | 'demand_qty', val: any) => {
    const updated = [...inItems];
    updated[index] = { ...updated[index], [field]: val };
    setInItems(updated);
  };

  const handleCreateTransferIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inDdocNo.trim()) {
      showNotification('กรุณากรอกเลขที่หนังสือ DDOC', 'error');
      return;
    }
    for (const it of inItems) {
      const q = Number(it.demand_qty);
      if (isNaN(q) || q <= 0) {
        showNotification('จำนวนที่ต้องการขอจัดสรรต้องมากกว่า 0 ทุกรายการ', 'error');
        return;
      }
    }

    const matSet = new Set<string>();
    for (const it of inItems) {
      if (matSet.has(it.material_id)) {
        showNotification(`มีรหัสพัสดุซ้ำกันในรายการ: ${it.material_id}`, 'error');
        return;
      }
      matSet.add(it.material_id);
    }

    setIsProcessingIn(true);
    try {
      const res = await createTransferInMulti({
        ddoc_no: inDdocNo.trim(),
        items: inItems,
      });

      if (res.success) {
        showNotification(
          `บันทึกขอจัดสรร DDOC ${inDdocNo.trim()} สำเร็จ (${inItems.length} ชนิดพัสดุ)`,
          'success'
        );
        setShowAddInModal(false);
        setInDdocNo('');
        setInItems([{ material_id: materials[0]?.id || '', demand_qty: 100 }]);
        await onRefresh();
      } else {
        showNotification(res.error || 'สร้างรายการไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsProcessingIn(false);
    }
  };

  const handleOpenAllocationModal = (transfer: TransferIn) => {
    setActiveInTransfer(transfer);
    const today = new Date().toISOString().split('T')[0];

    if (transfer.allocations && transfer.allocations.length > 0) {
      setAllocationsList(
        transfer.allocations.map((a) => ({
          district: a.district,
          quantity: Number(a.quantity) || 0,
          sto_no: a.sto_no || transfer.sto_no || '',
          transport_method: a.transport_method || transfer.transport_method || 'รถบรรทุกการไฟฟ้า',
          transport_date: a.transport_date || today,
        }))
      );
    } else if (transfer.origin_district) {
      setAllocationsList([
        {
          district: transfer.origin_district,
          quantity: transfer.allocated_qty || transfer.demand_qty,
          sto_no: transfer.sto_no || '',
          transport_method: transfer.transport_method || 'รถบรรทุกการไฟฟ้า',
          transport_date: today,
        },
      ]);
    } else {
      setAllocationsList([
        {
          district: 'น1',
          quantity: transfer.demand_qty,
          sto_no: '',
          transport_method: 'รถบรรทุกการไฟฟ้า',
          transport_date: today,
        },
      ]);
    }
  };

  const handleAddAllocationRow = () => {
    if (!activeInTransfer) return;
    const usedDistricts = new Set(allocationsList.map((a) => a.district));
    const nextDistrict = DISTRICTS.find((d) => !usedDistricts.has(d)) || 'น1';
    const currentTotal = allocationsList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const remaining = Math.max(0, activeInTransfer.demand_qty - currentTotal);
    const today = new Date().toISOString().split('T')[0];
    setAllocationsList([
      ...allocationsList,
      {
        district: nextDistrict,
        quantity: remaining,
        sto_no: '',
        transport_method: 'รถบรรทุกการไฟฟ้า',
        transport_date: today,
      },
    ]);
  };

  const handleRemoveAllocationRow = (index: number) => {
    if (allocationsList.length <= 1) {
      showNotification('ต้องระบุอย่างน้อย 1 เขต', 'error');
      return;
    }
    setAllocationsList(allocationsList.filter((_, i) => i !== index));
  };

  const handleUpdateAllocationRow = (
    index: number,
    field: 'district' | 'quantity' | 'sto_no' | 'transport_method' | 'transport_date',
    value: any
  ) => {
    const updated = [...allocationsList];
    if (field === 'district') {
      const isDuplicate = allocationsList.some((item, i) => i !== index && item.district === value);
      if (isDuplicate) {
        showNotification(`เขต ${DISTRICT_LABELS[value as District] || value} ถูกเลือกแล้วในแถวอื่น`, 'error');
        return;
      }
    }
    updated[index] = { ...updated[index], [field]: value };
    setAllocationsList(updated);
  };

  const handleSaveAllocations = async (andReceive: boolean = false) => {
    if (!activeInTransfer) return;

    const districtSet = new Set<string>();
    for (const itm of allocationsList) {
      if (districtSet.has(itm.district)) {
        showNotification(`ห้ามเลือกเขตซ้ำกัน (${DISTRICT_LABELS[itm.district] || itm.district})`, 'error');
        return;
      }
      districtSet.add(itm.district);

      if (itm.quantity <= 0) {
        showNotification('จำนวนที่จัดสรรของแต่ละเขตต้องมากกว่า 0', 'error');
        return;
      }
    }

    const totalAlloc = allocationsList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    if (totalAlloc <= 0) {
      showNotification('ยอดจัดสรรรวมต้องมากกว่า 0', 'error');
      return;
    }

    if (totalAlloc > activeInTransfer.demand_qty) {
      showNotification(
        `ยอดจัดสรรรวม (${totalAlloc.toLocaleString()}) เกินจำนวนที่ขอ (${activeInTransfer.demand_qty.toLocaleString()})`,
        'error'
      );
      return;
    }

    setIsProcessingIn(true);
    try {
      const updates: Partial<TransferIn> = {
        allocations: allocationsList.map((a) => ({
          district: a.district,
          quantity: Number(a.quantity) || 0,
          sto_no: a.sto_no.trim() || undefined,
          transport_method: a.transport_method.trim() || undefined,
          transport_date: a.transport_date || undefined,
          is_received: andReceive ? true : undefined,
        })),
        allocated_qty: totalAlloc,
        origin_district: allocationsList[0]?.district,
        sto_no: allocationsList.map((a) => a.sto_no.trim()).filter(Boolean).join(', ') || undefined,
        transport_method: allocationsList.map((a) => a.transport_method.trim()).filter(Boolean).join(', ') || undefined,
      };

      if (andReceive) {
        if (activeInTransfer.stock_updated) {
          showNotification('รายการนี้รับเข้าสต็อกแล้ว', 'error');
          setIsProcessingIn(false);
          return;
        }
        updates.status = 'RECEIVED';
        updates.received_qty = totalAlloc;
      } else {
        const hasAllSto = allocationsList.every((a) => a.sto_no && a.sto_no.trim().length > 0);
        const hasTransport = allocationsList.some((a) => a.transport_method && a.transport_method.trim().length > 0);
        if (hasTransport) {
          updates.status = 'IN_TRANSIT';
        } else if (hasAllSto) {
          updates.status = 'STO_ISSUED';
        } else {
          updates.status = 'ALLOCATED';
        }
      }

      const res = await updateTransferInStep(activeInTransfer.id, updates);
      if (res.success) {
        showNotification(
          andReceive
            ? `ตรวจรับพัสดุเข้าคลังเรียบร้อย และเพิ่ม Stock ${totalAlloc.toLocaleString()} หน่วย (ตามยอดจัดสรรจริง)`
            : `บันทึกข้อมูลการจัดสรร (${allocationsList.length} เขต) เรียบร้อย`,
          'success'
        );
        setActiveInTransfer(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'บันทึกล้มเหลว', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'บันทึกล้มเหลว', 'error');
    } finally {
      setIsProcessingIn(false);
    }
  };

  const handleDirectReceiveIn = async (item: TransferIn) => {
    const totalAlloc =
      item.allocated_qty !== undefined && item.allocated_qty > 0
        ? item.allocated_qty
        : item.allocations?.reduce((s, a) => s + (Number(a.quantity) || 0), 0) || 0;

    if (totalAlloc <= 0) {
      showNotification('กรุณาระบุเขตและจำนวนที่จัดสรรก่อนรับเข้าคลัง', 'error');
      handleOpenAllocationModal(item);
      return;
    }

    setIsProcessingIn(true);
    try {
      const res = await updateTransferInStep(item.id, {
        status: 'RECEIVED',
        allocated_qty: totalAlloc,
        received_qty: totalAlloc,
      });
      if (res.success) {
        showNotification(
          `ตรวจรับพัสดุเข้าคลังเรียบร้อย (+Stock เพิ่ม ${totalAlloc.toLocaleString()} หน่วย)`,
          'success'
        );
        await onRefresh();
      } else {
        showNotification(res.error || 'ตรวจรับไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการตรวจรับ', 'error');
    } finally {
      setIsProcessingIn(false);
    }
  };

  const handleConfirmDeleteDdoc = async () => {
    if (!ddocToDelete) return;
    setIsDeletingDdoc(true);
    try {
      const res = await deleteTransferInByDdoc(ddocToDelete);
      if (res.success) {
        showNotification(`ลบรายการ DDOC: ${ddocToDelete} ทั้งหมดสำเร็จ`, 'success');
        setDdocToDelete(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'ลบไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการลบ DDOC', 'error');
    } finally {
      setIsDeletingDdoc(false);
    }
  };

  const groupedTransfersIn = React.useMemo(() => {
    const map = new Map<
      string,
      {
        ddoc_no: string;
        items: TransferIn[];
        created_at: string;
        totalDemand: number;
        totalAllocated: number;
        allStockUpdated: boolean;
        hasStockUpdated: boolean;
      }
    >();

    for (const t of transfersIn) {
      const key = t.ddoc_no.trim();
      if (!map.has(key)) {
        map.set(key, {
          ddoc_no: key,
          items: [],
          created_at: t.created_at,
          totalDemand: 0,
          totalAllocated: 0,
          allStockUpdated: true,
          hasStockUpdated: false,
        });
      }
      const group = map.get(key)!;
      group.items.push(t);
      group.totalDemand += Number(t.demand_qty) || 0;
      const alloc =
        t.allocated_qty !== undefined && t.allocated_qty > 0
          ? t.allocated_qty
          : t.allocations?.reduce((s, a) => s + (Number(a.quantity) || 0), 0) || 0;
      group.totalAllocated += alloc;
      if (t.stock_updated) {
        group.hasStockUpdated = true;
      } else {
        group.allStockUpdated = false;
      }
    }

    let result = Array.from(map.values());

    if (inSearchQuery.trim()) {
      const q = inSearchQuery.trim().toLowerCase();
      result = result
        .map((group) => {
          const matchesDdoc = group.ddoc_no.toLowerCase().includes(q);
          if (matchesDdoc) return group;
          const matchingItems = group.items.filter(
            (it) =>
              it.material_id.toLowerCase().includes(q) ||
              it.material_description.toLowerCase().includes(q) ||
              it.allocations?.some(
                (a) =>
                  a.sto_no?.toLowerCase().includes(q) ||
                  a.transport_method?.toLowerCase().includes(q) ||
                  a.transport_date?.toLowerCase().includes(q) ||
                  a.district.toLowerCase().includes(q)
              )
          );
          if (matchingItems.length > 0) {
            return { ...group, items: matchingItems };
          }
          return null;
        })
        .filter(Boolean) as typeof result;
    }

    if (inStatusFilter === 'pending') {
      result = result.filter((g) => !g.allStockUpdated);
    } else if (inStatusFilter === 'received') {
      result = result.filter((g) => g.hasStockUpdated);
    }

    return result;
  }, [transfersIn, inSearchQuery, inStatusFilter]);

  const handleDeleteTransferIn = (transfer: TransferIn) => {
    setTransferInToDelete(transfer);
  };

  const handleConfirmDeleteTransferIn = async () => {
    if (!transferInToDelete) return;
    setIsDeletingIn(true);
    try {
      const res = await deleteTransferIn(transferInToDelete.id);
      if (res.success) {
        showNotification(`ลบรายการ DDOC: ${transferInToDelete.ddoc_no} สำเร็จ`, 'success');
        setTransferInToDelete(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'ลบล้มเหลว', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการลบ', 'error');
    } finally {
      setIsDeletingIn(false);
    }
  };

  // ==========================================
  // OUTGOING TRANSFERS HANDLERS (ต.1 -> Other)
  // ==========================================
  const handleAddOutItemRow = () => {
    setOutItems([...outItems, { material_id: materials[0]?.id || '', transfer_qty: 1 }]);
  };

  const handleRemoveOutItemRow = (idx: number) => {
    setOutItems(outItems.filter((_, i) => i !== idx));
  };

  const handleCreateTransferOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outDocNo.trim()) {
      showNotification('กรุณากรอกเลขที่หนังสือขอรับโอน', 'error');
      return;
    }
    if (!outCoordinator.trim()) {
      showNotification('กรุณากรอกชื่อผู้ประสานงาน', 'error');
      return;
    }
    if (outItems.length === 0) {
      showNotification('กรุณาเพิ่มรายการพัสดุอย่างน้อย 1 รายการ', 'error');
      return;
    }

    setIsProcessingOut(true);
    try {
      const res = await createTransferOutOrder({
        doc_no: outDocNo.trim(),
        doc_date: outDocDate,
        coordinator: outCoordinator.trim(),
        destination_district: outDestinationDistrict,
        sto_no: outStoNo.trim() || undefined,
        items: outItems,
      });

      if (res.success) {
        showNotification(`บันทึกรายการโอนพัสดุไปยังเขต ${outDestinationDistrict} สำเร็จ`, 'success');
        setShowAddOutModal(false);
        setOutDocNo('');
        setOutCoordinator('');
        setOutStoNo('');
        setOutItems([{ material_id: materials[0]?.id || '', transfer_qty: 10 }]);
        await onRefresh();
      } else {
        showNotification(res.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'บันทึกล้มเหลว', 'error');
    } finally {
      setIsProcessingOut(false);
    }
  };

  // 8.4 STO Inline Save
  const handleSaveInlineSto = async (orderId: string) => {
    if (!inlineStoVal.trim()) {
      setEditingStoId(null);
      return;
    }
    const res = await updateTransferOutInline(orderId, { sto_no: inlineStoVal.trim() });
    if (res.success) {
      showNotification('บันทึกเลขที่ STO สำเร็จ', 'success');
      setEditingStoId(null);
      await onRefresh();
    } else {
      showNotification(res.error || 'บันทึก STO ไม่สำเร็จ', 'error');
    }
  };

  // 8.5 Checklist พับหลัง กบพ.(ต.1)
  const handleToggleFoldedBack = async (order: TransferOutOrder) => {
    const newVal = !order.folded_back_checked;
    const res = await updateTransferOutInline(order.id, { folded_back_checked: newVal });
    if (res.success) {
      showNotification(newVal ? '✓ เช็คสถานะพับหลัง กบพ.(ต.1) เรียบร้อย' : 'ยกเลิกการเช็คพับหลัง', 'success');
      await onRefresh();
    } else {
      showNotification(res.error || 'อัปเดตไม่สำเร็จ', 'error');
    }
  };

  // 8.6 ตัดจ่ายคลัง: กดปุ่มแล้ว รายการโอนทั้งหมดจะนับเป็นการ ตัดจ่ายคลังลด Stock ทันที
  const handleDispatchOrder = async (order: TransferOutOrder) => {
    if (dispatchingOrderId) return;
    setDispatchingOrderId(order.id);
    try {
      const res = await dispatchTransferOut(order.id);
      if (res.success) {
        showNotification(
          `ตัดจ่ายพัสดุออกจากคลัง ต.1 สำเร็จ (ลด Stock เรียบร้อย ${order.items.length} รายการ)`,
          'success'
        );
        await onRefresh();
      } else {
        showNotification(res.error || 'ตัดจ่ายไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'เกิดข้อผิดพลาดในการตัดจ่ายคลัง', 'error');
    } finally {
      setDispatchingOrderId(null);
    }
  };

  // 8.7 ลบรายการ
  const handleDeleteTransferOut = (order: TransferOutOrder) => {
    setTransferOutToDelete(order);
  };

  const handleConfirmDeleteTransferOut = async () => {
    if (!transferOutToDelete) return;
    setIsDeletingOut(true);
    try {
      const res = await deleteTransferOutOrder(transferOutToDelete.id);
      if (res.success) {
        showNotification(`ลบรายการโอนหนังสือ ${transferOutToDelete.doc_no} เรียบร้อย`, 'success');
        setTransferOutToDelete(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'ไม่สามารถลบรายการได้', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการลบรายการ', 'error');
    } finally {
      setIsDeletingOut(false);
    }
  };

  // Export Excel
  const handleExportTracking = () => {
    if (subTab === 'incoming') {
      const exportData = transfersIn.map((t) => {
        const districtStr =
          t.allocations && t.allocations.length > 0
            ? t.allocations
                .map((a) => `${DISTRICT_LABELS[a.district] || a.district} = ${a.quantity.toLocaleString()}`)
                .join(', ')
            : t.origin_district
            ? `${DISTRICT_LABELS[t.origin_district] || t.origin_district} = ${(t.allocated_qty || t.demand_qty).toLocaleString()}`
            : '-';

        const allocatedTot = t.allocated_qty || 0;
        const receivedSt1 = t.stock_updated ? allocatedTot : 0;
        const statusStr = t.stock_updated
          ? allocatedTot >= t.demand_qty
            ? 'รับครบ'
            : `จัดสรรไม่ครบ / รับบางส่วน (${allocatedTot}/${t.demand_qty})`
          : t.status === 'IN_TRANSIT'
          ? 'กำลังขนย้าย'
          : t.status === 'STO_ISSUED'
          ? 'ออก STO แล้ว'
          : t.status === 'ALLOCATED'
          ? 'เขตจัดสรรแล้ว'
          : 'ขอจัดสรร DDOC';

        return {
          'เลขที่ DDOC': t.ddoc_no,
          'รหัสวัสดุ': t.material_id,
          'คำอธิบาย': t.material_description,
          'จำนวนที่ขอ': t.demand_qty,
          'เขตที่จัดสรร': districtStr,
          'จัดสรรรวม': allocatedTot,
          'รับเข้า ต.1': receivedSt1,
          'เลขที่ STO': t.sto_no || '-',
          'วิธีขนย้าย': t.transport_method || '-',
          'สถานะ': statusStr,
          'วันที่ตรวจรับ': t.received_at || '-',
        };
      });
      exportDataToExcel(exportData, 'TransferInTracking', 'WMS_Transfer_In_Tracking');
    } else {
      const exportData = transfersOut.flatMap((o) =>
        o.items.map((it) => ({
          'เลขที่หนังสือ': o.doc_no,
          'วันที่': o.doc_date,
          'ผู้ประสานงาน': o.coordinator,
          'เขตปลายทาง': o.destination_district,
          'รหัสวัสดุ': it.material_id,
          'คำอธิบาย': it.material_description,
          'ยอดโอน': it.transfer_qty,
          'STO': o.sto_no || '-',
          'พับหลัง กบพ.(ต.1)': o.folded_back_checked ? 'พับหลังแล้ว' : 'ยังไม่พับ',
          'ตัดจ่ายคลัง': o.is_dispatched ? 'ตัดจ่ายแล้ว' : 'ยังไม่ตัดจ่าย',
          'วันที่ตัดจ่าย': o.dispatched_at || '-',
        }))
      );
      exportDataToExcel(exportData, 'TransferOutTracking', 'WMS_Transfer_Out_Tracking');
    }
    showNotification('ส่งออกตาราง Tracking เป็น Excel สำเร็จ', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Export */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200/80 pb-3 gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setSubTab('incoming')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              subTab === 'incoming'
                ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-sky-600" />
            <span>7. Tracking การรับโอนจากเขตอื่น ({transfersIn.length})</span>
          </button>
          <button
            onClick={() => setSubTab('outgoing')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              subTab === 'outgoing'
                ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-sky-600" />
            <span>8. Tracking การโอนของจาก ต.1 ไปยังเขตอื่น ({transfersOut.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => (subTab === 'incoming' ? setShowAddInModal(true) : setShowAddOutModal(true))}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{subTab === 'incoming' ? 'ขอจัดสรร DDOC ใหม่' : 'สร้างใบโอนของออก (ต.1)'}</span>
          </button>

          <button
            onClick={handleExportTracking}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PART 1: Tracking การรับโอนของจากเขตอื่น (INCOMING)        */}
      {/* ======================================================== */}
      {subTab === 'incoming' && (
        <div className="space-y-4">
          {/* Minimalist Compact Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white/90 px-3.5 py-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-slate-500 block">เลขที่ DDOC ทั้งหมด</span>
              <div className="text-base sm:text-lg font-bold text-slate-800 font-mono mt-0.5 flex items-baseline gap-1">
                {groupedTransfersIn.length} <span className="text-2xs font-normal text-slate-400">DDOC ({transfersIn.length} ชนิดพัสดุ)</span>
              </div>
            </div>
            <div className="bg-amber-50/50 px-3.5 py-2.5 rounded-xl border border-amber-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-amber-800 block">อยู่ระหว่างดำเนินการ</span>
              <div className="text-base sm:text-lg font-bold text-amber-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersIn.filter((t) => !t.stock_updated).length}{' '}
                <span className="text-2xs font-normal text-amber-700/70">รายการ</span>
              </div>
            </div>
            <div className="bg-teal-50/50 px-3.5 py-2.5 rounded-xl border border-teal-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-teal-800 block">ตรวจรับแล้ว (+Stock)</span>
              <div className="text-base sm:text-lg font-bold text-teal-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersIn.filter((t) => t.stock_updated).length}{' '}
                <span className="text-2xs font-normal text-teal-700/70">รายการ</span>
              </div>
            </div>
            <div className="bg-sky-50/50 px-3.5 py-2.5 rounded-xl border border-sky-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-sky-800 block">ยอดรับเข้า ต.1 รวม</span>
              <div className="text-base sm:text-lg font-bold text-sky-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersIn
                  .filter((t) => t.stock_updated)
                  .reduce((s, t) => s + (t.allocated_qty || 0), 0)
                  .toLocaleString()}{' '}
                <span className="text-2xs font-normal text-sky-700/70">หน่วย</span>
              </div>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={inSearchQuery}
                onChange={(e) => setInSearchQuery(e.target.value)}
                placeholder="ค้นหาเลข DDOC, รหัสพัสดุ, ชื่อพัสดุ, เลข STO, เขต..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400 focus:outline-none"
              />
              {inSearchQuery && (
                <button
                  onClick={() => setInSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setInStatusFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  inStatusFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ทั้งหมด ({groupedTransfersIn.length} DDOC)
              </button>
              <button
                onClick={() => setInStatusFilter('pending')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  inStatusFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
                }`}
              >
                รอตรวจรับ
              </button>
              <button
                onClick={() => setInStatusFilter('received')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  inStatusFilter === 'received'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200/60'
                }`}
              >
                ตรวจรับแล้ว (+Stock)
              </button>
            </div>
          </div>

          {/* Master Table Grouped by DDOC */}
          {groupedTransfersIn.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">ไม่พบรายการขอรับโอนพัสดุจากเขตอื่น</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {inSearchQuery
                  ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา ลองเปลี่ยนคำค้นหาหรือตัวกรอง'
                  : 'ยังไม่มีข้อมูลการขอรับโอน คลิกปุ่ม "+ ขอจัดสรร DDOC ใหม่" ด้านบนเพื่อเริ่มทำรายการ'}
              </p>
              {!inSearchQuery && (
                <button
                  onClick={() => handleOpenAddInModal()}
                  className="mt-4 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>ขอจัดสรร DDOC ใหม่ (Multi-Item)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedTransfersIn.map((group) => (
                <div
                  key={group.ddoc_no}
                  className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs transition-shadow hover:shadow-xs"
                >
                  {/* DDOC Header Banner */}
                  <div className="p-3.5 sm:p-4 bg-slate-50/90 border-b border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 rounded-xl shadow-3xs font-mono font-bold text-slate-900 text-xs">
                        <FileText className="w-3.5 h-3.5 text-sky-600" />
                        <span>DDOC: {group.ddoc_no}</span>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {group.items.length} ชนิดพัสดุ
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                        ยอดขอรวม: {group.totalDemand.toLocaleString()} หน่วย
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                        จัดสรรแล้ว: {group.totalAllocated.toLocaleString()} หน่วย
                      </span>

                      {/* Overall DDOC Status Badge */}
                      {group.allStockUpdated ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ตรวจรับเข้าคลังครบ 100% แล้ว</span>
                        </span>
                      ) : group.hasStockUpdated ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3 h-3" />
                          <span>ตรวจรับเข้าคลังบางส่วน</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                          <Clock className="w-3 h-3" />
                          <span>อยู่ระหว่างดำเนินการ</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        onClick={() => handleOpenAddInModal(group.ddoc_no)}
                        className="px-2.5 py-1 text-2xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg cursor-pointer inline-flex items-center gap-1 transition-colors"
                        title="เพิ่มพัสดุชนิดอื่นใน DDOC เลขนี้"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ เพิ่มพัสดุใน DDOC นี้</span>
                      </button>

                      <button
                        onClick={() => setDdocToDelete(group.ddoc_no)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                        title="ลบทั้ง DDOC นี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-Item Table under DDOC */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
                      <thead className="bg-white text-slate-500 font-semibold uppercase text-2xs border-b border-slate-200/80">
                        <tr>
                          <th className="py-2.5 px-4 w-52">รหัส & ชื่อพัสดุ</th>
                          <th className="py-2.5 px-3 text-right w-24">ยอดที่ขอ</th>
                          <th className="py-2.5 px-4">รายละเอียดจัดสรรแยกตามเขต (เขต / ยอดจัดสรร / เลขที่ STO / ขนย้าย / วันที่ขนย้าย)</th>
                          <th className="py-2.5 px-3 text-center w-28">จัดสรรรวม & สถานะ</th>
                          <th className="py-2.5 px-3 text-center w-36">ตรวจรับเข้า ต.1 (+Stock)</th>
                          <th className="py-2.5 px-3 text-center w-24">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {group.items.map((item) => {
                          const totalAlloc =
                            item.allocated_qty !== undefined && item.allocated_qty > 0
                              ? item.allocated_qty
                              : item.allocations && item.allocations.length > 0
                              ? item.allocations.reduce((s, a) => s + (Number(a.quantity) || 0), 0)
                              : 0;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                              {/* รหัส & ชื่อพัสดุ */}
                              <td className="py-3 px-4 font-sans align-top">
                                <div className="font-mono font-bold text-slate-900 text-xs">
                                  {item.material_id}
                                </div>
                                <div className="text-2xs text-slate-500 font-sans mt-0.5 line-clamp-2">
                                  {item.material_description}
                                </div>
                              </td>

                              {/* ยอดที่ขอ */}
                              <td className="py-3 px-3 text-right font-bold text-slate-900 text-sm align-top">
                                {item.demand_qty.toLocaleString()}
                                <div className="text-3xs font-normal text-slate-400 font-sans">หน่วย</div>
                              </td>

                              {/* รายละเอียดจัดสรรแยกตามเขต (Multi-District, STO, Transport Method, Transport Date) */}
                              <td className="py-2.5 px-4 font-sans align-top">
                                {item.allocations && item.allocations.length > 0 ? (
                                  <div className="space-y-1.5">
                                    <div className="rounded-xl border border-slate-200/80 overflow-hidden bg-slate-50/60 shadow-3xs">
                                      <table className="w-full text-left text-2xs divide-y divide-slate-200/60">
                                        <thead className="bg-slate-100/90 text-slate-600 font-semibold uppercase">
                                          <tr>
                                            <th className="py-1 px-2.5">เขต</th>
                                            <th className="py-1 px-2.5 text-right">จำนวนจัดสรร</th>
                                            <th className="py-1 px-2.5">เลขที่ STO</th>
                                            <th className="py-1 px-2.5">วิธีขนย้าย</th>
                                            <th className="py-1 px-2.5">วันที่ขนย้าย</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white font-sans">
                                          {item.allocations.map((alloc, aIdx) => (
                                            <tr key={aIdx} className="hover:bg-slate-50/80">
                                              <td className="py-1.5 px-2.5">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-bold bg-sky-100/80 text-sky-800 border border-sky-200/70">
                                                  {DISTRICT_LABELS[alloc.district] || alloc.district}
                                                </span>
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-800">
                                                {alloc.quantity.toLocaleString()} <span className="text-3xs font-normal text-slate-400">หน่วย</span>
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono">
                                                {alloc.sto_no ? (
                                                  <span className="text-slate-900 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/70 text-3xs">
                                                    STO: {alloc.sto_no}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 italic text-3xs">ยังไม่ระบุ</span>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-slate-600 truncate max-w-[130px]">
                                                {alloc.transport_method || <span className="text-slate-400 italic text-3xs">-</span>}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-slate-600">
                                                {alloc.transport_date ? (
                                                  <span className="inline-flex items-center gap-1 text-3xs font-mono text-slate-700">
                                                    <Calendar className="w-3 h-3 text-slate-400" />
                                                    {alloc.transport_date}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 italic text-3xs">-</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="flex items-center justify-end">
                                      <button
                                        onClick={() => handleOpenAllocationModal(item)}
                                        className="text-2xs text-sky-600 hover:text-sky-800 font-semibold cursor-pointer inline-flex items-center gap-1 hover:underline"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                        <span>จัดการเขต / STO / ขนย้าย ({item.allocations.length} เขต)</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-1.5 flex items-center gap-2">
                                    <span className="text-2xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                                      ยังไม่ได้ระบุเขตที่จัดสรร
                                    </span>
                                    <button
                                      onClick={() => handleOpenAllocationModal(item)}
                                      className="text-2xs text-sky-700 hover:text-sky-900 font-bold px-2.5 py-1 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 cursor-pointer inline-flex items-center gap-1 transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>+ ระบุเขต & STO & ขนย้าย</span>
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* จัดสรรรวม & สถานะ */}
                              <td className="py-3 px-3 text-center font-sans align-top">
                                <div className="font-mono font-bold text-sky-700 text-sm">
                                  {totalAlloc > 0 ? totalAlloc.toLocaleString() : '-'}
                                </div>
                                <div className="mt-1">
                                  {totalAlloc >= item.demand_qty ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                      ✓ ครบ 100%
                                    </span>
                                  ) : totalAlloc > 0 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      จัดสรรบางส่วน
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold bg-slate-100 text-slate-600">
                                      รอจัดสรร
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* ตรวจรับเข้า ต.1 (+Stock) */}
                              <td className="py-3 px-3 text-center font-sans align-top">
                                {item.stock_updated ? (
                                  <div className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-2xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                                      <span>+Stock แล้ว</span>
                                    </div>
                                    <span className="font-mono text-3xs font-semibold text-teal-800">
                                      {totalAlloc.toLocaleString()} หน่วย
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleDirectReceiveIn(item)}
                                    className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold shadow-2xs cursor-pointer transition-colors inline-flex items-center gap-1"
                                    title="ตรวจรับและเพิ่ม Stock ตามยอดจัดสรรจริง"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>+Stock เข้าคลัง</span>
                                  </button>
                                )}
                              </td>

                              {/* จัดการ */}
                              <td className="py-3 px-3 text-center font-sans align-top">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleOpenAllocationModal(item)}
                                    className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg cursor-pointer transition-colors"
                                    title="แก้ไขข้อมูลเขต, STO, ขนย้าย"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTransferIn(item)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                    title="ลบพัสดุรายการนี้ออกจาก DDOC"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* PART 2: Tracking การโอนของจาก ต.1 ไปยังเขตอื่น (OUTGOING)   */}
      {/* ======================================================== */}
      {subTab === 'outgoing' && (
        <div className="space-y-4">
          {/* Minimalist Compact Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white/90 px-3.5 py-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-slate-500 block">ใบโอนออกทั้งหมด</span>
              <div className="text-base sm:text-lg font-bold text-slate-800 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersOut.length} <span className="text-2xs font-normal text-slate-400">ใบสั่ง</span>
              </div>
            </div>
            <div className="bg-amber-50/50 px-3.5 py-2.5 rounded-xl border border-amber-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-amber-800 block">รอตัดจ่ายคลัง</span>
              <div className="text-base sm:text-lg font-bold text-amber-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersOut.filter((o) => !o.is_dispatched).length}{' '}
                <span className="text-2xs font-normal text-amber-700/70">ใบสั่ง</span>
              </div>
            </div>
            <div className="bg-teal-50/50 px-3.5 py-2.5 rounded-xl border border-teal-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-teal-800 block">ตัดจ่ายคลังแล้ว</span>
              <div className="text-base sm:text-lg font-bold text-teal-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersOut.filter((o) => o.is_dispatched).length}{' '}
                <span className="text-2xs font-normal text-teal-700/70">ใบสั่ง</span>
              </div>
            </div>
            <div className="bg-sky-50/50 px-3.5 py-2.5 rounded-xl border border-sky-200/70 shadow-2xs">
              <span className="text-2xs font-medium text-sky-800 block">ยอดตัดจ่ายสะสม</span>
              <div className="text-base sm:text-lg font-bold text-sky-900 font-mono mt-0.5 flex items-baseline gap-1">
                {transfersOut
                  .filter((o) => o.is_dispatched)
                  .reduce((s, o) => s + o.items.reduce((si, it) => si + it.transfer_qty, 0), 0)
                  .toLocaleString()}{' '}
                <span className="text-2xs font-normal text-sky-700/70">หน่วย</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Tracking การโอนของจาก ต.1 ไปยังเขตอื่น (Master Table หน้าเดียว)
              </h3>
              <p className="text-xs text-slate-500">
                รองรับ Multi-Item ต่อใบสั่ง, กรอก STO Inline, Checklist พับหลัง กบพ.(ต.1), และตัดจ่ายคลังลด Stock ทันที
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              รวม {transfersOut.length} ใบสั่งโอน
            </span>
          </div>

          <div className="overflow-x-auto">
            {/* Master Table Structure from Section 8.2 */}
            <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-4">หนังสือขอรับโอน / วันที่ / ผู้ประสานงาน</th>
                  <th className="py-3 px-4">เขตปลายทาง</th>
                  <th className="py-3 px-4">รายการพัสดุ & ยอดโอน</th>
                  <th className="py-3 px-4">STO</th>
                  <th className="py-3 px-4 text-center">พับหลัง กบพ.(ต.1)</th>
                  <th className="py-3 px-4 text-center">ตัดจ่ายคลัง</th>
                  <th className="py-3 px-4 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {transfersOut.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                      ยังไม่มีรายการโอนพัสดุออกจากคลัง ต.1 คลิกปุ่ม "+ สร้างใบโอนของออก (ต.1)" ด้านบนเพื่อเริ่มทำรายการ
                    </td>
                  </tr>
                ) : (
                  transfersOut.map((order, index) => {
                    const isEditingSto = editingStoId === order.id;

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 text-slate-400 font-bold">{index + 1}</td>

                        {/* หนังสือขอรับโอน / วันที่ / ผู้ประสานงาน */}
                        <td className="py-3 px-4 font-sans">
                          <div className="font-bold text-slate-900">{order.doc_no}</div>
                          <div className="text-2xs text-slate-500">
                            วันที่: {order.doc_date} | ผู้ประสาน: {order.coordinator}
                          </div>
                        </td>

                        {/* เขตปลายทาง (Section 8.3 Badge เช่น ต.2 : นครศรีธรรมราช) */}
                        <td className="py-3 px-4 font-sans">
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200/80">
                            {DISTRICT_LABELS[order.destination_district] || order.destination_district}
                          </span>
                        </td>

                        {/* รายการพัสดุ & ยอดโอน (Section 8.1 Multi-Item) */}
                        <td className="py-3 px-4 font-sans">
                          <div className="space-y-1">
                            {order.items.map((item, itIdx) => (
                              <div key={itIdx} className="flex items-center justify-between text-2xs gap-2">
                                <span className="text-slate-700 font-mono font-medium">{item.material_id}</span>
                                <span className="font-bold text-slate-900 font-mono">
                                  {item.transfer_qty.toLocaleString()} หน่วย
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* STO Inline (Section 8.4) */}
                        <td className="py-3 px-4 font-sans">
                          {isEditingSto ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={inlineStoVal}
                                onChange={(e) => setInlineStoVal(e.target.value)}
                                placeholder="เลข STO"
                                className="w-24 px-2 py-1 text-xs border border-sky-300 rounded-lg focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveInlineSto(order.id)}
                                className="p-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-2xs cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : order.sto_no ? (
                            <div
                              onClick={() => {
                                setEditingStoId(order.id);
                                setInlineStoVal(order.sto_no || '');
                              }}
                              className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/80 cursor-pointer inline-flex items-center gap-1 hover:bg-teal-100/70 transition-colors"
                              title="คลิกเพื่อแก้ไขเลข STO"
                            >
                              <span>✓ STO: {order.sto_no}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingStoId(order.id);
                                setInlineStoVal('');
                              }}
                              className="text-xs text-slate-400 hover:text-sky-600 underline cursor-pointer"
                            >
                              + กรอก STO
                            </button>
                          )}
                        </td>

                        {/* Checklist พับหลัง กบพ.(ต.1) (Section 8.5) */}
                        <td className="py-3 px-4 text-center font-sans">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={order.folded_back_checked}
                              onChange={() => handleToggleFoldedBack(order)}
                              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                            />
                            {order.folded_back_checked && (
                              <span className="text-2xs font-bold text-teal-700">✓ พับหลังแล้ว</span>
                            )}
                          </label>
                        </td>

                        {/* ตัดจ่ายคลัง (Section 8.6) */}
                        <td className="py-3 px-4 text-center font-sans">
                          {order.is_dispatched ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ตัดจ่ายแล้ว</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDispatchOrder(order)}
                              disabled={dispatchingOrderId === order.id}
                              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-xl text-xs font-bold shadow-2xs cursor-pointer disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                            >
                              {dispatchingOrderId === order.id ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>กำลังตัดจ่าย...</span>
                                </>
                              ) : (
                                <span>ตัดจ่ายคลัง</span>
                              )}
                            </button>
                          )}
                        </td>

                        {/* จัดการ (Section 8.7: ลบจริง) */}
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => handleDeleteTransferOut(order)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="ลบรายการโอนนี้ออกจากฐานข้อมูล"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: ขอจัดสรร DDOC ใหม่ (Multi-Item)                  */}
      {/* ======================================================== */}
      {showAddInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full overflow-hidden border border-slate-200/80 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800">ขอจัดสรร DDOC ใหม่ (Multi-Item)</h3>
                <p className="text-2xs text-slate-500">ใน 1 เลข DDOC สามารถขอรับพัสดุได้หลายชนิดพร้อมกัน</p>
              </div>
              <button
                onClick={() => setShowAddInModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransferIn} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  เลขที่หนังสือ DDOC *
                </label>
                <input
                  type="text"
                  required
                  value={inDdocNo}
                  onChange={(e) => setInDdocNo(e.target.value)}
                  placeholder="เช่น DDOC-2026-0881"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400 font-mono font-bold"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    รายการพัสดุที่ขอรับโอน ({inItems.length} รายการ) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddInItemRow}
                    className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-800 font-semibold px-2.5 py-1 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200/80 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ เพิ่มพัสดุ</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {inItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80"
                    >
                      <span className="text-2xs font-mono font-bold text-slate-400 w-5 text-center">
                        {idx + 1}
                      </span>
                      <select
                        value={item.material_id}
                        onChange={(e) => handleInItemChange(idx, 'material_id', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                      >
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} : {m.description}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.demand_qty || ''}
                          onChange={(e) => handleInItemChange(idx, 'demand_qty', e.target.value)}
                          placeholder="ยอดขอ"
                          className="w-24 px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-right font-mono font-bold bg-white"
                        />
                        <span className="text-3xs text-slate-500">หน่วย</span>
                      </div>

                      {inItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInItemRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                          title="ลบแถวนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-100 flex items-center justify-between text-xs font-semibold text-sky-900">
                  <span>ยอดขอรวมทุกชนิดใน DDOC นี้:</span>
                  <span className="font-mono font-bold text-sm">
                    {inItems.reduce((sum, it) => sum + (Number(it.demand_qty) || 0), 0).toLocaleString()} หน่วย
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddInModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isProcessingIn}
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  {isProcessingIn ? 'กำลังบันทึก...' : `บันทึกขอจัดสรร (${inItems.length} รายการ)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: จัดการเขต & STO & ขนย้าย & ตรวจรับ (Multi-District) */}
      {/* ======================================================== */}
      {activeInTransfer && (() => {
        const currentAllocatedTotal = allocationsList.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0),
          0
        );
        const currentDemandDiff = activeInTransfer.demand_qty - currentAllocatedTotal;
        const isOverDemand = currentDemandDiff < 0;
        const isAllocInvalid =
          allocationsList.length === 0 ||
          currentAllocatedTotal <= 0 ||
          isOverDemand;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200/80 max-h-[92vh] flex flex-col">
              <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800">
                      จัดการจัดสรรรายเขต: {activeInTransfer.ddoc_no}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-sky-100 text-sky-800">
                      {activeInTransfer.material_id}
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500 mt-0.5">{activeInTransfer.material_description}</p>
                </div>
                <button
                  onClick={() => setActiveInTransfer(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {/* Note Banner */}
                <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl text-xs text-sky-900 flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-600 mt-1.5 shrink-0" />
                  <span>
                    พัสดุชนิดนี้สามารถขอรับมาจาก<strong>หลายเขต</strong>ได้ โดยแต่ละเขตจะมี<strong>เลขที่ STO, วิธีขนย้าย และวันที่ขนย้ายต่างกัน</strong>
                  </span>
                </div>

                {/* District Allocation Rows */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        เขตที่จัดสรรให้ ({allocationsList.length} เขต) *
                      </label>
                      <p className="text-2xs text-slate-500">
                        ระบุเขต, ยอดจัดสรร, เลขที่ STO, วิธีขนย้าย, และวันที่ขนย้ายของแต่ละเขต
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAllocationRow}
                      className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-800 font-semibold px-2.5 py-1 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200/80 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ เพิ่มเขตจัดสรร</span>
                    </button>
                  </div>

                  {allocationsList.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500 mb-2">ยังไม่ได้เพิ่มเขตที่จัดสรร</p>
                      <button
                        type="button"
                        onClick={handleAddAllocationRow}
                        className="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-bold border border-sky-200 cursor-pointer"
                      >
                        + เพิ่มเขตแรก
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {allocationsList.map((row, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2 relative"
                        >
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                            <span className="text-2xs font-bold text-slate-700">
                              เขตจัดสรรลำดับที่ {idx + 1}
                            </span>
                            {allocationsList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAllocationRow(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1 text-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>ลบเขตนี้</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">
                                เขตที่โอนให้ *
                              </label>
                              <select
                                value={row.district}
                                onChange={(e) => handleUpdateAllocationField(idx, 'district', e.target.value as District)}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-400 bg-white"
                              >
                                {DISTRICTS.map((d) => (
                                  <option key={d} value={d}>
                                    {DISTRICT_LABELS[d]}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">
                                ยอดที่เขตจัดสรรให้ *
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  value={row.quantity || ''}
                                  onChange={(e) => handleUpdateAllocationField(idx, 'quantity', e.target.value)}
                                  placeholder="จำนวน"
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold text-right focus:ring-2 focus:ring-sky-400 bg-white"
                                />
                                <span className="text-3xs text-slate-500">หน่วย</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">
                                เลขที่ STO
                              </label>
                              <input
                                type="text"
                                value={row.sto_no || ''}
                                onChange={(e) => handleUpdateAllocationField(idx, 'sto_no', e.target.value)}
                                placeholder="เช่น 100452391"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-sky-400 bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">
                                วิธีขนย้าย
                              </label>
                              <input
                                type="text"
                                value={row.transport_method || ''}
                                onChange={(e) => handleUpdateAllocationField(idx, 'transport_method', e.target.value)}
                                placeholder="เช่น รถ 6 ล้อ คลัง ต.1"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-400 bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">
                                วันที่ขนย้าย
                              </label>
                              <input
                                type="date"
                                value={row.transport_date || ''}
                                onChange={(e) => handleUpdateAllocationField(idx, 'transport_date', e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-sky-400 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Real-time Calculation Summary Card */}
                  <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/90 text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">จำนวนที่ขอตาม DDOC:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {activeInTransfer.demand_qty.toLocaleString()} หน่วย
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">ยอดจัดสรรรวมจากทุกเขต:</span>
                      <span className="font-bold text-sky-700 font-mono text-sm">
                        {currentAllocatedTotal.toLocaleString()} หน่วย
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/80 pt-1.5">
                      <span className="text-slate-600">ผลการจัดสรร:</span>
                      {currentDemandDiff === 0 ? (
                        <span className="text-teal-700 font-bold">✓ จัดสรรครบ 100%</span>
                      ) : currentDemandDiff > 0 ? (
                        <span className="text-amber-700 font-bold">
                          ⚠️ จัดสรรบางส่วน (ขาดอีก {currentDemandDiff.toLocaleString()} หน่วย)
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold">
                          ❌ ยอดจัดสรรเกินกว่าที่ขอ {(-currentDemandDiff).toLocaleString()} หน่วย
                        </span>
                      )}
                    </div>
                  </div>

                  {activeInTransfer.stock_updated && (
                    <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-800 font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>รายการนี้ทำการตรวจรับเข้าสต็อก (+Stock) ไปแล้ว</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50/90 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveInTransfer(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveAllocations(false)}
                    disabled={isProcessingIn || isAllocInvalid}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessingIn ? 'กำลังบันทึก...' : 'บันทึกข้อมูลจัดสรร & STO & ขนย้าย'}
                  </button>

                  {!activeInTransfer.stock_updated && (
                    <button
                      type="button"
                      onClick={() => handleSaveAllocations(true)}
                      disabled={isProcessingIn || isAllocInvalid}
                      className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>บันทึกและตรวจรับเข้าคลัง ต.1 (+Stock ทันที)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MODAL 3: สร้างใบโอนพัสดุออก Multi-Item (Outgoing)        */}
      {/* ======================================================== */}
      {showAddOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full overflow-hidden border border-slate-200/80 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                สร้างใบขอโอนพัสดุจาก ต.1 ไปยังเขตอื่น (Multi-Item)
              </h3>
              <button
                onClick={() => setShowAddOutModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransferOut} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เลขที่หนังสือขอรับโอน *
                  </label>
                  <input
                    type="text"
                    required
                    value={outDocNo}
                    onChange={(e) => setOutDocNo(e.target.value)}
                    placeholder="เช่น กบพ.ต1-2026/041"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">วันที่ *</label>
                  <input
                    type="date"
                    required
                    value={outDocDate}
                    onChange={(e) => setOutDocDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ผู้ประสานงาน *
                  </label>
                  <input
                    type="text"
                    required
                    value={outCoordinator}
                    onChange={(e) => setOutCoordinator(e.target.value)}
                    placeholder="เช่น นายสมชาย (ช่างเทคนิค ต.1)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เขตปลายทาง (12 เขต) *
                  </label>
                  <select
                    value={outDestinationDistrict}
                    onChange={(e) => setOutDestinationDistrict(e.target.value as District)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-400 font-bold"
                  >
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {DISTRICT_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เลขที่ STO (ไม่บังคับ สามารถกรอก Inline ภายหลังได้)
                  </label>
                  <input
                    type="text"
                    value={outStoNo}
                    onChange={(e) => setOutStoNo(e.target.value)}
                    placeholder="เช่น 10098412"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>

              {/* Multi-Item Table (Section 8.1) */}
              <div className="border border-slate-200/80 rounded-xl p-3 bg-slate-50/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    รายการพัสดุในหนังสือฉบับนี้ (Multi-Item) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddOutItemRow}
                    className="text-xs text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มแถวพัสดุ</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {outItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200/80">
                      <select
                        value={item.material_id}
                        onChange={(e) => {
                          const updated = [...outItems];
                          updated[idx].material_id = e.target.value;
                          setOutItems(updated);
                        }}
                        className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                      >
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} : {m.description}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={item.transfer_qty}
                        onChange={(e) => {
                          const updated = [...outItems];
                          updated[idx].transfer_qty = parseFloat(e.target.value) || 0;
                          setOutItems(updated);
                        }}
                        placeholder="ยอดโอน"
                        className="w-24 px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-right font-mono font-bold"
                      />

                      {outItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOutItemRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddOutModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isProcessingOut}
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  {isProcessingOut ? 'กำลังบันทึก...' : 'บันทึกใบโอนพัสดุ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal: Delete entire DDOC */}
      {ddocToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 border border-rose-200/70 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">ยืนยันการลบ DDOC ทั้งหมด</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ทุกรายการพัสดุภายใต้ DDOC เลขนี้จะถูกลบออกจากฐานข้อมูล
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">เลขที่ DDOC:</span>
                <span className="font-mono font-bold text-slate-800">{ddocToDelete}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">จำนวนชนิดพัสดุ:</span>
                <span className="font-mono font-bold text-slate-800">
                  {transfersIn.filter((t) => t.ddoc_no === ddocToDelete).length} ชนิด
                </span>
              </div>
            </div>

            {transfersIn.some((t) => t.ddoc_no === ddocToDelete && t.stock_updated) && (
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  มีรายการใน DDOC นี้ที่เคยตรวจรับเข้าคลังแล้ว ระบบจะปรับลดยอด Stock ในคลังและ SAP คืนสถานะเดิมให้อัตโนมัติ
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDdocToDelete(null)}
                disabled={isDeletingDdoc}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDdoc}
                disabled={isDeletingDdoc}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isDeletingDdoc ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ยืนยันลบทั้ง DDOC</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal: Delete Transfer In */}
      {transferInToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 border border-rose-200/70 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">ยืนยันการลบรายการ DDOC</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  รายการรับโอนจากเขตอื่นนี้จะถูกลบออกจากฐานข้อมูลจริง
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">เลขที่ DDOC:</span>
                <span className="font-mono font-bold text-slate-800">{transferInToDelete.ddoc_no}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">รหัสพัสดุ:</span>
                <span className="font-mono font-semibold text-slate-800">{transferInToDelete.material_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">รายการ:</span>
                <span className="font-medium text-slate-800 text-right max-w-[200px] truncate">{transferInToDelete.material_description}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">ยอดขอจัดสรร:</span>
                <span className="font-mono font-bold text-slate-800">{transferInToDelete.demand_qty.toLocaleString()} หน่วย</span>
              </div>
            </div>

            {transferInToDelete.stock_updated && (
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  รายการนี้เคยตรวจรับและเพิ่มสต็อกเข้าคลังแล้ว ({(transferInToDelete.allocated_qty || 0).toLocaleString()} หน่วย) ระบบจะทำการปรับลดยอด Stock ในคลังและ SAP ออกให้อัตโนมัติ
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTransferInToDelete(null)}
                disabled={isDeletingIn}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTransferIn}
                disabled={isDeletingIn}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isDeletingIn ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ยืนยันลบออกจากฐานข้อมูล</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal: Delete Transfer Out */}
      {transferOutToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 border border-rose-200/70 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">ยืนยันการลบใบโอนพัสดุออก</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  รายการโอนของจาก ต.1 ไปยังเขตอื่นนี้จะถูกลบออกจากฐานข้อมูลจริง
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">เลขที่หนังสือ:</span>
                <span className="font-mono font-bold text-slate-800">{transferOutToDelete.doc_no}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">เขตปลายทาง:</span>
                <span className="font-semibold text-slate-800">{DISTRICT_LABELS[transferOutToDelete.destination_district] || transferOutToDelete.destination_district}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">จำนวนพัสดุ:</span>
                <span className="font-mono font-bold text-slate-800">{transferOutToDelete.items.length} รายการ</span>
              </div>
            </div>

            {transferOutToDelete.is_dispatched && (
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  รายการนี้เคยตัดจ่ายคลังแล้ว ระบบจะคืนยอดพัสดุทั้งหมดกลับเข้าคลังให้อัตโนมัติ
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTransferOutToDelete(null)}
                disabled={isDeletingOut}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTransferOut}
                disabled={isDeletingOut}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isDeletingOut ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ยืนยันลบออกจากฐานข้อมูล</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
