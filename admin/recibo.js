// Recibo en PDF de un pago a la fábrica de chorizos.
// Una hoja carta con dos copias iguales (una para nosotros y otra para la fábrica), línea para
// recortar y espacio para las firmas. El PDF se arma en el navegador con jsPDF (admin/vendor)
// y las letras de la marca (assets/fuentes), sin mandar nada a ningún servidor.
import { plata, fechaLarga, fechaCorta, CHORIZOS_POR_PAQUETE, FORMAS_PAGO } from "../negocio.js";

const TINTA = "#1a110d", OXIDO = "#ac5531", OXIDO_OSCURO = "#9a4526", MOSTAZA = "#f0c870", CREMA = "#f6e7cc", GRIS = "#5c4a40";
const ANCHO = 215.9, ALTO = 279.4, MITAD = ALTO / 2, X0 = 14, X1 = ANCHO - 14; // carta, en milímetros

// ---------- Número en letras, como en los recibos de caja ----------
const UNIDADES = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
  "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro",
  "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
function menosDeMil(n) {
  if (n === 100) return "cien";
  const r = n % 100;
  const dos = r < 30 ? UNIDADES[r] : DECENAS[Math.floor(r / 10)] + (r % 10 ? " y " + UNIDADES[r % 10] : "");
  return [CENTENAS[Math.floor(n / 100)], dos].filter(Boolean).join(" ");
}
export function enLetras(valor) {
  const n = Math.round(Math.abs(Number(valor) || 0));
  if (!n) return "cero pesos";
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? "un millón" : menosDeMil(millones) + " millones");
  if (miles) partes.push(miles === 1 ? "mil" : menosDeMil(miles) + " mil");
  if (resto) partes.push(menosDeMil(resto));
  return partes.join(" ") + (millones && !miles && !resto ? " de pesos" : " pesos");
}

// El número de recibo sale del orden de los pagos a la fábrica, del más viejo al más nuevo
const enOrden = (pagos) => pagos.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || (a.creado || "").localeCompare(b.creado || ""));
export function numeroRecibo(pago, pagos) {
  const i = enOrden(pagos).findIndex((x) => x.id === pago.id);
  return String(i + 1).padStart(3, "0");
}
export const nombreArchivo = (pago, pagos) => "recibo-fabrica-" + numeroRecibo(pago, pagos) + "-" + pago.fecha + ".pdf";

// ---------- jsPDF, letras y logo: se cargan la primera vez que se pide un recibo ----------
let recursos = null;
function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => mal(new Error("no se pudo cargar el generador de PDF. Revisa la conexión."));
    document.head.appendChild(s);
  });
}
async function base64De(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("no se pudo cargar " + url.split("/").pop());
  const bytes = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function cargarRecursos() {
  const url = (ruta) => new URL(ruta, import.meta.url).href;
  recursos ||= (async () => {
    if (!window.jspdf) await cargarScript(url("./vendor/jspdf.umd.min.js"));
    const [medium, extra, luckiest, logo] = await Promise.all([
      base64De(url("../assets/fuentes/Baloo2-Medium.ttf")),
      base64De(url("../assets/fuentes/Baloo2-ExtraBold.ttf")),
      base64De(url("../assets/fuentes/LuckiestGuy-Regular.ttf")),
      base64De(url("../assets/logo.png")),
    ]);
    return { jsPDF: window.jspdf.jsPDF, medium, extra, luckiest, logo: "data:image/png;base64," + logo };
  })().catch((e) => { recursos = null; throw e; });
  return recursos;
}

// ---------- El recibo ----------
// pago: { id, fecha, paquetes, monto, descripcion, creado }; pagos: todos los pagos a la fábrica.
// Devuelve el PDF como Blob.
export async function reciboFabricaPDF(pago, pagos, { hoy = new Date(), pagadoA = "Fábrica de chorizos" } = {}) {
  const r = await cargarRecursos();
  const doc = new r.jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: true });
  doc.addFileToVFS("Baloo2-Medium.ttf", r.medium);
  doc.addFileToVFS("Baloo2-ExtraBold.ttf", r.extra);
  doc.addFileToVFS("LuckiestGuy-Regular.ttf", r.luckiest);
  doc.addFont("Baloo2-Medium.ttf", "Baloo", "normal");
  doc.addFont("Baloo2-ExtraBold.ttf", "Baloo", "bold");
  doc.addFont("LuckiestGuy-Regular.ttf", "Luckiest", "normal");

  const numero = numeroRecibo(pago, pagos);
  const hasta = enOrden(pagos).slice(0, Number(numero));
  const datos = {
    numero, pagadoA,
    fecha: fechaLarga(pago.fecha) + " de " + pago.fecha.slice(0, 4),
    paquetes: Number(pago.paquetes) || 0,
    monto: Number(pago.monto) || 0,
    nota: (pago.descripcion || "").trim(),
    formaPago: FORMAS_PAGO[pago.formaPago] || "",
    historial: hasta,
    generado: hoy,
  };
  doc.setProperties({ title: "Recibo de pago a la fábrica N.º " + numero, author: "Cerdísimo Chancho", subject: "Pago del " + fechaCorta(pago.fecha) });
  copia(doc, r, 0, datos, "Copia para Cerdísimo Chancho");
  copia(doc, r, MITAD, datos, "Copia para la fábrica");
  lineaDeCorte(doc);
  return doc.output("blob");
}

