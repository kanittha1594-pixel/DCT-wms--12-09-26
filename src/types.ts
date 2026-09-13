export type District =
  | 'น1'
  | 'น2'
  | 'น3'
  | 'ฉ1'
  | 'ฉ2'
  | 'ฉ3'
  | 'ก1'
  | 'ก2'
  | 'ก3'
  | 'ต1'
  | 'ต2'
  | 'ต3';

export const DISTRICTS: District[] = [
  'น1',
  'น2',
  'น3',
  'ฉ1',
  'ฉ2',
  'ฉ3',
  'ก1',
  'ก2',
  'ก3',
  'ต1',
  'ต2',
  'ต3',
];

export const DISTRICT_LABELS: Record<District, string> = {
  'น1': 'น1 (เชียงใหม่)',
  'น2': 'น2 (พิษณุโลก)',
  'น3': 'น3 (ลพบุรี)',
  'ฉ1': 'ฉ1 (อุดรธานี)',
  'ฉ2': 'ฉ2 (อุบลราชธานี)',
  'ฉ3': 'ฉ3 (นครราชสีมา)',
  'ก1': 'ก1 (พระนครศรีอยุธยา)',
  'ก2': 'ก2 (ชลบุรี)',
  'ก3': 'ก3 (นครปฐม)',
  'ต1': 'ต1 (เพชรบุรี / คลังหลัก)',
  'ต2': 'ต2 (นครศรีธรรมราช)',
  'ต3': 'ต3 (ยะลา)',
};

export const WAREHOUSE_CODES = [
  'J010',
  'J020',
  'J030',
  'J040',
  'J050',
  'J060',
  'J070',
  'J090',
] as const;

export type WarehouseCode = (typeof WAREHOUSE_CODES)[number];

export interface Material {
  id: string; // Material Code e.g. "2-29-005-0039"
  description: string;
  initial_sap: number;
  initial_warehouse: number;
  current_sap: number;
  current_warehouse: number;
  created_at?: string;
  updated_at?: string;
}

export type DemandType = 'ZPM2' | 'WBS';
export type DemandStatus = 'PLANNED' | 'PARTIALLY_PICKED' | 'COMPLETED';

export interface Demand {
  id: string;
  doc_no: string; // เลขที่ใบสั่ง / ชื่องาน WBS
  demand_type: DemandType;
  plant: string; // โรงงาน เช่น J010 หรือ รง.
  material_id: string;
  material_description: string;
  quantity_demand: number;
  picked_total: number;
  remaining: number; // quantity_demand - picked_total
  target_month?: string; // YYYY-MM
  last_picked_at?: string;
  status: DemandStatus;
  created_at: string;
  created_by?: string;
}

export type PickType = 'SINGLE_PICK' | 'PARTIAL_PICK';

export interface PickTransaction {
  id: string;
  demand_id: string;
  material_id: string;
  material_description: string;
  doc_no: string;
  pick_type: PickType;
  quantity: number;
  sap_before: number;
  sap_after: number;
  wh_before: number;
  wh_after: number;
  warehouse_code: WarehouseCode;
  notes?: string;
  created_at: string;
}

export type TransferInStatus =
  | 'REQUESTED' // 1. ขอจัดสรร DDOC
  | 'ALLOCATED' // 2. ตรวจสอบเขตที่รับได้
  | 'STO_ISSUED' // 3. STO
  | 'IN_TRANSIT' // 4. ขนย้าย
  | 'RECEIVED'; // 5. ตรวจรับเข้าคลัง

export interface DistrictAllocation {
  district: District;
  quantity: number;
  sto_no?: string; // เลขที่ STO เฉพาะเขต
  receive_date?: string; // วันที่รับของ
  transport_method?: string; // วิธีขนย้ายเฉพาะเขต
  transport_date?: string; // วันที่ขนย้ายเฉพาะเขต
  notes?: string; // หมายเหตุ
  is_received?: boolean; // สถานะรับเข้าคลังของเขตนี้
  received_at?: string;
}

