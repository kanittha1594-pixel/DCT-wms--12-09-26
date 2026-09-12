import React, { useState, useEffect, useCallback } from 'react';
import {
  Material,
  Demand,
  PickTransaction,
  TransferIn,
  TransferOutOrder,
  StockHistoryItem,
} from './types';
import {
  fetchMaterials,
  fetchDemands,
  fetchPickTransactions,
  fetchTransfersIn,
  fetchTransfersOut,
  fetchStockHistory,
  resetAllSystemData,
} from './lib/storage';
import { getSupabase } from './lib/supabase';
import { Navbar, ActiveTab } from './components/Navbar';
import { StockReportView } from './components/StockReportView';
import { DemandPlanningView } from './components/DemandPlanningView';
import { PickDisbursementView } from './components/PickDisbursementView';
import { TransferTrackingView } from './components/TransferTrackingView';
import { StockHistoryView } from './components/StockHistoryView';
import { MonthlyPerformanceView } from './components/MonthlyPerformanceView';
import { TrendAnalysisView } from './components/TrendAnalysisView';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import { CheckCircle2, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock-report');
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Core Data States
  const [materials, setMaterials] = useState<Material[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [pickTransactions, setPickTransactions] = useState<PickTransaction[]>([]);
  const [transfersIn, setTransfersIn] = useState<TransferIn[]>([]);
  const [transfersOut, setTransfersOut] = useState<TransferOutOrder[]>([]);
  const [stockHistory, setStockHistory] = useState<StockHistoryItem[]>([]);

  // Check Supabase status
  const isSupabaseConnected = Boolean(getSupabase());

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshAllData = useCallback(async () => {
    try {
      const [mats, dems, picks, trIn, trOut, hist] = await Promise.all([
        fetchMaterials(),
        fetchDemands(),
        fetchPickTransactions(),
        fetchTransfersIn(),
        fetchTransfersOut(),
        fetchStockHistory(),
      ]);

      setMaterials(mats);
      setDemands(dems);
      setPickTransactions(picks);
      setTransfersIn(trIn);
      setTransfersOut(trOut);
      setStockHistory(hist);
    } catch (err: any) {
      console.error('Failed to load data:', err);
      showNotification('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const handleResetData = () => {
    setIsResetModalOpen(true);
  };

  const handleExecuteReset = async () => {
    try {
      setIsResetting(true);
      const res = await resetAllSystemData();
      await refreshAllData();
      if (res.success) {
        showNotification(res.message, 'success');
      } else {
        showNotification(res.message, 'error');
      }
      setIsResetModalOpen(false);
    } catch (err: any) {
      showNotification(err.message || 'เกิดข้อผิดพลาดในการรีเซ็ตข้อมูล', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 font-sans flex flex-col">
      {/* Toast Notification Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl shadow-md border flex items-start gap-2.5 transition-all text-xs font-medium backdrop-blur-xs ${
              toast.type === 'success'
                ? 'bg-teal-900/90 text-teal-100 border-teal-700/80'
                : 'bg-rose-900/90 text-rose-100 border-rose-700/80'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdmin={isAdmin}
        setIsAdmin={setIsAdmin}
        isSupabaseConnected={isSupabaseConnected}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
        onResetData={handleResetData}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
            <span className="text-sm font-medium">กำลังโหลดฐานข้อมูล WMS...</span>
          </div>
        ) : (
          <>
            {activeTab === 'stock-report' && (
              <StockReportView
                materials={materials}
                onRefresh={refreshAllData}
                isAdmin={isAdmin}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'demand-planning' && (
              <DemandPlanningView
                demands={demands}
                materials={materials}
                onRefresh={refreshAllData}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'pick-disbursement' && (
              <PickDisbursementView
                demands={demands}
                materials={materials}
                pickTransactions={pickTransactions}
                onRefresh={refreshAllData}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'transfer-tracking' && (
              <TransferTrackingView
                transfersIn={transfersIn}
                transfersOut={transfersOut}
                materials={materials}
                onRefresh={refreshAllData}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'stock-history' && (
              <StockHistoryView
                transactions={stockHistory}
                materials={materials}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'monthly-summary' && (
              <MonthlyPerformanceView
                materials={materials}
                pickTransactions={pickTransactions}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'trend-analysis' && (
              <TrendAnalysisView
                materials={materials}
                pickTransactions={pickTransactions}
                showNotification={showNotification}
              />
            )}
          </>
        )}
      </main>

      {/* Supabase Setup Modal */}
      <SupabaseSetupModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        isConnected={isSupabaseConnected}
        onRefresh={refreshAllData}
        showNotification={showNotification}
      />

      {/* In-App Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 border border-rose-200/70 rounded-xl shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">ยืนยันการ Reset ข้อมูลทั้งระบบ</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ระบบจะล้างข้อมูลที่บันทึกทั้งหมด และคืนค่าสต็อกกลับสู่ข้อมูลตั้งต้น Master Data 35 รายการ
                </p>
              </div>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
              <div className="font-semibold text-slate-800">ผลการดำเนินการ:</div>
              <ul className="list-disc list-inside space-y-1 text-slate-600 text-2xs sm:text-xs">
                <li>คืนค่า Stock SAP และคลังจริง ของพัสดุ 35 รายการ กลับสู่ค่าเริ่มต้น</li>
                <li>ลบรายการแผนการเบิกพัสดุ (Demands) ทั้งหมด</li>
                <li>ลบประวัติการตัดจ่ายพัสดุ / หยิบจริง (Picks) ทั้งหมด</li>
                <li>ลบรายการ Tracking การรับโอนจากเขตอื่น (DDOC) ทั้งหมด</li>
                <li>ลบรายการ Tracking การโอนของไปยังเขตอื่นทั้งหมด</li>
                <li>ล้างประวัติ Stock History ทั้งหมด</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังรีเซ็ตข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ยืนยัน Reset ข้อมูล</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500">
        ระบบบริหารคลังพัสดุ WMS ต.1 (กบพ. 12 เขต) • Supabase / Real-Time Storage • ตรวจสอบความถูกต้องตามกฎ Recheck ทุกขั้นตอน
      </footer>
    </div>
  );
}