function texto(doc, s, x, y, { fuente = "Baloo", estilo = "normal", tam = 10, color = TINTA, ...op } = {}) {
  doc.setFont(fuente, estilo);
  doc.setFontSize(tam);
  doc.setTextColor(color);
  doc.text(s, x, y, op);
}

function copia(doc, r, y0, d, etiqueta) {
  // Encabezado: logo, marca y número del recibo
  doc.addImage(r.logo, "PNG", X0, y0 + 8, 23, 23.7, "logo", "FAST");
  texto(doc, "Cerdísimo Chancho", X0 + 27, y0 + 18.5, { fuente: "Luckiest", tam: 21, color: OXIDO });
  texto(doc, "Chorizos artesanales · cerdisimochancho.com", X0 + 27, y0 + 24.5, { tam: 9.5, color: GRIS });
  texto(doc, "Recibo de pago", X1, y0 + 15, { fuente: "Luckiest", tam: 13, align: "right" });
  texto(doc, "N.º " + d.numero, X1, y0 + 24, { fuente: "Luckiest", tam: 19, color: OXIDO, align: "right" });
  // Chip con la copia, como los chips de la marca
  doc.setFont("Baloo", "bold"); doc.setFontSize(8);
  const w = doc.getTextWidth(etiqueta) + 7;
  doc.setDrawColor(TINTA); doc.setLineWidth(0.4); doc.setFillColor(OXIDO_OSCURO);
  doc.roundedRect(X1 - w, y0 + 27, w, 5.4, 2.7, 2.7, "FD");
  texto(doc, etiqueta, X1 - w / 2, y0 + 30.8, { estilo: "bold", tam: 8, color: "#fff8ec", align: "center" });
  doc.setLineWidth(0.7); doc.line(X0, y0 + 35, X1, y0 + 35);

  // Quién, cuándo y cómo
  const dato = (etq, valor, x, y) => {
    texto(doc, etq, x, y, { estilo: "bold", tam: 8, color: OXIDO_OSCURO });
    texto(doc, valor, x, y + 5, { tam: 11 });
  };
  const xDer = X0 + 100;
  dato("Fecha del pago", d.fecha.charAt(0).toUpperCase() + d.fecha.slice(1), X0, y0 + 41);
  dato("Pagado a", d.pagadoA, xDer, y0 + 41);
  dato("Pagado por", "Cerdísimo Chancho (Daniel y Mariana)", X0, y0 + 52);
  dato("Forma de pago", d.formaPago || "_______________", xDer, y0 + 52);

  // Detalle: paquetes, valor por paquete y total
  const yt = y0 + 60;
  const cPaq = X0 + 112, cValor = X0 + 150, cTotal = X1 - 3;
  // Franja crema arriba (con las esquinas redondeadas de la tabla), luego el contorno encima
  doc.setFillColor(CREMA); doc.roundedRect(X0, yt, X1 - X0, 9, 2, 2, "F");
  doc.setFillColor("#ffffff"); doc.rect(X0, yt + 6.75, X1 - X0, 2.5, "F");
  doc.setLineWidth(0.5); doc.setDrawColor(TINTA);
  doc.roundedRect(X0, yt, X1 - X0, 18, 2, 2, "S");
  doc.line(X0, yt + 6.75, X1, yt + 6.75);
  const cab = { estilo: "bold", tam: 8.5 };
  texto(doc, "Concepto", X0 + 3, yt + 4.6, cab);
  texto(doc, "Paquetes", cPaq, yt + 4.6, { ...cab, align: "center" });
  texto(doc, "Valor por paquete", cValor, yt + 4.6, { ...cab, align: "right" });
  texto(doc, "Total", cTotal, yt + 4.6, { ...cab, align: "right" });
  texto(doc, "Paquetes de chorizo artesanal", X0 + 3, yt + 12, { estilo: "bold", tam: 10.5 });
  texto(doc, CHORIZOS_POR_PAQUETE + " chorizos de 15 cm por paquete, al vacío", X0 + 3, yt + 16, { tam: 8.5, color: GRIS });
  texto(doc, String(d.paquetes), cPaq, yt + 13.2, { estilo: "bold", tam: 11, align: "center" });
  // El valor por paquete solo se muestra si el monto es parejo (no lo es cuando el pago incluye arreglos)
  const unitario = d.paquetes && d.monto % d.paquetes === 0 && d.monto / d.paquetes >= 1000 ? plata(d.monto / d.paquetes) : "—";
  texto(doc, unitario, cValor, yt + 13.2, { tam: 11, align: "right" });
  texto(doc, plata(d.monto), cTotal, yt + 13.2, { estilo: "bold", tam: 11, align: "right" });

  // Total en grande con sombra dura, y en letras
  const yT = y0 + 82, wT = 72, xT = X1 - wT;
  doc.setFillColor(TINTA); doc.roundedRect(xT + 1.2, yT + 1.2, wT, 12, 2.5, 2.5, "F");
  doc.setFillColor(MOSTAZA); doc.setLineWidth(0.7); doc.roundedRect(xT, yT, wT, 12, 2.5, 2.5, "FD");
  texto(doc, "Total pagado", xT + 4, yT + 7.6, { estilo: "bold", tam: 10 });
  texto(doc, plata(d.monto), X1 - 4, yT + 8.4, { fuente: "Luckiest", tam: 17, align: "right" });
  const anchoIzq = xT - X0 - 8;
  const letras = doc.setFont("Baloo", "normal").setFontSize(10).splitTextToSize("La suma de " + enLetras(d.monto) + " m/cte.", anchoIzq);
  texto(doc, letras, X0, yT + 4.5, { tam: 10, lineHeightFactor: 1.2 });
  if (d.nota) {
    const nota = doc.setFont("Baloo", "normal").setFontSize(8.5).splitTextToSize("Nota: " + d.nota, anchoIzq).slice(0, 2);
    texto(doc, nota, X0, yT + 4.5 + letras.length * 4.3 + 0.8, { tam: 8.5, color: GRIS, lineHeightFactor: 1.15 });
  }

  // Lo pagado a la fábrica hasta este recibo, para llevar la cuenta los dos
  const yH = y0 + 101;
  const totPaq = d.historial.reduce((t, x) => t + (Number(x.paquetes) || 0), 0);
  const totPlata = d.historial.reduce((t, x) => t + (Number(x.monto) || 0), 0);
  const ultimos = d.historial.slice(-4);
  const lista = ultimos.map((x) => fechaCorta(x.fecha) + ": " + x.paquetes + " paq. (" + plata(x.monto) + ")").join("   ·   ");
  const antes = d.historial.length - ultimos.length;
  texto(doc, "Pagos a la fábrica hasta este recibo", X0, yH, { estilo: "bold", tam: 8, color: OXIDO_OSCURO });
  texto(doc, (antes ? "… y " + antes + " antes.   " : "") + lista, X0, yH + 4.5, { tam: 8.5, maxWidth: X1 - X0 });
  texto(doc, "En total: " + d.historial.length + (d.historial.length === 1 ? " pago" : " pagos") + ", " + totPaq + " paquetes por " + plata(totPlata) + ".", X0, yH + 9, { estilo: "bold", tam: 8.5 });

  // Firmas
  const yF = y0 + 121, wF = 78;
  doc.setLineWidth(0.4); doc.setDrawColor(TINTA);
  doc.line(X0, yF, X0 + wF, yF);
  doc.line(X1 - wF, yF, X1, yF);
  texto(doc, "Entregó: Cerdísimo Chancho", X0, yF + 4, { estilo: "bold", tam: 8.5 });
  texto(doc, "Recibió: " + d.pagadoA, X1 - wF, yF + 4, { estilo: "bold", tam: 8.5 });
  texto(doc, "Nombre y C.C.", X0, yF + 7.6, { tam: 7.5, color: GRIS });
  texto(doc, "Nombre y C.C.", X1 - wF, yF + 7.6, { tam: 7.5, color: GRIS });
  const g = d.generado;
  texto(doc, "Hecho con la app de Cerdísimo Chancho el " + g.getDate() + "/" + (g.getMonth() + 1) + "/" + g.getFullYear() + ".", ANCHO / 2, y0 + 133.5, { tam: 6.5, color: GRIS, align: "center" });
}

function lineaDeCorte(doc) {
  doc.setDrawColor(GRIS); doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 1.6], 0);
  doc.line(6, MITAD, ANCHO - 6, MITAD);
  doc.setLineDashPattern([], 0);
  doc.setFont("Baloo", "normal"); doc.setFontSize(7.5);
  const w = doc.getTextWidth("Cortar aquí") + 6;
  doc.setFillColor("#ffffff"); doc.rect(ANCHO / 2 - w / 2, MITAD - 2.2, w, 4.4, "F");
  texto(doc, "Cortar aquí", ANCHO / 2, MITAD + 1, { tam: 7.5, color: GRIS, align: "center" });
}
