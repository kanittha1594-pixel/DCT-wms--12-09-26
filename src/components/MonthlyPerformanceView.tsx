import React, { useState, useMemo } from 'react';
import { Material, PickTransaction, WAREHOUSE_CODES, WarehouseCode } from '../types';
import { exportDataToExcel } from '../lib/storage';
import { BarChart3, FileSpreadsheet, Layers, Calendar, Filter } from 'lucide-react';

interface MonthlyPerformanceViewProps {
  materials: Material[];
  pickTransactions: PickTransaction[];
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

const MONTH_NAMES = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export const MonthlyPerformanceView: React.FC<MonthlyPerformanceViewProps> = ({
  materials,
  pickTransactions,
  showNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'warehouse' | 'monthly'>('warehouse');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-indexed

  // Available Years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    pickTransactions.forEach((p) => {
      const d = new Date(p.created_at);
      if (!isNaN(d.getTime())) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [pickTransactions]);

  // 12.1 Matrix: Materials x Warehouse Codes (for selected Year & Month)
  const warehouseMatrix = useMemo(() => {
    // Filter picks for selected Year and Month
    const relevantPicks = pickTransactions.filter((p) => {
      const d = new Date(p.created_at);
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });

    // Map by materialId and warehouse
    const pickMap: Record<string, Record<WarehouseCode, number>> = {};
    relevantPicks.forEach((p) => {
      if (!pickMap[p.material_id]) {
        pickMap[p.material_id] = {
          J010: 0,
          J020: 0,
          J030: 0,
          J040: 0,
          J050: 0,
          J060: 0,
          J070: 0,
          J090: 0,
        };
      }
      const code = p.warehouse_code as WarehouseCode;
      if (pickMap[p.material_id][code] !== undefined) {
        pickMap[p.material_id][code] += p.quantity;
      }
    });

    return materials.map((m) => {
      const counts = pickMap[m.id] || {
        J010: 0,
        J020: 0,
        J030: 0,
        J040: 0,
        J050: 0,
        J060: 0,
        J070: 0,
        J090: 0,
      };
      const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
      return {
        material: m,
        counts,
        total,
      };
    });
  }, [materials, pickTransactions, selectedYear, selectedMonth]);

  // Section 13: Material x 12 Months Matrix (for selected Year)
  const annualMonthlyMatrix = useMemo(() => {
    const relevantPicks = pickTransactions.filter((p) => {
      const d = new Date(p.created_at);
      return d.getFullYear() === selectedYear;
    });

    // Map by materialId and month (0-11)
    const annualMap: Record<string, number[]> = {};
    relevantPicks.forEach((p) => {
      const mIdx = new Date(p.created_at).getMonth();
      if (!annualMap[p.material_id]) {
        annualMap[p.material_id] = Array(12).fill(0);
      }
      annualMap[p.material_id][mIdx] += p.quantity;
    });

    return materials.map((m) => {
      const months = annualMap[m.id] || Array(12).fill(0);
      const yearTotal = months.reduce((sum, v) => sum + v, 0);
      return {
        material: m,
        months,
        yearTotal,
      };
    });
  }, [materials, pickTransactions, selectedYear]);

  // Excel Exports
  const handleExportWarehouseMatrix = () => {
    const exportData = warehouseMatrix.map((row) => ({
      'รหัสวัสดุ': row.material.id,
      'คำอธิบายวัสดุ': row.material.description,
      J010: row.counts['J010'],
      J020: row.counts['J020'],
      J030: row.counts['J030'],
      J040: row.counts['J040'],
      J050: row.counts['J050'],
      J060: row.counts['J060'],
      J070: row.counts['J070'],
      J090: row.counts['J090'],
      'รวมทั้งหมด': row.total,
    }));

    exportDataToExcel(
      exportData,
      'WarehouseSummary',
      `WMS_Warehouse_Summary_${selectedYear}_${selectedMonth + 1}`
    );
    showNotification('ส่งออกสรุปความต้องการแยกคลังสินค้าเป็น Excel สำเร็จ', 'success');
  };

  const handleExportAnnualMonthly = () => {
    const exportData = annualMonthlyMatrix.map((row) => {
      const rowObj: Record<string, any> = {
        'รหัสวัสดุ': row.material.id,
        'คำอธิบายวัสดุ': row.material.description,
      };
      MONTH_NAMES.forEach((name, i) => {
        rowObj[name] = row.months[i];
      });
      rowObj['รวมทั้งปี'] = row.yearTotal;
      return rowObj;
    });

    exportDataToExcel(exportData, 'AnnualMonthlySummary', `WMS_Annual_Monthly_${selectedYear}`);
    showNotification('ส่งออกสรุปการเบิกรายเดือนทั้งปีเป็น Excel สำเร็จ', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Sub Tabs & Export */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200/80 pb-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('warehouse')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'warehouse'
                ? 'bg-sky-500 text-white shadow-2xs'
                : 'bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>12.1 สรุปความต้องการแยกตามคลังสินค้า (J010-J090)</span>
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'monthly'
                ? 'bg-sky-500 text-white shadow-2xs'
                : 'bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-sky-50/50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>13. สรุปการเบิกรายเดือน (ม.ค. - ธ.ค. ทั้งปี)</span>
          </button>
        </div>

        {/* Filters and Export */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* Year selector */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span>ปี:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-300 focus:outline-none shadow-2xs"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr + 543} ({yr})
                </option>
              ))}
            </select>
          </div>

          {/* Month selector for warehouse tab */}
          {activeTab === 'warehouse' && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span>เดือน:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-300 focus:outline-none shadow-2xs"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={activeTab === 'warehouse' ? handleExportWarehouseMatrix : handleExportAnnualMonthly}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 12.1 Matrix: Materials x Warehouse Codes (J010-J090)     */}
      {/* ======================================================== */}
      {activeTab === 'warehouse' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                สรุปความต้องการวัสดุประจำเดือน {MONTH_NAMES[selectedMonth]} {selectedYear + 543} แยกตามคลังสินค้า
              </h3>
              <p className="text-xs text-slate-500">
                แสดงยอดตัดจ่าย / เบิกพัสดุในแต่ละคลัง: J010, J020, J030, J040, J050, J060, J070, J090
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 font-mono">
              35 รายการวัสดุ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-3">รหัสวัสดุ</th>
                  <th className="py-3 px-4">คำอธิบายวัสดุ</th>
                  {WAREHOUSE_CODES.map((code) => (
                    <th key={code} className="py-3 px-2.5 text-right font-mono">
                      {code}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right bg-slate-100/80 font-bold text-slate-800">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {warehouseMatrix.map((row) => (
                  <tr key={row.material.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{row.material.id}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-700 max-w-xs truncate" title={row.material.description}>
                      {row.material.description}
                    </td>
                    {WAREHOUSE_CODES.map((code) => {
                      const val = row.counts[code];
                      return (
                        <td
                          key={code}
                          className={`py-2.5 px-2.5 text-right ${
                            val > 0 ? 'font-bold text-sky-700 bg-sky-50/40' : 'text-slate-300'
                          }`}
                        >
                          {val > 0 ? val.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                    <td
                      className={`py-2.5 px-3 text-right font-bold bg-slate-50/60 ${
                        row.total > 0 ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 13. Annual Monthly Summary (ม.ค. - ธ.ค. ทั้งปี)          */}
      {/* ======================================================== */}
      {activeTab === 'monthly' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                สถานะสายเคเบิลใยแก้วนำแสงและอุปกรณ์สำรองคลัง ประจำปี {selectedYear + 543}
              </h3>
              <p className="text-xs text-slate-500">
                สรุปปริมาณการเบิกใช้งานของวัสดุทั้ง 35 รายการในแต่ละเดือน (ม.ค. - ธ.ค.) และยอดรวมทั้งปี
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 font-mono">
              ปี {selectedYear + 543}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-100">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold uppercase border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-3">รหัสวัสดุ</th>
                  <th className="py-3 px-4">คำอธิบาย</th>
                  {MONTH_NAMES.map((mName) => (
                    <th key={mName} className="py-3 px-2 text-right">
                      {mName}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right bg-slate-100/80 font-bold text-slate-800">รวมทั้งปี</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {annualMonthlyMatrix.map((row) => (
                  <tr key={row.material.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{row.material.id}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-700 max-w-xs truncate" title={row.material.description}>
                      {row.material.description}
                    </td>
                    {row.months.map((val, idx) => (
                      <td
                        key={idx}
                        className={`py-2.5 px-2 text-right ${
                          val > 0 ? 'font-bold text-sky-700 bg-sky-50/40' : 'text-slate-300'
                        }`}
                      >
                        {val > 0 ? val.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td
                      className={`py-2.5 px-3 text-right font-bold bg-slate-50/60 ${
                        row.yearTotal > 0 ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {row.yearTotal.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
