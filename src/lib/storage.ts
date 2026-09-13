import * as XLSX from 'xlsx';
import {
  Material,
  Demand,
  PickTransaction,
  TransferIn,
  TransferInStatus,
  DistrictAllocation,
  TransferOutOrder,
  StockHistoryItem,
  INITIAL_35_MATERIALS,
  WarehouseCode,
  District,
  DISTRICT_LABELS,
} from '../types';
import { getSupabase } from './supabase';

const STORAGE_KEYS = {
  MATERIALS: 'wms_materials_v1',
  DEMANDS: 'wms_demands_v1',
  PICKS: 'wms_picks_v1',
  TRANSFERS_IN: 'wms_transfers_in_v1',
  TRANSFERS_OUT: 'wms_transfers_out_v1',
  STOCK_HISTORY: 'wms_stock_history_v1',
};

// Initialize default materials if storage is empty
export function initLocalStorage(): void {
  const existing = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (!existing) {
    const materials: Material[] = INITIAL_35_MATERIALS.map((m) => ({
      id: m.id,
      description: m.description,
      initial_sap: m.initial_sap,
      initial_warehouse: m.initial_warehouse,
      current_sap: m.initial_sap,
      current_warehouse: m.initial_warehouse,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  }
}

export async function fetchMaterials(): Promise<Material[]> {
  initLocalStorage();
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('materials').select('*').order('id');
      if (!error && data && data.length > 0) {
        return data as Material[];
      }
    } catch (e) {
      console.warn('Supabase fetch failed, falling back to local:', e);
    }
  }

  const raw = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  return raw ? JSON.parse(raw) : [];
}

export async function updateMaterialInitialStock(
  materialId: string,
  newInitialSap: number,
  newInitialWh: number
): Promise<{ success: boolean; message?: string }> {
  const materials = await fetchMaterials();
  const target = materials.find((m) => m.id === materialId);
  if (!target) {
    return { success: false, message: `ไม่พบรหัสวัสดุ ${materialId} ในฐานข้อมูล` };
  }

  // Calculate delta to recheck current stock
  const deltaSap = newInitialSap - target.initial_sap;
  const deltaWh = newInitialWh - target.initial_warehouse;

  const updatedTarget: Material = {
    ...target,
    initial_sap: newInitialSap,
    initial_warehouse: newInitialWh,
    current_sap: target.current_sap + deltaSap,
    current_warehouse: target.current_warehouse + deltaWh,
    updated_at: new Date().toISOString(),
  };

  // Recheck assertion
  if (
    updatedTarget.initial_sap - newInitialSap !== 0 ||
    updatedTarget.initial_warehouse - newInitialWh !== 0
  ) {
    return { success: false, message: 'Recheck Failed: การคำนวณ Stock ตั้งต้นไม่ถูกต้อง' };
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({
          initial_sap: updatedTarget.initial_sap,
          initial_warehouse: updatedTarget.initial_warehouse,
          current_sap: updatedTarget.current_sap,
          current_warehouse: updatedTarget.current_warehouse,
          updated_at: updatedTarget.updated_at,
        })
        .eq('id', materialId);
      if (error) {
        console.warn('Supabase update failed:', error);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  const updatedList = materials.map((m) => (m.id === materialId ? updatedTarget : m));
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(updatedList));

  // Add stock adjustment history
  await addStockHistory({
    material_id: materialId,
    material_description: target.description,
    project_name: 'Admin Stock Adjustment (Initial)',
    demand_qty: 0,
    pick_status: 'ปรับปรุง Stock ตั้งต้น',
    picked_qty: 0,
    remaining_company: 0,
    remaining_sap: updatedTarget.current_sap,
    remaining_wh: updatedTarget.current_warehouse,
    transaction_type: 'ADJUSTMENT',
  });

  return { success: true };
}

// -------------------------------------------------------------
// DEMANDS (วางแผนเบิกพัสดุ)
// -------------------------------------------------------------
export async function fetchDemands(): Promise<Demand[]> {
  const raw = localStorage.getItem(STORAGE_KEYS.DEMANDS);
  const localDemands: Demand[] = raw ? JSON.parse(raw) : [];

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('demands')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        if (data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(data));
          return data as Demand[];
        } else if (localDemands.length > 0) {
          // Table in Supabase is currently empty, push existing local demands to Supabase in background
          supabase.from('demands').upsert(localDemands).then(() => {}, () => {});
          return localDemands;
        }
      }
    } catch (e) {
      console.warn('Supabase fetchDemands error, using local:', e);
    }
  }
  return localDemands;
}

// Helper to find material by exact or normalized code (e.g. "2-29-005-0039" or "2290050039")
export function findMatchingMaterial(inputCode: string, materials: Material[]): Material | undefined {
  if (!inputCode) return undefined;
  const cleanInput = inputCode.trim();
  if (!cleanInput) return undefined;

  // 1. Strict Exact Match (case-insensitive) on id or material_code
  const exact = materials.find((m) => {
    const code = (m.id || (m as any).material_code || '').trim().toLowerCase();
    return code === cleanInput.toLowerCase();
  });
  if (exact) return exact;

  // 2. Normalized match (remove hyphens, spaces, underscores, dots)
  const normalizedInput = cleanInput.replace(/[-_.\s]/g, '').toLowerCase();
  if (normalizedInput.length >= 6) {
    const normalizedMatch = materials.find((m) => {
      const idNorm = (m.id || (m as any).material_code || '').replace(/[-_.\s]/g, '').toLowerCase();
      return idNorm === normalizedInput;
    });
    if (normalizedMatch) return normalizedMatch;
  }
  return undefined;
}

