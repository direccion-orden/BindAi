import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen } from "lucide-react";
import { FileText, Package, Trash2, Edit2, Save, Search, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { doc, updateDoc, collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { generateQuoteImage } from "@/actions/generate-image";

export function QuoteModal({ quote, onClose, stages }: { quote: any, onClose: () => void, stages: any[] }) {
  const { companyId } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  
  const [products, setProducts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (quote) {
      setEditData({ ...quote });
      setIsEditing(false);
    }
  }, [quote]);

  useEffect(() => {
    if (isEditing && products.length === 0 && companyId) {
      getDocs(collection(db, "companies", companyId, "products")).then(snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(collection(db, "companies", companyId, "projects")).then(snap => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [isEditing, companyId, products.length]);

  if (!quote || !editData) return null;

  const handleSave = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Recalculate totals
      const subtotal = editData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)), 0);
      const tax = subtotal * 0.16;
      const totalAmount = subtotal + tax;

      // Handle AI Image Update if prompt changed via Server Action
      let imageUrl = editData.imageUrl;
      if (editData.imagePrompt !== quote.imagePrompt && editData.imagePrompt) {
        try {
          imageUrl = await generateQuoteImage(editData.imagePrompt);
        } catch (err) {
          console.error("Imagen generation failed", err);
        }
      }

      let finalProjectName = null;
      if (editData.projectId) {
        finalProjectName = projects.find(p => p.id === editData.projectId)?.name || null;
      }

      const updatedQuote = {
        ...editData,
        projectName: finalProjectName,
        subtotal,
        tax,
        totalAmount,
        imageUrl
      };

      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), updatedQuote);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la cotización");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelQuote = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Estás seguro de cancelar esta cotización?")) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), {
        status: "cancelada"
      });
      onClose(); // Close modal and the parent will refresh via snapshot
    } catch (e) {
      console.error(e);
      alert("Error al cancelar la cotización.");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (variantId: string, field: string, value: number) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any) => 
        item.variantId === variantId ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeItem = (variantId: string) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.filter((item: any) => item.variantId !== variantId)
    }));
  };

  const handleAddProduct = (product: any, variant: any) => {
    const exists = editData.items.find((i: any) => i.variantId === variant.id);
    if (!exists) {
      setEditData((prev: any) => ({
        ...prev,
        items: [...prev.items, {
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          quantity: 1,
          unitPrice: variant.price || 0,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || ""
        }]
      }));
    }
    setProductSearch("");
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(term) || 
      p.variants?.some((v:any) => v.sku.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };

  // Recalc UI totals on the fly during edit
  const displaySubtotal = isEditing 
    ? editData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)), 0)
    : editData.subtotal;
  const displayTax = displaySubtotal * 0.16;
  const displayTotal = displaySubtotal + displayTax;

  return (
    <Dialog open={!!quote} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground mr-2">{quote.quoteNumber}</span>
              {isEditing ? "Editar Cotización" : "Detalles de Cotización"}
            </div>
            <div className="flex gap-2 mr-8">
              {!isEditing && (
                <Link href={`/pdf/cotizacion/${quote.id}`} target="_blank">
                  <Button variant="outline" size="sm" className="h-8 gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                    <FileText className="w-4 h-4" /> Ver PDF
                  </Button>
                </Link>
              )}
              <Button 
                variant={isEditing ? "default" : "secondary"} 
                size="sm" 
                className="h-8 gap-2"
                onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                disabled={loading || quote.status === 'cancelada'}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {isEditing ? "Guardar Cambios" : "Editar"}
              </Button>
              {!isEditing && quote.status !== 'cancelada' && quote.status !== 'ganada' && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-8 gap-2"
                  onClick={handleCancelQuote}
                  disabled={loading}
                >
                  <XCircle className="w-4 h-4" /> Cancelar
                </Button>
              )}
              {isEditing && (
                <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditData({...quote}); }} className="h-8 text-slate-500">
                  Cancelar
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Cliente</p>
              <p className="font-bold text-slate-900">{editData.clientName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Estatus</p>
              <p className="font-bold text-slate-900">
                {stages.find(s => s.id === editData.status)?.name || editData.status}
              </p>
            </div>
          </div>

          {(editData.imageUrl || isEditing) && (
            <div className="rounded-lg overflow-hidden border shadow-sm relative bg-slate-100">
              {editData.imageUrl && !isEditing && (
                <div className="h-48 relative">
                  <img src={editData.imageUrl} alt="Concepto" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 text-xs rounded font-medium shadow">
                    IA: {editData.imagePrompt}
                  </div>
                </div>
              )}
              {isEditing && (
                <div className="p-4 bg-indigo-50/50 space-y-2">
                  <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1">✨ Concepto Imagen IA</label>
                  <Input 
                    value={editData.imagePrompt || ""}
                    onChange={e => setEditData({...editData, imagePrompt: e.target.value})}
                    placeholder="Ej. Cocina minimalista..."
                    className="bg-white"
                  />
                  <p className="text-[10px] text-indigo-700/70">Al guardar, la IA regenerará la imagen automáticamente.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="font-semibold text-sm border-b pb-2 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-400" /> Partidas Cotizadas
            </h4>
            
            <div className="space-y-3">
              {editData.items?.map((item: any, idx: number) => (
                <div key={item.variantId || idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border p-3 rounded-lg text-sm shadow-sm gap-4">
                  <div className="flex-1 flex items-center gap-3">
                    <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Cant.</label>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.variantId, 'quantity', parseInt(e.target.value)||1)} className="w-16 h-8 text-center" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Precio U.</label>
                        <Input type="number" step={0.01} value={item.unitPrice} onChange={(e) => updateItem(item.variantId, 'unitPrice', parseFloat(e.target.value)||0)} className="w-24 h-8 text-right" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Desc %</label>
                        <Input type="number" min={0} max={100} value={item.discountPercentage} onChange={(e) => updateItem(item.variantId, 'discountPercentage', parseFloat(e.target.value)||0)} className="w-16 h-8 text-center text-emerald-600" />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.variantId)} className="h-8 w-8 text-red-500 mt-4"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="font-semibold">{item.quantity} x ${(item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      {item.discountPercentage > 0 && <p className="text-[10px] text-emerald-600">Descuento: {item.discountPercentage}%</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <div className="mt-4 p-4 border rounded-lg bg-slate-50 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto para agregar..." 
                    className="pl-9 bg-white"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                {productSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-white divide-y z-50 shadow-xl">
                    {getFilteredProducts().map(product => (
                      product.variants?.map((variant:any) => (
                        <div 
                          key={variant.id} 
                          className="p-3 hover:bg-slate-50 flex justify-between items-center text-sm cursor-pointer"
                          onClick={() => {
                            if (!editData.items?.some((i:any) => i.variantId === variant.id)) {
                              handleAddProduct(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">${variant.price}</div>
                          </div>
                          {editData.items?.some((i:any) => i.variantId === variant.id) && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                          )}
                        </div>
                      ))
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>${displaySubtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>IVA (16%)</span>
                <span>${displayTax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                <span>Total</span>
                <span className="text-indigo-700">${displayTotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              
              <div className="space-y-1 mt-4">
                <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1">
                  <FolderOpen className="w-3 h-3 text-indigo-500" /> Vincular a Proyecto (Opcional)
                </label>
                <select 
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  value={editData.projectId || ""}
                  onChange={e => setEditData({...editData, projectId: e.target.value})}
                >
                  <option value="">Ninguno</option>
                  {projects.filter(p => p.clientId === editData.clientId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Notas / Condiciones Comerciales</label>
              <Input value={editData.notes || ""} onChange={e => setEditData({...editData, notes: e.target.value})} />
            </div>
          ) : (
            editData.notes && (
              <div className="bg-amber-50 p-3 rounded-md border border-amber-100 text-sm">
                <p className="font-semibold text-amber-800 text-xs uppercase mb-1">Notas / Condiciones</p>
                <p className="text-amber-900">{editData.notes}</p>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
