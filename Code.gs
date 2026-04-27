/**
 * MULTIMARKET — Google Apps Script
 * Web App para recibir leads desde la landing page estática.
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Abre tu Google Sheet
 * 2. Copia el ID de la hoja desde la URL:
 *    https://docs.google.com/spreadsheets/d/[ESTE_ID]/edit  ← solo la parte entre /d/ y /edit
 * 3. Pégalo en SPREADSHEET_ID abajo
 * 4. Abre Extensiones > Apps Script, borra el contenido y pega este código
 * 5. Guarda (Ctrl+S)
 * 6. Clic en "Implementar" > "Administrar implementaciones" > editar (lápiz) > "Nueva versión" > Implementar
 *    (la URL permanece igual)
 *
 * ESTRUCTURA DE LA HOJA:
 * Columnas: Fecha | Nombre | Correo | Celular | Perfil | Acepta Política | Fuente | User Agent
 */

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const SPREADSHEET_ID = "1lpDEsT_z5hHwA1u8d8hSE3vQ3tSPeeAZpATmk6zFoAA";
const SHEET_NAME     = "Leads";
const NOTIFY_EMAIL   = "jhabmc@gmail.com";  // deja "" para desactivar notificaciones
// ──────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  // Lock de escritura: evita duplicados si llegan dos peticiones simultáneas
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);  // espera hasta 10 s para obtener el lock
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

    // ── Notificar por email (no-fatal) ────────────────────────
    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail({
          to:      NOTIFY_EMAIL,
          subject: "Nuevo lead Multimarket: " + data.nombre,
          body:    buildEmailBody(data, ss.getUrl()),
        });
      } catch (mailErr) {
        // El email falló pero el lead ya fue guardado — no rompemos la respuesta
        console.warn("Email no enviado:", mailErr.message);
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

function buildEmailBody(data, sheetUrl) {
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
