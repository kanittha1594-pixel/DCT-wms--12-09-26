import React from 'react';
import {
  Boxes,
  ClipboardList,
  CheckSquare,
  ArrowLeftRight,
  History,
  BarChart3,
  TrendingUp,
  Database,
  Shield,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

export type ActiveTab =
  | 'stock-report'
  | 'demand-planning'
  | 'pick-disbursement'
  | 'transfer-tracking'
  | 'stock-history'
  | 'monthly-summary'
  | 'trend-analysis';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin: boolean;
  setIsAdmin: (admin: boolean) => void;
  isSupabaseConnected: boolean;
  onOpenSupabaseModal: () => void;
  onResetData?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isAdmin,
  setIsAdmin,
  isSupabaseConnected,
  onOpenSupabaseModal,
  onResetData,
}) => {
  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: 'stock-report', label: '1. รายงานยอดคงเหลือ', icon: <Boxes className="w-4 h-4" /> },
    { id: 'demand-planning', label: '2. วางแผนเบิกพัสดุ', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'pick-disbursement', label: '3. ตัดจ่ายพัสดุ / หยิบจริง', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'transfer-tracking', label: '4. Tracking โอนย้าย (12 เขต)', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { id: 'stock-history', label: '5. ประวัติการทำรายการ', icon: <History className="w-4 h-4" /> },
    { id: 'monthly-summary', label: '6. Monthly Summary', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'trend-analysis', label: '7. วิเคราะห์แนวโน้ม', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-white/95 backdrop-blur-xs border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-400 text-white flex items-center justify-center font-bold text-xl shadow-xs">
              W
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-800 leading-tight">
                  WMS ระบบบริหารคลังพัสดุ
                </h1>
                <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200/70 font-semibold px-2.5 py-0.5 rounded-full">
                  ต.1 คลังหลัก 12 เขต
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ระบบจัดการ Stock SAP & คลังจริง | ตรวจสอบ Recheck ทุกรายการ
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            {/* Supabase Status Button */}
            <button
              id="btn-supabase-status"
              onClick={onOpenSupabaseModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer shadow-2xs ${
                isSupabaseConnected
                  ? 'bg-teal-50 text-teal-700 border-teal-200/80 hover:bg-teal-100/60'
                  : 'bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100/60'
              }`}
              title="ตั้งค่าฐานข้อมูล Supabase / ดู SQL Schema"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isSupabaseConnected ? 'Supabase: Connected' : 'DB: Local Repo / Setup SQL'}</span>
            </button>

            {/* Reset Data Button */}
            {onResetData && (
              <button
                id="btn-reset-data"
                onClick={onResetData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-rose-200/80 bg-rose-50 text-rose-700 hover:bg-rose-100/60 transition-colors cursor-pointer shadow-2xs"
                title="รีเซ็ตข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้น 35 รายการ"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                <span>Reset ข้อมูล</span>
              </button>
            )}

            {/* Admin Toggle */}
            <button
              id="btn-toggle-admin"
              onClick={() => setIsAdmin(!isAdmin)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer shadow-2xs ${
                isAdmin
                  ? 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100/60'
                  : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100/60'
              }`}
              title="สลับสิทธิ์การใช้งาน Admin (แก้ไข Stock ตั้งต้น, ลบรายการสำคัญ)"
            >
              {isAdmin ? <ShieldAlert className="w-3.5 h-3.5 text-purple-500" /> : <Shield className="w-3.5 h-3.5 text-slate-500" />}
              <span>{isAdmin ? 'สิทธิ์: Admin (ผู้ดูแล)' : 'สิทธิ์: เจ้าหน้าที่คลัง'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1.5 overflow-x-auto py-1.5 border-t border-slate-100 scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'border border-sky-200 bg-sky-50 text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
