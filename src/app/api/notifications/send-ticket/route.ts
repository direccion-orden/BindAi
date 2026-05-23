import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { saleId, saleData, companyId } = body;

    if (!saleId || !saleData) {
      return NextResponse.json({ error: 'Falta la información de la venta' }, { status: 400 });
    }

    const client = saleData.client;

    if (!client || !client.email) {
      return NextResponse.json({ error: 'El cliente no tiene un correo registrado' }, { status: 400 });
    }

    // Leer el logo SVG y convertirlo a base64
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.svg');
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
    } catch (e) {
      console.error("Error reading logo.svg for email:", e);
    }

    // Configurar transporte SMTP (dinámico o fallback a env)
    let smtpConfig: any = null;
    if (companyId) {
      try {
        const companySnap = await adminDb.collection('companies').doc(companyId).get();
        if (companySnap.exists) {
          const data = companySnap.data();
          if (data && data.smtpHost && data.smtpPort && data.smtpUser && data.smtpPass) {
            smtpConfig = {
              host: data.smtpHost,
              port: parseInt(data.smtpPort),
              secure: parseInt(data.smtpPort) === 465,
              auth: {
                user: data.smtpUser,
                pass: data.smtpPass,
              }
            };
            console.log(`[Send Ticket API] Loaded custom SMTP configuration for company: ${companyId} (${data.smtpUser})`);
          }
        }
      } catch (e: any) {
        console.error("[Send Ticket API] Error loading dynamic SMTP config from Firestore:", e.message);
      }
    }

    const transporter = smtpConfig ? nodemailer.createTransport(smtpConfig) : nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const senderEmail = smtpConfig ? smtpConfig.auth.user : process.env.SMTP_USER;

    // Formatear dinero
    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    // Crear lista de items en HTML
    const itemsHtml = saleData.items.map((item: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.title}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatMoney(item.unitPrice)}</td>
      </tr>
    `).join('');

    // Diseño del ticket HTML
    const folioText = saleData.folio || saleId.slice(0, 8).toUpperCase();
    const barcodeValue = saleData.folio || saleId;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; color: white; padding: 30px 20px; text-align: center;">
          ${logoBase64 ? `<img src="${logoBase64}" alt="El Orden de las Cosas" style="max-width: 250px; margin-bottom: 15px; filter: invert(1) brightness(2);" />` : ''}
          <h1 style="margin: 0; font-size: 24px;">¡Gracias por tu compra!</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.8;">Ticket: #${folioText}</p>
        </div>
        
        <div style="padding: 20px;">
          <p>Hola <strong>${client.name}</strong>,</p>
          <p>Aquí tienes el resumen de tu compra reciente:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Artículo</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Cant</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Precio</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Subtotal:</td>
                <td style="padding: 8px; text-align: right;">${formatMoney(saleData.financials.subtotal)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">IVA (16%):</td>
                <td style="padding: 8px; text-align: right;">${formatMoney(saleData.financials.tax)}</td>
              </tr>
              <tr style="font-size: 18px;">
                <td colspan="2" style="padding: 8px; text-align: right; font-weight: 900; color: #0f172a;">TOTAL:</td>
                <td style="padding: 8px; text-align: right; font-weight: 900; color: #0f172a;">${formatMoney(saleData.financials.total)}</td>
              </tr>
            </tfoot>
          </table>

          ${saleData.pointsEarned > 0 ? `
            <div style="background-color: #fff7ed; border: 1px solid #fdba74; padding: 15px; border-radius: 6px; text-align: center; margin-top: 20px;">
              <h3 style="color: #c2410c; margin: 0 0 5px 0;">🎁 ¡Felicidades!</h3>
              <p style="color: #9a3412; margin: 0; font-weight: bold;">Acumulaste ${saleData.pointsEarned} puntos en esta compra.</p>
              <p style="color: #c2410c; margin: 5px 0 0 0; font-size: 12px;">Úsalos en tu próxima visita.</p>
            </div>
          ` : ''}
        </div>
        
        <div style="padding: 20px; text-align: center; border-top: 1px dashed #ddd; background-color: #fff;">
          <p style="font-size: 13px; color: #64748b; margin: 0 0 10px 0;">Código para Cambios y Devoluciones:</p>
          <img src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeValue}&scale=2&height=12&includetext=true" alt="${barcodeValue}" style="max-width: 100%; border-radius: 4px;" />
        </div>
        
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">Este es un comprobante de compra generado automáticamente.</p>
        </div>
      </div>
    `;

    // Enviar el correo
    await transporter.sendMail({
      from: `"Punto de Venta" <${senderEmail}>`,
      to: client.email,
      subject: `Tu Ticket de Compra - ${formatMoney(saleData.financials.total)}`,
      html: htmlContent,
    });

    return NextResponse.json({ success: true, message: 'Correo enviado' });

  } catch (error: any) {
    console.error('Error al enviar ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
