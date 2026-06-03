import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export async function POST() {
  try {
    // 1. Check if the hardware agent is already running at port 3001
    try {
      const ping = await fetch("http://localhost:3001/api/status", { 
        method: "GET",
        signal: AbortSignal.timeout(1000) 
      });
      if (ping.ok) {
        return NextResponse.json({ 
          success: true, 
          message: "El agente ya está ejecutándose." 
        });
      }
    } catch (e) {
      // The port is free or agent is not running, proceed to spawn it.
    }

    // 2. Identify the hardware-agent path in the workspace
    const agentDir = path.join(process.cwd(), "hardware-agent");
    
    if (!fs.existsSync(agentDir)) {
      return NextResponse.json(
        { error: "No se encontró el directorio del agente de hardware en 'hardware-agent'." },
        { status: 404 }
      );
    }

    console.log(`[Hardware Agent Auto-Start] Launching agent from: ${agentDir}`);

    // 3. Spawn the Node.js agent directly in a separate, detached process
    const child = spawn("node", ["index.js"], {
      cwd: agentDir,
      detached: true, // runs independently of the Next.js server lifecycle
      stdio: "ignore", // don't pipe stdout/stderr to avoid holding Next.js open
      env: { ...process.env, PORT: "3001" }
    });

    // Unreference the child process so Next.js can finish handling the API request without waiting for the child
    child.unref();

    // 4. Wait 1.5 seconds to let the agent start up and bind the port
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return NextResponse.json({ 
      success: true, 
      message: "Agente de hardware iniciado en segundo plano." 
    });
  } catch (error: any) {
    console.error("Error launching hardware agent:", error);
    return NextResponse.json(
      { error: "Error al iniciar el agente: " + error.message },
      { status: 500 }
    );
  }
}
