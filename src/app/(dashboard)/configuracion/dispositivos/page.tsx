"use client";

import React from "react";
import { Download, Cpu, Terminal, ShieldAlert, CheckCircle, ExternalLink, HelpCircle, Save, RefreshCw, Sliders, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DispositivosPage() {
  const [status, setStatus] = React.useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [limitInput, setLimitInput] = React.useState("250");
  const [warnPercentInput, setWarnPercentInput] = React.useState("-10");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchOptions = async () => {
    setStatus('checking');
    try {
      const res = await fetch("http://localhost:3001/api/systemoptions", { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.maxPayoutlevel === 'number') {
          setLimitInput((data.maxPayoutlevel / 100).toString());
        }
        if (typeof data.lowFloatWarnPercent === 'number') {
          setWarnPercentInput(data.lowFloatWarnPercent.toString());
        }
        setStatus('connected');
      } else {
        setStatus('disconnected');
      }
    } catch (err) {
      setStatus('disconnected');
    }
  };

  React.useEffect(() => {
    fetchOptions();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitPesos = parseFloat(limitInput);
    const warnPercent = parseInt(warnPercentInput);

    if (isNaN(limitPesos) || limitPesos <= 0) {
      setMessage({ type: 'error', text: 'Por favor, ingrese un límite de retiro válido mayor a 0.' });
      return;
    }
    if (limitPesos > 1000) {
      setMessage({ type: 'error', text: 'El límite máximo permitido por el reciclador es de $1,000.00 MXN.' });
      return;
    }
    if (isNaN(warnPercent)) {
      setMessage({ type: 'error', text: 'Por favor, ingrese un porcentaje de advertencia válido.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("http://localhost:3001/api/systemoptions", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPayoutlevel: Math.round(limitPesos * 100),
          lowFloatWarnPercent: warnPercent
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.responseCode === 0) {
          setMessage({ type: 'success', text: 'Configuración guardada correctamente en el reciclador.' });
          fetchOptions();
        } else {
          setMessage({ type: 'error', text: `Error del reciclador: ${data.responseData || 'código ' + data.responseCode}` });
        }
      } else {
        setMessage({ type: 'error', text: 'No se pudo comunicar con el agente local para guardar.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error de conexión: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    // Trigger download of the ZIP file from the API route
    window.location.href = "/api/hardware-agent/download";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dispositivos y Hardware</h1>
        <p className="text-muted-foreground">
          Descarga y configura los agentes locales necesarios para conectar periféricos de hardware al Punto de Venta.
        </p>
      </div>

      {/* Tarjeta de descarga de Agente Local */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-muted/15 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              Agente Local de Periféricos (Next-Bridge)
            </h3>
            <p className="text-sm text-muted-foreground">
              Requerido para conectar la interfaz web con el Reciclador de Billetes CashGenic en la red local.
            </p>
          </div>
          
          <Button 
            onClick={handleDownload}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white min-w-[220px] shadow"
            size="lg"
          >
            <Download className="w-5 h-5" />
            Descargar Agente (.zip)
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Información del Estado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/5 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                IP Configurada en el Agente
              </h4>
              <p className="text-sm leading-relaxed">
                El agente descargado viene preconfigurado para conectarse al reciclador en la IP estática reservada:
              </p>
              <div className="bg-background border rounded px-3 py-1.5 font-mono text-sm inline-block font-bold text-indigo-600">
                RECYCLER_IP=192.168.1.180
              </div>
              <p className="text-xs text-muted-foreground">
                (Si la IP física del módem cambia, puedes editarla directamente en el archivo <code className="bg-muted px-1 py-0.5 rounded font-mono">.env</code> del agente).
              </p>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2 text-amber-800 dark:text-amber-500">
                <ShieldAlert className="w-4 h-4" />
                Nota de Seguridad
              </h4>
              <p className="text-xs leading-relaxed text-amber-900/80 dark:text-amber-400/80">
                Este agente se ejecuta localmente en la computadora física a la que está conectado el reciclador por USB/Ethernet y abre una conexión WebSocket en el puerto <code className="font-mono">3001</code>.
                No expone datos al exterior y solo acepta peticiones desde <code className="font-mono">localhost</code>.
              </p>
            </div>
          </div>

          {/* Guía de Instalación Paso a Paso */}
          <div className="space-y-4 pt-2">
            <h4 className="font-bold text-base flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              Guía de Instalación y Arranque Rápido
            </h4>

            <div className="relative border-l-2 border-indigo-200 ml-3 pl-6 space-y-6">
              {/* Paso 1 */}
              <div className="relative">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-4 ring-background">
                  1
                </span>
                <h5 className="font-semibold text-sm">Instalar Node.js</h5>
                <p className="text-xs text-muted-foreground mt-1">
                  El agente requiere Node.js instalado en la computadora local. Descarga e instala la versión recomendada (LTS) desde su portal oficial.
                </p>
                <a 
                  href="https://nodejs.org/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-2 font-semibold"
                >
                  Ir a nodejs.org <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Paso 2 */}
              <div className="relative">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-4 ring-background">
                  2
                </span>
                <h5 className="font-semibold text-sm">Descomprimir el Instalador</h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Haz clic en el botón de arriba para descargar <code className="bg-muted px-1 py-0.5 rounded font-mono">hardware-agent.zip</code> y extrae los archivos en una carpeta de tu preferencia (ej. <code className="bg-muted px-1 py-0.5 rounded font-mono">C:\hardware-agent</code> o en tu Escritorio).
                </p>
              </div>

              {/* Paso 3 */}
              <div className="relative">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-4 ring-background">
                  3
                </span>
                <h5 className="font-semibold text-sm">Instalar Dependencias de Red</h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Abre la consola de comandos (cmd o PowerShell) en la carpeta donde extrajiste el agente y ejecuta:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-lg mt-2 select-all max-w-md shadow-sm">
                  npm install
                </div>
              </div>

              {/* Paso 4 */}
              <div className="relative">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 ring-4 ring-background">
                  4
                </span>
                <h5 className="font-semibold text-sm">Arrancar el Servicio</h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Finalmente, arranca la comunicación local con el siguiente comando:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-lg mt-2 select-all max-w-md shadow-sm">
                  npm start
                </div>
                <p className="text-[11px] text-emerald-600 mt-2 font-medium">
                  ✓ El agente mostrará un mensaje confirmando la conexión con el reciclador en la IP 192.168.1.180.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta de configuración en tiempo real del Reciclador */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-muted/15 flex justify-between items-center">
          <div className="space-y-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" />
              Configuración de Límites del Reciclador
            </h3>
            <p className="text-sm text-muted-foreground">
              Ajusta el límite de retiros y parámetros operativos directamente en la máquina local.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchOptions} 
            disabled={status === 'checking'}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {status === 'connected' ? (
            <form onSubmit={handleSave} className="space-y-4 max-w-md">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg p-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Conectado con el Reciclador</p>
                  <p className="mt-0.5 opacity-90">Los valores a continuación están cargados directamente del dispositivo físico en la red local.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Monto Máximo Permitido por Retiro (MXN)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="1000"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-7 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="0.00"
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value)}
                      disabled={saving}
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Define la cantidad máxima que se puede retirar en un solo retiro con código. El límite físico máximo de la máquina es **$1,000.00 MXN**.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Advertencia de Nivel Mínimo (Float Warn %)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="-10"
                      value={warnPercentInput}
                      onChange={(e) => setWarnPercentInput(e.target.value)}
                      disabled={saving}
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Porcentaje por debajo del nivel óptimo para disparar una alerta visual de "efectivo bajo" (ej: -15).
                  </p>
                </div>
              </div>

              {message && (
                <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                  message.type === 'success' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                    : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                }`}>
                  {message.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{message.text}</span>
                </div>
              )}

              <Button 
                type="submit" 
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Configuración
                  </>
                )}
              </Button>
            </form>
          ) : status === 'checking' ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium">Buscando conexión con el agente local...</p>
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2 text-amber-800 dark:text-amber-500">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Agente Local No Detectado
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                No se pudo establecer conexión con el Agente Local en <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">http://localhost:3001</code>.
              </p>
              <ul className="text-xs list-disc list-inside text-muted-foreground space-y-1 pl-1">
                <li>Asegúrese de que el software del Agente esté descargado y corriendo en esta computadora.</li>
                <li>Verifique que haya corrido <code className="font-mono bg-muted px-1 rounded text-[10px]">npm start</code> y el puerto 3001 esté abierto.</li>
                <li>Confirme que está físicamente en la misma red que la computadora de la caja.</li>
              </ul>
              <Button 
                variant="outline" 
                size="sm"
                onClick={fetchOptions}
                className="mt-2 text-xs"
              >
                Reintentar Conexión
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Sección FAQ */}
      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-semibold flex items-center gap-2 border-b pb-3">
          <HelpCircle className="w-5 h-5 text-indigo-600" />
          Preguntas Frecuentes
        </h3>
        
        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className="font-semibold text-sm text-slate-800 dark:text-slate-200">¿En qué computadoras debo instalar este agente?</h5>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Únicamente debes instalarlo y dejarlo corriendo en las computadoras de cobro (cajas físicas) que vayan a procesar pagos en efectivo usando el reciclador físico. Si entras al sistema desde tu celular o desde casa para ver reportes, no es necesario instalarlo.
            </p>
          </div>
          <div className="space-y-1">
            <h5 className="font-semibold text-sm text-slate-800 dark:text-slate-200">¿El Punto de Venta detecta el agente en automático?</h5>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sí. Al seleccionar la opción de cobro en efectivo con "Reciclador", el Punto de Venta web intentará conectar con <code className="font-mono text-[10px]">http://localhost:3001</code> en segundo plano. Si el agente está encendido, el flujo de cobro iniciará de inmediato.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
