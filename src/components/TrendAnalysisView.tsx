import React, { useMemo } from 'react';
import { Material, PickTransaction } from '../types';
import { exportDataToExcel } from '../lib/storage';
import {
  TrendingUp,
  FileSpreadsheet,
  AlertOctagon,
  CheckCircle,
  Clock,
  ArrowUpRight,
  PackageCheck,
  ShoppingCart,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

interface TrendAnalysisViewProps {
  materials: Material[];
  pickTransactions: PickTransaction[];
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

export const TrendAnalysisView: React.FC<TrendAnalysisViewProps> = ({
  materials,
  pickTransactions,
  showNotification,
}) => {
  // 14.1 Top Utilized Materials & Procurement Calculations
  const analysisData = useMemo(() => {
    // Group picks by material
    const matTotalPick: Record<string, number> = {};
    pickTransactions.forEach((p) => {
      matTotalPick[p.material_id] = (matTotalPick[p.material_id] || 0) + p.quantity;
    });

    return materials.map((m) => {
      const totalPicked = matTotalPick[m.id] || 0;
      // Estimate monthly average (assume last 3 months or min 1)
      const avgMonthly = totalPicked > 0 ? Math.ceil(totalPicked / 3) : 0;
      // Safety Stock: 1.5x monthly average or 10% of initial
      const safetyStock = avgMonthly > 0 ? Math.ceil(avgMonthly * 1.5) : Math.ceil(m.initial_warehouse * 0.15);
      // Reorder Point = Safety Stock + (avgMonthly * 1 month lead time)
      const reorderPoint = safetyStock + avgMonthly;
      // Recommended Order Qty
      const deficit = reorderPoint - m.current_warehouse;
      const recommendedOrder = deficit > 0 ? deficit : 0;

      let statusPriority: 'URGENT' | 'WARNING' | 'NORMAL' = 'NORMAL';
      if (m.current_warehouse <= 0) {
        statusPriority = 'URGENT';
      } else if (m.current_warehouse < reorderPoint) {
        statusPriority = 'WARNING';
      }

      return {
        material: m,
        totalPicked,
        avgMonthly,
        safetyStock,
        reorderPoint,
        currentWh: m.current_warehouse,
        recommendedOrder,
        statusPriority,
      };
    });
  }, [materials, pickTransactions]);

  // Top 8 Materials by Utilization
  const topMaterials = useMemo(() => {
    return [...analysisData]
      .sort((a, b) => b.totalPicked - a.totalPicked)
      .slice(0, 8);
  }, [analysisData]);

  // Monthly consumption trend (Last 6 months)
  const monthlyTrendData = useMemo(() => {
    const monthsMap: Record<string, { month: string; total: number; cumulative: number }> = {};
    const now = new Date();

    // Init last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.toLocaleString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}`;
      monthsMap[key] = { month: label, total: 0, cumulative: 0 };
    }

    pickTransactions.forEach((p) => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthsMap[key]) {
        monthsMap[key].total += p.quantity;
      }
    });

    let runningCum = 0;
    return Object.values(monthsMap).map((m) => {
      runningCum += m.total;
      return {
        ...m,
        cumulative: runningCum,
      };
    });
  }, [pickTransactions]);

  const procurementUrgent = analysisData.filter((d) => d.statusPriority === 'URGENT');
  const procurementWarning = analysisData.filter((d) => d.statusPriority === 'WARNING');

  const handleExportProcurement = () => {
    const exportData = analysisData.map((d) => ({
      'รหัสวัสดุ': d.material.id,
      'คำอธิบายวัสดุ': d.material.description,
      'เบิกสะสมทั้งหมด': d.totalPicked,
      'ค่าเฉลี่ยต่อเดือน (AMC)': d.avgMonthly,
      'ระดับ Safety Stock': d.safetyStock,
      'จุดสั่งซื้อใหม่ (Reorder Point)': d.reorderPoint,
      'คงเหลือคลังจริงปัจจุบัน': d.currentWh,
      'ควรเตรียมจัดซื้อ (หน่วย)': d.recommendedOrder,
      'ระดับความสำคัญ':
        d.statusPriority === 'URGENT'
          ? 'ด่วนที่สุด (หมด/ติดลบ)'
          : d.statusPriority === 'WARNING'
          ? 'ควรจัดซื้อ (ต่ำกว่าจุด ROP)'
          : 'ปกติ',
    }));

    exportDataToExcel(exportData, 'ProcurementPlan', 'WMS_Procurement_Planning');
    showNotification('ส่งออกแผนวิเคราะห์จัดซื้อเป็น Excel สำเร็จ', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Top Banner / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <PackageCheck className="w-4 h-4 text-sky-600" />
            <span>พัสดุที่มีการใช้งาน</span>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-1 font-mono">
            {analysisData.filter((d) => d.totalPicked > 0).length} / {materials.length} <span className="text-xs font-normal text-slate-500">รายการ</span>
          </div>
          <div className="text-2xs text-slate-400 mt-1">มีประวัติการตัดจ่ายจริงในระบบ</div>
        </div>

        <div className="p-4 rounded-2xl border border-rose-200/80 bg-rose-50/60 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <span>ต้องสั่งซื้อด่วน (หมด/ติดลบ)</span>
          </div>
          <div className="text-2xl font-bold text-rose-900 mt-1 font-mono">
            {procurementUrgent.length} <span className="text-xs font-normal text-rose-700">รายการ</span>
          </div>
          <div className="text-2xs text-rose-700 mt-1">Stock ในคลังเป็นศูนย์หรือติดลบ</div>
        </div>

        <div className="p-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>ควรเตรียมจัดซื้อ (ROP)</span>
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1 font-mono">
            {procurementWarning.length} <span className="text-xs font-normal text-amber-700">รายการ</span>
          </div>
          <div className="text-2xs text-amber-700 mt-1">คงเหลือต่ำกว่าจุดสั่งซื้อใหม่ (Reorder Point)</div>
        </div>

        <div className="p-4 rounded-2xl border border-teal-200/80 bg-teal-50/60 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
            <CheckCircle className="w-4 h-4 text-teal-600" />
            <span>ระดับ Stock ปลอดภัย</span>
          </div>
          <div className="text-2xl font-bold text-teal-900 mt-1 font-mono">
            {analysisData.filter((d) => d.statusPriority === 'NORMAL').length} <span className="text-xs font-normal text-teal-700">รายการ</span>
          </div>
          <div className="text-2xs text-teal-700 mt-1">มีปริมาณเพียงพอต่อความต้องการ</div>
        </div>
      </div>

      {/* Visual Charts: 14.1 & 14.2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 14.1 Top Utilized Materials Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                14.1 พัสดุที่มีการใช้งานสูงสุด (Top Utilized Materials)
              </h3>
              <p className="text-xs text-slate-500">ลำดับพัสดุที่มีปริมาณการเบิกใช้งานสะสมสูงสุด</p>
            </div>
            <TrendingUp className="w-5 h-5 text-sky-500" />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topMaterials.map((d) => ({
                  name: d.material.id,
                  picked: d.totalPicked,
                  stock: d.currentWh,
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    Number(value).toLocaleString(),
                    name === 'picked' ? 'ยอดเบิกสะสม' : 'คงเหลือคลัง',
                  ]}
                />
                <Bar dataKey="picked" fill="#38bdf8" radius={[6, 6, 0, 0]} name="ยอดเบิกสะสม" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 14.2 & 14.3 Monthly & Cumulative Trend Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                14.2 ปริมาณการใช้ต่อเดือน & ปริมาณสะสม
              </h3>
              <p className="text-xs text-slate-500">แนวโน้มการเติบโตของปริมาณการเบิกใช้งานย้อนหลัง</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-teal-500" />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlyTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    Number(value).toLocaleString(),
                    name === 'total' ? 'เบิกในเดือน' : 'เบิกสะสม',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  name="เบิกในเดือน"
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#14b8a6"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                  name="เบิกสะสม"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 14.4 Procurement Planning Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-800">
                14.4 วางแผนจัดซื้อพัสดุ (Procurement Planning Recommendation)
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              วิเคราะห์อัตโนมัติ: ควรเตรียมจัดซื้อวัสดุใด และควรเตรียมประมาณกี่หน่วย คำนวณจาก Safety Stock และ Reorder Point
            </p>
          </div>

          <button
            onClick={handleExportProcurement}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
            <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">รหัสวัสดุ</th>
                <th className="py-3 px-4">คำอธิบาย</th>
                <th className="py-3 px-4 text-right">เบิกสะสม</th>
                <th className="py-3 px-4 text-right">เฉลี่ย/เดือน</th>
                <th className="py-3 px-4 text-right">Safety Stock</th>
                <th className="py-3 px-4 text-right">จุด ROP</th>
                <th className="py-3 px-4 text-right">คงเหลือคลังจริง</th>
                <th className="py-3 px-4 text-right bg-sky-50/60 font-bold text-sky-900">ควรเตรียมจัดซื้อ</th>
                <th className="py-3 px-4 text-center">ระดับความสำคัญ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {analysisData.map((d) => (
                <tr
                  key={d.material.id}
                  className={`hover:bg-slate-50/70 transition-colors ${
                    d.statusPriority === 'URGENT'
                      ? 'bg-rose-50/50'
                      : d.statusPriority === 'WARNING'
                      ? 'bg-amber-50/40'
                      : ''
                  }`}
                >
                  <td className="py-3 px-4 font-bold text-slate-900">{d.material.id}</td>
                  <td className="py-3 px-4 font-sans text-slate-700 max-w-xs truncate" title={d.material.description}>
                    {d.material.description}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-sky-700">
                    {d.totalPicked.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {d.avgMonthly.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {d.safetyStock.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">
                    {d.reorderPoint.toLocaleString()}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold ${
                      d.currentWh <= 0 ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {d.currentWh.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-bold bg-sky-50/30 text-sky-700">
                    {d.recommendedOrder > 0 ? `${d.recommendedOrder.toLocaleString()} หน่วย` : '-'}
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    {d.statusPriority === 'URGENT' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                        <AlertOctagon className="w-3 h-3" />
                        <span>ด่วนที่สุด (Stock หมด)</span>
                      </span>
                    ) : d.statusPriority === 'WARNING' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                        <Clock className="w-3 h-3" />
                        <span>ควรจัดซื้อ (ต่ำกว่า ROP)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-medium bg-teal-50 text-teal-700 border border-teal-200/80">
                        <CheckCircle className="w-3 h-3" />
                        <span>Stock ปกติ</span>
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
  );
};
