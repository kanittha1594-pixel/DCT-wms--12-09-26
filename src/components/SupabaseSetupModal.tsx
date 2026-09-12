import React, { useState } from 'react';
import { Database, CheckCircle2, Copy, Check, X, Key, AlertCircle, RefreshCw } from 'lucide-react';
import {
  SUPABASE_SCHEMA_SQL,
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
  testSupabaseConnection,
} from '../lib/supabase';
import { seedInitialMaterialsToSupabase } from '../lib/storage';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  onRefresh: () => Promise<void>;
  showNotification: (msg: string, type: 'success' | 'error') => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  onRefresh,
  showNotification,
}) => {
  const [copied, setCopied] = useState(false);
  const currentConfig = getStoredSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url);
  const [supabaseKey, setSupabaseKey] = useState(currentConfig.anonKey);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopied(true);
    showNotification('คัดลอก SQL Schema สำเร็จ นำไปรันใน Supabase SQL Editor ได้ทันที', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCreds(true);
    setTestResult(null);
    try {
      saveStoredSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
      const test = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());
      setTestResult(test);
      if (test.success) {
        showNotification(test.message, 'success');
      } else {
        showNotification(test.message, 'error');
      }
      await onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'บันทึกล้มเหลว', 'error');
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleSeedMaterials = async () => {
    setIsSeeding(true);
    try {
      const res = await seedInitialMaterialsToSupabase();
      if (res.success) {
        showNotification('Sync พัสดุ Master 35 รายการเข้า Supabase เรียบร้อย', 'success');
        await onRefresh();
      } else {
        showNotification(res.message || 'Sync ไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Sync ล้มเหลว', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200/80 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                การตั้งค่าฐานข้อมูล Supabase (Database Management)
              </h3>
              <p className="text-2xs text-slate-500">
                รองรับการเชื่อมต่อไปยัง Supabase จริงตามข้อกำหนด หรือใช้งานผ่าน Local Storage Repository
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Status Alert */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isConnected
                ? 'bg-teal-50/70 border-teal-200/80 text-teal-900'
                : 'bg-amber-50/70 border-amber-200/80 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isConnected ? (
                <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <div>
                <span className="font-bold">
                  {isConnected
                    ? 'สถานะ: เชื่อมต่อ Supabase สำเร็จ (Active Connection)'
                    : 'สถานะ: โหมด Local Engine (ระบบทำงานได้ครบ 100% พร้อม Recheck)'}
                </span>
                <p className="text-2xs opacity-90 mt-0.5">
                  {isConnected
                    ? 'ข้อมูลการเบิกจ่ายและโอนพัสดุถูกบันทึกลงฐานข้อมูล Supabase โดยตรง'
                    : 'เมื่อต้องการเชื่อมต่อ Supabase ของท่าน ให้กรอก Project URL & Anon Key ด้านล่าง'}
                </p>
              </div>
            </div>

            {isConnected && (
              <button
                onClick={handleSeedMaterials}
                disabled={isSeeding}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-2xs font-bold cursor-pointer transition-colors shadow-2xs"
              >
                {isSeeding ? 'กำลัง Sync...' : 'Sync 35 พัสดุ'}
              </button>
            )}
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleSaveCredentials} className="space-y-3 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
              <Key className="w-4 h-4 text-sky-600" />
              <span>ระบุข้อมูล Supabase Credentials (URL & Anon Key)</span>
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Project URL (เช่น https://xyzcompany.supabase.co)
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-sky-300 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Anon Public API Key
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-sky-300 focus:outline-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingCreds}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                {isSavingCreds ? 'กำลังบันทึก...' : 'บันทึกการเชื่อมต่อ'}
              </button>
            </div>
          </form>

          {/* SQL Schema Viewer & Copy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800">SQL Schema สำหรับรันใน Supabase</span>
                <p className="text-2xs text-slate-500">
                  คัดลอก SQL ด้านล่างไปวางใน Supabase Dashboard &gt; SQL Editor แล้วกด RUN
                </p>
              </div>

              <button
                onClick={handleCopySql}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'คัดลอกแล้ว!' : 'Copy SQL Schema'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className="bg-slate-900 text-slate-200 p-3.5 rounded-xl text-2xs font-mono overflow-x-auto max-h-56 leading-relaxed">
                {SUPABASE_SCHEMA_SQL}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50/80 border-t border-slate-200/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200/80 cursor-pointer transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
