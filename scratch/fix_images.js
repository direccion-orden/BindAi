const fs = require('fs');
let file = 'src/app/(dashboard)/productos/[id]/page.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Add storage imports
c = c.replace(
  'import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";',
  'import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";\nimport { ref, uploadBytes, getDownloadURL } from "firebase/storage";'
);
c = c.replace(
  'import { db } from "@/lib/firebase/client";',
  'import { db, storage } from "@/lib/firebase/client";'
);

// 2. Add state and handlers
const stateIndex = c.indexOf('const [generatingAi, setGeneratingAi] = useState(false);');
const injection = `const [newImages, setNewImages] = useState<{id: string, file: File, preview: string}[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added = Array.from(e.target.files).map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      }));
      setNewImages((prev) => [...prev, ...added]);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, targetId: string) => { e.preventDefault(); }; // simplified for edit

  const removeOriginalImage = (imgSrc: string) => {
    if(originalProduct && originalProduct.images) {
      setOriginalProduct({...originalProduct, images: originalProduct.images.filter((i:any) => i.src !== imgSrc)});
    }
  };
`;
c = c.slice(0, stateIndex) + injection + '\n  ' + c.slice(stateIndex);

// 3. Update handleSave
const saveIndex = c.indexOf('const updatedProduct: Partial<ShopifyProduct> = {');
const saveInjection = `
      let finalImages = originalProduct?.images ? [...originalProduct.images] : [];
      if (newImages.length > 0) {
        for (const img of newImages) {
          const imageRef = ref(storage, \`companies/\${companyId}/products/\${productId}/\${img.id}\`);
          await uploadBytes(imageRef, img.file);
          const url = await getDownloadURL(imageRef);
          finalImages.push({ id: img.id, src: url, altText: title });
        }
      }
`;
c = c.slice(0, saveIndex) + saveInjection + '\n      ' + c.slice(saveIndex).replace(
  'variants: updatedVariants,',
  'variants: updatedVariants,\n        images: finalImages,'
);

// 4. Update UI
const uiStart = c.indexOf('{/* Media (Placeholder) */}');
const uiEnd = c.indexOf('{/* Pricing */}');
const newUI = `{/* Media */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Elementos multimedia</h3>
            
            {(originalProduct?.images && originalProduct.images.length > 0) || newImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {originalProduct?.images?.map((img: any, idx: number) => (
                  <div key={idx} className="relative aspect-square border rounded-lg overflow-hidden shrink-0 group">
                    <img src={img.src} alt="Producto" className="w-full h-full object-cover" />
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); removeOriginalImage(img.src); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {newImages.map((img) => (
                  <div key={img.id} className="relative aspect-square border rounded-lg overflow-hidden shrink-0 group">
                    <img src={img.preview} alt="New" className="w-full h-full object-cover" />
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); setNewImages(prev => prev.filter(i => i.id !== img.id)); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            
            <label className="block border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center text-muted-foreground bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} />
              <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Agrega archivos o arrastra y suelta</p>
              <p className="text-xs mt-1">Imágenes de alta resolución recomendadas</p>
            </label>
          </div>

          `;
c = c.slice(0, uiStart) + newUI + c.slice(uiEnd);

fs.writeFileSync(file, c, 'utf8');
console.log('Fixed edit product images');
