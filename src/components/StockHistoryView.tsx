import React, { useState, useMemo } from 'react';
import { StockHistoryItem, Material, TransactionType } from '../types';
import { exportDataToExcel, performStockAudit } from '../lib/storage';
import {
  History,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface StockHistoryViewProps {
  transactions: StockHistoryItem[];
  materials: Material[];
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

export const StockHistoryView: React.FC<StockHistoryViewProps> = ({
  transactions,
  materials,
  showNotification,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'history' | 'audit'>('history');

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.material_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.material_description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.pick_status || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (filterType !== 'ALL' && t.transaction_type !== filterType) return false;
      return true;
    });
  }, [transactions, searchTerm, filterType]);

  // Section 25: Audit / Reconciliation Logic
  const [auditData, setAuditData] = useState<
    Array<{
      material_id: string;
      description: string;
      initial_wh: number;
      current_wh: number;
      expected_wh: number;
      diff_wh: number;
      isMismatch: boolean;
      txCount: number;
    }>
  >([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await performStockAudit();
      setAuditData(res);
    } catch (e: any) {
      console.warn(e);
    } finally {
      setIsAuditing(false);
    }
  };

  // Run initial audit on load or when materials/transactions change
  React.useEffect(() => {
    runAudit();
  }, [materials, transactions]);

  const mismatchCount = auditData.filter((r) => r.isMismatch).length;

  const handleExportHistory = () => {
    const exportData = filteredTransactions.map((t, idx) => ({
      '#': idx + 1,
      'วันที่เบิก': new Date(t.created_at).toLocaleString('th-TH'),
      'รหัสวัสดุ': t.material_id,
      'คำอธิบายวัสดุ': t.material_description,
      'ชื่องาน / โครงการ': t.project_name,
      Demand: t.demand_qty,
      'สถานะเบิก': t.pick_status,
      'จำนวนที่หยิบ/โอน (Picked)': t.picked_qty,
      'คงค้างบริษัท': t.remaining_company,
      'คงเหลือ SAP': t.remaining_sap,
      'คงเหลือคลังจริง': t.remaining_wh,
      'ประเภท Transaction': t.transaction_type,
    }));

    exportDataToExcel(exportData, 'StockHistory', 'WMS_Stock_History');
    showNotification('ส่งออกประวัติการทำรายการเป็น Excel สำเร็จ', 'success');
  };

  const handleExportAudit = () => {
    const exportData = auditData.map((r) => ({
      'รหัสวัสดุ': r.material_id,
      'คำอธิบาย': r.description,
      'ตั้งต้น คลัง': r.initial_wh,
      'คลัง คำนวณจาก Tx': r.expected_wh,
      'คลัง ปัจจุบัน': r.current_wh,
      'ส่วนต่าง (Diff)': r.diff_wh,
      'จำนวน Transaction': r.txCount,
      'สถานะการตรวจทาน': r.isMismatch ? '⚠️ Stock Mismatch' : '✓ Reconciled',
    }));

    exportDataToExcel(exportData, 'StockAudit', 'WMS_Stock_Reconciliation');
    showNotification('ส่งออกข้อมูล Audit Reconciliation เป็น Excel สำเร็จ', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Sub tabs: History Table vs Audit/Reconciliation */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200/80 pb-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-sky-500 text-white shadow-2xs'
                : 'bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>5. ประวัติการทำรายการ (Stock History)</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-sky-500 text-white shadow-2xs'
                : 'bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              Audit & Reconciliation ตรวจทาน Stock ({mismatchCount > 0 ? `⚠️ ${mismatchCount}` : '✓ 100%'})
            </span>
          </button>
        </div>

        <button
          onClick={activeTab === 'history' ? handleExportHistory : handleExportAudit}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: STOCK HISTORY TABLE (Section 10)                  */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหารหัสวัสดุ, ชื่องาน, โครงการ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-slate-100/60 rounded-xl border border-slate-200/60">
              {['ALL', 'PICK', 'TRANSFER_OUT', 'TRANSFER_IN', 'ISSUE', 'ADJUSTMENT'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    filterType === type
                      ? 'bg-white text-sky-700 shadow-2xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  {type === 'ALL'
                    ? 'ทั้งหมด'
                    : type === 'PICK'
                    ? 'หยิบ/เบิก'
                    : type === 'TRANSFER_OUT'
                    ? 'โอนออกเขต'
                    : type === 'TRANSFER_IN'
                    ? 'รับโอนเข้า'
                    : type}
                </button>
              ))}
            </div>
          </div>

          {/* Master History Table (Section 10 schema) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  ตารางประวัติการทำรายการ Stock (Stock History Table ตาม Section 10)
                </h3>
                <p className="text-xs text-slate-500">
                  ทุก Transaction บันทึกยอดก่อนและหลังทำรายการตามกฎ Recheck อย่างเคร่งครัด
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                แสดง {filteredTransactions.length} รายการ
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
                <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-3 text-center">#</th>
                    <th className="py-3 px-4">วันที่เบิก</th>
                    <th className="py-3 px-4">รหัส / คำอธิบายวัสดุ</th>
                    <th className="py-3 px-4">ชื่องาน / โครงการ</th>
                    <th className="py-3 px-4 text-right">Demand</th>
                    <th className="py-3 px-4">สถานะเบิก</th>
                    <th className="py-3 px-4 text-right">Picked</th>
                    <th className="py-3 px-4 text-right">คงค้างบริษัท</th>
                    <th className="py-3 px-4 text-right">คงเหลือ SAP</th>
                    <th className="py-3 px-4 text-right">คงเหลือคลังจริง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                        ยังไม่มีประวัติการทำรายการในระบบ
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-sans text-slate-600 text-2xs">
                          {new Date(tx.created_at).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{tx.material_id}</div>
                          <div className="text-2xs font-sans text-slate-500 truncate max-w-xs">
                            {tx.material_description}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans font-medium text-slate-800 max-w-xs truncate" title={tx.project_name}>
                          {tx.project_name}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {tx.demand_qty > 0 ? tx.demand_qty.toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-4 font-sans text-2xs">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-medium border ${
                              tx.transaction_type === 'PICK'
                                ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                                : tx.transaction_type === 'TRANSFER_IN'
                                ? 'bg-teal-50 text-teal-700 border-teal-200/80'
                                : tx.transaction_type === 'TRANSFER_OUT'
                                ? 'bg-sky-50 text-sky-700 border-sky-200/80'
                                : 'bg-slate-100 text-slate-700 border-slate-200/80'
                            }`}
                          >
                            {tx.pick_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-sky-700">
                          {tx.picked_qty.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {tx.remaining_company.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {tx.remaining_sap.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {tx.remaining_wh.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: AUDIT & RECONCILIATION (Section 25)               */}
      {/* ======================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between shadow-2xs ${
              mismatchCount === 0
                ? 'bg-teal-50/70 border-teal-200/80 text-teal-900'
                : 'bg-rose-50/70 border-rose-200/80 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {mismatchCount === 0 ? (
                <CheckCircle2 className="w-8 h-8 text-teal-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-sm">
                  {mismatchCount === 0
                    ? '✓ Stock Reconciled: ข้อมูลทั้งหมด 100% สอดคล้องตามกฎ Recheck'
                    : `⚠️ Stock Mismatch: พบข้อผิดพลาดไม่ตรงกัน ${mismatchCount} รายการ!`}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">
                  ระบบทำการ Recheck เปรียบเทียบ Current Stock กับผลรวมตั้งต้น + ผลรวมของทุก Transaction
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 font-mono">
              <button
                onClick={runAudit}
                disabled={isAuditing}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-sans text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>ตรวจทานอีกครั้ง</span>
              </button>
              <div className="text-right">
                <div className="text-xs font-sans text-slate-500">รายการตรวจสอบ</div>
                <div className="text-base font-bold">{materials.length} วัสดุ</div>
              </div>
            </div>
          </div>

          {/* Audit Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
                <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">รหัสวัสดุ</th>
                    <th className="py-3 px-4">คำอธิบาย</th>
                    <th className="py-3 px-4 text-right">ตั้งต้น คลัง</th>
                    <th className="py-3 px-4 text-right">คลัง คำนวณจาก Tx</th>
                    <th className="py-3 px-4 text-right">คลัง ปัจจุบัน</th>
                    <th className="py-3 px-4 text-right">ส่วนต่าง (Diff)</th>
                    <th className="py-3 px-4 text-center">Tx Count</th>
                    <th className="py-3 px-4 text-center">ผลการตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {auditData.map((r) => (
                    <tr
                      key={r.material_id}
                      className={r.isMismatch ? 'bg-rose-50/60 font-bold' : 'hover:bg-slate-50/70'}
                    >
                      <td className="py-3 px-4 text-slate-900 font-bold">{r.material_id}</td>
                      <td className="py-3 px-4 font-sans text-slate-700 max-w-xs truncate">
                        {r.description}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        {r.initial_wh.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {r.expected_wh.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {r.current_wh.toLocaleString()}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          r.diff_wh !== 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {r.diff_wh.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600">{r.txCount}</td>
                      <td className="py-3 px-4 text-center font-sans">
                        {r.isMismatch ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Mismatch (ไม่ตรง)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                            <span>100% ตรงกัน</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