export interface TransferIn {
  id: string;
  ddoc_no: string; // เลขที่หนังสือ DDOC
  ddoc_date?: string; // วันที่ทำหนังสือ DDOC
  material_id: string;
  material_description: string;
  demand_qty: number;
  purpose_note?: string; // วัตถุประสงค์ / หมายเหตุโครงการ
  origin_district?: District; // เขตที่จัดสรรให้ (backward compatibility)
  allocations?: DistrictAllocation[]; // รายการจัดสรรแยกเขต
  sto_no?: string; // เลขที่ STO
  transport_method?: string; // วิธีขนย้าย
  status: TransferInStatus;
  allocated_qty?: number; // จำนวนที่ได้รับการจัดสรร
  received_qty?: number; // จำนวนที่รับจริง
  received_at?: string; // วันที่รับจริง
  stock_updated: boolean;
  created_at: string;
}

export interface TransferOutItem {
  id: string;
  material_id: string;
  material_description: string;
  transfer_qty: number;
}

export interface TransferOutOrder {
  id: string;
  doc_no: string; // หนังสือขอรับโอน
  doc_date: string; // วันที่
  coordinator: string; // ผู้ประสานงาน
  destination_district: District; // เขตปลายทาง (จาก 12 เขต)
  sto_no?: string; // STO inline
  folded_back_checked: boolean; // พับหลัง กบพ.(ต.1)
  is_dispatched: boolean; // ตัดจ่ายคลัง
  dispatched_at?: string;
  items: TransferOutItem[];
  created_at: string;
}

export type TransactionType =
  | 'ISSUE'
  | 'PICK'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT';

export interface StockHistoryItem {
  id: string;
  created_at: string; // วันที่เบิก / วันที่ทำรายการ
  material_id: string;
  material_description: string;
  project_name: string; // ชื่องาน / โครงการ / DDOC / STO
  demand_qty: number;
  pick_status: string; // สถานะเบิก (หยิบครั้งเดียว, แบ่งหยิบ, โอนของออกจากคลัง, รับของเข้าคลัง, ปรับปรุง)
  picked_qty: number;
  remaining_company: number; // คงค้างบริษัท (Remaining)
  remaining_sap: number; // คงเหลือ SAP
  remaining_wh: number; // คงเหลือคลังจริง
  transaction_type: TransactionType;
  reference_id?: string;
}

