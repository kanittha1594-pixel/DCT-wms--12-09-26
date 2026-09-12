import React, { useState, useMemo } from 'react';
import { Material } from '../types';
import { updateMaterialInitialStock, exportDataToExcel } from '../lib/storage';
import {
  Search,
  FileSpreadsheet,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  X,
  ArrowUpDown,
} from 'lucide-react';

interface StockReportViewProps {
  materials: Material[];
  onRefresh: () => Promise<void>;
  isAdmin: boolean;
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

type FilterType = 'all' | 'equal' | 'diff' | 'negative';
type SortField = 'id' | 'description' | 'current_sap' | 'current_warehouse';

export const StockReportView: React.FC<StockReportViewProps> = ({
  materials,
  onRefresh,
  isAdmin,
  showNotification,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortAsc, setSortAsc] = useState(true);

  // Edit Initial Stock State (Admin only)
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editInitialSap, setEditInitialSap] = useState<number>(0);
  const [editInitialWh, setEditInitialWh] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Filtering & Sorting
  const filteredMaterials = useMemo(() => {
    return materials
      .filter((m) => {
        const matchesSearch =
          m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.description.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        const isEqual = m.current_sap === m.current_warehouse;
        const isNegative = m.current_sap < 0 || m.current_warehouse < 0;

        if (filterType === 'equal') return isEqual && !isNegative;
        if (filterType === 'diff') return !isEqual && !isNegative;
        if (filterType === 'negative') return isNegative;
        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [materials, searchTerm, filterType, sortField, sortAsc]);

  // Summary counts
  const countTotal = materials.length;
  const countEqual = materials.filter(
    (m) => m.current_sap === m.current_warehouse && m.current_sap >= 0 && m.current_warehouse >= 0
  ).length;
  const countDiff = materials.filter(
    (m) => m.current_sap !== m.current_warehouse && m.current_sap >= 0 && m.current_warehouse >= 0
  ).length;
  const countNegative = materials.filter((m) => m.current_sap < 0 || m.current_warehouse < 0).length;

  const handleStartEdit = (mat: Material) => {
    if (!isAdmin) {
      showNotification('เฉพาะ Admin เท่านั้นที่สามารถแก้ไข Stock ตั้งต้นได้', 'error');
      return;
    }
    setEditingMaterialId(mat.id);
    setEditInitialSap(mat.initial_sap);
    setEditInitialWh(mat.initial_warehouse);
  };

  const handleSaveInitial = async (materialId: string) => {
    setIsSaving(true);
    try {
      const res = await updateMaterialInitialStock(materialId, editInitialSap, editInitialWh);
      if (res.success) {
        showNotification('แก้ไขค่าตั้งต้น Stock สำเร็จและปรับปรุงยอดคงเหลือเรียบร้อย', 'success');
        setEditingMaterialId(null);
        await onRefresh();
      } else {
        showNotification(res.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredMaterials.map((m) => {
      let statusStr = 'ปกติ (เท่ากัน)';
      if (m.current_sap < 0 || m.current_warehouse < 0) {
        statusStr = 'ติดลบ';
      } else if (m.current_sap !== m.current_warehouse) {
        statusStr = 'SAP กับคลังไม่เท่ากัน';
      }
      return {
        'รหัสวัสดุ': m.id,
        'คำอธิบายวัสดุ': m.description,
        'ตั้งต้น SAP': m.initial_sap,
        'ตั้งต้น คลัง': m.initial_warehouse,
        'คงเหลือ SAP': m.current_sap,
        'คงเหลือคลังจริง': m.current_warehouse,
        'สถานะ': statusStr,
      };
    });

    exportDataToExcel(exportData, 'StockBalance', 'WMS_Stock_Report');
    showNotification('ส่งออกรายงานยอดคงเหลือเป็น Excel สำเร็จ', 'success');
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterType('all')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterType === 'all'
              ? 'bg-sky-50/70 border-sky-300 shadow-2xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">พัสดุทั้งหมดในระบบ</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{countTotal} รายการ</div>
          <div className="text-xs text-slate-400 mt-1">Master Data 35 รายการตามระบุ</div>
        </button>

        <button
          onClick={() => setFilterType('equal')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterType === 'equal'
              ? 'bg-teal-50/70 border-teal-300 shadow-2xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
            <span>SAP กับคลังจริงเท่ากัน</span>
          </div>
          <div className="text-2xl font-bold text-teal-800 mt-1">{countEqual} รายการ</div>
          <div className="text-xs text-teal-600/80 mt-1">ยอดตัดจ่ายในระบบตรงกับคลังจริง</div>
        </button>

        <button
          onClick={() => setFilterType('diff')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterType === 'diff'
              ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>SAP กับคลังจริงไม่เท่ากัน</span>
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{countDiff} รายการ</div>
          <div className="text-xs text-amber-600 mt-1">เกิดจากการแบ่งหยิบ หรือตัดจ่ายใน SAP ก่อน</div>
        </button>

        <button
          onClick={() => setFilterType('negative')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterType === 'negative'
              ? 'bg-rose-50/70 border-rose-300 shadow-2xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>Stock ติดลบ</span>
          </div>
          <div className="text-2xl font-bold text-rose-800 mt-1">{countNegative} รายการ</div>
          <div className="text-xs text-rose-600/80 mt-1">ต้องตรวจสอบและปรับปรุง Stock ทันที</div>
        </button>
      </div>

      {/* Control Bar: Search, Filter Tabs, Export */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="input-search-materials"
            type="text"
            placeholder="ค้นหารหัสวัสดุ หรือคำอธิบาย..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-slate-500 hidden sm:inline">
            แสดง {filteredMaterials.length} จาก {materials.length} รายการ
          </span>
          <button
            id="btn-export-excel-stock"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Master Table Single-Page View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
            <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200/80">
              <tr>
                <th
                  onClick={() => toggleSort('id')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>รหัสวัสดุ</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('description')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>คำอธิบายวัสดุ</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">ตั้งต้น SAP</th>
                <th className="py-3 px-4 text-right">ตั้งต้น คลัง</th>
                <th
                  onClick={() => toggleSort('current_sap')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>คงเหลือ SAP</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('current_warehouse')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>คงเหลือคลังจริง</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">สถานะ</th>
                {isAdmin && <th className="py-3 px-4 text-center">จัดการ (Admin)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-slate-400 font-sans">
                    ไม่พบข้อมูลวัสดุที่ค้นหา
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((mat) => {
                  const isEqual = mat.current_sap === mat.current_warehouse;
                  const isNegative = mat.current_sap < 0 || mat.current_warehouse < 0;
                  const isEditing = editingMaterialId === mat.id;

                  return (
                    <tr
                      key={mat.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isNegative
                          ? 'bg-rose-50/30'
                          : !isEqual
                          ? 'bg-amber-50/25'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-900">{mat.id}</td>
                      <td className="py-3 px-4 font-sans text-slate-800 max-w-xs truncate" title={mat.description}>
                        {mat.description}
                      </td>

                      {/* Initial Stock Editing Row */}
                      {isEditing ? (
                        <>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              value={editInitialSap}
                              onChange={(e) => setEditInitialSap(Number(e.target.value))}
                              className="w-24 px-2 py-1 border border-sky-400 rounded-lg text-right text-xs focus:ring-1 focus:ring-sky-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              value={editInitialWh}
                              onChange={(e) => setEditInitialWh(Number(e.target.value))}
                              className="w-24 px-2 py-1 border border-sky-400 rounded-lg text-right text-xs focus:ring-1 focus:ring-sky-500"
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4 text-right text-slate-600">
                            {mat.initial_sap.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-600">
                            {mat.initial_warehouse.toLocaleString()}
                          </td>
                        </>
                      )}

                      {/* Current SAP */}
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          mat.current_sap < 0
                            ? 'text-rose-600'
                            : !isEqual
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {mat.current_sap.toLocaleString()}
                      </td>

                      {/* Current Warehouse */}
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          mat.current_warehouse < 0
                            ? 'text-rose-600'
                            : !isEqual
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {mat.current_warehouse.toLocaleString()}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 text-center font-sans">
                        {isNegative ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/70">
                            <AlertCircle className="w-3 h-3" />
                            <span>Stock ติดลบ</span>
                          </span>
                        ) : isEqual ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200/70">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ตรงกัน (ปกติ)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/70">
                            <AlertTriangle className="w-3 h-3" />
                            <span>SAP ≠ คลัง</span>
                          </span>
                        )}
                      </td>

                      {/* Admin Edit Controls */}
                      {isAdmin && (
                        <td className="py-3 px-4 text-center font-sans">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleSaveInitial(mat.id)}
                                disabled={isSaving}
                                className="p-1 rounded-lg bg-teal-500 hover:bg-teal-600 text-white cursor-pointer transition-colors"
                                title="บันทึก"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingMaterialId(null)}
                                className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer transition-colors"
                                title="ยกเลิก"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartEdit(mat)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 border border-slate-200/80 cursor-pointer transition-colors"
                              title="แก้ไข Stock ตั้งต้น (Admin Only)"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>ตั้งต้น</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
