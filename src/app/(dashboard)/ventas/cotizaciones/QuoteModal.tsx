import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen } from "lucide-react";
import { FileText, Package, Trash2, Edit2, Save, Search, Loader2, XCircle, MessageSquare } from "lucide-react";
import Link from "next/link";
import { doc, updateDoc, collection, query, getDocs, where, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { generateQuoteImage } from "@/actions/generate-image";
import { calculateOrderTotals, EngineDiscount, EngineItem } from "@/lib/utils/discountEngine";
import { Percent } from "lucide-react";

export function QuoteModal({ quote, onClose, stages }: { quote: any, onClose: () => void, stages: any[] }) {
  const { companyId } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  
  const [products, setProducts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

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
      getDocs(collection(db, "companies", companyId, "locations")).then(snap => {
        setLocations(snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, name: data.name || data.Name || "Sucursal sin nombre" };
        }));
      });
      getDocs(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active"))).then(snap => {
        setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
      });
    }
  }, [isEditing, companyId, products.length]);

  if (!quote || !editData) return null;

  const handleSave = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Recalculate totals using calculateOrderTotals
      const engineItems: EngineItem[] = (editData.items || []).map((i: any) => ({
        id: i.variantId || i.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        manualDiscountPercentage: i.discountPercentage || 0,
        categoryIds: i.categoryIds || []
      }));
      
      const calc = calculateOrderTotals(
        engineItems,
        availableDiscounts,
        editData.promoCode || null,
        editData.globalDiscountType || "none",
        editData.globalDiscountValue || 0
      );

      // Handle AI Image Update if prompt changed via Server Action
      let imageUrl = editData.imageUrl;
      if (editData.imagePrompt !== quote.imagePrompt && editData.imagePrompt) {
        try {
          const resImg = await generateQuoteImage(editData.imagePrompt, companyId);
          if (resImg.startsWith("ERROR:")) {
            alert(resImg.replace("ERROR:", "").trim());
          } else {
            imageUrl = resImg;
          }
        } catch (err) {
          console.error("Imagen generation failed", err);
        }
      }


      let finalProjectId = editData.projectId;
      let finalProjectName = editData.projectId ? (projects.find(p => p.id === editData.projectId)?.name || null) : null;

      if (isCreatingProject) {
        if (!newProjectName) {
          alert("El nombre del proyecto es obligatorio.");
          setLoading(false);
          return;
        }
        finalProjectId = crypto.randomUUID();
        finalProjectName = newProjectName;

        const projectRef = doc(db, "companies", companyId, "projects", finalProjectId);
        await setDoc(projectRef, {
          id: finalProjectId,
          name: newProjectName,
          clientId: editData.clientId,
          createdAt: new Date().toISOString()
        });
      }

      let finalLocationName = editData.locationName || null;
      if (editData.locationId) {
        finalLocationName = locations.find(l => l.id === editData.locationId)?.name || editData.locationName || null;
      }

      const updatedQuote = {
        ...editData,
        projectId: finalProjectId || null,
        projectName: finalProjectName,
        locationName: finalLocationName,
        subtotal: calc.subtotal,
        totalDiscount: calc.totalDiscount,
        globalDiscountType: editData.globalDiscountType || "none",
        globalDiscountValue: editData.globalDiscountValue || 0,
        globalDiscountAmount: calc.globalDiscountTotal,
        tax: calc.tax,
        totalAmount: calc.total,
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

  const updateItem = (lineKeyOrVariantId: string, field: string, value: any) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any) => {
        const matchKey = item.lineKey || item.variantId;
        return matchKey === lineKeyOrVariantId ? { ...item, [field]: value } : item;
      })
    }));
  };

  const removeItem = (lineKeyOrVariantId: string) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.filter((item: any) => (item.lineKey || item.variantId) !== lineKeyOrVariantId)
    }));
  };

  const handleAddProduct = (product: any, variant: any) => {
    const isService = !!product.isService || variant.sku?.startsWith("SER-");
    
    if (isService) {
      const lineKey = crypto.randomUUID();
      setEditData((prev: any) => ({
        ...prev,
        items: [...(prev.items || []), {
          lineKey,
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          sku: variant.sku || "",
          quantity: 1,
          unitPrice: variant.price || 0,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || "",
          isService: true,
          description: product.bodyHtml || product.title || "",
          comment: "",
          showComment: false
        }]
      }));
    } else {
      const exists = editData.items?.find((i: any) => i.variantId === variant.id);
      if (!exists) {
        setEditData((prev: any) => ({
          ...prev,
          items: [...(prev.items || []), {
            productId: product.id,
            variantId: variant.id,
            productName: product.title,
            variantTitle: variant.title !== "Default Title" ? variant.title : "",
            sku: variant.sku || "",
            quantity: 1,
            unitPrice: variant.price || 0,
            discountPercentage: 0,
            imageUrl: product.images?.[0]?.src || "",
            isService: false,
            description: "",
            comment: "",
            showComment: false
          }]
        }));
      } else {
        setEditData((prev: any) => ({
          ...prev,
          items: prev.items.map((item: any) => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item)
        }));
      }
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

  // Helpers to update global discount in state
  const handleGlobalDiscountTypeChange = (val: string) => {
    setEditData((prev: any) => ({
      ...prev,
      globalDiscountType: val,
      globalDiscountValue: 0
    }));
  };

  const handleGlobalDiscountValueChange = (val: number) => {
    setEditData((prev: any) => ({
      ...prev,
      globalDiscountValue: val
    }));
  };

  // Recalc UI totals on the fly during edit using calculateOrderTotals
  const engineItems: EngineItem[] = (editData.items || []).map((i: any) => ({
    id: i.variantId || i.id,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    manualDiscountPercentage: i.discountPercentage || 0,
    categoryIds: i.categoryIds || []
  }));

  const calcTotals = calculateOrderTotals(
    engineItems,
    availableDiscounts,
    editData.promoCode || null,
    editData.globalDiscountType || "none",
    editData.globalDiscountValue || 0
  );

  const displaySubtotal = isEditing ? calcTotals.subtotal : (editData.subtotal || calcTotals.subtotal);
  const displayDiscount = isEditing ? calcTotals.totalDiscount : (editData.totalDiscount || calcTotals.totalDiscount);
  const displayTax = isEditing ? calcTotals.tax : (editData.tax !== undefined ? editData.tax : calcTotals.tax);
  const displayTotal = isEditing ? calcTotals.total : (editData.totalAmount !== undefined ? editData.totalAmount : calcTotals.total);

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
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Cliente</p>
              <p className="font-bold text-slate-900">{editData.clientName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Sucursal</p>
              <p className="font-bold text-slate-900">{editData.locationName || "N/A"}</p>
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
                <div key={item.lineKey || (item.variantId ? `${item.variantId}-${idx}` : idx)} className="flex flex-col bg-white border p-3 rounded-lg text-sm shadow-sm gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 flex items-start gap-3">
                      <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1">
                        {isEditing ? (
                          item.isService ? (
                            <div className="space-y-1 w-full">
                              {item.sku && (
                                <div>
                                  <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                    {item.sku}
                                  </span>
                                </div>
                              )}
                              <textarea
                                value={item.description || ""}
                                onChange={(e) => updateItem(item.lineKey || item.variantId, 'description', e.target.value)}
                                placeholder="Descripción del servicio..."
                                className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                                rows={2}
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold">{item.productName}</p>
                                {item.sku && (
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                    {item.sku}
                                  </span>
                                )}
                              </div>
                              {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                            </>
                          )
                        ) : (
                          item.isService ? (
                            <div className="space-y-1">
                              {item.sku && (
                                <div>
                                  <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                    {item.sku}
                                  </span>
                                </div>
                              )}
                              <p className="font-semibold text-sm leading-tight text-foreground/90 whitespace-pre-wrap">{item.description}</p>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold">{item.productName}</p>
                                {item.sku && (
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                    {item.sku}
                                  </span>
                                )}
                              </div>
                              {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                            </>
                          )
                        )}

                        {/* Comment in view mode */}
                        {!isEditing && item.comment && (
                          <p className="text-xs text-indigo-600 font-medium flex items-start gap-1 mt-1 bg-indigo-50/50 p-1.5 rounded border border-indigo-100/50 whitespace-pre-wrap">
                            <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{item.comment}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-3 justify-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 font-bold uppercase">Cant.</label>
                          <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.lineKey || item.variantId, 'quantity', parseInt(e.target.value)||1)} className="w-16 h-8 text-center" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 font-bold uppercase">Precio U.</label>
                          <Input type="number" step={0.01} value={item.unitPrice} onChange={(e) => updateItem(item.lineKey || item.variantId, 'unitPrice', parseFloat(e.target.value)||0)} className="w-24 h-8 text-right" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-emerald-600 font-bold uppercase">Desc %</label>
                          <Input type="number" min={0} max={100} value={item.discountPercentage} onChange={(e) => updateItem(item.lineKey || item.variantId, 'discountPercentage', parseFloat(e.target.value)||0)} className="w-16 h-8 text-center text-emerald-600" />
                        </div>
                        <div className="flex flex-col gap-1 text-right min-w-[90px]">
                          <label className="text-[10px] text-slate-500 font-bold uppercase">Subtotal</label>
                          <span className="h-8 flex items-center justify-end font-bold text-slate-900 pr-1">
                            ${(item.quantity * (item.unitPrice / 1.16) * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-4">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-8 w-8 ${item.comment || item.showComment ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700' : 'text-muted-foreground hover:text-indigo-600'}`}
                            onClick={() => updateItem(item.lineKey || item.variantId, 'showComment', !item.showComment)}
                            title="Agregar nota/comentario"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(item.lineKey || item.variantId)} className="h-8 w-8 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-right flex items-center gap-6">
                        <div className="text-slate-500 text-xs">
                          <span className="font-semibold text-slate-700">{item.quantity}</span> x ${(item.unitPrice / 1.16).toLocaleString('es-MX', {minimumFractionDigits:2})}
                          {item.discountPercentage > 0 && (
                            <span className="text-emerald-600 font-medium ml-1.5">(-{item.discountPercentage}%)</span>
                          )}
                        </div>
                        <div className="font-bold text-slate-950 min-w-[100px] text-base">
                          ${(item.quantity * (item.unitPrice / 1.16) * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                        </div>
                      </div>
                    )}
                  </div>
                  {isEditing && (item.showComment || item.comment) && (
                    <div className="pt-2 border-t border-slate-100">
                      <Input
                        placeholder="Escribe una nota o comentario sobre esta partida..."
                        value={item.comment || ""}
                        onChange={(e) => updateItem(item.lineKey || item.variantId, 'comment', e.target.value)}
                        className="text-xs bg-slate-50/50 border-slate-200 h-8"
                      />
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
                            const isService = !!product.isService || variant.sku?.startsWith("SER-");
                            if (isService || !editData.items?.some((i:any) => i.variantId === variant.id)) {
                              handleAddProduct(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">${variant.price}</div>
                          </div>
                          {editData.items?.some((i:any) => i.variantId === variant.id) && !variant.sku?.startsWith("SER-") && !product.isService && (
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
              {isEditing && (
                <div className="space-y-1 pb-3 border-b border-dashed mb-3">
                  <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                     <Percent className="w-3 h-3"/> Descuento Global
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="flex h-8 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={editData.globalDiscountType || "none"}
                      onChange={(e) => handleGlobalDiscountTypeChange(e.target.value)}
                    >
                      <option value="none">Ninguno</option>
                      <option value="percentage">%</option>
                      <option value="fixed_amount">$</option>
                    </select>
                    {(editData.globalDiscountType && editData.globalDiscountType !== "none") && (
                      <Input
                        type="number"
                        min={0}
                        max={editData.globalDiscountType === "percentage" ? 100 : undefined}
                        step={editData.globalDiscountType === "percentage" ? 1 : 0.01}
                        placeholder={editData.globalDiscountType === "percentage" ? "10" : "100.00"}
                        value={editData.globalDiscountValue !== undefined ? editData.globalDiscountValue : ""}
                        onChange={(e) => handleGlobalDiscountValueChange(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>${displaySubtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              {displayDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Descuento</span>
                  <span>-${displayDiscount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>IVA (16%)</span>
                <span>${displayTax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                <span>Total</span>
                <span className="text-indigo-700">${displayTotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              
              <div className="space-y-1 mt-4">
                <div className="flex justify-between items-center h-5">
                  <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3 text-indigo-500" /> Vincular a Proyecto (Opcional)
                  </label>
                  {isEditing && editData.clientId && (
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                      onClick={() => setIsCreatingProject(true)}
                    >
                      + Crear Proyecto
                    </Button>
                  )}
                </div>
                {isEditing && isCreatingProject ? (
                  <div className="space-y-2 bg-blue-50/30 p-2.5 rounded-lg border border-blue-100 mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-blue-900 uppercase">Nuevo Proyecto</label>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm" 
                        className="h-4 px-1 text-[9px] text-blue-600 font-semibold hover:bg-blue-50"
                        onClick={() => {
                          setIsCreatingProject(false);
                          setNewProjectName("");
                        }}
                      >
                        Buscar Existente
                      </Button>
                    </div>
                    <Input 
                      placeholder="Nombre del Proyecto *" 
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs font-semibold"
                    />
                  </div>
                ) : (
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={editData.projectId || ""}
                    onChange={e => setEditData({...editData, projectId: e.target.value})}
                    disabled={!isEditing}
                  >
                    <option value="">Ninguno</option>
                    {projects.filter(p => p.clientId === editData.clientId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {isEditing && (
                <div className="space-y-1 mt-2">
                  <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1">
                     Vincular a Sucursal
                  </label>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={editData.locationId || ""}
                    onChange={e => setEditData({...editData, locationId: e.target.value})}
                  >
                    <option value="">Seleccionar Sucursal</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