// Exactly the 35 materials allowed as dummy initial data (from Prompt Section 31)
export const INITIAL_35_MATERIALS: Array<{
  id: string;
  description: string;
  initial_sap: number;
  initial_warehouse: number;
}> = [
  { id: '2-29-005-0039', description: 'Optic fiber ADSS G.652.D 24 Core', initial_sap: 45141, initial_warehouse: 45141 },
  { id: '2-29-005-0041', description: 'Optic fiber ADSS G.655 24 Core', initial_sap: 0, initial_warehouse: 0 },
  { id: '2-29-005-0042', description: 'Optic fiber Figure-8 G.652.D 24 Core', initial_sap: 4884, initial_warehouse: 4884 },
  { id: '2-29-005-0043', description: 'Optic fiber Figure-8 G.655 24 Core', initial_sap: 0, initial_warehouse: 0 },
  { id: '2-29-005-0045', description: 'Optic fiber Drop wire G.652.D 12 Core', initial_sap: 0, initial_warehouse: 0 },
  { id: '2-29-005-0049', description: 'Optic fiber ARSS G.652.D 24 Core', initial_sap: 4078, initial_warehouse: 4078 },
  { id: '2-29-005-0052', description: 'Optic fiber ARSS G.655 24 Core', initial_sap: 3876, initial_warehouse: 3876 },
  { id: '2-29-030-0009', description: 'Hook Bolt - 5/8" x 12"', initial_sap: 640, initial_warehouse: 640 },
  { id: '2-29-030-0010', description: 'Hook Bolt - 5/8" x 14"', initial_sap: 897, initial_warehouse: 897 },
  { id: '2-29-030-0011', description: 'Hook Bolt - 5/8" x 16"', initial_sap: 1673, initial_warehouse: 1673 },
  { id: '2-29-030-0012', description: 'Hook Bolt - 5/8" x 18"', initial_sap: 1676, initial_warehouse: 1676 },
  { id: '2-29-030-0013', description: 'Short Hook', initial_sap: 997, initial_warehouse: 997 },
  { id: '2-29-030-0014', description: 'Square washer', initial_sap: 1005, initial_warehouse: 1005 },
  { id: '2-29-031-0007', description: 'Straight Thimble Eye Bolt - 5/8" x 12"', initial_sap: 597, initial_warehouse: 597 },
  { id: '2-29-031-0008', description: 'Straight Thimble Eye Bolt - 5/8" x 14"', initial_sap: 851, initial_warehouse: 851 },
  { id: '2-29-031-0009', description: 'Straight Thimble Eye Bolt - 5/8" x 16"', initial_sap: 1533, initial_warehouse: 1533 },
  { id: '2-29-031-0010', description: 'Straight Thimble Eye Bolt - 5/8" x 18"', initial_sap: 1668, initial_warehouse: 1668 },
  { id: '2-29-032-0002', description: 'Thimble Eye Nut - 5/8" (Forged)', initial_sap: 615, initial_warehouse: 615 },
  { id: '2-29-033-0007', description: 'Suspension Clamp', initial_sap: 242, initial_warehouse: 242 },
  { id: '2-29-033-0008', description: 'J - Clamp', initial_sap: 334, initial_warehouse: 334 },
  { id: '2-29-033-0009', description: 'Drop wire Clamp', initial_sap: 0, initial_warehouse: 0 },
  { id: '2-29-033-0010', description: 'Suspension for Self-Support Cable', initial_sap: 1165, initial_warehouse: 1165 },
  { id: '2-29-033-0011', description: 'Strand Ground U-Clamp', initial_sap: 326, initial_warehouse: 326 },
  { id: '2-29-034-0008', description: 'Preformed for ADSS 24 core', initial_sap: 556, initial_warehouse: 556 },
  { id: '2-29-034-0010', description: 'Preformed for Figure-8 24 core', initial_sap: 829, initial_warehouse: 829 },
  { id: '2-29-035-0005', description: 'Stainless Steel Band', initial_sap: 10, initial_warehouse: 10 },
  { id: '2-29-035-0006', description: 'Stainless Steel Buckle', initial_sap: 378, initial_warehouse: 378 },
  { id: '2-29-035-0007', description: 'Stainless Steel Support', initial_sap: -40, initial_warehouse: -40 },
  { id: '2-29-035-0010', description: 'Splice Enclosure Dome Type 24 F', initial_sap: 0, initial_warehouse: 0 },
  { id: '2-29-037-0009', description: 'Crossarm Type C', initial_sap: 768, initial_warehouse: 768 },
  { id: '2-29-039-0006', description: 'Machine Bolts 5/8" x 12"', initial_sap: 440, initial_warehouse: 440 },
  { id: '2-29-039-0007', description: 'Machine Bolts 5/8" x 14"', initial_sap: 1008, initial_warehouse: 1008 },
  { id: '2-29-039-0008', description: 'Machine Bolts 5/8" x 16"', initial_sap: 399, initial_warehouse: 399 },
  { id: '2-29-039-0009', description: 'Machine Bolts 5/8" x 18"', initial_sap: 1021, initial_warehouse: 1021 },
  { id: '2-29-039-0010', description: 'Ground Rod ยาว 2.40 เมตร', initial_sap: 338, initial_warehouse: 338 },
];
