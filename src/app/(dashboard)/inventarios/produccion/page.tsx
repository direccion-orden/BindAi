"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Factory, MoreHorizontal, Calendar, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ProductionStage } from "@/app/(dashboard)/catalogos/etapas-produccion/page";

interface ProductionOrder {
  id: string;
  orderNumber: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  warehouseName: string; // Used for UI display primarily
  finishedProduct: string;
  finishedProductId: string;
  finishedVariantId: string;
  finishedQuantity: number;
  totalCost: number;
  createdAt: string;
  createdBy: string;
  stageId?: string | null; // null = Backlog "Por Iniciar"
  status: string;
  materialsDeducted: boolean;
  finishedProductAdded: boolean;
  materials: {
    productId: string;
    variantId: string;
    productName: string;
    quantity: number;
    unitCost: number;
  }[];
}

export default function ProduccionPage() {
  const { companyId } = useAuth();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drag and Drop State
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    // Fetch Stages
    const unsubStages = onSnapshot(query(collection(db, "companies", companyId, "production_stages"), orderBy("order", "asc")), (snap) => {
      setStages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionStage)));
    });

    // Fetch Orders
    const unsubOrders = onSnapshot(query(collection(db, "companies", companyId, "production_orders"), orderBy("createdAt", "desc")), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionOrder));
      setOrders(data);
      setLoading(false);
    });

    return () => { unsubStages(); unsubOrders(); };
  }, [companyId]);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    setDraggedOrderId(orderId);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      const el = document.getElementById(`order-${orderId}`);
      if (el) el.classList.add("opacity-50");
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent, orderId: string) => {
    setDraggedOrderId(null);
    const el = document.getElementById(`order-${orderId}`);
    if (el) el.classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string | null) => {
    e.preventDefault();
    if (!draggedOrderId || !companyId) return;
    
    // Check WIP Limits if not backlog
    if (targetStageId !== null) {
      const targetStage = stages.find(s => s.id === targetStageId);
      if (targetStage && targetStage.wipLimit > 0) {
         const ordersInTarget = orders.filter(o => o.stageId === targetStageId).length;
         if (ordersInTarget >= targetStage.wipLimit) {
           alert(`¡Límite WIP superado! La etapa "${targetStage.name}" no acepta más de ${targetStage.wipLimit} órdenes simultáneas.`);
           return;
         }
      }
    }

    const order = orders.find(o => o.id === draggedOrderId);
    if (!order) return;
    
    const currentStageId = order.stageId || null;
    if (currentStageId === targetStageId) return; // No change

    // Check rollback scenario
    let isRollback = false;
    let rollbackFinishedProduct = false;
    if (targetStageId === null && order.materialsDeducted) {
      const confirmMsg = "Al regresar esta orden a 'Por Iniciar', el inventario de materia prima se regresará al almacén de origen." +
                         (order.finishedProductAdded ? "\n\nTambién se revertirá la entrada del producto terminado en el almacén de destino." : "") +
                         "\n\n¿Estás seguro de continuar?";
      if (!window.confirm(confirmMsg)) {
        return; // User canceled
      }
      isRollback = true;
      rollbackFinishedProduct = order.finishedProductAdded;
    }

    // Optimistic UI Update
    setOrders(prev => prev.map(o => o.id === draggedOrderId ? { ...o, stageId: targetStageId } : o));
    
    // DB Update
    setIsUpdating(true);
    try {
      const batch = writeBatch(db);
      const orderRef = doc(db, "companies", companyId, "production_orders", draggedOrderId);
      
      const updateData: any = { stageId: targetStageId };
      const now = new Date().toISOString();

      if (isRollback) {
        updateData.materialsDeducted = false;
        updateData.status = "Por Iniciar";
        
        // Revert materials (Add them back)
        const materialItemsByProduct = order.materials.reduce((acc, item) => {
          if (!acc[item.productId]) acc[item.productId] = [];
          acc[item.productId].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        for (const [productId, items] of Object.entries(materialItemsByProduct)) {
          const prodRef = doc(db, "companies", companyId, "products", productId);
          const prodSnap = await getDoc(prodRef);
          if (prodSnap.exists()) {
            const productData = prodSnap.data();
            const updatedVariants = [...productData.variants];

            for (const item of items) {
              const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
              if (variantIndex > -1) {
                const v = updatedVariants[variantIndex];
                const inv = { ...(v.inventoryByWarehouse || {}) };
                inv[order.originWarehouseId] = (inv[order.originWarehouseId] || 0) + item.quantity;
                updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
              }

              // TX IN (Rollback)
              const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
              batch.set(txRef, {
                type: "IN",
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                toWarehouseId: order.originWarehouseId,
                referenceId: order.id,
                reason: `Reversión Producción - ${order.orderNumber}`,
                createdAt: now,
                createdBy: "Sistema (Kanban)"
              });
            }
            batch.update(prodRef, { variants: updatedVariants });
          }
        }

        // Revert finished product if needed
        if (rollbackFinishedProduct) {
          updateData.finishedProductAdded = false;
          const finProdRef = doc(db, "companies", companyId, "products", order.finishedProductId);
          const finProdSnap = await getDoc(finProdRef);
          if (finProdSnap.exists()) {
            const productData = finProdSnap.data();
            const updatedVariants = [...productData.variants];
            const variantIndex = updatedVariants.findIndex(v => v.id === order.finishedVariantId);
            
            if (variantIndex > -1) {
              const v = updatedVariants[variantIndex];
              const inv = { ...(v.inventoryByWarehouse || {}) };
              
              inv[order.destinationWarehouseId] = Math.max(0, (inv[order.destinationWarehouseId] || 0) - order.finishedQuantity);

              updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
              batch.update(finProdRef, { variants: updatedVariants });

              // TX OUT (Rollback)
              const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
              batch.set(txRef, {
                type: "OUT",
                productId: order.finishedProductId,
                productName: order.finishedProduct,
                quantity: order.finishedQuantity,
                fromWarehouseId: order.destinationWarehouseId,
                referenceId: order.id,
                reason: `Reversión Producción - ${order.orderNumber}`,
                createdAt: now,
                createdBy: "Sistema (Kanban)"
              });
            }
          }
        }
      } else {
        // IF it's moving from "backlog" to a real stage (i.e. started) -> Deduct Materials
      if (!order.materialsDeducted && targetStageId !== null) {
        updateData.materialsDeducted = true;
        updateData.status = "En Proceso";
        
        // Deduct materials
        const materialItemsByProduct = order.materials.reduce((acc, item) => {
          if (!acc[item.productId]) acc[item.productId] = [];
          acc[item.productId].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        for (const [productId, items] of Object.entries(materialItemsByProduct)) {
          const prodRef = doc(db, "companies", companyId, "products", productId);
          const prodSnap = await getDoc(prodRef);
          if (prodSnap.exists()) {
            const productData = prodSnap.data();
            const updatedVariants = [...productData.variants];

            for (const item of items) {
              const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
              if (variantIndex > -1) {
                const v = updatedVariants[variantIndex];
                const inv = { ...(v.inventoryByWarehouse || {}) };
                inv[order.originWarehouseId] = (inv[order.originWarehouseId] || 0) - item.quantity;
                updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
              }

              // TX OUT
              const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
              batch.set(txRef, {
                type: "OUT",
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                fromWarehouseId: order.originWarehouseId,
                referenceId: order.id,
                reason: `Consumo Producción - ${order.orderNumber}`,
                createdAt: now,
                createdBy: "Sistema (Kanban)"
              });
            }
            batch.update(prodRef, { variants: updatedVariants });
          }
        }
      }

      // IF it's moving to the LAST stage -> Add Finished Product
      if (!order.finishedProductAdded && stages.length > 0 && targetStageId === stages[stages.length - 1].id) {
        updateData.finishedProductAdded = true;
        updateData.status = "Completado";

        const finProdRef = doc(db, "companies", companyId, "products", order.finishedProductId);
        const finProdSnap = await getDoc(finProdRef);
        if (finProdSnap.exists()) {
          const productData = finProdSnap.data();
          const updatedVariants = [...productData.variants];
          const variantIndex = updatedVariants.findIndex(v => v.id === order.finishedVariantId);
          
          if (variantIndex > -1) {
            const v = updatedVariants[variantIndex];
            const inv = { ...(v.inventoryByWarehouse || {}) };
            
            // Cost calculation
            const currentTotalStock = Object.values(inv).reduce((sum: number, q: any) => sum + (q as number), 0);
            const currentCost = v.cost || 0;
            const totalCurrentValue = currentTotalStock * currentCost;
            const totalNewValue = order.totalCost;
            const newTotalStock = currentTotalStock + order.finishedQuantity;
            const newAverageCost = newTotalStock > 0 ? (totalCurrentValue + totalNewValue) / newTotalStock : 0;

            inv[order.destinationWarehouseId] = (inv[order.destinationWarehouseId] || 0) + order.finishedQuantity;

            updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv, cost: newAverageCost };
            batch.update(finProdRef, { variants: updatedVariants });

            // TX IN
            const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
            batch.set(txRef, {
              type: "IN",
              productId: order.finishedProductId,
              productName: order.finishedProduct,
              quantity: order.finishedQuantity,
              toWarehouseId: order.destinationWarehouseId,
              referenceId: order.id,
              reason: `Alta Producción - ${order.orderNumber}`,
              createdAt: now,
              createdBy: "Sistema (Kanban)"
            });
          }
        }
      }
      }

      batch.update(orderRef, updateData);
      await batch.commit();
      
    } catch (err) {
      console.error(err);
      alert("Error al actualizar la orden y el inventario.");
      window.location.reload(); // Revert optimistic update
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Common Order Card Render
  const renderOrderCard = (order: ProductionOrder) => (
    <div 
      key={order.id}
      id={`order-${order.id}`}
      draggable
      onDragStart={(e) => handleDragStart(e, order.id)}
      onDragEnd={(e) => handleDragEnd(e, order.id)}
      className={`bg-white border rounded-lg p-4 shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors group relative ${order.status === 'Completado' ? 'opacity-80 grayscale-[0.2]' : ''}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${order.status === 'Por Iniciar' ? 'bg-slate-100 text-slate-600' : order.status === 'Completado' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'}`}>
          {order.orderNumber}
        </span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex items-start gap-2 mb-3 mt-3">
        <Package className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className={`font-medium text-sm leading-snug ${order.status === 'Completado' ? 'text-slate-600 line-through decoration-emerald-500/30' : 'text-slate-900'}`}>
          {order.finishedProduct}
        </p>
      </div>

      <div className="flex justify-between items-end border-t pt-2 mt-2">
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(order.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Cantidad</p>
          <p className={`font-bold text-sm ${order.status === 'Completado' ? 'text-emerald-700' : 'text-indigo-600'}`}>{order.finishedQuantity} uds</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-6">
      {/* Header code */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tablero de Producción</h1>
          <p className="text-muted-foreground">
            Control visual del flujo de manufactura (Kanban Push/Pull).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inventarios/produccion/formulas">
            <Button variant="outline" className="gap-2">
              Fórmulas (BOM)
            </Button>
          </Link>
          <Link href="/inventarios/produccion/nueva">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Nueva Orden
            </Button>
          </Link>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10 bg-slate-50 border border-dashed rounded-xl">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Factory className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Bienvenido al Tablero Kanban de Producción</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 mt-2">Para usar el tablero de control visual, primero necesitas configurar las etapas de tu proceso productivo (Ej. Corte, Ensamble, Empaque).</p>
          <Link href="/catalogos/etapas-produccion">
            <Button className="bg-indigo-600 hover:bg-indigo-700">Configurar Etapas de Producción</Button>
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 pb-4 px-1" style={{ width: 'max-content', minWidth: '100%' }}>
            
            {/* Backlog Column (Por Iniciar) */}
            <div 
              className="flex flex-col w-80 shrink-0 bg-slate-100/50 border border-slate-300 border-dashed rounded-xl overflow-hidden shadow-sm h-full"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null)}
            >
              <div className="p-3 border-b border-slate-300 bg-slate-200 flex justify-between items-center sticky top-0">
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span> Por Iniciar
                </h3>
                <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-300 text-slate-700">
                  {orders.filter(o => !o.stageId).length}
                </div>
              </div>
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {orders.filter(o => !o.stageId).map(renderOrderCard)}
                {orders.filter(o => !o.stageId).length === 0 && (
                  <div className="h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-xs text-slate-400 font-medium text-center px-4">
                    Sin órdenes pendientes
                  </div>
                )}
              </div>
            </div>

            {/* Configured Stages */}
            {stages.map((stage) => {
              const stageOrders = orders.filter(o => o.stageId === stage.id);
              const isAtWipLimit = stage.wipLimit > 0 && stageOrders.length >= stage.wipLimit;

              return (
                <div 
                  key={stage.id} 
                  className="flex flex-col w-80 shrink-0 bg-slate-50 border rounded-xl overflow-hidden shadow-sm h-full"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <div 
                    className="p-3 border-b border-slate-200 bg-white flex justify-between items-center sticky top-0"
                    style={{ borderTop: `4px solid ${stage.color || '#6366f1'}` }}
                  >
                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">{stage.name}</h3>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${isAtWipLimit ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      {stageOrders.length} {stage.wipLimit > 0 ? `/ ${stage.wipLimit}` : ''}
                    </div>
                  </div>

                  <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                    {stageOrders.map(renderOrderCard)}
                    {stageOrders.length === 0 && (
                      <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400 font-medium">
                        Arrastra órdenes aquí
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