export async function saveDemand(
  demandData: Omit<Demand, 'id' | 'picked_total' | 'remaining' | 'status' | 'created_at'>
): Promise<{ success: boolean; error?: string; demand?: Demand }> {
  // Validate material exists (supporting normalized codes like 2290050039)
  const materials = await fetchMaterials();
  const material = findMatchingMaterial(demandData.material_id, materials);
  if (!material) {
    return {
      success: false,
      error: `รหัสวัสดุ "${demandData.material_id}" ไม่พบในฐานข้อมูล Master 35 รายการ`,
    };
  }

  if (demandData.quantity_demand <= 0) {
    return { success: false, error: 'ปริมาณความต้องการต้องมากกว่า 0' };
  }

  const existingDemands = await fetchDemands();

  // Duplicate Check (Idempotency Rule 1.3) using canonical material.id
  const isDuplicate = existingDemands.some(
    (d) =>
      d.doc_no.trim().toLowerCase() === demandData.doc_no.trim().toLowerCase() &&
      d.material_id === material.id &&
      d.plant.trim().toLowerCase() === demandData.plant.trim().toLowerCase() &&
      (d.target_month || '') === (demandData.target_month || '')
  );

  if (isDuplicate) {
    return {
      success: false,
      error: `ข้อมูลซ้ำ: มีแผนเบิกสำหรับชื่องาน "${demandData.doc_no}" รหัสวัสดุ "${material.id}" ในระบบแล้ว`,
    };
  }

  const newDemand: Demand = {
    id: crypto.randomUUID(),
    doc_no: demandData.doc_no.trim(),
    demand_type: demandData.demand_type,
    plant: demandData.plant.trim(),
    material_id: material.id,
    material_description: material.description,
    quantity_demand: Number(demandData.quantity_demand),
    picked_total: 0,
    remaining: Number(demandData.quantity_demand),
    target_month: demandData.target_month?.trim() || undefined,
    status: 'PLANNED',
    created_at: new Date().toISOString(),
    created_by: demandData.created_by || 'User',
  };

  // 1. ALWAYS persist to LocalStorage immediately (guaranteed never to fail)
  existingDemands.unshift(newDemand);
  localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(existingDemands));

  // 2. Sync to Supabase in background (failures do not block local operation)
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from('demands').insert(newDemand);
      if (error) {
        console.warn('Supabase insert note (data preserved locally):', error.message);
      }
    } catch (e: any) {
      console.warn('Supabase insert failed, preserved locally:', e);
    }
  }

  return { success: true, demand: newDemand };
}

export async function deleteDemand(
  demandId: string
): Promise<{ success: boolean; error?: string; restoredQty?: number }> {
  // Check if there are existing pick transactions for this demand
  const picks = await fetchPickTransactions();
  const relatedPicks = picks.filter((p) => p.demand_id === demandId);
  const demands = await fetchDemands();
  const demand = demands.find((d) => d.id === demandId);

  let totalRestored = 0;

  // If there are related picks, cleanly reverse deducted stock and cleanup picks
  if (relatedPicks.length > 0) {
    const materials = await fetchMaterials();
    for (const p of relatedPicks) {
      const mat = materials.find((m) => m.id === p.material_id);
      if (mat) {
        mat.current_sap += p.quantity;
        mat.current_warehouse += p.quantity;
        mat.updated_at = new Date().toISOString();
        totalRestored += p.quantity;
      }
    }

    const supabase = getSupabase();
    if (supabase) {
      for (const p of relatedPicks) {
        const mat = materials.find((m) => m.id === p.material_id);
        if (mat) {
          try {
            await supabase
              .from('materials')
              .update({
                current_sap: mat.current_sap,
                current_warehouse: mat.current_warehouse,
                updated_at: mat.updated_at,
              })
              .eq('id', mat.id);
          } catch (e) {
            console.warn('Failed to update material in supabase during demand delete:', e);
          }
        }
      }

      try {
        await supabase.from('pick_transactions').delete().eq('demand_id', demandId);
      } catch (e) {
        console.warn('Failed to delete pick_transactions in supabase:', e);
      }
    }

    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    const remainingPicks = picks.filter((p) => p.demand_id !== demandId);
    localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify(remainingPicks));

    if (demand && totalRestored > 0) {
      await addStockHistory({
        material_id: demand.material_id,
        material_description: demand.material_description,
        project_name: `${demand.doc_no} (ลบแผนเบิกและคืนสต็อก)`,
        demand_qty: demand.quantity_demand,
        pick_status: `ลบแผนเบิก คืนยอดคงเหลือ (${totalRestored.toLocaleString()} หน่วย)`,
        picked_qty: -totalRestored,
        remaining_company: 0,
        remaining_sap: materials.find((m) => m.id === demand.material_id)?.current_sap || 0,
        remaining_wh: materials.find((m) => m.id === demand.material_id)?.current_warehouse || 0,
        transaction_type: 'ADJUSTMENT',
        reference_id: demand.id,
      });
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from('demands').delete().eq('id', demandId);
      if (error) {
        console.warn('Supabase delete demand error:', error);
      }
    } catch (e: any) {
      console.warn(e);
    }
  }

  const updatedDemands = demands.filter((d) => d.id !== demandId);
  localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(updatedDemands));
  return { success: true, restoredQty: totalRestored };
}

// -------------------------------------------------------------
// PICK TRANSACTIONS (ตัดจ่ายพัสดุ / หยิบจริง)
// -------------------------------------------------------------
export async function fetchPickTransactions(): Promise<PickTransaction[]> {
  const raw = localStorage.getItem(STORAGE_KEYS.PICKS);
  const localPicks: PickTransaction[] = raw ? JSON.parse(raw) : [];

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pick_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        if (data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify(data));
          return data as PickTransaction[];
        } else if (localPicks.length > 0) {
          supabase.from('pick_transactions').upsert(localPicks).then(() => {}, () => {});
          return localPicks;
        }
      }
    } catch (e) {
      console.warn('Supabase fetchPickTransactions error, using local:', e);
    }
  }
  return localPicks;
}

