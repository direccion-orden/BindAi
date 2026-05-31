const fs = require('fs');
let file = 'src/app/(dashboard)/productos/[id]/page.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Remove the old image states
const oldImageStates = `const [newImages, setNewImages] = useState<{id: string, file: File, preview: string}[]>([]);
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
  };`;

const newImageStates = `const [allImages, setAllImages] = useState<{id: string, file?: File, preview: string, isOriginal?: boolean, src?: string}[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added = Array.from(e.target.files).map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        isOriginal: false
      }));
      setAllImages((prev) => [...prev, ...added]);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const newImages = [...allImages];
    const draggedIndex = newImages.findIndex((img) => img.id === draggedId);
    const targetIndex = newImages.findIndex((img) => img.id === targetId);

    const [draggedItem] = newImages.splice(draggedIndex, 1);
    newImages.splice(targetIndex, 0, draggedItem);
    setAllImages(newImages);
    setDraggedId(null);
  };
`;

c = c.replace(oldImageStates, newImageStates);

// 2. Add hydration inside fetchProduct
const fetchProductEnd = `setOriginalProduct(data);`;
c = c.replace(fetchProductEnd, fetchProductEnd + '\n      if (data.images) setAllImages(data.images.map((img:any) => ({ id: img.id || crypto.randomUUID(), preview: img.src, isOriginal: true, src: img.src })));');

// 3. Update handleSave logic
const oldHandleSaveImages = `let finalImages = originalProduct?.images ? [...originalProduct.images] : [];
      if (newImages.length > 0) {
        for (const img of newImages) {
          const imageRef = ref(storage, \`companies/\${companyId}/products/\${productId}/\${img.id}\`);
          await uploadBytes(imageRef, img.file);
          const url = await getDownloadURL(imageRef);
          finalImages.push({ id: img.id, src: url, altText: title });
        }
      }`;

const newHandleSaveImages = `let finalImages = [];
      for (const img of allImages) {
        if (img.isOriginal) {
          finalImages.push({ id: img.id, src: img.src, altText: title });
        } else if (img.file) {
          const imageRef = ref(storage, \`companies/\${companyId}/products/\${productId}/\${img.id}\`);
          await uploadBytes(imageRef, img.file);
          const url = await getDownloadURL(imageRef);
          finalImages.push({ id: img.id, src: url, altText: title });
        }
      }`;

c = c.replace(oldHandleSaveImages, newHandleSaveImages);

// 4. Update UI
const oldUI = `{(originalProduct?.images && originalProduct.images.length > 0) || newImages.length > 0 ? (
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
            ) : null}`;

const newUI = `{allImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {allImages.map((img, idx) => (
                  <div 
                    key={img.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, img.id)}
                    className={\`relative aspect-square border rounded-lg overflow-hidden cursor-move group \${draggedId === img.id ? "opacity-50" : "opacity-100 hover:border-primary/50"}\`}
                  >
                    <img src={img.preview} alt="Producto" className="w-full h-full object-cover" />
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); setAllImages(prev => prev.filter(i => i.id !== img.id)); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {idx === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[10px] text-center py-1">
                        Principal
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}`;

c = c.replace(oldUI, newUI);

fs.writeFileSync(file, c, 'utf8');
console.log('Fixed drag and drop images logic in edit page');
