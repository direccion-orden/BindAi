const fs = require('fs');

let f = 'src/app/(dashboard)/clientes/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// 1. imports
if (!c.includes('writeBatch')) {
  c = c.replace('orderBy } from "firebase/firestore";', 'orderBy, writeBatch } from "firebase/firestore";');
}
if (!c.includes('Upload')) {
  c = c.replace('Eye } from "lucide-react";', 'Eye, Upload } from "lucide-react";');
}

// 2. state
if (!c.includes('setImporting')) {
  c = c.replace('const [isViewing, setIsViewing] = useState(false);', 'const [isViewing, setIsViewing] = useState(false);\n  const [importing, setImporting] = useState(false);');
}

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
        encoding: "ISO-8859-1",
        complete: async (results: any) => {
          try {
            const records = results.data;
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            
            for (const record of records) {
              const ref = doc(collection(db, "companies", companyId, "clients"));
              currentBatch.set(ref, {
                name: record["Razón Social"] || record["Nombre Comercial"] || record["Razn Social"] || "",
                rfc: record.RFC || "",
                email: record.Email || "",
                phone: record["Teléfonos"] || record["Telfonos"] || "",
                address: record.Calle ? \`\${record.Calle} \${record["No Ext"] || ''} \${record["No Interior"] || ''}\`.trim() : "",
                zipCode: record.CP || "",
                city: record.Municipio || record.Ciudad || "",
                state: record.Estado || "",
                neighborhood: record.Colonia || "",
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
            
            alert(\`¡Importación exitosa! Se importaron \${records.length} clientes con sus direcciones completas.\`);
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

if (!c.includes('handleImportCSV')) {
  c = c.replace('const handleOpenForm = (client?: Client, viewMode = false) => {', importFunc + '\n  const handleOpenForm = (client?: Client, viewMode = false) => {');
}

// 4. UI
const newBtn = `
          {!isEditing && (
            <div className="flex gap-2">
              <input type="file" id="csv-upload" className="hidden" accept=".csv" onChange={handleImportCSV} />
              <Button variant="outline" className="gap-2" onClick={() => document.getElementById('csv-upload')?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Importando..." : "Importar CSV"}
              </Button>
              <Button onClick={() => handleOpenForm()} className="gap-2">
                <Plus className="w-4 h-4" /> Nuevo Cliente
              </Button>
            </div>
          )}
`;
// Replace the old block exactly
const oldBtn = `          {!isEditing && (
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="w-4 h-4" /> Nuevo Cliente
            </Button>
          )}`;
          
if (c.includes(oldBtn)) {
  c = c.replace(oldBtn, newBtn.trim());
} else {
  // Try regex if spacing is different
  c = c.replace(/\{!isEditing && \(\s*<Button onClick=\{\(\) => handleOpenForm\(\)\} className="gap-2">\s*<Plus className="w-4 h-4" \/> Nuevo Cliente\s*<\/Button>\s*\)\}/g, newBtn.trim());
}

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed clientes UI completely');