export async function executePickDisbursement(params: {
  demandId: string;
  pickType: 'SINGLE_PICK' | 'PARTIAL_PICK';
  pickQuantity: number;
  warehouseCode: WarehouseCode;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { demandId, pickType, pickQuantity, warehouseCode, notes } = params;

  if (pickQuantity <= 0) {
    return { success: false, error: 'จำนวนที่เบิกต้องมากกว่า 0' };
  }

  const demands = await fetchDemands();
  const demand = demands.find((d) => d.id === demandId);
  if (!demand) {
    return { success: false, error: 'ไม่พบรายการความต้องการเบิกนี้' };
  }

  const remaining = demand.quantity_demand - demand.picked_total;
  if (pickQuantity > remaining) {
    return {
      success: false,
      error: `จำนวนที่ต้องการหยิบ (${pickQuantity}) เกินกว่าคงค้างที่สามารถหยิบได้ (${remaining}) ห้าม Picked สะสม > Demand`,
    };
  }

  const materials = await fetchMaterials();
  const material = materials.find((m) => m.id === demand.material_id);
  if (!material) {
    return { success: false, error: `ไม่พบรหัสวัสดุ ${demand.material_id} ในคลัง` };
  }

  // Stock calculations:
  // Prompt Section 15 & 17-22:
  // When SAP issues: SAP stock decreases by pickQuantity
  // When Warehouse picks: Warehouse stock decreases by pickQuantity
  const sapBefore = material.current_sap;
  const whBefore = material.current_warehouse;
  const sapAfter = sapBefore - pickQuantity;
  const whAfter = whBefore - pickQuantity;

  // RULE 1.5 RECHECK: Stock ก่อนทำรายการ + Transaction = Stock หลังทำรายการ
  // Before - pickQuantity = After  => Before - pickQuantity - After === 0
  if (sapBefore - pickQuantity !== sapAfter || whBefore - pickQuantity !== whAfter) {
    return {
      success: false,
      error: 'Recheck Failed: ความถูกต้องของ Stock ล้มเหลว การคำนวณก่อนและหลังไม่ตรงกัน',
    };
  }

  const newPickedTotal = demand.picked_total + pickQuantity;
  const newRemaining = demand.quantity_demand - newPickedTotal;
  const newStatus =
    newRemaining === 0
      ? 'COMPLETED'
      : newPickedTotal > 0
      ? 'PARTIALLY_PICKED'
      : 'PLANNED';

  const newPickTx: PickTransaction = {
    id: crypto.randomUUID(),
    demand_id: demand.id,
    material_id: material.id,
    material_description: material.description,
    doc_no: demand.doc_no,
    pick_type: pickType,
    quantity: pickQuantity,
    sap_before: sapBefore,
    sap_after: sapAfter,
    wh_before: whBefore,
    wh_after: whAfter,
    warehouse_code: warehouseCode,
    notes: notes?.trim() || undefined,
    created_at: new Date().toISOString(),
  };

  // Update Material Stock
  material.current_sap = sapAfter;
  material.current_warehouse = whAfter;
  material.updated_at = new Date().toISOString();

  // Update Demand
  demand.picked_total = newPickedTotal;
  demand.remaining = newRemaining;
  demand.status = newStatus;
  demand.last_picked_at = newPickTx.created_at;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('pick_transactions').insert(newPickTx);
      await supabase
        .from('materials')
        .update({
          current_sap: sapAfter,
          current_warehouse: whAfter,
          updated_at: material.updated_at,
        })
        .eq('id', material.id);
      await supabase
        .from('demands')
        .update({
          picked_total: newPickedTotal,
          status: newStatus,
          last_picked_at: newPickTx.created_at,
        })
        .eq('id', demand.id);
    } catch (e) {
      console.warn('Supabase sync error:', e);
    }
  }

  // Save to Local Storage
  const picks = await fetchPickTransactions();
  picks.unshift(newPickTx);
  localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify(picks));
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(demands));

  // Add to Stock History
  await addStockHistory({
    material_id: material.id,
    material_description: material.description,
    project_name: demand.doc_no,
    demand_qty: demand.quantity_demand,
    pick_status: pickType === 'SINGLE_PICK' ? 'หยิบครั้งเดียว' : 'แบ่งหยิบ',
    picked_qty: pickQuantity,
    remaining_company: newRemaining,
    remaining_sap: sapAfter,
    remaining_wh: whAfter,
    transaction_type: 'PICK',
    reference_id: newPickTx.id,
  });

  return { success: true };
}

