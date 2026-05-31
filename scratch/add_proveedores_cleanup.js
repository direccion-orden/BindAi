const fs = require('fs');

let f = 'src/app/(dashboard)/proveedores/page.tsx';
let c = fs.readFileSync(f, 'utf8');

if (!c.includes('handleCleanup')) {
  const cleanupFunc = `
  const handleCleanup = async () => {
    if (!companyId || !window.confirm("¿Seguro que deseas limpiar duplicados? Esto fusionará las direcciones importadas del CSV a los registros originales.")) return;
    setImporting(true);
    try {
      const snap = await getDocs(query(collection(db, "companies", companyId, "vendors")));
      const clients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
      
      const grouped: Record<string, Vendor[]> = {};
      clients.forEach(c => {
        const key = (c.name || "UNKNOWN").trim().toUpperCase();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(c);
      });

      let updated = 0;
      let deleted = 0;
      const batches = [];
      let currentBatch = writeBatch(db);
      let operations = 0;

      for (const key of Object.keys(grouped)) {
        const group = grouped[key];
        if (group.length > 1) {
          const bindClient = group.find(c => c.id.length > 30);
          const csvClient = group.find(c => c.id.length === 20 && c.address);

          if (bindClient && csvClient) {
            const ref = doc(db, "companies", companyId, "vendors", bindClient.id);
            currentBatch.update(ref, {
              address: csvClient.address || "",
              zipCode: csvClient.zipCode || "",
              city: csvClient.city || "",
              state: csvClient.state || "",
              neighborhood: csvClient.neighborhood || ""
            });
            operations++;
            
            for (const dup of group) {
              if (dup.id !== bindClient.id) {
                 const delRef = doc(db, "companies", companyId, "vendors", dup.id);
                 currentBatch.delete(delRef);
                 operations++;
                 deleted++;
              }
            }
            updated++;
          }
        }
        
        if (operations >= 450) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          operations = 0;
        }
      }
      
      if (operations > 0) batches.push(currentBatch);
      for (const b of batches) {
        await b.commit();
      }
      
      alert(\`¡Limpieza exitosa! Se actualizaron \${updated} proveedores con direcciones y se eliminaron \${deleted} duplicados.\`);
    } catch(e) {
      console.error(e);
      alert("Error limpiando duplicados");
    } finally {
      setImporting(false);
    }
  };
  `;

  if (!c.includes('getDocs } from "firebase/firestore"')) {
    c = c.replace('writeBatch } from "firebase/firestore";', 'writeBatch, getDocs } from "firebase/firestore";');
  }

  c = c.replace('const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {', cleanupFunc + '\n  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {');
  
  const newBtn = `
              <Button variant="outline" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={handleCleanup} disabled={importing}>
                Limpiar Duplicados
              </Button>
              <Button onClick={() => handleOpenForm()} className="gap-2">
`;
  c = c.replace('<Button onClick={() => handleOpenForm()} className="gap-2">', newBtn);

  fs.writeFileSync(f, c, 'utf8');
  console.log('Added cleanup button to proveedores UI');
}
