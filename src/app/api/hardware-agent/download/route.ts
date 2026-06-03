import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

export async function GET() {
  try {
    const zip = new JSZip();
    
    // Ruta del directorio del agente en el proyecto
    const agentDir = path.join(process.cwd(), "hardware-agent");
    
    // Archivos requeridos para distribuir el agente (sin incluir node_modules)
    const filesToInclude = ["index.js", "package.json", "package-lock.json", ".env"];
    
    for (const fileName of filesToInclude) {
      const filePath = path.join(agentDir, fileName);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        zip.file(fileName, fileContent);
      }
    }
    
    // Crear un archivo README.md con instrucciones claras de arranque
    const readmeContent = `# Agente de Hardware Local (Cash Recycler)

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
