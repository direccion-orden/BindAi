"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Edit2, ArrowLeft, Image as ImageIcon, Save } from "lucide-react";
import Link from "next/link";
import Barcode from "react-barcode";
import Image from "next/image";
import { Rnd } from "react-rnd";

export interface ElementConfig {
  visible: boolean;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface LabelFormat {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  logoUrl?: string;
  elements: {
    title: ElementConfig;
    price: ElementConfig;
    sku: ElementConfig;
    barcode: ElementConfig;
    logo: ElementConfig;
  };
  // Legacy fields (for backwards compatibility during this transition)
  showTitle?: boolean;
  showPrice?: boolean;
  showSku?: boolean;
  showBarcode?: boolean;
}

const SCALE = 6; // 1mm = 6px in the editor for better visibility

const defaultElements = {
  title: { visible: true, xPct: 5, yPct: 5, wPct: 90, hPct: 20 },
  price: { visible: true, xPct: 5, yPct: 75, wPct: 90, hPct: 20 },
  sku: { visible: false, xPct: 5, yPct: 25, wPct: 90, hPct: 15 },
  barcode: { visible: true, xPct: 5, yPct: 40, wPct: 90, hPct: 35 },
  logo: { visible: true, xPct: 5, yPct: 5, wPct: 30, hPct: 20 },
};

export default function LabelFormatsDesigner() {
  const { companyId } = useAuth();
  const [formats, setFormats] = useState<LabelFormat[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [widthMm, setWidthMm] = useState(50);
  const [heightMm, setHeightMm] = useState(25);
  
  const [elements, setElements] = useState(defaultElements);
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "label_formats"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LabelFormat));
      setFormats(data);
      setLoading(false);
    });
    return () => unsub();
  }, [companyId]);

  const handleOpenForm = (format?: LabelFormat) => {
    if (format) {
      setCurrentId(format.id);
      setName(format.name);
      setWidthMm(format.widthMm);
      setHeightMm(format.heightMm);
      setLogoUrl(format.logoUrl || "");
      setLogoFile(null);
      
      // Handle legacy formats
      if (format.elements) {
        setElements(format.elements);
      } else {
        setElements({
          title: { ...defaultElements.title, visible: format.showTitle ?? true },
          price: { ...defaultElements.price, visible: format.showPrice ?? true },
          sku: { ...defaultElements.sku, visible: format.showSku ?? false },
          barcode: { ...defaultElements.barcode, visible: format.showBarcode ?? true },
          logo: { ...defaultElements.logo, visible: !!format.logoUrl }
        });
      }
    } else {
      setCurrentId("");
      setName("Nuevo Formato");
      setWidthMm(50);
      setHeightMm(25);
      setElements(defaultElements);
      setLogoUrl("");
      setLogoFile(null);
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoUrl(URL.createObjectURL(file));
      setElements(prev => ({ ...prev, logo: { ...prev.logo, visible: true } }));
    }
  };

  const handleSave = async () => {
    if (!companyId || !name.trim() || widthMm <= 0 || heightMm <= 0) return;
    setSaving(true);
    
    try {
      const docId = currentId || crypto.randomUUID();
      let finalLogoUrl = logoUrl;

      if (logoFile) {
        setUploadingLogo(true);
        const storageRef = ref(storage, `companies/${companyId}/label_formats/${docId}/logo`);
        await uploadBytes(storageRef, logoFile);
        finalLogoUrl = await getDownloadURL(storageRef);
        setUploadingLogo(false);
      }

      const formatData: LabelFormat = {
        id: docId,
        name: name.trim(),
        widthMm,
        heightMm,
        logoUrl: finalLogoUrl,
        elements
      };

      await setDoc(doc(db, "companies", companyId, "label_formats", docId), formatData);
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar el formato");
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Eliminar este formato de etiqueta?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "label_formats", id));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleVisibility = (key: keyof typeof elements) => {
    setElements(prev => ({
      ...prev,
      [key]: { ...prev[key], visible: !prev[key].visible }
    }));
  };

  const updateElementPosition = (key: keyof typeof elements, xPx: number, yPx: number, wPx: number, hPx: number) => {
    const editorW = widthMm * SCALE;
    const editorH = heightMm * SCALE;
    setElements(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        xPct: (xPx / editorW) * 100,
        yPct: (yPx / editorH) * 100,
        wPct: (wPx / editorW) * 100,
        hPct: (hPx / editorH) * 100,
      }
    }));
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const editorWidth = widthMm * SCALE;
  const editorHeight = heightMm * SCALE;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventarios/etiquetas">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Diseñador de Etiquetas</h1>
            <p className="text-muted-foreground">Configura los tamaños y arrastra los elementos a tu gusto.</p>
          </div>
          {!isEditing && (
            <Button onClick={() => handleOpenForm()}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Formato
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Controls Panel */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="text-xl font-bold">Ajustes del Formato</h2>
              <Button onClick={handleSave} disabled={saving || uploadingLogo} className="gap-2">
                {(saving || uploadingLogo) && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" /> Guardar
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nombre del formato</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Etiqueta Estándar" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Ancho (mm)</label>
                  <Input type="number" min={10} max={200} value={widthMm} onChange={e => setWidthMm(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Alto (mm)</label>
                  <Input type="number" min={10} max={200} value={heightMm} onChange={e => setHeightMm(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-sm text-muted-foreground">Elementos Visibles</h3>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Nombre del Producto</label>
                  <Switch checked={elements.title.visible} onCheckedChange={() => toggleVisibility('title')} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Precio</label>
                  <Switch checked={elements.price.visible} onCheckedChange={() => toggleVisibility('price')} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">SKU (Clave)</label>
                  <Switch checked={elements.sku.visible} onCheckedChange={() => toggleVisibility('sku')} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Código de Barras</label>
                  <Switch checked={elements.barcode.visible} onCheckedChange={() => toggleVisibility('barcode')} />
                </div>
              </div>

              <div className="pt-4 border-t space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground">Logotipo (Opcional)</h3>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative w-16 h-16 border rounded-md overflow-hidden bg-white">
                      <Image src={logoUrl} alt="Logo" fill className="object-contain p-1" />
                      <button onClick={() => {setLogoUrl(""); setLogoFile(null); toggleVisibility('logo');}} className="absolute top-0 right-0 bg-destructive text-destructive-foreground p-0.5 rounded-bl-md z-10">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-16 h-16 border-2 border-dashed rounded-md flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </label>
                  )}
                  <div className="text-xs text-muted-foreground flex-1">
                    Sube una imagen. Luego ajusta su posición y tamaño en el lienzo de la derecha.
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Drag & Drop Editor Panel */}
          <div className="bg-muted/30 border rounded-xl p-6 shadow-inner flex flex-col items-center justify-center relative min-h-[400px] overflow-hidden">
            <div className="absolute top-4 left-4 text-sm font-medium text-muted-foreground flex items-center gap-2">
               Lienzo de Edición
               <span className="text-xs font-normal bg-background px-2 py-0.5 rounded border shadow-sm">
                 {widthMm} x {heightMm} mm
               </span>
            </div>
            
            <div className="text-xs text-muted-foreground absolute top-4 right-4">
              Arrastra y redimensiona
            </div>

            <div 
              className="bg-white border-2 border-dashed shadow-md relative mt-8"
              style={{
                width: `${editorWidth}px`,
                height: `${editorHeight}px`,
              }}
            >
              {(Object.keys(elements) as Array<keyof typeof elements>).map(key => {
                const conf = elements[key];
                if (!conf.visible || (key === 'logo' && !logoUrl)) return null;

                const x = (conf.xPct / 100) * editorWidth;
                const y = (conf.yPct / 100) * editorHeight;
                const w = (conf.wPct / 100) * editorWidth;
                const h = (conf.hPct / 100) * editorHeight;

                return (
                  <Rnd
                    key={key}
                    bounds="parent"
                    position={{ x, y }}
                    size={{ width: w, height: h }}
                    onDragStop={(e, d) => {
                      updateElementPosition(key, d.x, d.y, w, h);
                    }}
                    onResizeStop={(e, dir, ref, delta, position) => {
                      updateElementPosition(key, position.x, position.y, parseInt(ref.style.width), parseInt(ref.style.height));
                    }}
                    className="group border border-transparent hover:border-primary/50 hover:bg-primary/5 absolute"
                  >
                    <div className="w-full h-full flex items-center justify-center relative overflow-hidden pointer-events-none">
                      {key === 'title' && <span className="font-bold text-center leading-tight line-clamp-2 w-full" style={{ fontSize: h * 0.6 }}>Producto Demo</span>}
                      {key === 'price' && <span className="font-bold w-full text-center" style={{ fontSize: h * 0.8 }}>$99.00</span>}
                      {key === 'sku' && <span className="text-gray-500 w-full text-center" style={{ fontSize: h * 0.8 }}>SKU: ABC-123</span>}
                      {key === 'barcode' && (
                        <div className="w-full h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:h-full flex justify-center items-center">
                          <Barcode value="12345678" width={2} height={40} fontSize={12} margin={0} displayValue={true} />
                        </div>
                      )}
                      {key === 'logo' && logoUrl && (
                        <img src={logoUrl} alt="Logo" className="object-contain max-w-full max-h-full" />
                      )}
                    </div>
                  </Rnd>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {formats.map(format => (
            <div key={format.id} className="bg-card border rounded-xl p-5 shadow-sm space-y-4 hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{format.name}</h3>
                  <p className="text-sm text-muted-foreground">{format.widthMm}mm x {format.heightMm}mm</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenForm(format)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(format.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {formats.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              No tienes formatos guardados. Crea uno nuevo para empezar a imprimir.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
