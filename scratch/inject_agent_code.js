const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const agentDir = path.join(projectRoot, 'hardware-agent');
const routePath = path.join(projectRoot, 'src', 'app', 'api', 'hardware-agent', 'download', 'route.ts');

const indexJs = fs.readFileSync(path.join(agentDir, 'index.js'), 'utf8');
const packageJson = fs.readFileSync(path.join(agentDir, 'package.json'), 'utf8');
const envTemplate = fs.readFileSync(path.join(agentDir, '.env'), 'utf8');

const readme = `# Agente de Hardware Local (Cash Recycler)

Este agente sirve de puente entre el Punto de Venta web y el reciclador de billetes físico (CashGenic).

## Requisitos de la Computadora Local
- Tener instalado **Node.js** (versión 18 o superior). Puedes descargarlo desde: https://nodejs.org/

## Instrucciones de Instalación
1. Extrae el contenido de este archivo ZIP en una carpeta local de tu computadora (por ejemplo, en \`C:\\hardware-agent\` o en el Escritorio).
2. Abre la terminal o consola de comandos (cmd o PowerShell) en esa carpeta.
3. Ejecuta el siguiente comando para descargar los componentes necesarios:
   \`\`\`bash
   npm install
   \`\`\`
4. Una vez completado, inicia el puente de comunicación ejecutando:
   \`\`\`bash
   npm start
   \`\`\`

El agente comenzará a ejecutarse y escuchará en http://localhost:3001 para conectar de forma automática el Punto de Venta con el Reciclador de Billetes.

## Configuración (.env)
Si la IP del reciclador cambia en la red, puedes abrir el archivo \`.env\` con cualquier editor de texto y actualizar la IP asignada:
\`\`\`env
RECYCLER_IP=192.168.1.180
\`\`\`
`;

// We will construct a fully self-contained route.ts file
const selfContainedCode = `import { NextResponse } from "next/server";
import JSZip from "jszip";

// Embedded hardware agent files
const indexJsContent = ${JSON.stringify(indexJs)};
const packageJsonContent = ${JSON.stringify(packageJson)};
const envContent = ${JSON.stringify(envTemplate)};
const readmeContent = ${JSON.stringify(readme)};

export async function GET() {
  try {
    const zip = new JSZip();
    
    zip.file("index.js", indexJsContent);
    zip.file("package.json", packageJsonContent);
    zip.file(".env", envContent);
    zip.file("README.md", readmeContent);

    // Generar el archivo ZIP
    const buffer = await zip.generateAsync({ type: "uint8array" });

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="hardware-agent.zip"',
      },
    });
  } catch (error: any) {
    console.error("Error generating agent ZIP:", error);
    return NextResponse.json(
      { error: "No se pudo generar el instalador del agente. Detalle: " + error.message },
      { status: 500 }
    );
  }
}
`;

fs.writeFileSync(routePath, selfContainedCode, 'utf8');
console.log("Successfully generated self-contained route.ts with embedded agent files!");