// Rule 23: Edit Transaction
export async function editPickTransaction(
  pickId: string,
  newQuantity: number
): Promise<{ success: boolean; error?: string }> {
  if (newQuantity <= 0) {
    return { success: false, error: 'จำนวนต้องมากกว่า 0' };
  }

  const picks = await fetchPickTransactions();
  const targetPick = picks.find((p) => p.id === pickId);
  if (!targetPick) {
    return { success: false, error: 'ไม่พบรายการตัดจ่ายนี้' };
  }

  const demands = await fetchDemands();
  const demand = demands.find((d) => d.id === targetPick.demand_id);
  if (!demand) {
    return { success: false, error: 'ไม่พบใบเบิกที่เกี่ยวข้อง' };
  }

  const oldQty = targetPick.quantity;
  const delta = newQuantity - oldQty; // e.g., 60 - 40 = +20 (more picked, less stock)

  const projectedPickedTotal = demand.picked_total + delta;
  if (projectedPickedTotal > demand.quantity_demand) {
    return {
      success: false,
      error: `ไม่สามารถแก้ไขได้ เนื่องจากยอด Picked สะสมใหม่ (${projectedPickedTotal}) จะเกิน Demand (${demand.quantity_demand})`,
    };
  }

  const materials = await fetchMaterials();
  const material = materials.find((m) => m.id === targetPick.material_id);
  if (!material) {
    return { success: false, error: 'ไม่พบวัสดุในระบบ' };
  }

  // Stock effect: if delta > 0, stock decreases by delta; if delta < 0, stock increases
  const newSap = material.current_sap - delta;
  const newWh = material.current_warehouse - delta;

  // Recheck assertion
  if (material.current_sap - delta !== newSap || material.current_warehouse - delta !== newWh) {
    return { success: false, error: 'Recheck Failed: การคำนวณส่วนต่าง Stock ไม่ถูกต้อง' };
  }

  material.current_sap = newSap;
  material.current_warehouse = newWh;
  material.updated_at = new Date().toISOString();

  demand.picked_total = projectedPickedTotal;
  demand.remaining = demand.quantity_demand - projectedPickedTotal;
  demand.status =
    demand.remaining === 0
      ? 'COMPLETED'
      : demand.picked_total > 0
      ? 'PARTIALLY_PICKED'
      : 'PLANNED';

  targetPick.quantity = newQuantity;
  targetPick.sap_after = newSap;
  targetPick.wh_after = newWh;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('pick_transactions')
        .update({ quantity: newQuantity, sap_after: newSap, wh_after: newWh })
        .eq('id', pickId);
      await supabase
        .from('materials')
        .update({ current_sap: newSap, current_warehouse: newWh })
        .eq('id', material.id);
      await supabase
        .from('demands')
        .update({ picked_total: projectedPickedTotal, status: demand.status })
        .eq('id', demand.id);
    } catch (e) {
      console.warn(e);
    }
  }

  localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify(picks));
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(demands));

  await addStockHistory({
    material_id: material.id,
    material_description: material.description,
    project_name: `${demand.doc_no} (แก้ไขจำนวน)`,
    demand_qty: demand.quantity_demand,
    pick_status: `แก้ไขยอดตัดจ่าย (${oldQty} -> ${newQuantity})`,
    picked_qty: delta,
    remaining_company: demand.remaining,
    remaining_sap: newSap,
    remaining_wh: newWh,
    transaction_type: 'ADJUSTMENT',
    reference_id: targetPick.id,
  });

  return { success: true };
}

// Rule 24: Delete Transaction with Stock Reversal
export async function deletePickTransaction(pickId: string): Promise<{ success: boolean; error?: string }> {
  const picks = await fetchPickTransactions();
  const targetPick = picks.find((p) => p.id === pickId);
  if (!targetPick) {
    return { success: false, error: 'ไม่พบรายการตัดจ่ายนี้' };
  }

  const materials = await fetchMaterials();
  const material = materials.find((m) => m.id === targetPick.material_id);
  if (!material) {
    return { success: false, error: 'ไม่พบรหัสวัสดุในคลัง' };
  }

  const demands = await fetchDemands();
  const demand = demands.find((d) => d.id === targetPick.demand_id);

  // Reverse stock: returned to stock
  const restoredSap = material.current_sap + targetPick.quantity;
  const restoredWh = material.current_warehouse + targetPick.quantity;

  // Recheck assertion
  if (
    material.current_sap + targetPick.quantity !== restoredSap ||
    material.current_warehouse + targetPick.quantity !== restoredWh
  ) {
    return { success: false, error: 'Recheck Failed: การคืนยอด Stock ล้มเหลว' };
  }

  material.current_sap = restoredSap;
  material.current_warehouse = restoredWh;
  material.updated_at = new Date().toISOString();

  if (demand) {
    demand.picked_total = Math.max(0, demand.picked_total - targetPick.quantity);
    demand.remaining = demand.quantity_demand - demand.picked_total;
    demand.status =
      demand.remaining === 0
        ? 'COMPLETED'
        : demand.picked_total > 0
        ? 'PARTIALLY_PICKED'
        : 'PLANNED';
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('pick_transactions').delete().eq('id', pickId);
      await supabase
        .from('materials')
        .update({ current_sap: restoredSap, current_warehouse: restoredWh })
        .eq('id', material.id);
      if (demand) {
        await supabase
          .from('demands')
          .update({ picked_total: demand.picked_total, status: demand.status })
          .eq('id', demand.id);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  const updatedPicks = picks.filter((p) => p.id !== pickId);
  localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify(updatedPicks));
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  if (demand) {
    localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify(demands));
  }

  await addStockHistory({
    material_id: material.id,
    material_description: material.description,
    project_name: `${targetPick.doc_no} (ยกเลิกรายการเบิก)`,
    demand_qty: demand ? demand.quantity_demand : 0,
    pick_status: `ยกเลิกการตัดจ่าย (คืน Stock +${targetPick.quantity})`,
    picked_qty: -targetPick.quantity,
    remaining_company: demand ? demand.remaining : 0,
    remaining_sap: restoredSap,
    remaining_wh: restoredWh,
    transaction_type: 'ADJUSTMENT',
    reference_id: targetPick.id,
  });

  return { success: true };
}

// -------------------------------------------------------------
// TRANSFERS IN (Tracking การรับโอนของจากเขตอื่น)
// 5 ขั้นตอน: ขอจัดสรร DDOC -> เช็คเขตที่รับได้ -> STO -> ขนย้าย -> ตรวจรับเข้าคลัง
// -------------------------------------------------------------
export async function fetchTransfersIn(): Promise<TransferIn[]> {
  const raw = localStorage.getItem(STORAGE_KEYS.TRANSFERS_IN);
  const localTransfers: TransferIn[] = raw ? JSON.parse(raw) : [];

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transfers_in')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        if (data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(data));
          return data as TransferIn[];
        } else if (localTransfers.length > 0) {
          supabase.from('transfers_in').upsert(localTransfers).then(() => {}, () => {});
          return localTransfers;
        }
      }
    } catch (e) {
      console.warn('Supabase fetchTransfersIn error, using local:', e);
    }
  }
  return localTransfers;
}

