import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD local format
    const locationId = searchParams.get('locationId');
    
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    let totalCashSales = 0;
    
    // Obtener la fecha en la zona horaria local (America/Mexico_City)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const localDateStr = formatter.format(new Date()); 
    const targetDateStr = dateParam ? dateParam : localDateStr;

    const [yearStr, monthStr, dayStr] = targetDateStr.split('-');
    const yearNum = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const dayNum = parseInt(dayStr);

    // Fetch Bank Accounts to find the specific cash account for this location
    let targetAccountName = "";
    if (locationId) {
      try {
        const banksRes = await fetch(`${API_BASE}/BankAccounts`, { headers, cache: 'no-store' });
        if (banksRes.ok) {
          const banksData = await banksRes.json();
          // Find the bank account assigned to this location that is a cash account
          const locationCashAccount = (banksData.value || []).find((b: any) => 
            b.LocationID === locationId && 
            (b.Name.toLowerCase().includes('efectivo') || b.Name.toLowerCase().includes('caja'))
          );
          if (locationCashAccount) {
            targetAccountName = locationCashAccount.Name.toLowerCase();
          }
        }
      } catch (e) {
        console.error("Error fetching bank accounts for location:", e);
      }
    }

    // Fetch Invoices for this branch on this day to link anonymous cash journals to the branch.
    const branchInvoiceNumbers = new Set<string>();
    if (locationId) {
      try {
        let skipInvoices = 0;
        let keepFetchingInvoices = true;
        while (keepFetchingInvoices) {
          const invUrl = `${API_BASE}/Invoices?$filter=year(Date) eq ${yearNum} and month(Date) eq ${monthNum} and day(Date) eq ${dayNum} and LocationID eq guid'${locationId}'&$top=100&$skip=${skipInvoices}`;
          const invRes = await fetch(invUrl, { headers, cache: 'no-store' });
          if (invRes.ok) {
            const invData = await invRes.json();
            if (!invData.value || invData.value.length === 0) break;
            invData.value.forEach((inv: any) => {
               branchInvoiceNumbers.add(inv.Number.toString());
            });
            skipInvoices += 100;
            if (invData.value.length < 100) keepFetchingInvoices = false;
          } else {
            break;
          }
        }
      } catch (e) {
        console.error("Error fetching branch invoices:", e);
      }
    }

    let skip = 0;
    let keepFetching = true;

    while (keepFetching) {
        // Enorme mejora de velocidad (reducido de ~50 segundos a 0.5s): Filtramos vía OData nativo
        const url = `${API_BASE}/AccountingJournals?$filter=year(ApplicationDate) eq ${yearNum} and month(ApplicationDate) eq ${monthNum} and day(ApplicationDate) eq ${dayNum}&$top=100&$skip=${skip}`;
        const res = await fetch(url, { headers, cache: 'no-store' });
        
        if (!res.ok) {
           break;
        }

        const data = await res.json();
        if (!data.value || data.value.length === 0) {
           break;
        }

        for (const journal of data.value) {
            if (journal.Type === 'Pago de Venta') {
                
                // If locationId is provided, check if the journal belongs to this branch via invoice number match.
                let belongsToBranch = true;
                if (locationId) {
                    if (branchInvoiceNumbers.size === 0) {
                        // There are no invoices for this branch today, so no cash sales.
                        belongsToBranch = false;
                    } else {
                        belongsToBranch = false;
                        for (const item of journal.Items || []) {
                            if (item.Description) {
                                for (const invNum of branchInvoiceNumbers) {
                                    if (item.Description.includes(`#${invNum}`)) {
                                        belongsToBranch = true;
                                        break;
                                    }
                                }
                            }
                            if (belongsToBranch) break;
                        }
                    }
                }

                if (!belongsToBranch) continue;

                if (journal.Items) {
                   journal.Items.forEach((item: any) => {
                      if (item.Charge > 0) {
                          const accNameLower = item.AccountName.toLowerCase();
                          let isCashMatch = false;
                          
                          if (targetAccountName && accNameLower.includes(targetAccountName)) {
                              // Strict match if we found a specific bank account name.
                              isCashMatch = true;
                          } else if (accNameLower.includes('efectivo') || accNameLower.includes('caja')) {
                              // If it falls back to a generic account like "caja y efectivo" 
                              // we accept it because we already verified it belongs to the branch (belongsToBranch).
                              isCashMatch = true;
                          }

                          if (isCashMatch) {
                              totalCashSales += item.Charge;
                          }
                      }
                   });
                }
            }
        }
        
        skip += 100;
        
        // Si el API regresó menos de 100 ítems, estamos seguros de que no hay una página adicional que descargar
        if (data.value.length < 100) {
            keepFetching = false;
        }
    }

    return NextResponse.json({ 
        totalCashSales,
        date: targetDateStr,
        source: 'Bind ERP AccountingJournals (Pago de Venta)'
    });

  } catch (error: any) {
    console.error("Cash Sales API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
