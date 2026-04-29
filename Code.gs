/**
 * MULTIMARKET — Google Apps Script
 * Web App para recibir leads desde la landing page estática.
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Abre tu Google Sheet
 * 2. Copia el ID de la hoja desde la URL:
 *    https://docs.google.com/spreadsheets/d/[ESTE_ID]/edit  ← solo la parte entre /d/ y /edit
 * 3. Pégalo en SPREADSHEET_ID abajo
 * 4. Configura TURNSTILE_SECRET con tu Secret Key de Cloudflare Turnstile
 * 5. Guarda (Ctrl+S)
 * 6. Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar
 *
 * CLOUDFLARE TURNSTILE:
 * 1. Ve a dash.cloudflare.com → Turnstile → Add site
 * 2. Nombre: "Multimarket Landing", dominio: haroldbustosb.github.io
 * 3. Copia el Site Key → pégalo en index.html (data-sitekey)
 * 4. Copia el Secret Key → pégalo en TURNSTILE_SECRET abajo
 *
 * ESTRUCTURA DE LA HOJA:
 * Columnas: Fecha | Nombre | Correo | Celular | Perfil | Acepta Política | Fuente | User Agent
 */

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const SPREADSHEET_ID   = "1lpDEsT_z5hHwA1u8d8hSE3vQ3tSPeeAZpATmk6zFoAA";
const SHEET_NAME       = "Leads";
const NOTIFY_EMAIL     = "mlmultimarketcompany@gmail.com"; // notificación interna (deja "" para desactivar)
const TURNSTILE_SECRET = "0x4AAAAAADFVV5HXysHr7UWah-LZ78tCDnQ"; // Secret Key de Cloudflare Turnstile
const SEND_CLIENT_MAIL = true;                      // false para desactivar email al registrado
// ──────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return buildResponse(false, "Servidor ocupado, reintenta en unos segundos");
  }

  try {
    const data = JSON.parse(e.postData.contents);

    // Validaciones del lado servidor
    if (!data.nombre || !data.correo || !data.celular) {
      return buildResponse(false, "Campos obligatorios incompletos");
    }
    if (!isValidEmail(data.correo)) {
      return buildResponse(false, "Correo electrónico inválido");
    }
    if (!data.aceptaPoliticas) {
      return buildResponse(false, "Debe aceptar la política de tratamiento de datos");
    }

    // Verificación Cloudflare Turnstile
    if (!verifyTurnstile(data.cfToken || "")) {
      return buildResponse(false, "Verificación de seguridad fallida");
    }

    // Abrir hoja por ID (obligatorio en Web App standalone)
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        "Fecha y Hora", "Nombre", "Correo", "Celular",
        "Perfil de Interés", "Acepta Política", "Fuente", "User Agent"
      ]);
      const header = sheet.getRange(1, 1, 1, 8);
      header.setFontWeight("bold");
      header.setBackground("#1A3C5E");
      header.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }

    // ── Guardar lead ──────────────────────────────────────────
    sheet.appendRow([
      new Date(),
      sanitize(data.nombre),
      sanitize(data.correo).toLowerCase(),
      sanitize(data.celular),
      sanitize(data.perfil || "No especificado"),
      "Sí",
      sanitize(data.fuente || "Landing Page"),
      sanitize(data.userAgent || "")
    ]);

    // ── Email de bienvenida al cliente (no-fatal) ─────────────
    if (SEND_CLIENT_MAIL) {
      try {
        sendClientEmail(data);
      } catch (mailErr) {
        console.warn("Email cliente no enviado:", mailErr.message);
      }
    }

    // ── Notificación interna (no-fatal) ───────────────────────
    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail({
          to:      NOTIFY_EMAIL,
          subject: "Nuevo lead Multimarket: " + data.nombre,
          body:    buildAdminEmailBody(data, ss.getUrl()),
        });
      } catch (mailErr) {
        console.warn("Email admin no enviado:", mailErr.message);
      }
    }

    return buildResponse(true, "Lead registrado correctamente");

  } catch (error) {
    console.error("Error en doPost:", error);
    return buildResponse(false, "Error interno: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

// GET — verificar que la web app está activa
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status:    "active",
      app:       "Multimarket Lead Collector",
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Cloudflare Turnstile verification ─────────────────────────────────────────
function verifyTurnstile(token) {
  // Si el secret no está configurado aún, pasar (modo desarrollo)
  if (!token || !TURNSTILE_SECRET || TURNSTILE_SECRET === "PEGA_TU_SECRET_KEY_AQUI") {
    return true;
  }
  try {
    const resp = UrlFetchApp.fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method:           "post",
        contentType:      "application/x-www-form-urlencoded",
        payload:          "secret="   + encodeURIComponent(TURNSTILE_SECRET) +
                          "&response=" + encodeURIComponent(token),
        muteHttpExceptions: true,
      }
    );
    const result = JSON.parse(resp.getContentText());
    if (!result.success) {
      console.warn("Turnstile falló:", JSON.stringify(result["error-codes"]));
    }
    return result.success === true;
  } catch (err) {
    // Falla abierta: si el servicio no responde, no bloqueamos al usuario
    console.warn("Turnstile error de red:", err.message);
    return true;
  }
}