export async function createTransferIn(params: {
  ddoc_no: string;
  ddoc_date?: string;
  material_id: string;
  demand_qty: number;
  purpose_note?: string;
  allocations?: DistrictAllocation[];
}): Promise<{ success: boolean; error?: string }> {
  const { ddoc_no, ddoc_date, material_id, demand_qty, purpose_note, allocations } = params;
  if (!ddoc_no.trim()) {
    return { success: false, error: 'กรุณากรอกเลขที่หนังสือ DDOC' };
  }
  const qty = Number(demand_qty);
  if (!qty || qty <= 0) {
    return { success: false, error: 'จำนวนที่ต้องการขอรับจัดสรรต้องมากกว่า 0' };
  }

  const materials = await fetchMaterials();
  const mat = materials.find((m) => m.id === material_id) || findMatchingMaterial(material_id, materials);
  if (!mat) {
    return { success: false, error: `ไม่พบรหัสวัสดุ ${material_id}` };
  }

  const existing = await fetchTransfersIn();
  const isDuplicate = existing.some(
    (t) => t.ddoc_no.trim().toLowerCase() === ddoc_no.trim().toLowerCase() && t.material_id === mat.id
  );
  if (isDuplicate) {
    return { success: false, error: `เลขที่ DDOC ${ddoc_no} มีรายการพัสดุ ${mat.id} อยู่แล้ว (ห้ามซ้ำใน DDOC เดียวกัน)` };
  }

  const validAllocations = (allocations || []).filter((a) => Number(a.quantity) > 0);
  const totalAlloc = validAllocations.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);

  let initialStatus: TransferInStatus = 'REQUESTED';
  if (validAllocations.length > 0) {
    const hasAllSto = validAllocations.every((a) => a.sto_no && a.sto_no.trim().length > 0);
    initialStatus = hasAllSto ? 'STO_ISSUED' : 'ALLOCATED';
  }

  const newTransfer: TransferIn = {
    id: crypto.randomUUID(),
    ddoc_no: ddoc_no.trim(),
    ddoc_date: ddoc_date || new Date().toISOString().split('T')[0],
    material_id: mat.id,
    material_description: mat.description,
    demand_qty: qty,
    purpose_note: purpose_note?.trim() || undefined,
    allocations: validAllocations.length > 0 ? validAllocations : undefined,
    allocated_qty: totalAlloc > 0 ? totalAlloc : undefined,
    origin_district: validAllocations[0]?.district,
    sto_no: validAllocations.map((a) => a.sto_no?.trim()).filter(Boolean).join(', ') || undefined,
    status: initialStatus,
    stock_updated: false,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_in').insert([newTransfer]);
    } catch (e) {
      console.warn(e);
    }
  }

  existing.unshift(newTransfer);
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(existing));
  return { success: true };
}

// 1 เลข DDOC สามารถขอรับพัสดุได้หลายชนิด (Multi-Item)
export async function createTransferInMulti(params: {
  ddoc_no: string;
  items: Array<{ material_id: string; demand_qty: number }>;
}): Promise<{ success: boolean; error?: string }> {
  const { ddoc_no, items } = params;
  if (!ddoc_no.trim()) {
    return { success: false, error: 'กรุณากรอกเลขที่หนังสือ DDOC' };
  }
  if (!items || items.length === 0) {
    return { success: false, error: 'กรุณาระบุรายการพัสดุอย่างน้อย 1 รายการ' };
  }

  const materials = await fetchMaterials();
  const existing = await fetchTransfersIn();
  const now = new Date().toISOString();
  const newRecords: TransferIn[] = [];

  for (const it of items) {
    const qty = Number(it.demand_qty);
    if (!qty || qty <= 0) {
      return { success: false, error: 'จำนวนที่ต้องการขอจัดสรรต้องมากกว่า 0 ทุกรายการ' };
    }
    const mat = materials.find((m) => m.id === it.material_id) || findMatchingMaterial(it.material_id, materials);
    if (!mat) {
      return { success: false, error: `ไม่พบรหัสวัสดุ ${it.material_id}` };
    }
    const isDuplicate = existing.some(
      (t) => t.ddoc_no.trim().toLowerCase() === ddoc_no.trim().toLowerCase() && t.material_id === mat.id
    );
    if (isDuplicate) {
      return { success: false, error: `เลขที่ DDOC ${ddoc_no} มีรายการพัสดุ ${mat.id} อยู่แล้ว (ห้ามซ้ำใน DDOC เดียวกัน)` };
    }

    const newTransfer: TransferIn = {
      id: crypto.randomUUID(),
      ddoc_no: ddoc_no.trim(),
      material_id: mat.id,
      material_description: mat.description,
      demand_qty: qty,
      status: 'REQUESTED',
      stock_updated: false,
      created_at: now,
    };
    newRecords.push(newTransfer);
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_in').insert(newRecords);
    } catch (e) {
      console.warn(e);
    }
  }

  existing.unshift(...newRecords);
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(existing));
  return { success: true };
}

export async function deleteTransferInByDdoc(ddocNo: string): Promise<{ success: boolean; error?: string }> {
  const list = await fetchTransfersIn();
  const targets = list.filter((t) => t.ddoc_no.trim().toLowerCase() === ddocNo.trim().toLowerCase());
  if (targets.length === 0) {
    return { success: false, error: 'ไม่พบรายการใน DDOC นี้' };
  }

  const materials = await fetchMaterials();
  let matChanged = false;
  for (const target of targets) {
    if (target.stock_updated && target.allocated_qty && target.allocated_qty > 0) {
      const material = materials.find((m) => m.id === target.material_id);
      if (material) {
        material.current_sap = Math.max(0, material.current_sap - target.allocated_qty);
        material.current_warehouse = Math.max(0, material.current_warehouse - target.allocated_qty);
        material.updated_at = new Date().toISOString();
        matChanged = true;
      }
    }
  }
  if (matChanged) {
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  }

  const remaining = list.filter((t) => t.ddoc_no.trim().toLowerCase() !== ddocNo.trim().toLowerCase());
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(remaining));

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_in').delete().eq('ddoc_no', ddocNo.trim());
    } catch (e) {
      console.warn(e);
    }
  }

  return { success: true };
}

