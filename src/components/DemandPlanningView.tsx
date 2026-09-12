import React, { useState, useMemo } from 'react';
import { Material, Demand, DemandType, WAREHOUSE_CODES, WarehouseCode } from '../types';
import { saveDemand, deleteDemand, exportDataToExcel, findMatchingMaterial } from '../lib/storage';
import {
  Plus,
  FileSpreadsheet,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Calendar,
  Building,
  Hash,
  Layers,
  Search,
  Filter,
  ArrowLeft,
  AlertTriangle,
  Clock,
  CheckCircle,
  Boxes,
  ClipboardList,
  Sparkles,
  X,
  Check,
} from 'lucide-react';

interface DemandPlanningViewProps {
  demands: Demand[];
  materials: Material[];
  onRefresh: () => Promise<void>;
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

interface ParsedRow {
  rowNum: number;
  plant: string;
  originalMaterialId: string;
  materialId: string;
  description: string;
  quantity: number;
  demandType: DemandType;
  docNo: string;
  targetMonth?: string;
  isValid: boolean;
  errors: string[];
}

// Standard Plant options with descriptions
const STANDARD_PLANTS: { code: string; name: string }[] = [
  { code: 'J010', name: 'J010 (กบพ. ต.1 / คลังหลักเพชรบุรี)' },
  { code: 'J020', name: 'J020 (คลังสาขา / แผนกจ่ายพัสดุ 2)' },
  { code: 'J030', name: 'J030 (คลังสาขา / แผนกจ่ายพัสดุ 3)' },
  { code: 'J040', name: 'J040 (คลังสาขา / แผนกจ่ายพัสดุ 4)' },
  { code: 'J050', name: 'J050 (คลังสาขา / แผนกจ่ายพัสดุ 5)' },
  { code: 'J060', name: 'J060 (คลังสาขา / แผนกจ่ายพัสดุ 6)' },
  { code: 'J070', name: 'J070 (คลังสาขา / แผนกจ่ายพัสดุ 7)' },
  { code: 'J090', name: 'J090 (คลังสาขา / แผนกจ่ายพัสดุ 9)' },
];

export const DemandPlanningView: React.FC<DemandPlanningViewProps> = ({
  demands,
  materials,
  onRefresh,
  showNotification,
}) => {
  // Requirement: Default to 'list' view so users see all demands and pending balances first
  const [activeTab, setActiveTab] = useState<'list' | 'single' | 'import'>('list');

  // Filter & Search State for List View
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partially' | 'completed'>('all');
  const [plantFilter, setPlantFilter] = useState<string>('all');

  // Single Entry Form State
  const [plant, setPlant] = useState('J010');
  const [customPlant, setCustomPlant] = useState('');
  const [isCustomPlant, setIsCustomPlant] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(materials[0]?.id || '');
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [quantityDemand, setQuantityDemand] = useState<string>('');
  const [demandType, setDemandType] = useState<DemandType>('ZPM2');
  const [docNo, setDocNo] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const [pasteContent, setPasteContent] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [hasValidated, setHasValidated] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Custom Delete Confirmation Modal State
  const [demandToDelete, setDemandToDelete] = useState<Demand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Exact Match resolution: if user typed code manually, match exact material
  const exactMatchedMaterial = useMemo(() => {
    if (!materialSearchQuery.trim()) return undefined;
    return findMatchingMaterial(materialSearchQuery, materials);
  }, [materialSearchQuery, materials]);

  // Handle typing material code: if user enters exact/normalized code, sync selectedMaterialId immediately
  const handleMaterialSearchChange = (val: string) => {
    setMaterialSearchQuery(val);
    const matched = findMatchingMaterial(val, materials);
    if (matched) {
      setSelectedMaterialId(matched.id);
    }
  };

  // Handle dropdown selection: sync materialSearchQuery so both are strictly consistent
  const handleMaterialDropdownSelect = (val: string) => {
    setSelectedMaterialId(val);
    const chosen = materials.find((m) => m.id === val);
    if (chosen) {
      setMaterialSearchQuery(chosen.id);
    }
  };

  // Selected Material Details for Single Form: prioritize exact match from user input
  const currentMaterial = useMemo(() => {
    if (exactMatchedMaterial) return exactMatchedMaterial;
    return materials.find((m) => m.id === selectedMaterialId) || materials[0];
  }, [exactMatchedMaterial, selectedMaterialId, materials]);

  // Filtered materials for single form search and dropdown
  const filteredMaterialsForSelect = useMemo(() => {
    if (!materialSearchQuery.trim()) return materials;
    const q = materialSearchQuery.trim().toLowerCase();
    const qNorm = q.replace(/[-_.\s]/g, '');

    // If exact or normalized match found, place it at the very top of the list
    const exact = findMatchingMaterial(materialSearchQuery, materials);
    if (exact) {
      const others = materials.filter((m) => m.id !== exact.id);
      return [exact, ...others];
    }

    return materials.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (qNorm.length >= 3 && m.id.replace(/[-_.\s]/g, '').toLowerCase().includes(qNorm)) ||
        m.description.toLowerCase().includes(q)
    );
  }, [materials, materialSearchQuery]);