// ── Email de bienvenida al cliente ────────────────────────────────────────────
function sendClientEmail(data) {
  const nombre = sanitize(data.nombre);
  const perfil = sanitize(data.perfil || "No especificado");

  const html = '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"/></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
           'background:#F0F4F8;margin:0;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;' +
         'overflow:hidden;box-shadow:0 4px 24px rgba(26,60,94,.12)">' +

      // Header
      '<div style="background:linear-gradient(135deg,#0D2137,#1A3C5E);padding:32px 36px;text-align:center">' +
        '<div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px">' +
          'Multi<span style="color:#10B981">market</span>' +
        '</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,.55);margin-top:5px;letter-spacing:.5px">' +
          'Red de economía activa · Colombia' +
        '</div>' +
      '</div>' +

      // Body
      '<div style="padding:36px 40px">' +
        '<h1 style="font-size:22px;font-weight:900;color:#1A3C5E;margin:0 0 12px">' +
          '¡Hola, ' + nombre + '!' +
        '</h1>' +
        '<p style="font-size:15px;color:#64748B;line-height:1.75;margin:0 0 28px">' +
          'Tu lugar en la red está reservado. Eres parte de los primeros usuarios que ' +
          'construyen la base de Multimarket — y esa posición tiene <strong style="color:#1A3C5E">' +
          'ventaja permanente.</strong>' +
        '</p>' +

        // Info box
        '<div style="background:#F8FAFC;border-radius:12px;padding:20px 24px;' +
             'border:1px solid #E2E8F0;margin-bottom:24px">' +
          '<div style="font-size:10px;font-weight:700;color:#94A3B8;' +
               'text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Tu registro</div>' +
          '<table style="width:100%;border-collapse:collapse">' +
            '<tr>' +
              '<td style="font-size:13px;color:#64748B;padding:6px 0">Perfil de interés</td>' +
              '<td style="font-size:13px;font-weight:700;color:#1A3C5E;text-align:right">' + perfil + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="font-size:13px;color:#64748B;padding:6px 0;border-top:1px solid #E2E8F0">Estado</td>' +
              '<td style="font-size:13px;font-weight:700;color:#10B981;text-align:right;border-top:1px solid #E2E8F0">' +
                '✓ Confirmado' +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

        // Next steps
        '<div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);' +
             'border-radius:12px;padding:20px 24px;margin-bottom:28px">' +
          '<div style="font-size:13px;font-weight:700;color:#059669;margin-bottom:10px">' +
            '¿Qué pasa ahora?' +
          '</div>' +
          '<ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.9">' +
            '<li>Te notificamos cuando la plataforma abra oficialmente</li>' +
            '<li>Acceso anticipado antes del lanzamiento público</li>' +
            '<li>Tu posición en la red queda fija desde hoy</li>' +
          '</ul>' +
        '</div>' +

        // ML reminder
        '<div style="background:#1A3C5E;border-radius:12px;padding:18px 22px;' +
             'margin-bottom:28px;text-align:center">' +
          '<div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:6px">' +
            'Recuerda: en Multimarket' +
          '</div>' +
          '<div style="font-size:16px;font-weight:800;color:#fff;line-height:1.4">' +
            '1 ML = 1 COP · ' +
            '<span style="color:#10B981">1% de tu red, automático</span>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:13px;color:#94A3B8;text-align:center;line-height:1.7;margin:0">' +
          '¿Tienes preguntas? Escríbenos a<br/>' +
          '<a href="mailto:contact@multimarket.com.co" ' +
             'style="color:#10B981;font-weight:700;text-decoration:none">' +
            'contact@multimarket.com.co' +
          '</a>' +
        '</p>' +
      '</div>' +

      // Footer
      '<div style="background:#F8FAFC;padding:16px 40px;text-align:center;' +
           'border-top:1px solid #E2E8F0">' +
        '<p style="font-size:11px;color:#94A3B8;margin:0;line-height:1.7">' +
          '© 2026 Multimarket S.A.S. · Colombia · Economía activa<br/>' +
          'Este correo confirma tu registro anticipado.' +
        '</p>' +
      '</div>' +

    '</div>' +
    '</body></html>';

  MailApp.sendEmail({
    to:       sanitize(data.correo).toLowerCase(),
    subject:  "¡Tu lugar en Multimarket está reservado, " + nombre + "!",
    htmlBody: html,
    name:     "Multimarket",
    replyTo:  "contact@multimarket.com.co",
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildResponse(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitize(value) {
  if (typeof value !== "string") return String(value || "");
  return value.trim().substring(0, 500);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

function buildAdminEmailBody(data, sheetUrl) {
  return [
    "Nuevo lead registrado en Multimarket",
    "─────────────────────────────",
    "Nombre:  " + data.nombre,
    "Correo:  " + data.correo,
    "Celular: " + data.celular,
    "Perfil:  " + (data.perfil || "No especificado"),
    "Fecha:   " + new Date().toLocaleString("es-CO"),
    "─────────────────────────────",
    "Ver todos los leads: " + sheetUrl
  ].join("\n");
}