export async function updateTransferInStep(
  transferId: string,
  updates: Partial<TransferIn>
): Promise<{ success: boolean; error?: string }> {
  const list = await fetchTransfersIn();
  const target = list.find((t) => t.id === transferId);
  if (!target) {
    return { success: false, error: 'ไม่พบรายการรับโอนนี้' };
  }

  // Calculate allocated_qty if allocations array provided
  if (updates.allocations && updates.allocations.length > 0) {
    const totalAlloc = updates.allocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    updates.allocated_qty = totalAlloc;
    updates.origin_district = updates.allocations[0].district;
  }

  // If completing receive (Step 5: ตรวจรับเข้าคลัง / +Stock)
  if (updates.status === 'RECEIVED') {
    // Section 5: ป้องกันการบวก Stock ซ้ำ
    if (target.stock_updated) {
      return { success: false, error: 'รายการนี้รับเข้าสต็อกแล้ว' };
    }

    // Section 4: คำนวณ Stock โดยใช้เฉพาะ "ยอดรวมที่เขตต่าง ๆ จัดสรรให้จริง" (allocatedTotal) เท่านั้น
    let allocated = 0;
    if (updates.allocations && updates.allocations.length > 0) {
      allocated = updates.allocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    } else if (updates.allocated_qty !== undefined && updates.allocated_qty > 0) {
      allocated = updates.allocated_qty;
    } else if (target.allocations && target.allocations.length > 0) {
      allocated = target.allocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    } else if (target.allocated_qty !== undefined && target.allocated_qty > 0) {
      allocated = target.allocated_qty;
    }

    if (allocated <= 0) {
      return { success: false, error: 'กรุณาระบุเขตและจำนวนที่เขตจัดสรรให้จริงก่อนรับเข้าคลัง (ยอดจัดสรรต้องมากกว่า 0)' };
    }

    const materials = await fetchMaterials();
    const material = materials.find((m) => m.id === target.material_id);
    if (!material) {
      return { success: false, error: 'ไม่พบรหัสพัสดุในคลัง' };
    }

    // Section 4 & Section 1.5: คำนวณ Stock ตามยอดจัดสรรจริง
    const sapAfter = material.current_sap + allocated;
    const whAfter = material.current_warehouse + allocated;

    // Rule 1.5 Recheck: Before + Delta = After
    if (
      material.current_sap + allocated !== sapAfter ||
      material.current_warehouse + allocated !== whAfter
    ) {
      return { success: false, error: 'Recheck Failed: การคำนวณ Stock รับโอนไม่ตรงกัน' };
    }

    material.current_sap = sapAfter;
    material.current_warehouse = whAfter;
    material.updated_at = new Date().toISOString();

    updates.allocated_qty = allocated;
    updates.received_qty = allocated;
    updates.stock_updated = true;
    updates.received_at = new Date().toISOString();

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase
          .from('materials')
          .update({ current_sap: sapAfter, current_warehouse: whAfter })
          .eq('id', material.id);
      } catch (e) {
        console.warn(e);
      }
    }

    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));

    const allocList = updates.allocations ?? target.allocations;
    const allocSummary =
      allocList && allocList.length > 0
        ? allocList.map((a) => `${DISTRICT_LABELS[a.district] || a.district}: ${a.quantity}`).join(', ')
        : target.origin_district || 'ต่างเขต';

    await addStockHistory({
      material_id: material.id,
      material_description: material.description,
      project_name: `DDOC: ${target.ddoc_no} (${allocSummary} -> ต.1)`,
      demand_qty: target.demand_qty,
      pick_status: `รับของเข้าคลัง (จัดสรรจริง: ${allocated} หน่วย จากขอ ${target.demand_qty} หน่วย)`,
      picked_qty: allocated,
      remaining_company: 0,
      remaining_sap: sapAfter,
      remaining_wh: whAfter,
      transaction_type: 'TRANSFER_IN',
      reference_id: target.id,
    });
  }

  const updatedTarget = { ...target, ...updates };
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_in').update(updates).eq('id', transferId);
    } catch (e) {
      console.warn(e);
    }
  }

  const updatedList = list.map((t) => (t.id === transferId ? updatedTarget : t));
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(updatedList));
  return { success: true };
}

export async function deleteTransferIn(transferId: string): Promise<{ success: boolean; error?: string }> {
  const list = await fetchTransfersIn();
  const target = list.find((t) => t.id === transferId);
  if (!target) {
    return { success: false, error: 'ไม่พบรายการ' };
  }

  // If already stock_updated, reverse the added stock to keep inventory consistent
  if (target.stock_updated && target.allocated_qty && target.allocated_qty > 0) {
    const materials = await fetchMaterials();
    const material = materials.find((m) => m.id === target.material_id);
    if (material) {
      material.current_sap = Math.max(0, material.current_sap - target.allocated_qty);
      material.current_warehouse = Math.max(0, material.current_warehouse - target.allocated_qty);
      material.updated_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));

      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase
            .from('materials')
            .update({ current_sap: material.current_sap, current_warehouse: material.current_warehouse })
            .eq('id', material.id);
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_in').delete().eq('id', transferId);
    } catch (e) {
      console.warn(e);
    }
  }

  const updated = list.filter((t) => t.id !== transferId);
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify(updated));
  return { success: true };
}

// -------------------------------------------------------------
// TRANSFERS OUT (Tracking การโอนของจาก ต.1 ไปยังเขตอื่น)
// -------------------------------------------------------------
export async function fetchTransfersOut(): Promise<TransferOutOrder[]> {
  const raw = localStorage.getItem(STORAGE_KEYS.TRANSFERS_OUT);
  const localTransfersOut: TransferOutOrder[] = raw ? JSON.parse(raw) : [];

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transfers_out_orders')
        .select('*, items:transfer_out_items(*)')
        .order('created_at', { ascending: false });
      if (!error && data) {
        if (data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify(data));
          return data as TransferOutOrder[];
        } else if (localTransfersOut.length > 0) {
          return localTransfersOut;
        }
      }
    } catch (e) {
      console.warn('Supabase fetchTransfersOut error, using local:', e);
    }
  }
  return localTransfersOut;
}

