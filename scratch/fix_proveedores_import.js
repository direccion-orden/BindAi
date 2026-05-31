const fs = require('fs');

let f = 'src/app/(dashboard)/proveedores/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// 1. imports
c = c.replace('orderBy } from "firebase/firestore";', 'orderBy, writeBatch } from "firebase/firestore";');
c = c.replace('MapPin } from "lucide-react";', 'MapPin, Upload } from "lucide-react";');

// 2. state
c = c.replace('const [saving, setSaving] = useState(false);', 'const [saving, setSaving] = useState(false);\n  const [importing, setImporting] = useState(false);');

// 3. handleImportCSV
const importFunc = `
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setImporting(true);
    
    import("papaparse").then((Papa) => {
      Papa.default.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results: any) => {
          try {
            const records = results.data;
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            
            for (const record of records) {
              const ref = doc(collection(db, "companies", companyId, "vendors"));
              currentBatch.set(ref, {
                name: record.RazonSocial || record.NombreComercial || "",
                rfc: record.RFC || "",
                email: record.Email || "",
                phone: record.Telefonos || "",
                address: record.Calle ? \`\${record.Calle} \${record.NoExt || ''} \${record.IntExt || ''}\`.trim() : "",
                zipCode: record.CP || "",
                city: record.Ciudad || "",
                state: record.Estado || "",
                neighborhood: record.Colonia || "",
                creditDays: parseInt(record.DiasDeCredito) || 0,
                creditLimit: parseFloat(record.MontoCredito) || 0,
                comments: record.Comentarios || "",
              });
              
              count++;
              if (count === 450) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                count = 0;
              }
            }
            if (count > 0) batches.push(currentBatch);
            
            for (const b of batches) {
              await b.commit();
            }
            
            alert(\`¡Importación exitosa! Se importaron \${records.length} proveedores con sus direcciones completas.\`);
          } catch (error) {
            console.error(error);
            alert("Error importando CSV");
          } finally {
            setImporting(false);
            if (e.target) e.target.value = '';
          }
        }
      });
    });
  };
`;
c = c.replace('const handleOpenForm = (vendor?: Vendor) => {', importFunc + '\n  const handleOpenForm = (vendor?: Vendor) => {');

// 4. UI
const newBtn = `
            <div className="flex gap-2">
              <input type="file" id="csv-upload" className="hidden" accept=".csv" onChange={handleImportCSV} />
              <Button variant="outline" className="gap-2" onClick={() => document.getElementById('csv-upload')?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Importando..." : "Importar CSV"}
              </Button>
              <Button onClick={() => handleOpenForm()} className="gap-2">
                <Plus className="w-4 h-4" /> Nuevo Proveedor
              </Button>
            </div>
`;
c = c.replace(/<Button onClick=\{\(\) => handleOpenForm\(\)\} className="gap-2">\s*<Plus className="w-4 h-4" \/> Nuevo Proveedor\s*<\/Button>/g, newBtn);

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed proveedores UI completely');
