import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables or custom config
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  const localUrl = localStorage.getItem('wms_supabase_url');
  const localKey = localStorage.getItem('wms_supabase_key');
  return {
    url: localUrl || envUrl || '',
    anonKey: localKey || envAnonKey || '',
  };
}

export function saveStoredSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem('wms_supabase_url', url.trim());
  localStorage.setItem('wms_supabase_key', anonKey.trim());
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey || url === 'https://your-project.supabase.co' || anonKey === 'your-anon-key') {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    cachedUrl = url;
    cachedKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from('materials').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'เชื่อมต่อ Supabase สำเร็จ แต่ยังไม่ได้สร้างตาราง (กรุณารัน SQL Script ด้านล่าง)',
        };
      }
      return { success: false, message: `Supabase Error: ${error.message} (${error.code || ''})` };
    }
    return { success: true, message: 'เชื่อมต่อ Supabase สำเร็จและพบตารางข้อมูลเรียบร้อยแล้ว' };
  } catch (e: any) {
    return { success: false, message: e.message || 'ไม่สามารถเชื่อมต่อไปยัง Supabase ได้' };
  }
}

export const SUPABASE_SCHEMA_SQL = `-- =========================================================
-- WMS Warehouse Management System - Supabase Schema
-- ระบบบริหารคลังพัสดุ 12 เขต (น1-น3, ฉ1-ฉ3, ก1-ก3, ต1-ต3)
-- =========================================================

-- 1. Materials Master Table
CREATE TABLE IF NOT EXISTS public.materials (
    id TEXT PRIMARY KEY, -- Material Code e.g. '2-29-005-0039'
    description TEXT NOT NULL,
    initial_sap NUMERIC NOT NULL DEFAULT 0,
    initial_warehouse NUMERIC NOT NULL DEFAULT 0,
    current_sap NUMERIC NOT NULL DEFAULT 0,
    current_warehouse NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Demand Planning Table (การวางแผนเบิกพัสดุ ZPM2 / WBS)
CREATE TABLE IF NOT EXISTS public.demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no TEXT NOT NULL,
    demand_type TEXT NOT NULL CHECK (demand_type IN ('ZPM2', 'WBS')),
    plant TEXT NOT NULL,
    material_id TEXT NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    material_description TEXT NOT NULL,
    quantity_demand NUMERIC NOT NULL CHECK (quantity_demand > 0),
    picked_total NUMERIC NOT NULL DEFAULT 0 CHECK (picked_total >= 0 AND picked_total <= quantity_demand),
    remaining NUMERIC GENERATED ALWAYS AS (quantity_demand - picked_total) STORED,
    target_month TEXT, -- YYYY-MM
    last_picked_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'PARTIALLY_PICKED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT DEFAULT 'User',
    CONSTRAINT uq_demand_entry UNIQUE (doc_no, plant, material_id, target_month)
);

-- 3. Pick Transactions (ประวัติการตัดจ่ายพัสดุ / แบ่งหยิบ / เบิกเต็มจำนวน)
CREATE TABLE IF NOT EXISTS public.pick_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL REFERENCES public.materials(id),
    material_description TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    pick_type TEXT NOT NULL CHECK (pick_type IN ('SINGLE_PICK', 'PARTIAL_PICK')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    sap_before NUMERIC NOT NULL,
    sap_after NUMERIC NOT NULL,
    wh_before NUMERIC NOT NULL,
    wh_after NUMERIC NOT NULL,
    warehouse_code TEXT NOT NULL CHECK (warehouse_code IN ('J010', 'J020', 'J030', 'J040', 'J050', 'J060', 'J070', 'J090')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Transfers In (Tracking การรับโอนของจากเขตอื่น)
CREATE TABLE IF NOT EXISTS public.transfers_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ddoc_no TEXT NOT NULL,
    material_id TEXT NOT NULL REFERENCES public.materials(id),
    material_description TEXT NOT NULL,
    demand_qty NUMERIC NOT NULL CHECK (demand_qty > 0),
    origin_district TEXT CHECK (origin_district IN ('น1', 'น2', 'น3', 'ฉ1', 'ฉ2', 'ฉ3', 'ก1', 'ก2', 'ก3', 'ต1', 'ต2', 'ต3')),
    sto_no TEXT,
    transport_method TEXT,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ALLOCATED', 'STO_ISSUED', 'IN_TRANSIT', 'RECEIVED')),
    allocated_qty NUMERIC,
    received_qty NUMERIC,
    received_at TIMESTAMPTZ,
    stock_updated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ddoc_item UNIQUE (ddoc_no, material_id)
);

-- 5. Transfers Out Orders (Tracking การโอนของจาก ต.1 ไปยังเขตอื่น)
CREATE TABLE IF NOT EXISTS public.transfers_out_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no TEXT NOT NULL UNIQUE,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    coordinator TEXT NOT NULL,
    destination_district TEXT NOT NULL CHECK (destination_district IN ('น1', 'น2', 'น3', 'ฉ1', 'ฉ2', 'ฉ3', 'ก1', 'ก2', 'ก3', 'ต1', 'ต2', 'ต3')),
    sto_no TEXT,
    folded_back_checked BOOLEAN NOT NULL DEFAULT FALSE,
    is_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
    dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transfer_out_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.transfers_out_orders(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL REFERENCES public.materials(id),
    material_description TEXT NOT NULL,
    transfer_qty NUMERIC NOT NULL CHECK (transfer_qty > 0),
    CONSTRAINT uq_order_material UNIQUE (order_id, material_id)
);

-- 6. Stock Audit & Transaction Log Table
CREATE TABLE IF NOT EXISTS public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    material_id TEXT NOT NULL REFERENCES public.materials(id),
    material_description TEXT NOT NULL,
    project_name TEXT NOT NULL,
    demand_qty NUMERIC NOT NULL DEFAULT 0,
    pick_status TEXT NOT NULL,
    picked_qty NUMERIC NOT NULL DEFAULT 0,
    remaining_company NUMERIC NOT NULL DEFAULT 0,
    remaining_sap NUMERIC NOT NULL,
    remaining_wh NUMERIC NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('ISSUE', 'PICK', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT')),
    reference_id TEXT
);

-- 7. Seed Dummy Master Materials (Only the 35 materials from specification)
INSERT INTO public.materials (id, description, initial_sap, initial_warehouse, current_sap, current_warehouse) VALUES
('2-29-005-0039', 'Optic fiber ADSS G.652.D 24 Core', 45141, 45141, 45141, 45141),
('2-29-005-0041', 'Optic fiber ADSS G.655 24 Core', 0, 0, 0, 0),
('2-29-005-0042', 'Optic fiber Figure-8 G.652.D 24 Core', 4884, 4884, 4884, 4884),
('2-29-005-0043', 'Optic fiber Figure-8 G.655 24 Core', 0, 0, 0, 0),
('2-29-005-0045', 'Optic fiber Drop wire G.652.D 12 Core', 0, 0, 0, 0),
('2-29-005-0049', 'Optic fiber ARSS G.652.D 24 Core', 4078, 4078, 4078, 4078),
('2-29-005-0052', 'Optic fiber ARSS G.655 24 Core', 3876, 3876, 3876, 3876),
('2-29-030-0009', 'Hook Bolt - 5/8" x 12"', 640, 640, 640, 640),
('2-29-030-0010', 'Hook Bolt - 5/8" x 14"', 897, 897, 897, 897),
('2-29-030-0011', 'Hook Bolt - 5/8" x 16"', 1673, 1673, 1673, 1673),
('2-29-030-0012', 'Hook Bolt - 5/8" x 18"', 1676, 1676, 1676, 1676),
('2-29-030-0013', 'Short Hook', 997, 997, 997, 997),
('2-29-030-0014', 'Square washer', 1005, 1005, 1005, 1005),
('2-29-031-0007', 'Straight Thimble Eye Bolt - 5/8" x 12"', 597, 597, 597, 597),
('2-29-031-0008', 'Straight Thimble Eye Bolt - 5/8" x 14"', 851, 851, 851, 851),
('2-29-031-0009', 'Straight Thimble Eye Bolt - 5/8" x 16"', 1533, 1533, 1533, 1533),
('2-29-031-0010', 'Straight Thimble Eye Bolt - 5/8" x 18"', 1668, 1668, 1668, 1668),
('2-29-032-0002', 'Thimble Eye Nut - 5/8" (Forged)', 615, 615, 615, 615),
('2-29-033-0007', 'Suspension Clamp', 242, 242, 242, 242),
('2-29-033-0008', 'J - Clamp', 334, 334, 334, 334),
('2-29-033-0009', 'Drop wire Clamp', 0, 0, 0, 0),
('2-29-033-0010', 'Suspension for Self-Support Cable', 1165, 1165, 1165, 1165),
('2-29-033-0011', 'Strand Ground U-Clamp', 326, 326, 326, 326),
('2-29-034-0008', 'Preformed for ADSS 24 core', 556, 556, 556, 556),
('2-29-034-0010', 'Preformed for Figure-8 24 core', 829, 829, 829, 829),
('2-29-035-0005', 'Stainless Steel Band', 10, 10, 10, 10),
('2-29-035-0006', 'Stainless Steel Buckle', 378, 378, 378, 378),
('2-29-035-0007', 'Stainless Steel Support', -40, -40, -40, -40),
('2-29-035-0010', 'Splice Enclosure Dome Type 24 F', 0, 0, 0, 0),
('2-29-037-0009', 'Crossarm Type C', 768, 768, 768, 768),
('2-29-039-0006', 'Machine Bolts 5/8" x 12"', 440, 440, 440, 440),
('2-29-039-0007', 'Machine Bolts 5/8" x 14"', 1008, 1008, 1008, 1008),
('2-29-039-0008', 'Machine Bolts 5/8" x 16"', 399, 399, 399, 399),
('2-29-039-0009', 'Machine Bolts 5/8" x 18"', 1021, 1021, 1021, 1021),
('2-29-039-0010', 'Ground Rod ยาว 2.40 เมตร', 338, 338, 338, 338)
ON CONFLICT (id) DO UPDATE 
SET description = EXCLUDED.description;
`;