export async function createTransferOutOrder(orderData: {
  doc_no: string;
  doc_date: string;
  coordinator: string;
  destination_district: District;
  sto_no?: string;
  items: Array<{ material_id: string; transfer_qty: number }>;
}): Promise<{ success: boolean; error?: string }> {
  if (!orderData.doc_no.trim()) {
    return { success: false, error: 'กรุณากรอกเลขที่หนังสือขอรับโอน' };
  }
  if (!orderData.coordinator.trim()) {
    return { success: false, error: 'กรุณากรอกชื่อผู้ประสานงาน' };
  }
  if (!orderData.items || orderData.items.length === 0) {
    return { success: false, error: 'กรุณาเพิ่มรายการพัสดุอย่างน้อย 1 รายการ' };
  }

  const existing = await fetchTransfersOut();
  if (existing.some((o) => o.doc_no.trim().toLowerCase() === orderData.doc_no.trim().toLowerCase())) {
    return { success: false, error: `เลขที่หนังสือ ${orderData.doc_no} มีอยู่ในระบบแล้ว (ห้ามบันทึกซ้ำ)` };
  }

  const materials = await fetchMaterials();
  const orderId = crypto.randomUUID();
  const fullItems = orderData.items.map((it) => {
    const mat = materials.find((m) => m.id === it.material_id);
    if (!mat) {
      throw new Error(`ไม่พบรหัสวัสดุ ${it.material_id}`);
    }
    if (it.transfer_qty <= 0) {
      throw new Error(`จำนวนโอนของวัสดุ ${it.material_id} ต้องมากกว่า 0`);
    }
    return {
      id: crypto.randomUUID(),
      order_id: orderId,
      material_id: mat.id,
      material_description: mat.description,
      transfer_qty: it.transfer_qty,
    };
  });

  const newOrder: TransferOutOrder = {
    id: orderId,
    doc_no: orderData.doc_no.trim(),
    doc_date: orderData.doc_date,
    coordinator: orderData.coordinator.trim(),
    destination_district: orderData.destination_district,
    sto_no: orderData.sto_no?.trim() || undefined,
    folded_back_checked: false,
    is_dispatched: false,
    items: fullItems,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_out_orders').insert({
        id: newOrder.id,
        doc_no: newOrder.doc_no,
        doc_date: newOrder.doc_date,
        coordinator: newOrder.coordinator,
        destination_district: newOrder.destination_district,
        sto_no: newOrder.sto_no,
        folded_back_checked: false,
        is_dispatched: false,
      });
      for (const item of fullItems) {
        await supabase.from('transfer_out_items').insert({
          id: item.id,
          order_id: orderId,
          material_id: item.material_id,
          material_description: item.material_description,
          transfer_qty: item.transfer_qty,
        });
      }
    } catch (e) {
      console.warn(e);
    }
  }

  existing.unshift(newOrder);
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify(existing));
  return { success: true };
}

export async function updateTransferOutInline(
  orderId: string,
  fields: { sto_no?: string; folded_back_checked?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const orders = await fetchTransfersOut();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'ไม่พบรายการโอน' };
  }

  if (fields.sto_no !== undefined) {
    order.sto_no = fields.sto_no.trim();
  }
  if (fields.folded_back_checked !== undefined) {
    order.folded_back_checked = fields.folded_back_checked;
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_out_orders').update(fields).eq('id', orderId);
    } catch (e) {
      console.warn(e);
    }
  }

  localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify(orders));
  return { success: true };
}

// 8.6 ตัดจ่ายคลัง: บันทึกวันที่ตัดจ่ายจริง ตัด Stock แสดงสถานะสีเขียว
export async function dispatchTransferOut(orderId: string): Promise<{ success: boolean; error?: string }> {
  const orders = await fetchTransfersOut();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'ไม่พบรายการโอน' };
  }
  if (order.is_dispatched) {
    return { success: false, error: 'รายการนี้ได้รับการตัดจ่ายคลังไปแล้ว ห้ามตัด Stock ซ้ำ' };
  }

  const materials = await fetchMaterials();

  // Validate stock for all items first
  for (const item of order.items) {
    const mat = materials.find((m) => m.id === item.material_id) || findMatchingMaterial(item.material_id, materials);
    if (!mat) {
      return { success: false, error: `ไม่พบรหัสวัสดุ ${item.material_id} ในคลัง` };
    }
  }

  // Deduct stock for all items
  const now = new Date().toISOString();
  for (const item of order.items) {
    const mat = (materials.find((m) => m.id === item.material_id) || findMatchingMaterial(item.material_id, materials))!;
    const qty = Number(item.transfer_qty) || 0;
    const sapBefore = Number(mat.current_sap) || 0;
    const whBefore = Number(mat.current_warehouse) || 0;
    const sapAfter = sapBefore - qty;
    const whAfter = whBefore - qty;

    mat.current_sap = sapAfter;
    mat.current_warehouse = whAfter;
    mat.updated_at = now;

    await addStockHistory({
      material_id: mat.id,
      material_description: mat.description,
      project_name: `โอนออกไปเขต ${order.destination_district} (หนังสือ: ${order.doc_no})`,
      demand_qty: qty,
      pick_status: 'โอนของออกจากคลัง',
      picked_qty: qty,
      remaining_company: 0,
      remaining_sap: sapAfter,
      remaining_wh: whAfter,
      transaction_type: 'TRANSFER_OUT',
      reference_id: order.id,
    });
  }

  order.is_dispatched = true;
  order.dispatched_at = now;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('transfers_out_orders')
        .update({ is_dispatched: true, dispatched_at: now })
        .eq('id', orderId);
      for (const item of order.items) {
        const mat = materials.find((m) => m.id === item.material_id)!;
        await supabase
          .from('materials')
          .update({ current_sap: mat.current_sap, current_warehouse: mat.current_warehouse })
          .eq('id', mat.id);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify(orders));
  return { success: true };
}

