import React, { useState } from 'react';
import { Demand, Material, PickTransaction, WarehouseCode, WAREHOUSE_CODES } from '../types';
import {
  executePickDisbursement,
  editPickTransaction,
  deletePickTransaction,
} from '../lib/storage';
import {
  CheckSquare,
  Scissors,
  CheckCircle2,
  Calendar,
  History,
  X,
  Trash2,
  Edit3,
  Search,
} from 'lucide-react';

interface PickDisbursementViewProps {
  demands: Demand[];
  materials: Material[];
  pickTransactions: PickTransaction[];
  onRefresh: () => Promise<void>;
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

export const PickDisbursementView: React.FC<PickDisbursementViewProps> = ({
  demands,
  materials,
  pickTransactions,
  onRefresh,
  showNotification,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');

  // Pick Modal State
  const [activeDemand, setActiveDemand] = useState<Demand | null>(null);
  const [pickMode, setPickMode] = useState<'PARTIAL' | 'FULL'>('PARTIAL');
  const [pickQuantity, setPickQuantity] = useState<string>('');
  const [warehouseCode, setWarehouseCode] = useState<WarehouseCode>('J010');
  const [pickNotes, setPickNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // History Drawer / Modal
  const [historyDemand, setHistoryDemand] = useState<Demand | null>(null);

  // Edit Transaction State
  const [editingPickId, setEditingPickId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);

  // Open Pick Modal
  const handleOpenPickModal = (demand: Demand, mode: 'PARTIAL' | 'FULL') => {
    setActiveDemand(demand);
    setPickMode(mode);
    setPickQuantity(mode === 'FULL' ? demand.remaining.toString() : '');
    setWarehouseCode('J010');
    setPickNotes('');
  };

  // Submit Pick
  const handleConfirmPick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDemand) return;

    const qty = parseFloat(pickQuantity);
    if (isNaN(qty) || qty <= 0) {
      showNotification('กรุณาระบุจำนวนที่ต้องการหยิบเป็นตัวเลขที่มากกว่า 0', 'error');
      return;
    }

    if (qty > activeDemand.remaining) {
      showNotification(`จำนวนที่หยิบ (${qty}) เกินกว่าคงค้าง (${activeDemand.remaining})`, 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await executePickDisbursement({
        demandId: activeDemand.id,
        pickType: pickMode === 'FULL' ? 'SINGLE_PICK' : 'PARTIAL_PICK',
        pickQuantity: qty,
        warehouseCode,
        notes: pickNotes,
      });

      if (res.success) {
        showNotification(
          `ตัดจ่ายพัสดุ ${activeDemand.material_id} จำนวน ${qty.toLocaleString()} สำเร็จ (Stock คลังและ SAP ถูกตัดตามจริง)`,
          'success'
        );
        setActiveDemand(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'เกิดข้อผิดพลาดในการตัดจ่าย', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'การตัดจ่ายล้มเหลว', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Edit Pick Transaction (Rule 23)
  const handleSaveEditPick = async (pick: PickTransaction) => {
    if (editQty <= 0) {
      showNotification('จำนวนต้องมากกว่า 0', 'error');
      return;
    }
    try {
      const res = await editPickTransaction(pick.id, editQty);
      if (res.success) {
        showNotification(`แก้ไขยอดหยิบพัสดุสำเร็จ และคำนวณส่วนต่าง Stock เรียบร้อย`, 'success');
        setEditingPickId(null);
        await onRefresh();
      } else {
        showNotification(res.error || 'แก้ไขล้มเหลว', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'แก้ไขล้มเหลว', 'error');
    }
  };

  // Delete Pick Transaction with Stock Reversal (Rule 24)
  const handleDeletePick = async (pick: PickTransaction) => {
    if (
      !window.confirm(
        `คุณต้องการยกเลิกและลบรายการหยิบนี้หรือไม่? (ระบบจะทำการ Reverse Stock คืน +${pick.quantity} หน่วย)`
      )
    ) {
      return;
    }

    try {
      const res = await deletePickTransaction(pick.id);
      if (res.success) {
        showNotification(`ยกเลิกรายการหยิบสำเร็จ และคืน Stock +${pick.quantity} หน่วยเรียบร้อย`, 'success');
        await onRefresh();
      } else {
        showNotification(res.error || 'ลบล้มเหลว', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'ลบล้มเหลว', 'error');
    }
  };

  // Filter demands
  const filteredDemands = demands.filter((d) => {
    const matchesSearch =
      d.doc_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.material_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.material_description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterStatus === 'pending') return d.remaining > 0;
    if (filterStatus === 'completed') return d.remaining === 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาเลขที่ใบสั่ง, รหัสวัสดุ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              filterStatus === 'all'
                ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            ทั้งหมด ({demands.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              filterStatus === 'pending'
                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            รอเบิก / แบ่งหยิบค้าง ({demands.filter((d) => d.remaining > 0).length})
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              filterStatus === 'completed'
                ? 'bg-teal-100 text-teal-800 border border-teal-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            เบิกครบแล้ว ({demands.filter((d) => d.remaining === 0).length})
          </button>
        </div>
      </div>

      {/* Master Table Single-Page View (Section 6.3) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
            <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">ชื่องาน / ใบสั่ง</th>
                <th className="py-3 px-4">วัสดุ</th>
                <th className="py-3 px-4">คำอธิบาย</th>
                <th className="py-3 px-4 text-right">Demand</th>
                <th className="py-3 px-4 text-right">Picked สะสม</th>
                <th className="py-3 px-4 text-right">Remaining</th>
                <th className="py-3 px-4 text-center">วันที่เบิกล่าสุด</th>
                <th className="py-3 px-4 text-center">สถานะ</th>
                <th className="py-3 px-4 text-center">ดำเนินการตัดจ่าย / หยิบจริง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredDemands.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    ไม่มีรายการที่ต้องตัดจ่าย (หากยังไม่มีแผนเบิก กรุณาไปที่เมนู "2. วางแผนเบิกพัสดุ")
                  </td>
                </tr>
              ) : (
                filteredDemands.map((d) => {
                  const isCompleted = d.remaining === 0;
                  const relatedPicks = pickTransactions.filter((p) => p.demand_id === d.id);
                  const mat = materials.find((m) => m.id === d.material_id);

                  return (
                    <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">
                        <div>{d.doc_no}</div>
                        <span className="text-2xs text-slate-500 font-normal">
                          {d.plant} | {d.demand_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{d.material_id}</td>
                      <td className="py-3 px-4 font-sans text-slate-700 max-w-xs truncate" title={d.material_description}>
                        <div>{d.material_description}</div>
                        {mat && (
                          <div className="text-2xs text-slate-400">
                            (คงเหลือคลังจริง: {mat.current_warehouse.toLocaleString()} | SAP:{' '}
                            {mat.current_sap.toLocaleString()})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {d.quantity_demand.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-sky-700 font-bold">
                        {d.picked_total.toLocaleString()}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          isCompleted ? 'text-slate-400' : 'text-amber-700'
                        }`}
                      >
                        {d.remaining.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-sans text-slate-500 text-2xs">
                        {d.last_picked_at ? new Date(d.last_picked_at).toLocaleString('th-TH') : '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-teal-50 text-teal-700 border border-teal-200/80">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Completed</span>
                          </span>
                        ) : d.picked_total > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
                            <span>แบ่งหยิบบางส่วน</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-slate-50 text-slate-600 border border-slate-200/80">
                            <span>รอเบิก</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          {isCompleted ? (
                            <span className="text-xs text-slate-400 font-sans">เบิกครบแล้ว</span>
                          ) : (
                            <>
                              {/* 6.1 แบ่งหยิบ */}
                              <button
                                onClick={() => handleOpenPickModal(d, 'PARTIAL')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-xl border border-sky-200 cursor-pointer transition-colors shadow-2xs"
                                title="แบ่งหยิบพัสดุตามจำนวนที่ต้องการ"
                              >
                                <Scissors className="w-3.5 h-3.5 text-sky-600" />
                                <span>แบ่งหยิบ</span>
                              </button>

                              {/* 6.2 เบิกเต็มจำนวน */}
                              <button
                                onClick={() => handleOpenPickModal(d, 'FULL')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-teal-500 text-white hover:bg-teal-600 rounded-xl shadow-2xs cursor-pointer transition-colors"
                                title="เบิกเต็มจำนวน Remaining ทั้งหมดในครั้งเดียว"
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                                <span>เบิกเต็ม</span>
                              </button>
                            </>
                          )}

                          {/* History button */}
                          {relatedPicks.length > 0 && (
                            <button
                              onClick={() => setHistoryDemand(d)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                              title={`ดูประวัติการหยิบ (${relatedPicks.length} ครั้ง)`}
                            >
                              <History className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pick Action Modal */}
      {activeDemand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-sky-50/50 border-b border-sky-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {pickMode === 'FULL' ? 'เบิกเต็มจำนวน (Single Pick)' : 'แบ่งหยิบพัสดุ (Partial Pick)'}
                </h3>
              </div>
              <button
                onClick={() => setActiveDemand(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPick} className="p-5 space-y-4">
              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
                <div>
                  ชื่องาน: <strong className="text-slate-800">{activeDemand.doc_no}</strong>
                </div>
                <div>
                  รหัสพัสดุ: <strong className="font-mono text-slate-800">{activeDemand.material_id}</strong>
                </div>
                <div className="text-slate-600">{activeDemand.material_description}</div>
                <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 text-center">
                  <div>
                    <div className="text-2xs text-slate-400">Demand ทั้งหมด</div>
                    <div className="font-bold font-mono text-slate-800">
                      {activeDemand.quantity_demand.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs text-slate-400">Picked แล้ว</div>
                    <div className="font-bold font-mono text-sky-600">
                      {activeDemand.picked_total.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs text-slate-400">Remaining คงค้าง</div>
                    <div className="font-bold font-mono text-amber-600">
                      {activeDemand.remaining.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  จำนวนที่ต้องการตัดจ่าย / หยิบจริง *
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={activeDemand.remaining}
                  step="any"
                  required
                  value={pickQuantity}
                  onChange={(e) => setPickQuantity(e.target.value)}
                  placeholder={`ไม่เกิน ${activeDemand.remaining}`}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200/90 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400 font-bold"
                />
                <p className="text-2xs text-slate-400 mt-1">
                  * กฎสำคัญ: Stock คลังและ SAP จะลดลงเฉพาะยอดที่หยิบจริงนี้เท่านั้น ({pickQuantity || 0} หน่วย) ไม่มีการตัดยอด Demand 100 ซ้ำ
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  คลังสินค้า (Warehouse) *
                </label>
                <select
                  value={warehouseCode}
                  onChange={(e) => setWarehouseCode(e.target.value as WarehouseCode)}
                  className="w-full px-3 py-2 text-sm border border-slate-200/90 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                >
                  {WAREHOUSE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมายเหตุ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={pickNotes}
                  onChange={(e) => setPickNotes(e.target.value)}
                  placeholder="เช่น เบิกลงหน้างานชุดที่ 1"
                  className="w-full px-3 py-2 text-sm border border-slate-200/90 rounded-xl focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDemand(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  {isProcessing ? 'กำลังตัดจ่าย...' : 'ยืนยันตัดจ่าย / หยิบจริง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Drawer / Modal */}
      {historyDemand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  ประวัติการตัดจ่ายพัสดุ: {historyDemand.doc_no}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {historyDemand.material_id} : {historyDemand.material_description}
                </p>
              </div>
              <button
                onClick={() => setHistoryDemand(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">วันที่ตัดจ่าย</th>
                    <th className="py-2.5 px-3">ประเภท</th>
                    <th className="py-2.5 px-3">คลัง</th>
                    <th className="py-2.5 px-3 text-right">จำนวนที่หยิบ</th>
                    <th className="py-2.5 px-3 text-right">Stock หลังหยิบ</th>
                    <th className="py-2.5 px-3 text-center">จัดการ (Rule 23,24)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {pickTransactions
                    .filter((p) => p.demand_id === historyDemand.id)
                    .map((pick) => {
                      const isEditing = editingPickId === pick.id;
                      return (
                        <tr key={pick.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-sans text-2xs text-slate-600">
                            {new Date(pick.created_at).toLocaleString('th-TH')}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
                              {pick.pick_type === 'SINGLE_PICK' ? 'หยิบครั้งเดียว' : 'แบ่งหยิบ'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">{pick.warehouse_code}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editQty}
                                onChange={(e) => setEditQty(Number(e.target.value))}
                                className="w-20 px-1 py-0.5 border border-sky-400 rounded-lg text-right text-xs"
                              />
                            ) : (
                              pick.quantity.toLocaleString()
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            คลัง: {pick.wh_after.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSaveEditPick(pick)}
                                  className="px-2.5 py-1 bg-teal-500 text-white rounded-lg text-2xs font-bold cursor-pointer hover:bg-teal-600 transition-colors"
                                >
                                  บันทึก
                                </button>
                                <button
                                  onClick={() => setEditingPickId(null)}
                                  className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-2xs cursor-pointer hover:bg-slate-300 transition-colors"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingPickId(pick.id);
                                    setEditQty(pick.quantity);
                                  }}
                                  className="text-sky-600 hover:text-sky-800 text-2xs font-semibold flex items-center gap-0.5 cursor-pointer"
                                  title="แก้ไขจำนวนและคำนวณส่วนต่าง Stock"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>แก้</span>
                                </button>
                                <button
                                  onClick={() => handleDeletePick(pick)}
                                  className="text-rose-500 hover:text-rose-700 text-2xs font-semibold flex items-center gap-0.5 cursor-pointer"
                                  title="ลบรายการและ Reverse Stock คืน"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>คืน Stock</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setHistoryDemand(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