  // Summary Metrics for Demands
  const metrics = useMemo(() => {
    let pendingCount = 0;
    let totalRemainingQty = 0;
    let partiallyPickedCount = 0;
    let completedCount = 0;

    demands.forEach((d) => {
      if (d.remaining > 0) {
        pendingCount++;
        totalRemainingQty += d.remaining;
      }
      if (d.status === 'PARTIALLY_PICKED') {
        partiallyPickedCount++;
      } else if (d.status === 'COMPLETED') {
        completedCount++;
      }
    });

    return {
      totalCount: demands.length,
      pendingCount,
      totalRemainingQty,
      partiallyPickedCount,
      completedCount,
    };
  }, [demands]);

  // Filtered Demands List
  const filteredDemands = useMemo(() => {
    return demands.filter((d) => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchDoc = d.doc_no.toLowerCase().includes(q);
        const matchMatId = d.material_id.toLowerCase().includes(q);
        const matchMatDesc = d.material_description.toLowerCase().includes(q);
        const matchPlant = d.plant.toLowerCase().includes(q);
        if (!matchDoc && !matchMatId && !matchMatDesc && !matchPlant) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'pending' && d.remaining <= 0) return false;
      if (statusFilter === 'partially' && d.status !== 'PARTIALLY_PICKED') return false;
      if (statusFilter === 'completed' && d.status !== 'COMPLETED') return false;

      // Plant filter
      if (plantFilter !== 'all' && d.plant !== plantFilter) return false;

      return true;
    });
  }, [demands, searchTerm, statusFilter, plantFilter]);

  // Unique plants in demands for filter dropdown
  const uniquePlants = useMemo(() => {
    const set = new Set<string>();
    demands.forEach((d) => {
      if (d.plant) set.add(d.plant);
    });
    return Array.from(set).sort();
  }, [demands]);

  // Single Item Submit Handler
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePlant = isCustomPlant ? customPlant.trim() : plant.trim();
    if (!effectivePlant) {
      showNotification('กรุณาระบุโรงงาน (Plant)', 'error');
      return;
    }
    if (!docNo.trim()) {
      showNotification('กรุณาระบุชื่องาน หรือเลขที่ใบสั่ง (Doc No)', 'error');
      return;
    }
    const qty = parseFloat(quantityDemand);
    if (isNaN(qty) || qty <= 0) {
      showNotification('ปริมาณความต้องการต้องเป็นตัวเลขที่มากกว่า 0', 'error');
      return;
    }

    // Resolve Material: Strictly enforce EXACT MATCH when user types material code
    let finalMaterial: Material | undefined;

    if (materialSearchQuery.trim()) {
      // User typed material code manually (e.g. 2-29-030-0013)
      const matched = findMatchingMaterial(materialSearchQuery, materials);
      if (matched) {
        finalMaterial = matched;
      } else {
        // User typed an invalid or non-existent material code
        showNotification(
          `ไม่พบรหัสพัสดุ "${materialSearchQuery.trim()}" ในฐานข้อมูล Master 35 รายการ กรุณาตรวจสอบรหัสพัสดุหรือเลือกจากรายการ`,
          'error'
        );
        return;
      }
    } else if (selectedMaterialId) {
      finalMaterial = materials.find((m) => m.id === selectedMaterialId);
    }

    if (!finalMaterial) {
      showNotification('กรุณาเลือกหรือระบุรหัสพัสดุจากระบบ Master 35 รายการ', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await saveDemand({
        doc_no: docNo.trim(),
        demand_type: demandType,
        plant: effectivePlant,
        material_id: finalMaterial.id,
        material_description: finalMaterial.description,
        quantity_demand: qty,
        target_month: targetMonth.trim() || undefined,
        created_by: 'เจ้าหน้าที่คลัง',
      });

      if (res.success) {
        showNotification(`บันทึกแผนเบิกสำหรับ "${docNo}" (${finalMaterial.id} - ${finalMaterial.description}) สำเร็จ`, 'success');
        setDocNo('');
        setQuantityDemand('');
        setMaterialSearchQuery('');
        await onRefresh();
        // Return to master list so user can see it right away
        setActiveTab('list');
      } else {
        showNotification(res.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'บันทึกล้มเหลว', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excel Paste Parser & Validator (Supports hyphens and non-hyphens like 2290050039)
  const handleParseAndValidate = () => {
    if (!pasteContent.trim()) {
      showNotification('กรุณาวางข้อมูลจาก Excel ในช่องข้อความ', 'error');
      return;
    }

    const rawLines = pasteContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Auto-detect header row
    let startIndex = 0;
    if (rawLines.length > 0) {
      const firstLineLower = rawLines[0].toLowerCase();
      if (
        firstLineLower.includes('plant') ||
        firstLineLower.includes('โรงงาน') ||
        firstLineLower.includes('รหัสวัสดุ') ||
        firstLineLower.includes('material') ||
        firstLineLower.includes('ใบสั่ง')
      ) {
        startIndex = 1;
      }
    }

    const lines = rawLines.slice(startIndex);
    if (lines.length === 0) {
      showNotification('ไม่พบแถวข้อมูลสำหรับนำเข้า (ตรวจพบเฉพาะหัวตาราง)', 'error');
      return;
    }

    const results: ParsedRow[] = [];
    const seenCombos = new Set<string>();

    lines.forEach((line, index) => {
      const rowNum = index + 1;
      // Split by tab (standard Excel copy) or comma
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const errors: string[] = [];

      // Expected format: โรงงาน | รหัสวัสดุ | ปริมาณความต้องการ | ประเภท (ZPM2 หรือ WBS) | ชื่องาน/ใบสั่ง | เดือน (YYYY-MM)
      if (parts.length < 5) {
        errors.push(`จำนวน Column ไม่ครบถ้วน (ต้องการอย่างน้อย 5 ช่อง: โรงงาน, รหัสวัสดุ, ปริมาณ, ประเภท, ชื่องาน)`);
      }

      const rowPlant = (parts[0] || '').trim() || 'J010';
      const rawMaterialCode = (parts[1] || '').trim();
      const rowQtyRaw = (parts[2] || '').trim().replace(/,/g, '');
      const rowTypeRaw = (parts[3] || '').trim().toUpperCase();
      const rowDocNo = (parts[4] || '').trim();
      const rowMonth = (parts[5] || '').trim();

      // Check Material ID in master (Supporting 2-29-005-0039 AND 2290050039)
      const matchedMat = findMatchingMaterial(rawMaterialCode, materials);
      if (!rawMaterialCode) {
        errors.push('ไม่พบรหัสวัสดุ');
      } else if (!matchedMat) {
        errors.push(`รหัสวัสดุ "${rawMaterialCode}" ไม่พบในฐานข้อมูล Master 35 รายการ`);
      }

      const canonicalMaterialId = matchedMat ? matchedMat.id : rawMaterialCode;
      const matDescription = matchedMat ? matchedMat.description : '-';

      // Check Quantity
      const qty = parseFloat(rowQtyRaw);
      if (isNaN(qty) || qty <= 0) {
        errors.push(`ปริมาณต้องการต้องเป็นตัวเลขมากกว่า 0 (ค่าที่พบ: "${rowQtyRaw}")`);
      }

      // Check Demand Type
      let dType: DemandType = 'ZPM2';
      if (rowTypeRaw === 'WBS' || rowTypeRaw === 'ZPM2') {
        dType = rowTypeRaw as DemandType;
      } else {
        errors.push(`ประเภทเบิกต้องเป็น ZPM2 หรือ WBS เท่านั้น (ค่าที่พบ: "${rowTypeRaw}")`);
      }

      // Check Doc No
      if (!rowDocNo) {
        errors.push('ต้องระบุชื่องาน หรือเลขที่ใบสั่ง');
      }

      // Check in-sheet duplicate using canonical material ID
      const comboKey = `${rowDocNo}|${rowPlant}|${canonicalMaterialId}|${rowMonth}`.toLowerCase();
      if (seenCombos.has(comboKey)) {
        errors.push('พบข้อมูลซ้ำกับแถวอื่นในรายการที่นำเข้าเดียวกัน');
      } else {
        seenCombos.add(comboKey);
      }

      // Check existing system duplicates
      const isAlreadyInSystem = demands.some(
        (d) =>
          d.doc_no.toLowerCase() === rowDocNo.toLowerCase() &&
          d.plant.toLowerCase() === rowPlant.toLowerCase() &&
          d.material_id === canonicalMaterialId &&
          (d.target_month || '') === rowMonth
      );
      if (isAlreadyInSystem) {
        errors.push(`มีแผนเบิกใบสั่ง "${rowDocNo}" วัสดุ "${canonicalMaterialId}" ในระบบอยู่แล้ว`);
      }

      results.push({
        rowNum,
        plant: rowPlant,
        originalMaterialId: rawMaterialCode,
        materialId: canonicalMaterialId,
        description: matDescription,
        quantity: isNaN(qty) ? 0 : qty,
        demandType: dType,
        docNo: rowDocNo,
        targetMonth: rowMonth || undefined,
        isValid: errors.length === 0,
        errors,
      });
    });

    setParsedRows(results);
    setHasValidated(true);
  };

  // Pre-fill Sample Data for user testing
  const handleLoadSamplePaste = () => {
    const sample = `J010\t2-29-005-0039\t500\tZPM2\tงานขยายสายใยแก้ว\t2026-10\nJ010\t2290050039\t300\tZPM2\tงานขยายสายใยแก้ว (รหัสแบบไม่มีขีด)\t2026-10\nJ010\t2-29-005-0042\t200\tWBS\tโครงการติดตั้งโครงข่ายสื่อสาร\t2026-11\nJ010\t2290300009\t150\tZPM2\tงานซ่อมบำรุงระบบสายส่ง\t2026-10`;
    setPasteContent(sample);
    setHasValidated(false);
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      showNotification('ไม่มีข้อมูลที่ถูกต้องในการนำเข้า กรุณาแก้ไขข้อผิดพลาดก่อน', 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    try {
      for (const row of validRows) {
        const res = await saveDemand({
          doc_no: row.docNo,
          demand_type: row.demandType,
          plant: row.plant,
          material_id: row.materialId,
          material_description: row.description,
          quantity_demand: row.quantity,
          target_month: row.targetMonth,
          created_by: 'Excel Import',
        });
        if (res.success) successCount++;
      }

      showNotification(`นำเข้าข้อมูลสำเร็จ ${successCount} จาก ${validRows.length} รายการ`, 'success');
      setPasteContent('');
      setParsedRows([]);
      setHasValidated(false);
      await onRefresh();
      // Transition to list view so user immediately inspects new demands
      setActiveTab('list');
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการนำเข้า', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Real Delete with Custom In-App Confirmation Modal & Automatic Stock Reversal
  const handleConfirmDelete = async () => {
    if (!demandToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteDemand(demandToDelete.id);
      if (res.success) {
        const restoredMsg = res.restoredQty && res.restoredQty > 0
          ? ` (คืนสต็อกกลับเข้าคลัง ${res.restoredQty.toLocaleString()} หน่วย)`
          : '';
        showNotification(`ลบรายการ ${demandToDelete.doc_no} ออกจากฐานข้อมูลสำเร็จ${restoredMsg}`, 'success');
        setDemandToDelete(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'ไม่สามารถลบรายการได้', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการลบ', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportDemands = () => {
    const exportData = filteredDemands.map((d) => ({
      'เลขที่ใบสั่ง / ชื่องาน': d.doc_no,
      'ประเภท': d.demand_type,
      'โรงงาน': d.plant,
      'รหัสวัสดุ': d.material_id,
      'คำอธิบายวัสดุ': d.material_description,
      'Demand (ความต้องการ)': d.quantity_demand,
      'Picked สะสม': d.picked_total,
      'Remaining (คงค้าง)': d.remaining,
      'เดือนเป้าหมาย': d.target_month || '-',
      'สถานะ': d.status === 'COMPLETED' ? 'เบิกครบแล้ว' : d.status === 'PARTIALLY_PICKED' ? 'แบ่งหยิบบางส่วน' : 'รอการเบิก',
      'วันที่สร้าง': d.created_at,
    }));
    exportDataToExcel(exportData, 'DemandPlanning', 'WMS_Demand_Planning');
    showNotification('ส่งออกข้อมูลแผนเบิกเป็น Excel สำเร็จ', 'success');
  };

  const invalidCount = parsedRows.filter((r) => !r.isValid).length;
  const validCount = parsedRows.filter((r) => r.isValid).length;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Default List Tab */}
          <button
            id="tab-demands-list"
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'list'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>รายการแผนเบิกทั้งหมด</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-2xs font-extrabold ${
                activeTab === 'list' ? 'bg-sky-600/90 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {demands.length}
            </span>
          </button>

          {/* Single Entry Tab */}
          <button
            id="tab-demands-single"
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'single'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>วางแผนเบิกพัสดุ (คีย์ทีละรายการ)</span>
          </button>

          {/* Excel Import Tab */}
          <button
            id="tab-demands-import"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import จาก Excel (Copy & Paste)</span>
          </button>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {activeTab === 'list' && (
            <button
              id="btn-export-excel"
              onClick={handleExportDemands}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MASTER LIST VIEW (DEFAULT VIEW AS REQUESTED)                          */}
      {/* ========================================================================= */}
      {activeTab === 'list' && (
        <div className="space-y-5">
          {/* Search, Filter Pills & Quick Entry CTA */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="input-search-demands"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาเลขที่ใบสั่ง, ชื่องาน, รหัสวัสดุ..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 focus:outline-none bg-slate-50/40"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Plant Filter & Quick Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>โรงงาน:</span>
                  <select
                    id="select-plant-filter"
                    value={plantFilter}
                    onChange={(e) => setPlantFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-sky-200 focus:border-sky-400 focus:outline-none"
                  >
                    <option value="all">ทั้งหมด ({demands.length})</option>
                    {uniquePlants.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  id="btn-add-demand-shortcut"
                  onClick={() => setActiveTab('single')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ คีย์แผนเบิกใหม่</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider mr-1">
                กรองสถานะ:
              </span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ทั้งหมด ({demands.length})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'pending'
                    ? 'bg-amber-400/90 text-amber-950 shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100/80'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>คงค้างรอตัดจ่าย ({metrics.pendingCount})</span>
              </button>
              <button
                onClick={() => setStatusFilter('partially')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  statusFilter === 'partially'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'bg-sky-50 text-sky-800 border border-sky-200/80 hover:bg-sky-100/80'
                }`}
              >
                แบ่งหยิบบางส่วน ({metrics.partiallyPickedCount})
              </button>
              <button
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  statusFilter === 'completed'
                    ? 'bg-teal-500 text-white shadow-xs'
                    : 'bg-teal-50 text-teal-800 border border-teal-200/80 hover:bg-teal-100/80'
                }`}
              >
                เบิกครบแล้ว ({metrics.completedCount})
              </button>
            </div>
          </div>

          {/* Demands Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>รายการแผนเบิกพัสดุในระบบ</span>
                  <span className="text-xs font-semibold text-slate-500">
                    (แสดง {filteredDemands.length} จาก {demands.length} รายการ)
                  </span>
                </h3>
                <p className="text-2xs text-slate-500 mt-0.5">
                  รายการที่มี <strong>"ยอดคงค้าง (Remaining)"</strong> สามารถนำไปตัดจ่ายพัสดุได้ที่เมนู "ตัดจ่ายพัสดุ / หยิบจริง"
                </p>
              </div>

              {statusFilter === 'pending' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-bold rounded-xl shadow-2xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>กำลังกรองเฉพาะรายการที่มียอดคงค้างรอตัดจ่าย</span>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
                <thead className="bg-slate-50/90 text-slate-600 font-bold uppercase tracking-wider text-2xs border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">เลขที่ใบสั่ง / ชื่องาน</th>
                    <th className="py-3 px-3">ประเภท</th>
                    <th className="py-3 px-3">โรงงาน</th>
                    <th className="py-3 px-3">รหัสวัสดุ</th>
                    <th className="py-3 px-4">คำอธิบายพัสดุ</th>
                    <th className="py-3 px-3 text-right">Demand</th>
                    <th className="py-3 px-3 text-right">Picked สะสม</th>
                    <th className="py-3 px-3 text-right">ยอดคงค้าง (Remaining)</th>
                    <th className="py-3 px-3 text-center">สถานะ</th>
                    <th className="py-3 px-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDemands.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <ClipboardList className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">ไม่พบรายการแผนเบิกพัสดุที่ค้นหา</p>
                        <p className="text-2xs text-slate-400 mt-1">
                          {demands.length === 0
                            ? 'ยังไม่มีรายการแผนเบิกในระบบ กรุณาคลิก "+ คีย์แผนเบิกใหม่" หรือ "Import จาก Excel"'
                            : 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะด้านบน'}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <button
                            onClick={() => setActiveTab('single')}
                            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
                          >
                            + วางแผนเบิกทีละรายการ
                          </button>
                          <button
                            onClick={() => setActiveTab('import')}
                            className="px-4 py-2 bg-white border border-slate-200/80 text-slate-700 text-xs font-bold rounded-xl hover:bg-sky-50/50 cursor-pointer shadow-2xs transition-colors"
                          >
                            Import จาก Excel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredDemands.map((d) => {
                      const hasRemaining = d.remaining > 0;
                      return (
                        <tr
                          key={d.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            hasRemaining ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          {/* Doc No */}
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div className="flex flex-col">
                              <span>{d.doc_no}</span>
                              {d.target_month && (
                                <span className="text-2xs text-slate-400 font-normal">
                                  เป้าหมาย: {d.target_month}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Demand Type */}
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-2xs font-extrabold border ${
                                d.demand_type === 'ZPM2'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200/80'
                                  : 'bg-purple-50 text-purple-700 border-purple-200/80'
                              }`}
                            >
                              {d.demand_type}
                            </span>
                          </td>

                          {/* Plant */}
                          <td className="py-3 px-3 font-semibold text-slate-700">{d.plant}</td>

                          {/* Material Code */}
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">
                            {d.material_id}
                          </td>

                          {/* Material Description */}
                          <td
                            className="py-3 px-4 text-slate-700 max-w-xs truncate"
                            title={d.material_description}
                          >
                            {d.material_description}
                          </td>

                          {/* Demand Qty */}
                          <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                            {d.quantity_demand.toLocaleString()}
                          </td>

                          {/* Picked Total */}
                          <td className="py-3 px-3 text-right font-bold text-sky-700 font-mono">
                            {d.picked_total.toLocaleString()}
                          </td>

                          {/* Remaining Qty - Highlighted */}
                          <td className="py-3 px-3 text-right font-mono">
                            {hasRemaining ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg font-bold text-amber-900 bg-amber-100/80 border border-amber-200/70">
                                <span>{d.remaining.toLocaleString()}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">0</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {d.status === 'COMPLETED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-teal-50 text-teal-700 border border-teal-200/70">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>เบิกครบแล้ว</span>
                              </span>
                            ) : d.status === 'PARTIALLY_PICKED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-sky-50 text-sky-700 border border-sky-200/70">
                                <Clock className="w-3 h-3" />
                                <span>แบ่งหยิบ ({Math.round((d.picked_total / d.quantity_demand) * 100)}%)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-800 border border-amber-200/70">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>รอตัดจ่าย</span>
                              </span>
                            )}
                          </td>

                          {/* Real Delete Action */}
                          <td className="py-3 px-3 text-center">
                            <button
                              id={`btn-delete-demand-${d.id}`}
                              onClick={() => setDemandToDelete(d)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50/80 cursor-pointer transition-colors"
                              title="ลบแผนเบิกพัสดุนี้ออกจากระบบ"
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

      {/* ========================================================================= */}
      {/* 2. SINGLE ENTRY FORM (REFINED MODERN LAYOUT & DROPDOWN PLANT)            */}
      {/* ========================================================================= */}
      {activeTab === 'single' && (
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Back to master list button */}
          <button
            onClick={() => setActiveTab('list')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-sky-600 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้ารายการแผนเบิกทั้งหมด</span>
          </button>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {/* Header Banner - Soft Pastel */}
            <div className="bg-sky-50/70 border-b border-sky-100/80 px-6 py-5">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-sky-100/90 text-sky-700 rounded-xl border border-sky-200/70 shadow-2xs">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">
                    วางแผนเบิกพัสดุ (คีย์ทีละรายการ)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    กำหนดความต้องการเบิกพัสดุ (Demand) ตามใบสั่ง ZPM2 หรือโครงการจัดจ้าง WBS
                  </p>
                </div>
              </div>
            </div>

            {/* Form Body with Clear Functional Sections */}
            <form onSubmit={handleSingleSubmit} className="p-6 space-y-6">
              {/* SECTION 1: Document & Plant Info */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/70 space-y-4">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>1. ข้อมูลหน่วยงานและเอกสารอ้างอิง</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. Plant (โรงงาน) - DROPDOWN LIST */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-sky-500" />
                        <span>โรงงาน (Plant) *</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCustomPlant(!isCustomPlant)}
                        className="text-2xs text-sky-600 hover:text-sky-700 hover:underline font-medium cursor-pointer"
                      >
                        {isCustomPlant ? '← เลือกจากรายการมาตรฐาน' : '+ ระบุรหัสโรงงานอื่น'}
                      </button>
                    </label>

                    {isCustomPlant ? (
                      <input
                        id="input-custom-plant"
                        type="text"
                        required
                        value={customPlant}
                        onChange={(e) => setCustomPlant(e.target.value)}
                        placeholder="ระบุรหัสโรงงาน เช่น J010, J020"
                        className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white"
                      />
                    ) : (
                      <select
                        id="select-plant"
                        value={plant}
                        onChange={(e) => setPlant(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white font-medium text-slate-800"
                      >
                        {STANDARD_PLANTS.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-2xs text-slate-400">
                      เลือกโรงงานที่รับผิดชอบการเบิกพัสดุ (ค่าเริ่มต้น J010 กบพ. ต.1)
                    </p>
                  </div>

                  {/* 2. Demand Type */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-500" />
                      <span>ประเภทการเบิก *</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDemandType('ZPM2')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          demandType === 'ZPM2'
                            ? 'bg-sky-50 text-sky-700 border-sky-300 ring-1 ring-sky-300 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        5.1 ใบสั่ง ZPM2
                      </button>
                      <button
                        type="button"
                        onClick={() => setDemandType('WBS')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          demandType === 'WBS'
                            ? 'bg-purple-50 text-purple-700 border-purple-300 ring-1 ring-purple-300 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        5.2 งานจัดจ้าง / WBS
                      </button>
                    </div>
                    <p className="text-2xs text-slate-400">
                      รูปแบบเอกสารอ้างอิงในระบบ SAP
                    </p>
                  </div>

                  {/* 3. Doc No / Project Name */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-500" />
                      <span>เลขที่ใบสั่ง / ชื่องาน (Doc No) *</span>
                    </label>
                    <input
                      id="input-doc-no"
                      type="text"
                      required
                      value={docNo}
                      onChange={(e) => setDocNo(e.target.value)}
                      placeholder="เช่น งานขยายสายใยแก้ว, WO-2026-0914"
                      className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white"
                    />
                    <p className="text-2xs text-slate-400">
                      ชื่องานหรือเลขที่ใบสั่งสำหรับการตัดจ่าย
                    </p>
                  </div>

                  {/* 4. Target Month */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-sky-500" />
                      <span>เดือนเป้าหมาย (YYYY-MM, ไม่บังคับ)</span>
                    </label>
                    <input
                      id="input-target-month"
                      type="month"
                      value={targetMonth}
                      onChange={(e) => setTargetMonth(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white"
                    />
                    <p className="text-2xs text-slate-400">
                      กำหนดรอบเดือนที่ต้องการเบิกใช้งานจริง เช่น 2026-10
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Material & Quantity */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/70 space-y-4">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span>2. ข้อมูลพัสดุและปริมาณความต้องการ</span>
                </div>

                <div className="space-y-3">
                  {/* Material Selection */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-teal-600" />
                        <span>เลือกพัสดุ (จากฐานข้อมูล Master 35 รายการ) *</span>
                      </span>
                      <span className="text-2xs text-slate-400 font-normal">
                        พิมพ์รหัสมีขีด (2-29-030-0013) หรือไม่มีขีด (2290300013)
                      </span>
                    </label>

                    {/* Search filter / Manual material code input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={materialSearchQuery}
                        onChange={(e) => handleMaterialSearchChange(e.target.value)}
                        placeholder="พิมพ์ค้นหารหัสพัสดุด้วยตนเอง (เช่น 2-29-030-0013)..."
                        className="w-full pl-8 pr-16 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 focus:outline-none bg-white shadow-2xs"
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        {exactMatchedMaterial && (
                          <span
                            title={`ตรงกับรหัส Master: ${exactMatchedMaterial.id} — ${exactMatchedMaterial.description}`}
                            className="inline-flex items-center text-emerald-600"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        )}
                        {materialSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialSearchQuery('');
                              setSelectedMaterialId(materials[0]?.id || '');
                            }}
                            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subtle small icon status indicator under input if user typed */}
                    {materialSearchQuery.trim() && (
                      <div className="px-1">
                        {exactMatchedMaterial ? (
                          <div
                            className="flex items-center gap-1.5 text-2xs text-emerald-600"
                            title={`ตรงกับ Master 35 รายการ: ${exactMatchedMaterial.id} — ${exactMatchedMaterial.description}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-mono font-medium">{exactMatchedMaterial.id}</span>
                            <span className="text-slate-500 truncate">— {exactMatchedMaterial.description}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-2xs text-amber-600">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>ยังไม่ตรงกับ Master 35 รายการ</span>
                          </div>
                        )}
                      </div>
                    )}

                    <select
                      id="select-material"
                      value={currentMaterial?.id || selectedMaterialId}
                      onChange={(e) => handleMaterialDropdownSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 font-mono text-slate-800 bg-white shadow-2xs"
                    >
                      {filteredMaterialsForSelect.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id} — {m.description} (คลังจริง: {m.current_warehouse.toLocaleString()} | SAP: {m.current_sap.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Material Live Stock Preview Card */}
                  {currentMaterial && (
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs font-sans">
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <span className="font-mono text-sky-700 bg-sky-50 border border-sky-200/70 px-2 py-0.5 rounded-md text-2xs">
                            {currentMaterial.id}
                          </span>
                          <span>{currentMaterial.description}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <div className="text-2xs text-slate-400 font-medium">คงเหลือระบบ SAP</div>
                          <div className="font-bold font-mono text-slate-700">
                            {currentMaterial.current_sap.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right pl-3 border-l border-slate-200">
                          <div className="text-2xs text-slate-400 font-medium">คงเหลือคลังจริง</div>
                          <div className="font-bold font-mono text-teal-700">
                            {currentMaterial.current_warehouse.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quantity Demand Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-teal-600" />
                        <span>ปริมาณความต้องการ (Demand) *</span>
                      </span>
                      {currentMaterial && quantityDemand && !isNaN(parseFloat(quantityDemand)) && (
                        <span
                          className={`text-2xs font-bold ${
                            parseFloat(quantityDemand) <= currentMaterial.current_warehouse
                              ? 'text-teal-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {parseFloat(quantityDemand) <= currentMaterial.current_warehouse
                            ? '✓ สต็อกคลังเพียงพอ'
                            : '⚠️ เกินสต็อกคลัง (ต้องแบ่งหยิบ)'}
                        </span>
                      )}
                    </label>
                    <input
                      id="input-quantity-demand"
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={quantityDemand}
                      onChange={(e) => setQuantityDemand(e.target.value)}
                      placeholder="ระบุจำนวน เช่น 500"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 font-mono bg-white"
                    />
                    <p className="text-2xs text-slate-400">
                      ระบุจำนวนหน่วยที่ต้องการเบิกตามแผนงาน
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  ยกเลิก / กลับหน้ารายการ
                </button>

                <button
                  id="btn-submit-demand"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>บันทึกแผนเบิกพัสดุ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EXCEL IMPORT VIEW (SUPPORTING NON-HYPHEN CODE LIKE 2290050039)        */}
      {/* ========================================================================= */}
      {activeTab === 'import' && (
        <div className="space-y-5">
          {/* Back to master list button */}
          <button
            onClick={() => setActiveTab('list')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-sky-600 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้ารายการแผนเบิกทั้งหมด</span>
          </button>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-50 text-teal-600 border border-teal-200/70 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Import หลายรายการจาก Excel (Copy & Paste)
                  </h2>
                  <p className="text-xs text-slate-500">
                    คัดลอกตารางจาก Excel แล้ววางลงในกล่องข้อความ รองรับทั้งรหัสวัสดุแบบมีขีด (2-29-005-0039) และไม่มีขีด (2290050039)
                  </p>
                </div>
              </div>

              {/* Sample Data Button */}
              <button
                type="button"
                onClick={handleLoadSamplePaste}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100/80 border border-sky-200/70 rounded-xl cursor-pointer self-start sm:self-auto transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ใส่ตัวอย่างข้อมูลทดสอบ</span>
              </button>
            </div>

            {/* Instruction Banner */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 text-xs text-slate-700 font-mono space-y-2">
              <div className="font-bold text-slate-800 font-sans flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>รูปแบบข้อมูล 5 หรือ 6 คอลัมน์ (คั่นด้วย Tab จาก Excel):</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 text-slate-800">
                โรงงาน [Tab] รหัสวัสดุ [Tab] ปริมาณความต้องการ [Tab] ประเภท (ZPM2 หรือ WBS) [Tab] ชื่องาน/ใบสั่ง [Tab] เดือน (YYYY-MM ไม่บังคับ)
              </div>
              <div className="text-slate-500 font-sans text-2xs space-y-0.5">
                <div>
                  💡 <strong>ตัวอย่าง:</strong> <code className="bg-slate-200/70 px-1 py-0.5 rounded">J010 [Tab] 2-29-005-0039 [Tab] 500 [Tab] ZPM2 [Tab] งานขยายสายใยแก้ว [Tab] 2026-10</code>
                </div>
                <div>
                  💡 <strong>รองรับรหัสวัสดุแบบไม่มีขีด:</strong> สามารถกรอกเป็น <code className="bg-slate-200/70 px-1 py-0.5 rounded">2290050039</code> ระบบจะทำการจับคู่กับฐานข้อมูล Master 35 รายการให้อัตโนมัติ
                </div>
              </div>
            </div>

            {/* Textarea */}
            <textarea
              id="textarea-excel-paste"
              rows={6}
              value={pasteContent}
              onChange={(e) => {
                setPasteContent(e.target.value);
                setHasValidated(false);
              }}
              placeholder="คัดลอกจาก Excel แล้ววางที่นี่..."
              className="w-full p-3.5 text-xs font-mono border border-slate-200/90 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 focus:outline-none bg-slate-50/50"
            />

            {/* Validation & Submit Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                id="btn-validate-excel"
                type="button"
                onClick={handleParseAndValidate}
                className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                1. ตรวจสอบข้อมูล (Validate & Preview)
              </button>

              {hasValidated && (
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-xs">
                    ถูกต้อง:{' '}
                    <strong className="text-teal-700 font-bold">{validCount}</strong> แถว |
                    พบข้อผิดพลาด:{' '}
                    <strong className="text-rose-700 font-bold">{invalidCount}</strong> แถว
                  </span>
                  <button
                    id="btn-confirm-import"
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={validCount === 0 || isImporting}
                    className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    {isImporting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>กำลังบันทึกลงระบบ...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>2. ยืนยันบันทึก ({validCount} แถว)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Validation Preview Table */}
          {hasValidated && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    ผลการตรวจสอบข้อมูลก่อนบันทึก (Validation Preview)
                  </h3>
                  <p className="text-2xs text-slate-500">
                    แสดงสถานะการจับคู่รหัสวัสดุและปริมาณความต้องการ
                  </p>
                </div>
                {invalidCount > 0 && (
                  <span className="text-xs text-rose-700 font-bold bg-rose-50 px-3 py-1 rounded-full border border-rose-200/70">
                    ห้ามบันทึกแถวที่ผิดพลาด (กรุณาแก้ไขก่อนนำเข้า)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
                  <thead className="bg-slate-50/90 text-slate-600 font-bold uppercase text-2xs border-b border-slate-200/80">
                    <tr>
                      <th className="py-2.5 px-3">แถว</th>
                      <th className="py-2.5 px-3">สถานะ</th>
                      <th className="py-2.5 px-3">โรงงาน</th>
                      <th className="py-2.5 px-3">รหัสวัสดุที่จับคู่</th>
                      <th className="py-2.5 px-3">คำอธิบาย</th>
                      <th className="py-2.5 px-3 text-right">จำนวน</th>
                      <th className="py-2.5 px-3">ประเภท</th>
                      <th className="py-2.5 px-3">ชื่องาน / ใบสั่ง</th>
                      <th className="py-2.5 px-3">ข้อผิดพลาด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {parsedRows.map((row) => {
                      const isCodeNormalized =
                        row.originalMaterialId &&
                        row.originalMaterialId !== row.materialId;

                      return (
                        <tr
                          key={row.rowNum}
                          className={row.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/40'}
                        >
                          <td className="py-2.5 px-3 text-slate-500 font-bold">{row.rowNum}</td>
                          <td className="py-2.5 px-3 font-sans">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-teal-700 font-bold text-2xs bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>ถูกต้อง</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-2xs bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />
                                <span>ผิดพลาด</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans">{row.plant}</td>
                          <td className="py-2.5 px-3 font-bold">
                            <div className="flex flex-col">
                              <span>{row.materialId}</span>
                              {isCodeNormalized && (
                                <span className="text-2xs text-sky-600 font-normal font-sans">
                                  (จาก {row.originalMaterialId})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-sans max-w-xs truncate">{row.description}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {row.quantity.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-sans">{row.demandType}</td>
                          <td className="py-2.5 px-3 font-sans">{row.docNo}</td>
                          <td className="py-2.5 px-3 font-sans text-rose-600">
                            {row.errors.length > 0 ? (
                              <ul className="list-disc list-inside space-y-0.5">
                                {row.errors.map((err, idx) => (
                                  <li key={idx} className="text-2xs font-semibold">
                                    {err}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-400 text-2xs font-sans">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. REAL DELETE CONFIRMATION MODAL (IN-APP DIALOG - NO BLOCKED WINDOW.CONFIRM) */}
      {/* ========================================================================= */}
      {demandToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-500 border border-rose-200/70 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800">
                  ยืนยันการลบแผนเบิกพัสดุ
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  การลบจะนำข้อมูลออกจากฐานข้อมูลจริงทั้งระบบ
                </p>
              </div>
              <button
                onClick={() => setDemandToDelete(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Demand Details */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">เลขที่ใบสั่ง / ชื่องาน:</span>
                <span className="font-bold text-slate-900">{demandToDelete.doc_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">รหัสพัสดุ:</span>
                <span className="font-mono font-bold text-slate-800">{demandToDelete.material_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">คำอธิบาย:</span>
                <span className="text-slate-700 max-w-xs truncate text-right">
                  {demandToDelete.material_description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ความต้องการ (Demand):</span>
                <span className="font-bold font-mono">{demandToDelete.quantity_demand.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ตัดจ่ายไปแล้ว (Picked):</span>
                <span className="font-bold font-mono text-sky-700">
                  {demandToDelete.picked_total.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ยอดคงค้าง (Remaining):</span>
                <span className="font-bold font-mono text-amber-700">
                  {demandToDelete.remaining.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Warning if picked items exist */}
            {demandToDelete.picked_total > 0 && (
              <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/70 flex items-start gap-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">ระบบจะคืนยอดสต็อกให้อัตโนมัติ:</strong>
                  <div className="text-2xs text-amber-700 mt-0.5">
                    เนื่องจากรายการนี้เคยตัดจ่ายไปแล้ว {demandToDelete.picked_total.toLocaleString()} หน่วย เมื่อลบแล้ว ระบบจะคืนยอดพัสดุกลับเข้าคลังและลบประวัติการตัดจ่ายที่เกี่ยวข้อง
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDemandToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                id="btn-confirm-delete-modal"
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ยืนยันการลบจริง</span>
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