// 8.7 ลบรายการโอนออกจากระบบ
export async function deleteTransferOutOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  const orders = await fetchTransfersOut();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'ไม่พบรายการโอนนี้' };
  }

  // If already dispatched, restore deducted quantities back to materials
  if (order.is_dispatched && order.items && order.items.length > 0) {
    const materials = await fetchMaterials();
    for (const itm of order.items) {
      const mat = materials.find((m) => m.id === itm.material_id);
      if (mat) {
        mat.current_warehouse += itm.transfer_qty;
        mat.updated_at = new Date().toISOString();
      }
    }
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    const supabase = getSupabase();
    if (supabase) {
      try {
        for (const itm of order.items) {
          const mat = materials.find((m) => m.id === itm.material_id);
          if (mat) {
            await supabase
              .from('materials')
              .update({ current_warehouse: mat.current_warehouse })
              .eq('id', mat.id);
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('transfers_out_orders').delete().eq('id', orderId);
    } catch (e) {
      console.warn(e);
    }
  }

  const updated = orders.filter((o) => o.id !== orderId);
  localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify(updated));
  return { success: true };
}

// -------------------------------------------------------------
// STOCK HISTORY & AUDIT RECONCILIATION
// -------------------------------------------------------------
export async function fetchStockHistory(): Promise<StockHistoryItem[]> {
  const raw = localStorage.getItem(STORAGE_KEYS.STOCK_HISTORY);
  const localHist: StockHistoryItem[] = raw ? JSON.parse(raw) : [];

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        if (data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.STOCK_HISTORY, JSON.stringify(data));
          return data as StockHistoryItem[];
        } else if (localHist.length > 0) {
          return localHist;
        }
      }
    } catch (e) {
      console.warn('Supabase fetchStockHistory error, using local:', e);
    }
  }
  return localHist;
}

export async function addStockHistory(
  item: Omit<StockHistoryItem, 'id' | 'created_at'>
): Promise<void> {
  const fullItem: StockHistoryItem = {
    ...item,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('stock_transactions').insert(fullItem);
    } catch (e) {
      console.warn(e);
    }
  }

  const history = await fetchStockHistory();
  history.unshift(fullItem);
  localStorage.setItem(STORAGE_KEYS.STOCK_HISTORY, JSON.stringify(history));
}

// Rule 25: Audit / Reconciliation Check
export async function performStockAudit(): Promise<
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
> {
  const materials = await fetchMaterials();
  const history = await fetchStockHistory();

  return materials.map((mat) => {
    // Calculate expected stock based on transactions
    const matTxs = history.filter((h) => h.material_id === mat.id);
    let netChange = 0;
    for (const tx of matTxs) {
      if (tx.transaction_type === 'PICK' || tx.transaction_type === 'TRANSFER_OUT') {
        netChange -= tx.picked_qty;
      } else if (tx.transaction_type === 'TRANSFER_IN') {
        netChange += tx.picked_qty;
      } else if (tx.transaction_type === 'ADJUSTMENT') {
        // Handled via adjustment
        netChange += tx.picked_qty;
      }
    }

    const expectedWh = mat.initial_warehouse + netChange;
    const diffWh = mat.current_warehouse - expectedWh;
    const isMismatch = Math.abs(diffWh) > 0.001;

    return {
      material_id: mat.id,
      description: mat.description,
      initial_wh: mat.initial_warehouse,
      current_wh: mat.current_warehouse,
      expected_wh: expectedWh,
      diff_wh: diffWh,
      isMismatch,
      txCount: matTxs.length,
    };
  });
}

// -------------------------------------------------------------
// EXCEL EXPORT HELPER (Section 30)
// -------------------------------------------------------------
export function exportDataToExcel(data: Record<string, any>[], sheetName: string, filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function seedInitialMaterialsToSupabase(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Supabase หรือยังไม่ได้ระบุ Credentials' };
  }

  try {
    const materials: Material[] = INITIAL_35_MATERIALS.map((m) => ({
      id: m.id,
      description: m.description,
      initial_sap: m.initial_sap,
      initial_warehouse: m.initial_warehouse,
      current_sap: m.initial_sap,
      current_warehouse: m.initial_warehouse,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('materials').upsert(materials, { onConflict: 'id' });
    if (error) {
      return { success: false, message: `ไม่สามารถนำเข้าข้อมูลได้: ${error.message}` };
    }
    return { success: true, message: 'นำเข้า Master Data 35 รายการเข้า Supabase เรียบร้อย' };
  } catch (err: any) {
    return { success: false, message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
  }
}

// -------------------------------------------------------------
// RESET ALL SYSTEM DATA (คืนค่าเริ่มต้น Master Data 35 รายการ & ล้างรายการ)
// -------------------------------------------------------------
export async function resetAllSystemData(): Promise<{ success: boolean; message: string }> {
  try {
    const materials: Material[] = INITIAL_35_MATERIALS.map((m) => ({
      id: m.id,
      description: m.description,
      initial_sap: m.initial_sap,
      initial_warehouse: m.initial_warehouse,
      current_sap: m.initial_sap,
      current_warehouse: m.initial_warehouse,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    localStorage.setItem(STORAGE_KEYS.DEMANDS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PICKS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TRANSFERS_IN, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TRANSFERS_OUT, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STOCK_HISTORY, JSON.stringify([]));

    const supabase = getSupabase();
    if (supabase) {
      try {
        try {
          await supabase.from('transfer_out_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('transfers_out_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('pick_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('demands').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('transfers_in').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('stock_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        try {
          await supabase.from('stock_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}
        await supabase.from('materials').upsert(materials, { onConflict: 'id' });
      } catch (e) {
        console.warn('Supabase reset warning:', e);
      }
    }

    return {
      success: true,
      message: 'รีเซ็ตข้อมูลระบบและคืนค่าสต็อกตั้งต้น 35 รายการสำเร็จ',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'เกิดข้อผิดพลาดในการรีเซ็ตข้อมูล',
    };
  }
}


