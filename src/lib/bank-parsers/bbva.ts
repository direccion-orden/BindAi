import { BankTransaction } from "@/types/bank";

/**
 * BBVA Maestra Pyme PDF Parser
 * 
 * This parser expects the standard BBVA Maestra Pyme layout.
 * Columns: FECHA OPER | FECHA LIQ | COD. DESCRIPCIÓN | REFERENCIA | CARGOS | ABONOS | SALDO OPERACIÓN | SALDO LIQUIDACIÓN
 */
export async function parseBBVAPdf(file: File): Promise<BankTransaction[]> {
  // Load pdfjs-dist dynamically to avoid SSR issues or heavy initial bundle
  const pdfjs = await import("pdfjs-dist");
  
  // Set worker source (standard for pdfjs-dist in browser)
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  let year = new Date().getFullYear().toString();

  // 1. Extract all text and find the year/period
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => (item as any).str).join(" ");
    fullText += pageText + "\n";

    // Try to find year on page 1
    if (i === 1) {
      const periodMatch = pageText.match(/DEL \d{2}\/\d{2}\/(\d{4}) AL/i);
      if (periodMatch) {
        year = periodMatch[1];
      }
    }
  }

  const lines = fullText.split("\n");
  const transactions: BankTransaction[] = [];
  
  // Regex to match the start of a transaction row
  // Example: 01/JUN 01/JUN T09 TEF RECIBIDO HSBC 11,883.19
  // Groups: 1: OperDate, 2: LiqDate, 3: Concept, 4: Amount
  const rowStartRegex = /^(\d{2}\/[A-Z]{3})\s+(\d{2}\/[A-Z]{3})\s+(.+?)\s+([\d,]+\.\d{2})$/;

  let currentTx: any = null;

  const MONTHS_MAP: Record<string, string> = {
    'ENE': '01', 'FEB': '02', 'MAR': '03', 'ABR': '04', 'MAY': '05', 'JUN': '06',
    'JUL': '07', 'AGO': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DIC': '12'
  };

  const parseBBVADate = (str: string) => {
    const [day, monthStr] = str.split('/');
    const month = MONTHS_MAP[monthStr.toUpperCase()] || '01';
    return `${year}-${month}-${day.padStart(2, '0')}`;
  };

  const finalizeTx = (tx: any): BankTransaction => {
    let concept = tx.concept || "";
    let reference = tx.reference || "";

    // Keywords that indicate a charge (negative amount)
    const chargeKeywords = [
      "SPEI ENVIADO", "COM.", "IVA", "CARGO", "RETIRO", 
      "PAGO CUENTA", "PAGO SERVICIO", "ANUALIDAD", "MANEJO DE CUENTA",
      "COMPRA", "AUTO."
    ];
    
    const isCharge = chargeKeywords.some(kw => concept.toUpperCase().includes(kw));

    return {
      id: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: tx.date,
      concept: concept.substring(0, 150).trim(),
      reference: reference.substring(0, 100).trim(),
      amount: isCharge ? -Math.abs(tx.amount) : Math.abs(tx.amount),
      type: isCharge ? "EXPENSE" : "INCOME",
      createdAt: Date.now()
    };
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(rowStartRegex);

    if (match) {
      if (currentTx) {
        transactions.push(finalizeTx(currentTx));
      }

      const [_, operDateStr, liqDateStr, conceptPart, amountStr] = match;
      const amount = parseFloat(amountStr.replace(/,/g, ''));
      
      currentTx = {
        date: parseBBVADate(operDateStr),
        concept: conceptPart,
        amount: amount,
        rawLines: [trimmed]
      };
    } else if (currentTx && !trimmed.startsWith("PAGINA") && !trimmed.includes("Estado de Cuenta") && !trimmed.includes("No. Cuenta")) {
      currentTx.rawLines.push(trimmed);
      if (trimmed.includes("Ref.") || trimmed.match(/[A-Z]{3,4}\d{6}[A-Z0-9]{3}/)) {
          currentTx.reference = (currentTx.reference ? currentTx.reference + " " : "") + trimmed;
      } else {
          currentTx.concept += " " + trimmed;
      }
    }
  }

  if (currentTx) {
    transactions.push(finalizeTx(currentTx));
  }

  return transactions;
}
