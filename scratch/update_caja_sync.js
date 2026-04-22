const fs = require('fs');

let pageTxt = fs.readFileSync('src/app/(dashboard)/caja/page.tsx', 'utf8');

// 1. Fix Imports
if (!pageTxt.includes('useRef')) {
  pageTxt = pageTxt.replace('import { useState, useEffect } from "react";', 'import { useState, useEffect, useRef } from "react";');
}
if (!pageTxt.includes('updateDoc')) {
  pageTxt = pageTxt.replace('limit, Timestamp } from "firebase/firestore";', 'limit, Timestamp, doc, updateDoc } from "firebase/firestore";');
}
if (!pageTxt.includes('CheckCircle2')) {
  pageTxt = pageTxt.replace('RefreshCcw } from "lucide-react";', 'RefreshCcw, CheckCircle2 } from "lucide-react";');
}

// 2. Insert Debouncer State & Logic
const injectIndex = pageTxt.indexOf('const handleLiveCountChange =');
if (injectIndex !== -1 && !pageTxt.includes('const [syncStatus')) {
  const syncCode = `
  const [syncStatus, setSyncStatus] = useState<'idle'|'syncing'|'saved'>('idle');
  const hasMounted = useRef(false);

  useEffect(() => {
    if (activeSession?.liveAudit && !hasMounted.current) {
        setLiveCardSales(activeSession.liveAudit.cardSales || "");
        setLiveCounts(activeSession.liveAudit.counts || {});
        hasMounted.current = true;
    } else if (activeSession && !hasMounted.current) {
        hasMounted.current = true;
    }
  }, [activeSession]);

  useEffect(() => {
     if (!activeSession?.id || !hasMounted.current) return;
     
     setSyncStatus('syncing');
     const timerId = setTimeout(async () => {
         try {
            const ref = doc(db, "cash_sessions", activeSession.id);
            await updateDoc(ref, {
                liveAudit: {
                    cardSales: liveCardSales,
                    counts: liveCounts,
                    updatedAt: new Date()
                }
            });
            setSyncStatus('saved');
            setTimeout(() => setSyncStatus('idle'), 2000);
         } catch(err) {
            console.error("Sync live audit err:", err);
         }
     }, 1500);

     return () => clearTimeout(timerId);
  }, [liveCounts, liveCardSales, activeSession?.id]);

  `;
  
  pageTxt = pageTxt.slice(0, injectIndex) + syncCode + pageTxt.slice(injectIndex);
}

// 3. Update Title to include Sync Indicator
const oldUI = `<h3 className="font-semibold text-lg border-b pb-2 mb-4">Arqueo Físico Simultáneo (Sin Cerrar)</h3>`;
const newUI = `<div className="flex items-center justify-between border-b pb-2 mb-4">
                 <h3 className="font-semibold text-lg">Arqueo Físico Simultáneo (Sin Cerrar)</h3>
                 {syncStatus === 'syncing' && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Sincronizando...</span>}
                 {syncStatus === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3 h-3"/> Activo en la Nube</span>}
               </div>`;
pageTxt = pageTxt.replace(oldUI, newUI);

// Fix TS Record definition missed in last update just in case
pageTxt = pageTxt.replace('const [liveCounts, setLiveCounts] = useState({});', 'const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});');
pageTxt = pageTxt.replace('handleLiveCountChange = (valStr, qtyStr)', 'handleLiveCountChange = (valStr: string, qtyStr: string)');

fs.writeFileSync('src/app/(dashboard)/caja/page.tsx', pageTxt);
console.log('SYNC LOGIC ADDED!');
