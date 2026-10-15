/**
 * Cerdísimo Chancho · Aviso por correo de pagos reportados
 *
 * Cada minuto revisa si algún cliente reportó un pago en la tienda (pedidos de la app en
 * "por_verificar") y les manda un correo a los socios: los correos de la colección "socios".
 * Corre en Google Apps Script con la cuenta de Google dueña del proyecto de Firebase, que lee
 * Firestore con sus propios permisos. Cómo activarlo: README.md, "Aviso de pagos por correo".
 *
 * instalar()    → ejecutar una vez: deja el aviso corriendo y manda un correo de prueba.
 * desinstalar() → apaga el aviso.
 */
const PROYECTO = "cerdisimo-chancho";
const ADMIN = "https://cerdisimochancho.com/admin/";
const DOCS = "https://firestore.googleapis.com/v1/projects/" + PROYECTO + "/databases/(default)/documents";
const ZONA = "America/Bogota";

function instalar() {
  const socios = correosSocios_();
  if (!socios.length) throw new Error("No encontré correos en la colección «socios» de Firestore.");
  quitarAvisos_();
  ScriptApp.newTrigger("revisarPagos").timeBased().everyMinutes(1).create();
  MailApp.sendEmail({
    to: socios.join(","),
    name: "Cerdísimo Chancho",
    subject: "Avisos de pagos activados",
    body: "Desde ahora les llega un correo cada vez que un cliente reporte un pago en la tienda.\n\nAdministración: " + ADMIN,
    htmlBody: plantilla_("<p style=\"margin:0 0 12px\">Desde ahora les llega un correo cada vez que un cliente reporte un pago en la tienda.</p>", ADMIN, "Abrir la administración"),
  });
  revisarPagos();
  console.log("Listo: el aviso revisa cada minuto y escribe a " + socios.join(", ") + ".");
}

function desinstalar() {
  quitarAvisos_();
  console.log("Aviso apagado.");
}

function revisarPagos() {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(5000)) return; // otra revisión sigue corriendo
  try {
    const props = PropertiesService.getScriptProperties();
    const avisados = JSON.parse(props.getProperty("avisados") || "{}");
    const pendientes = pedidosPorVerificar_();
    // Nuevo = un reporte del cliente que no se ha avisado. Si un socio desmarca un pago que ya
    // había aprobado, el pedido vuelve a "por_verificar" sin reporte nuevo y no se avisa.
    const nuevos = pendientes.filter((p) => avisados[p.id] !== p.reportadoEn && !(p.aprobadoEn > p.reportadoEn));
    try {
      if (nuevos.length) {
        const socios = correosSocios_();
        nuevos.forEach((p) => {
          if (MailApp.getRemainingDailyQuota() < socios.length) throw new Error("Se acabó el cupo diario de correos de Google.");
          enviarAviso_(p, socios);
          avisados[p.id] = p.reportadoEn;
        });
      }
    } finally {
      // Solo se recuerdan los que siguen por revisar: si se rechaza y el cliente vuelve a
      // reportar, llega otro aviso.
      const siguen = {};
      pendientes.forEach((p) => { if (avisados[p.id]) siguen[p.id] = avisados[p.id]; });
      props.setProperty("avisados", JSON.stringify(siguen));
    }
  } finally {
    candado.releaseLock();
  }
}

function enviarAviso_(p, socios) {
  const codigo = "CC-" + p.id.replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase();
  const nombre = p.clienteNombre || "Un cliente";
  const valor = plata_(p.total);
  const cuando = Utilities.formatDate(new Date(p.reportadoEn), ZONA, "d/MM h:mm a");
  const entrega = p.fechaEntrega ? fechaLarga_(p.fechaEntrega) : "";
  const enlace = ADMIN + "#pedido=" + encodeURIComponent(p.id);
  const filas = [
    ["Traslado a nombre de", p.comprobante || "—"],
    ["Valor", valor],
    ["Pedido", codigo],
    ["Lo reportó", cuando],
  ].concat(entrega ? [["Entrega", entrega]] : []);
  MailApp.sendEmail({
    to: socios.join(","),
    name: "Cerdísimo Chancho",
    subject: "Pago por revisar: " + nombre + " · " + valor + " (" + codigo + ")",
    body: nombre + " reportó el pago del pedido " + codigo + ".\n\n" +
      filas.map((f) => f[0] + ": " + f[1]).join("\n") +
      "\n\nRevisen en Nequi que haya entrado ese traslado y apruébenlo en la administración:\n" + enlace,
    htmlBody: plantilla_(
      "<p style=\"margin:0 0 12px\"><b>" + esc_(nombre) + "</b> reportó el pago del pedido <b>" + codigo + "</b>.</p>" +
      "<table style=\"border-collapse:collapse;margin:0 0 14px\">" +
      filas.map((f) => "<tr><td style=\"padding:3px 14px 3px 0;color:#4a3a30\">" + f[0] + "</td><td style=\"padding:3px 0\"><b>" + esc_(f[1]) + "</b></td></tr>").join("") +
      "</table><p style=\"margin:0 0 12px\">Revisen en Nequi que haya entrado ese traslado y apruébenlo.</p>",
      enlace, "Revisar el pago"),
  });
}

// ---------- Firestore ----------
function pedidosPorVerificar_() {
  const filas = llamar_("post", DOCS + ":runQuery", {
    structuredQuery: {
      from: [{ collectionId: "pedidos" }],
      where: { fieldFilter: { field: { fieldPath: "estado" }, op: "EQUAL", value: { stringValue: "por_verificar" } } },
    },
  });
  return filas.filter((f) => f.document)
    .map((f) => Object.assign(campos_(f.document.fields), { id: f.document.name.split("/").pop() }))
    .filter((p) => p.origen === "web" && p.reportadoEn);
}

function correosSocios_() {
  const r = llamar_("get", DOCS + "/socios?pageSize=50");
  return (r.documents || []).map((d) => decodeURIComponent(d.name.split("/").pop())).filter((c) => c.indexOf("@") > 0);
}

function llamar_(metodo, url, cuerpo) {
  const opciones = {
    method: metodo,
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "X-Goog-User-Project": PROYECTO },
  };
  if (cuerpo) { opciones.contentType = "application/json"; opciones.payload = JSON.stringify(cuerpo); }
  const r = UrlFetchApp.fetch(url, opciones);
  const texto = r.getContentText();
  if (r.getResponseCode() >= 300) {
    throw new Error("Firestore respondió " + r.getResponseCode() + ". ¿Este script corre con la cuenta de Google dueña del proyecto " + PROYECTO + "? " + texto.slice(0, 400));
  }
  return JSON.parse(texto);
}

function campos_(f) {
  const o = {};
  Object.keys(f || {}).forEach((k) => { o[k] = valor_(f[k]); });
  return o;
}

function valor_(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return campos_(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valor_);
  return null;
}

function quitarAvisos_() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "revisarPagos")
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

// ---------- Formato ----------
function plata_(n) {
  return "$" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fechaLarga_(iso) {
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  return DIAS[f.getDay()] + " " + d + " de " + MESES[m - 1];
}

function esc_(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function plantilla_(contenido, enlace, boton) {
  return "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:#1a110d;background:#f6e7cc;padding:20px\">" +
    "<div style=\"max-width:480px;margin:0 auto;background:#fff8ec;border:3px solid #1a110d;border-radius:18px;padding:18px 20px\">" +
    "<p style=\"margin:0 0 12px;font-size:20px;font-weight:bold;color:#9a4526\">Cerdísimo Chancho</p>" + contenido +
    "<p style=\"margin:16px 0 0\"><a href=\"" + enlace + "\" style=\"display:inline-block;background:#f0c870;color:#1a110d;border:3px solid #1a110d;border-radius:999px;padding:10px 18px;font-weight:bold;text-decoration:none\">" + boton + "</a></p>" +
    "</div></div>";
}
