import { crearStore, sembrarSiHaceFalta, modoPrueba } from "../store.js";
import {
  PRODUCTOS, PRECIOS_BASE, SOCIOS, precios, calcularPedido, hoyISO, sumarDias, viernesDeEntrega, viernesActual,
  fechaLarga, fechaCorta, nombreMes, plata, leerPlata, resumenMes, saldos,
  enlaceGoogle, enlaceApple, enlaceWhatsApp, ordenarDesdeElNorte, ordenDeReparto, enlaceRutaGoogle,
  necesidadesEntrega, viernesConPedidos, ESTADOS, venceAlCorte, pasoElCorte, codigoPedido, saldoNequi, cuentaFabrica
} from "../negocio.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let store, correoSocio = "";
let datos = { clientes: [], pedidos: [], movimientos: [], config: [] };
const ui = { vista: "entregas", viernes: viernesActual(), viernesProd: null, mes: hoyISO().slice(0, 7) };

// ---------- Arranque ----------
async function iniciar() {
  if (modoPrueba) $("#aviso-prueba").hidden = false;
  try {
    store = await crearStore();
    const sesion = await store.iniciar(pedirLogin);
    if (!modoPrueba) { $("#salir").hidden = false; $("#salir").onclick = () => store.salir(); }
    correoSocio = (sesion.usuario && sesion.usuario.email) || "";
    let sembrado = false;
    store.escuchar(async (d, info) => {
      // Los pedidos cancelados (por el cliente o por el corte) no cuentan en ninguna pestaña
      cancelarVencidos(d.pedidos);
      datos = { ...d, pedidos: d.pedidos.filter((p) => p.estado !== "cancelado" && !venceAlCorte(p)) };
      if (!sembrado) {
        sembrado = true;
        try { if (await sembrarSiHaceFalta(store, d)) return; } catch (e) { console.error(e); }
      }
      $("#cargando").hidden = true;
      pintar();
      revisarAlertas(!info || info.alDia);
    });
    return sesion;
  } catch (e) {
    $("#cargando").textContent = e.message;
    console.error(e);
  }
}

// Pedidos de la app que siguen sin pagar al corte del jueves: se cancelan solos.
const cancelando = new Set();
function cancelarVencidos(pedidos) {
  const vencidos = pedidos.filter((p) => venceAlCorte(p) && !cancelando.has(p.id));
  if (!vencidos.length) return;
  vencidos.forEach((p) => cancelando.add(p.id));
  store.lote(vencidos.map((p) => ["actualizar", "pedidos", p.id, { estado: "cancelado", canceladoPor: "corte", canceladoEn: new Date().toISOString() }]))
    .catch((e) => { console.warn(e); vencidos.forEach((p) => cancelando.delete(p.id)); });
}

const esWeb = (p) => p && p.origen === "web";
// Lo que se produce: los pedidos creados aquí (pagados o no) y los de la app con pago aprobado
const confirmado = (p) => !esWeb(p) || !!p.pagado;

function pedirLogin(entrar) {
  const d = $("#d-login");
  d.showModal();
  return new Promise((res) => {
    $("#login-btn").onclick = async () => {
      try { const u = await entrar(); d.close(); res(u); }
      catch (e) { alert("No se pudo entrar: " + e.message); }
    };
  });
}

// Los botones "Cancelar" cierran su diálogo sin enviar el formulario (así Enter guarda)
document.querySelectorAll('dialog button[value="cancelar"]').forEach((b) => {
  b.type = "button";
  b.addEventListener("click", () => b.closest("dialog").close());
});

// ---------- Navegación ----------
document.querySelectorAll(".pestanas button").forEach((b) => {
  b.addEventListener("click", () => {
    ui.vista = b.dataset.vista;
    document.querySelectorAll(".pestanas button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    pintar();
  });
});

function pintar() {
  ["entregas", "contabilidad", "clientes", "produccion"].forEach((v) => { $("#vista-" + v).hidden = v !== ui.vista; });
  if (ui.vista === "entregas") pintarEntregas();
  if (ui.vista === "contabilidad") pintarContabilidad();
  if (ui.vista === "clientes") pintarClientes();
  if (ui.vista === "produccion") pintarProduccion();
}

const cliente = (id) => datos.clientes.find((c) => c.id === id);
const tienePin = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";

// =====================================================================
// 1. ENTREGAS
// =====================================================================
let mapa, capaPines;

function iniciarMapa() {
  if (mapa || !window.L) return;
  mapa = L.map("mapa", { scrollWheelZoom: false }).setView([6.2442, -75.5812], 12); // Medellín
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap"
  }).addTo(mapa);
  capaPines = L.layerGroup().addTo(mapa);
}

function icono(clase, texto) {
  return L.divIcon({ className: "", html: '<div class="pin ' + clase + '"><span>' + esc(texto) + "</span></div>", iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
}

$("#v-ant").onclick = () => { ui.viernes = sumarDias(ui.viernes, -7); pintarEntregas(); };
$("#v-sig").onclick = () => { ui.viernes = sumarDias(ui.viernes, 7); pintarEntregas(); };

function tarjetaPedido(p, n) {
  const c = cliente(p.clienteId) || {};
  const nombre = c.nombre || p.clienteNombre;
  const color = p.pagado ? "verde" : "rojo";
  const dir = c.direccion
    ? esc(c.direccion) + (c.notas ? " · " + esc(c.notas) : "")
    : '<span class="sin-dir">Sin dirección</span>';
  const mapas = tienePin(c)
    ? '<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="' + enlaceGoogle(c) + '">Google Maps</a>' +
      '<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="' + enlaceApple(c) + '">Mapas de iPhone</a>'
    : "";
  const tel = c.telefono
    ? '<a class="enlace" href="tel:' + esc(c.telefono.replace(/\s/g, "")) + '">' + esc(c.telefono) + '</a> · <a class="enlace" target="_blank" rel="noopener" href="' + enlaceWhatsApp(c.telefono) + '">WhatsApp</a>'
    : '<span class="sin-dir">Sin teléfono</span>';
  const web = esWeb(p);
  const estadoTxt = p.pagado ? "Pagado" : web ? ESTADOS[p.estado] || "Por pagar" : "Pendiente de pago";
  const pagoWeb = web
    ? '<p class="pago-web"><span class="tag app">App · ' + codigoPedido(p) + "</span> " +
      (p.comprobante ? "Traslado a nombre de: <strong>" + esc(p.comprobante) + "</strong>" : p.pagado ? "" : "El cliente aún no reporta el pago.") +
      (p.estado === "rechazado" && p.notaPago ? " · Rechazado: " + esc(p.notaPago) : "") + "</p>"
    : "";
  const aviso = web && c.telefono ? avisoWhatsApp(p, c) : "";
  const botonPago = web && !p.pagado
    ? '<button class="btn btn-chico" data-acc="aprobar" data-id="' + p.id + '">Aprobar pago</button>' +
      (p.estado === "por_verificar" ? '<button class="btn btn-sec btn-chico" data-acc="rechazar" data-id="' + p.id + '">Rechazar</button>' : "")
    : '<button class="btn btn-chico" data-acc="pagado" data-id="' + p.id + '">' + (p.pagado ? "Marcar sin pagar" : "Marcar pagado") + "</button>";
  return '<article class="pedido ' + (p.pagado ? "pagado" : "pendiente") + (p.entregado ? " entregado" : "") + '" data-pedido="' + esc(p.id) + '">' +
    '<div class="pedido-cab">' + (n ? '<span class="pedido-num">' + n + "</span>" : "") +
    '<p class="pedido-nombre">' + esc(nombre) + "</p>" +
    '<span class="estado ' + color + '">' + estadoTxt + "</span>" +
    '<span class="pedido-total">' + plata(p.total) + "</span></div>" +
    "<p>" + esc(p.resumen) + (p.domi ? " + domi " + plata(p.domi) : p.recoge ? " · lo recoge" : " · domi gratis") +
    (p.entregado ? " · <strong>Entregado</strong>" : "") + "</p>" +
    pagoWeb +
    "<p>" + dir + "</p><p>" + tel + "</p>" +
    (p.notas ? "<p><em>" + esc(p.notas) + "</em></p>" : "") +
    '<div class="pedido-acc">' +
    botonPago + aviso +
    '<button class="btn btn-sec btn-chico" data-acc="entregado" data-id="' + p.id + '">' + (p.entregado ? "No entregado" : "Entregado") + "</button>" +
    mapas +
    '<button class="btn btn-sec btn-chico" data-acc="editar" data-id="' + p.id + '">Editar</button>' +
    (c.id ? '<button class="btn btn-sec btn-chico" data-acc="cliente" data-id="' + c.id + '">' + (c.direccion ? "Datos del cliente" : "Agregar dirección") + "</button>" : "") +
    "</div></article>";
}

// Mensaje listo para avisarle al cliente por WhatsApp según el estado de su pedido
function avisoWhatsApp(p, c) {
  const nombre = (c.nombre || p.clienteNombre || "").split(" ")[0];
  const texto = p.pagado
    ? "Hola " + nombre + ", tu pago del pedido " + codigoPedido(p) + " fue aprobado. Te llega el " + fechaLarga(p.fechaEntrega) + ". ¡Gracias por pedirle a Cerdísimo Chancho!"
    : p.estado === "rechazado"
      ? "Hola " + nombre + ", no encontramos el pago del pedido " + codigoPedido(p) + " por " + plata(p.total) + ". ¿Nos mandas la captura del comprobante de Nequi?"
      : "Hola " + nombre + ", recibimos tu pedido " + codigoPedido(p) + " por " + plata(p.total) + ". Apenas nos llegue el pago a Nequi lo aprobamos.";
  return '<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="' + enlaceWhatsApp(c.telefono, texto) + '">Avisar por WhatsApp</a>';
}

function pintarEntregas() {
  iniciarMapa();
  const v = ui.viernes;
  $("#v-titulo").textContent = fechaLarga(v);
  const delDia = datos.pedidos.filter((p) => p.fechaEntrega === v)
    .sort((a, b) => (!!a.entregado - !!b.entregado) || (a.clienteNombre || "").localeCompare(b.clienteNombre || ""));
  const paquetes = delDia.reduce((t, p) => t + (p.paquetes || 0), 0);
  const litros = delDia.reduce((t, p) => t + (p.litros || 0), 0);
  const cobrado = delDia.filter((p) => p.pagado).reduce((t, p) => t + p.total, 0);
  const porCobrar = delDia.filter((p) => !p.pagado).reduce((t, p) => t + p.total, 0);
  const porVerificar = delDia.filter((p) => esWeb(p) && p.estado === "por_verificar").length;
  $("#v-resumen").innerHTML =
    (porVerificar ? '<span class="chip app">' + porVerificar + " por verificar pago</span>" : "") +
    '<span class="chip rust">' + delDia.length + " pedidos</span>" +
    '<span class="chip">' + paquetes + " paquetes</span>" +
    (litros ? '<span class="chip">' + litros + " L de aguardiente</span>" : "") +
    '<span class="chip verde">Pagado ' + plata(cobrado) + "</span>" +
    '<span class="chip rojo">Por cobrar ' + plata(porCobrar) + "</span>";

  // Paradas con pin en orden de reparto, numeradas igual en la lista y el mapa. El número no
  // cambia al marcar entregas; solo se reordena con "Actualizar puntos".
  const conPin = paradasDelViernes(v);
  const reparto = ordenDeReparto(conPin, v);
  const sueltas = reparto.sueltas;
  const numero = new Map(), lugar = new Map();
  reparto.orden.forEach((x, i) => {
    lugar.set(x.pedido.id, i);
    if (!x.pedido.entregado) numero.set(x.pedido.id, reparto.numero.get(x.pedido.id));
  });
  const ruta = reparto.orden.filter((x) => !x.pedido.entregado);

  if (capaPines) {
    capaPines.clearLayers();
    conPin.forEach((x) => {
      const p = x.pedido;
      const n = numero.get(p.id) || "✓";
      L.marker([x.lat, x.lng], { icon: icono(p.pagado ? "verde" : "rojo", n) })
        .bindPopup("<strong>" + esc(x.nombre) + "</strong><br>" + esc(p.resumen) + " · " + plata(p.total) +
          "<br>" + (p.pagado ? "Pagado" : "Pendiente de pago") +
          '<br><a target="_blank" rel="noopener" href="' + enlaceGoogle(x) + '">Google Maps</a> · <a target="_blank" rel="noopener" href="' + enlaceApple(x) + '">Mapas de iPhone</a>')
        .addTo(capaPines);
    });
    const limites = conPin.length ? L.latLngBounds(conPin.map((x) => [x.lat, x.lng])).pad(0.25) : null;
    // El mapa se mide después de mostrarse la vista; se encuadra con su tamaño real
    setTimeout(() => { mapa.invalidateSize(); if (limites) mapa.fitBounds(limites, { maxZoom: 15 }); }, 60);
  }

  const urlRuta = enlaceRutaGoogle(ruta);
  const rg = $("#ruta-google");
  if (urlRuta) { rg.href = urlRuta; rg.removeAttribute("aria-disabled"); } else { rg.removeAttribute("href"); rg.setAttribute("aria-disabled", "true"); }
  rg.textContent = ruta.length > 10 ? "Ruta en Google Maps (primeras 10)" : "Ruta en Google Maps";
  const ap = $("#actualizar-puntos");
  ap.disabled = !conPin.length;
  $("#ruta-nota").textContent = sueltas
    ? (sueltas === 1 ? "Hay 1 punto nuevo o movido" : "Hay " + sueltas + " puntos nuevos o movidos") +
      " al final de la ruta: toca «Actualizar puntos» para reordenar."
    : "";

  const faltan = delDia.filter((p) => !p.recoge && !tienePin(cliente(p.clienteId)));
  $("#sin-pin").textContent = faltan.length
    ? faltan.length + (faltan.length === 1 ? " pedido no tiene" : " pedidos no tienen") + " pin en el mapa: agrega su dirección en Clientes."
    : "";

  $("#v-lista").innerHTML = delDia.length
    ? delDia.slice().sort((a, b) => (!!a.entregado - !!b.entregado) || ((lugar.get(a.id) ?? 1e9) - (lugar.get(b.id) ?? 1e9)))
      .map((p) => tarjetaPedido(p, numero.get(p.id))).join("")
    : '<p class="nota">No hay pedidos para este viernes.</p>';

  const atrasados = datos.pedidos.filter((p) => p.fechaEntrega < v && (!p.entregado || !p.pagado) && v === viernesActual());
  $("#v-atrasados").innerHTML = atrasados.length
    ? '<h2 class="seccion">De viernes anteriores (sin entregar o sin pagar)</h2><div class="lista">' +
      atrasados.sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega)).map((p) => tarjetaPedido(p)).join("") + "</div>"
    : "";
}

// Pedidos del viernes que van a domicilio y cuyo cliente tiene pin, como paradas del mapa
function paradasDelViernes(v) {
  return datos.pedidos.filter((p) => p.fechaEntrega === v && !p.recoge && tienePin(cliente(p.clienteId)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({ ...cliente(p.clienteId), pedido: p }));
}

// Guarda el orden de reparto del viernes: desde el pin más al norte y luego el más cercano.
// Queda guardado en cada pedido para que Daniel y Mariana vean los mismos números.
$("#actualizar-puntos").addEventListener("click", async () => {
  const b = $("#actualizar-puntos");
  const v = ui.viernes;
  const paradas = ordenarDesdeElNorte(paradasDelViernes(v));
  const ids = new Set(paradas.map((x) => x.pedido.id));
  const cambios = paradas
    .map((x, i) => ({ id: x.pedido.id, antes: x.pedido.ruta, ruta: { viernes: v, orden: i + 1, lat: x.lat, lng: x.lng } }))
    .filter((c) => !c.antes || ["viernes", "orden", "lat", "lng"].some((k) => c.antes[k] !== c.ruta[k]))
    .map((c) => ["actualizar", "pedidos", c.id, { ruta: c.ruta }])
    // Pedidos que tenían lugar en esta ruta y ya no son parada (cambiaron de viernes, los
    // recogen o se quedaron sin pin): se les quita para que no choquen si vuelven
    .concat(datos.pedidos.filter((p) => p.ruta && p.ruta.viernes === v && !ids.has(p.id))
      .map((p) => ["actualizar", "pedidos", p.id, { ruta: null }]));
  clearTimeout(b._listo);
  b.textContent = "Puntos actualizados ✓";
  b._listo = setTimeout(() => { b.textContent = "Actualizar puntos"; }, 2500);
  try { if (cambios.length) await store.lote(cambios); }
  catch (e) { clearTimeout(b._listo); b.textContent = "Actualizar puntos"; alert("No se pudieron actualizar los puntos: " + e.message); }
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-acc]");
  if (!b) return;
  const id = b.dataset.id;
  const p = datos.pedidos.find((x) => x.id === id);
  if (b.dataset.acc === "pagado" && p) {
    await store.actualizar("pedidos", id, esWeb(p)
      ? { pagado: !p.pagado, estado: p.pagado ? "por_verificar" : "aprobado" }
      : { pagado: !p.pagado });
  }
  if (b.dataset.acc === "aprobar" && p) await aprobarPago(p);
  if (b.dataset.acc === "rechazar" && p) {
    const nota = prompt("¿Por qué se rechaza? El cliente lo ve en su app.", "No vemos el pago en Nequi");
    if (nota !== null) await store.actualizar("pedidos", id, { estado: "rechazado", notaPago: nota.trim(), rechazadoEn: new Date().toISOString() });
  }
  if (b.dataset.acc === "entregado" && p) await store.actualizar("pedidos", id, { entregado: !p.entregado });
  if (b.dataset.acc === "editar" && p) abrirPedido(p);
  if (b.dataset.acc === "cliente") abrirCliente(cliente(id));
  if (b.dataset.acc === "borrar-mov" && confirm("¿Borrar este movimiento?")) await store.borrar("movimientos", id);
  if (b.dataset.acc === "borrar-pedido" && p && confirm("¿Borrar el pedido de " + p.clienteNombre + "?")) await store.borrar("pedidos", id);
});

// Aprobar el pago de un pedido de la app. Recalcula el total con los precios vigentes por si el
// pedido llegó con un valor distinto (precios cambiados o un pedido manipulado).
async function aprobarPago(p) {
  const real = calcularPedido(p.items || {}, precios(datos), !!p.recoge);
  let msg = "¿Aprobar el pago de " + p.clienteNombre + " (" + codigoPedido(p) + ") por " + plata(p.total) + "?" +
    (p.comprobante ? "\nTraslado a nombre de: " + p.comprobante + "\nRevisa en Nequi que entró un traslado de ese nombre por ese valor." : "\nEl cliente aún no reporta el pago.");
  if (real.total !== p.total) msg += "\n\nOjo: con los precios de hoy este pedido vale " + plata(real.total) + ". Revisa cuánto llegó a Nequi.";
  if (!confirm(msg)) return;
  await store.actualizar("pedidos", p.id, { pagado: true, estado: "aprobado", aprobadoEn: new Date().toISOString(), aprobadoPor: correoSocio });
}

// ---------- Alertas de pagos ----------
// La campanita cuenta los pedidos de la tienda con el pago reportado y sin revisar, de cualquier
// viernes. Si un cliente reporta un pago con la administración abierta, suena y sale un aviso.
const TITULO = document.title;
const reportesVistos = new Map(); // id del pedido → reportadoEn que ya se vio en esta pestaña
let alertasListas = false;

const porRevisar = () => datos.pedidos.filter((p) => esWeb(p) && p.estado === "por_verificar")
  .sort((a, b) => String(a.reportadoEn || "").localeCompare(String(b.reportadoEn || "")));

function revisarAlertas(alDia) {
  const lista = porRevisar();
  // Solo es nuevo si cambió reportadoEn: así no suena cuando un socio desmarca un pago aprobado
  const nuevos = lista.filter((p) => p.reportadoEn && reportesVistos.get(p.id) !== p.reportadoEn);
  datos.pedidos.forEach((p) => { if (p.reportadoEn) reportesVistos.set(p.id, p.reportadoEn); });
  pintarCampana(lista.length);
  if ($("#d-alertas").open) pintarAlertas();
  if (alertasListas && nuevos.length) avisarPago(nuevos);
  datosAlDia = alDia;
  if (!alertasListas) { alertasListas = true; leerEnlace(); }
  atenderEnlace();
}

function pintarCampana(n) {
  const b = $("#alertas");
  const texto = n === 1 ? "1 pago por revisar" : n + " pagos por revisar";
  b.hidden = false;
  b.classList.toggle("hay", n > 0);
  $("#alertas-t").textContent = texto;
  $("#alertas-n").textContent = n;
  b.setAttribute("aria-label", n ? texto : "Alertas de pagos: no hay pagos por revisar");
  document.title = (n ? "(" + n + ") " : "") + TITULO;
  // Número sobre el ícono de la pantalla de inicio, donde el teléfono lo permita
  if ("setAppBadge" in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

function pintarAlertas() {
  const lista = porRevisar();
  $("#alertas-lista").innerHTML = lista.length
    ? lista.map((p) => {
      const c = cliente(p.clienteId) || {};
      return '<article class="alerta">' +
        '<div class="pedido-cab"><p class="pedido-nombre">' + esc(c.nombre || p.clienteNombre) + "</p>" +
        '<span class="pedido-total">' + plata(p.total) + "</span></div>" +
        '<p class="pago-web"><span class="tag app">App · ' + codigoPedido(p) + "</span> Traslado a nombre de: <strong>" + esc(p.comprobante || "—") + "</strong></p>" +
        '<p class="nota">Reportado ' + hace(p.reportadoEn) + " · Entrega el " + fechaLarga(p.fechaEntrega) + "</p>" +
        '<div class="pedido-acc">' +
        '<button class="btn btn-chico" data-acc="aprobar" data-id="' + esc(p.id) + '">Aprobar pago</button>' +
        '<button class="btn btn-sec btn-chico" data-acc="rechazar" data-id="' + esc(p.id) + '">Rechazar</button>' +
        '<button class="btn btn-sec btn-chico" data-ir="' + esc(p.id) + '">Ver pedido</button>' +
        "</div></article>";
    }).join("")
    : '<p class="nota fuerte">Todo al día: no hay pagos por revisar.</p>';
}

function hace(iso) {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (!iso || isNaN(min)) return "";
  if (min < 1) return "hace un momento";
  if (min < 60) return "hace " + min + " min";
  if (min < 24 * 60) { const h = Math.floor(min / 60); return "hace " + h + (h === 1 ? " hora" : " horas"); }
  return "el " + new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long" });
}

function avisarPago(nuevos) {
  const p = nuevos[nuevos.length - 1];
  const c = cliente(p.clienteId) || {};
  const t = $("#toast");
  t.innerHTML = '<button class="toast-abrir" type="button"><strong>' +
    (nuevos.length > 1 ? nuevos.length + " pagos nuevos por revisar" : "Entró un pago por revisar") + "</strong>" +
    "<span>" + esc(c.nombre || p.clienteNombre) + " · " + plata(p.total) + " · " + codigoPedido(p) + "</span>" +
    '<span class="toast-ir">Revisar ›</span></button>' +
    '<button class="toast-x" type="button" aria-label="Cerrar aviso">×</button>';
  t.hidden = false;
  clearTimeout(t._fin);
  t._fin = setTimeout(() => { t.hidden = true; }, 30000);
  const b = $("#alertas");
  b.classList.remove("timbre");
  void b.offsetWidth; // reinicia la animación si ya estaba sonando
  b.classList.add("timbre");
  sonar();
  if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
}

// Timbre corto de dos notas. El navegador solo deja sonar después de un toque en la página; sin
// ese toque no suena (si se programara igual, quedaría en cola y sonaría tarde, al primer toque).
let audio;
try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin audio */ }
function desbloquearAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== "running") audio.resume();
  } catch (e) { /* sin audio */ }
}
["pointerup", "touchend", "keydown"].forEach((ev) => document.addEventListener(ev, desbloquearAudio));
function sonar() {
  if (!audio || audio.state !== "running") return;
  try {
    const a = audio;
    [880, 1318.5].forEach((f, i) => {
      const t0 = a.currentTime + i * 0.2;
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(a.destination);
      o.start(t0); o.stop(t0 + 0.65);
    });
  } catch (e) { /* sin audio */ }
}

function abrirAlertas() {
  $("#toast").hidden = true;
  pintarAlertas();
  if (!$("#d-alertas").open) $("#d-alertas").showModal();
}

// Lleva a Entregas en el viernes del pedido y lo resalta
function irAPedido(id) {
  const p = datos.pedidos.find((x) => x.id === id);
  if (!p || !p.fechaEntrega) return;
  if ($("#d-alertas").open) $("#d-alertas").close();
  $("#toast").hidden = true;
  ui.vista = "entregas";
  ui.viernes = p.fechaEntrega;
  document.querySelectorAll(".pestanas button").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.vista === "entregas")));
  pintar();
  const tarjeta = $('#v-lista [data-pedido="' + CSS.escape(id) + '"]');
  if (!tarjeta) return;
  tarjeta.scrollIntoView({ behavior: "smooth", block: "center" });
  tarjeta.classList.add("resaltado");
  setTimeout(() => tarjeta.classList.remove("resaltado"), 2600);
}

// El correo de aviso enlaza a /admin/#pedido=ID para abrir ese pago directo. Los primeros datos
// pueden venir de la memoria del teléfono, sin el pedido o sin el pago reportado: si no está por
// revisar, se decide cuando lleguen los del servidor (o a los 8 s, si no hay internet).
let enlace = null, datosAlDia = false;
function leerEnlace() {
  const m = location.hash.match(/^#pedido=([A-Za-z0-9_-]+)$/);
  if (m) { soltarEnlace(); enlace = { id: m[1], hasta: Date.now() + 8000 }; }
}
function soltarEnlace() {
  if (!enlace) return;
  clearTimeout(enlace.espera);
  enlace = null;
  history.replaceState(null, "", location.pathname + location.search);
}
function atenderEnlace() {
  if (!enlace) return;
  const p = datos.pedidos.find((x) => x.id === enlace.id);
  const porRevisarYa = p && p.estado === "por_verificar";
  clearTimeout(enlace.espera);
  if (!porRevisarYa && !datosAlDia && Date.now() < enlace.hasta) {
    enlace.espera = setTimeout(atenderEnlace, enlace.hasta - Date.now());
    return;
  }
  soltarEnlace();
  if (porRevisarYa) abrirAlertas();
  else if (p) irAPedido(p.id);
  else mensaje("No encontré ese pedido. Puede que lo hayan cancelado.");
}
window.addEventListener("hashchange", () => { if (alertasListas) { leerEnlace(); atenderEnlace(); } });
// Si mientras tanto la persona ya hizo otra cosa, el enlace no le cambia la pantalla después
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, soltarEnlace));

function mensaje(texto) {
  const t = $("#toast");
  t.innerHTML = '<p class="toast-msg">' + esc(texto) + '</p><button class="toast-x" type="button" aria-label="Cerrar aviso">×</button>';
  t.hidden = false;
  clearTimeout(t._fin);
  t._fin = setTimeout(() => { t.hidden = true; }, 12000);
}

$("#alertas").addEventListener("click", abrirAlertas);
$("#toast").addEventListener("click", (e) => {
  if (e.target.closest(".toast-x")) $("#toast").hidden = true;
  else if (e.target.closest(".toast-abrir")) abrirAlertas();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ir]");
  if (b) irAPedido(b.dataset.ir);
});

// ---------- Crear / editar pedido ----------
let pedidoEditando = null;
const cantidades = {};

function pintarProductos() {
  const p = precios(datos);
  $("#p-productos").innerHTML = '<legend class="etq">¿Qué pidió?</legend>' + PRODUCTOS.map((prod) =>
    '<div class="prod' + (cantidades[prod.id] ? " activo" : "") + '"><div class="prod-n">' + prod.nombre + " · " + plata(p[prod.precio]) +
    "<small>" + prod.detalle + '</small></div><div class="stepper">' +
    '<button type="button" data-paso="-1" data-prod="' + prod.id + '" aria-label="Quitar ' + prod.nombre + '">−</button>' +
    "<output>" + (cantidades[prod.id] || 0) + "</output>" +
    '<button type="button" data-paso="1" data-prod="' + prod.id + '" aria-label="Agregar ' + prod.nombre + '">+</button></div></div>'
  ).join("");
  actualizarTotal();
}

$("#p-productos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-paso]");
  if (!b) return;
  const id = b.dataset.prod;
  cantidades[id] = Math.max(0, (cantidades[id] || 0) + Number(b.dataset.paso));
  pintarProductos();
});

const precioDelPedido = () => precios(datos);

function actualizarTotal() {
  const c = calcularPedido(cantidades, precioDelPedido(), $("#p-recoge").checked);
  $("#p-total").innerHTML = c.paquetes
    ? "Total a cobrar: <strong>" + plata(c.total) + "</strong><br>" + c.paquetes + " paquetes" + (c.litros ? " + " + c.litros + " L" : "") +
      (c.domi ? " · incluye domi de " + plata(c.domi) : $("#p-recoge").checked ? " · lo recoge" : " · domi gratis")
    : "Agrega al menos un producto.";
}
$("#p-recoge").onchange = actualizarTotal;

function buscarCliente(nombre) {
  const n = norm(nombre);
  return datos.clientes.find((c) => norm(c.nombre) === n);
}

$("#p-cliente").addEventListener("input", () => {
  const c = buscarCliente($("#p-cliente").value);
  const escrito = $("#p-cliente").value.trim();
  $("#p-nuevo").hidden = !!c || !escrito || !!pedidoEditando;
  $("#p-cliente-info").textContent = c
    ? (c.direccion ? c.direccion : "Sin dirección") + (c.telefono ? " · " + c.telefono : "")
    : "";
});

$("#p-fecha").addEventListener("change", () => {
  if ($("#p-fecha").value) $("#p-entrega").value = viernesDeEntrega($("#p-fecha").value);
});

$("#btn-crear").onclick = () => abrirPedido(null);

function abrirPedido(p) {
  pedidoEditando = p;
  Object.keys(cantidades).forEach((k) => delete cantidades[k]);
  if (p && p.items) Object.assign(cantidades, p.items);
  $("#d-pedido-t").textContent = p ? "Editar pedido" : "Crear pedido";
  $("#lista-clientes").innerHTML = datos.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((c) => '<option value="' + esc(c.nombre) + '">').join("");
  const c = p ? cliente(p.clienteId) : null;
  $("#p-cliente").value = p ? (c ? c.nombre : p.clienteNombre) : "";
  $("#p-cliente").disabled = !!p;
  $("#p-tel").value = ""; $("#p-dir").value = "";
  const hoy = hoyISO();
  $("#p-fecha").value = p ? p.fechaPedido : hoy;
  $("#p-entrega").value = p ? p.fechaEntrega : (viernesDeEntrega(hoy) === ui.viernes || ui.viernes > hoy ? ui.viernes : viernesDeEntrega(hoy));
  $("#p-recoge").checked = !!(p && p.recoge);
  $("#p-pagado").checked = !!(p && p.pagado);
  $("#p-notas").value = p ? p.notas || "" : "";
  $("#p-error").textContent = "";
  $("#p-cliente").dispatchEvent(new Event("input"));
  let borrar = $("#p-borrar");
  if (!borrar) {
    borrar = document.createElement("button");
    borrar.type = "button"; borrar.id = "p-borrar"; borrar.className = "btn btn-peligro btn-chico"; borrar.textContent = "Borrar";
    $("#f-pedido .botonera").prepend(borrar);
  }
  borrar.hidden = !p;
  borrar.onclick = async () => {
    if (!confirm("¿Borrar el pedido de " + p.clienteNombre + "?")) return;
    await store.borrar("pedidos", p.id);
    $("#d-pedido").close();
  };
  pintarProductos();
  $("#d-pedido").showModal();
}

$("#f-pedido").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancelar") return;
  e.preventDefault();
  const err = $("#p-error");
  const nombre = $("#p-cliente").value.trim();
  const items = {};
  PRODUCTOS.forEach((x) => { if (cantidades[x.id]) items[x.id] = cantidades[x.id]; });
  const recoge = $("#p-recoge").checked;
  const calc = calcularPedido(items, precioDelPedido(), recoge);
  if (!nombre) { err.textContent = "Escribe el nombre del cliente."; return; }
  if (!calc.paquetes) { err.textContent = "Agrega al menos un producto."; return; }
  const btn = $("#p-guardar"); btn.disabled = true;
  try {
    const base = {
      fechaPedido: $("#p-fecha").value, fechaEntrega: $("#p-entrega").value,
      items, recoge, ...calc, pagado: $("#p-pagado").checked, notas: $("#p-notas").value.trim()
    };
    if (pedidoEditando) {
      // Si no cambió lo pedido, se conservan los precios con que se creó
      const igual = PRODUCTOS.every((x) => Number((pedidoEditando.items || {})[x.id] || 0) === Number(items[x.id] || 0)) && !!pedidoEditando.recoge === recoge;
      if (igual) Object.keys(calc).forEach((k) => delete base[k]);
      if (esWeb(pedidoEditando) && base.pagado !== !!pedidoEditando.pagado) base.estado = base.pagado ? "aprobado" : "por_verificar";
      await store.actualizar("pedidos", pedidoEditando.id, base);
    } else {
      let c = buscarCliente(nombre);
      let nuevoId = null;
      if (!c) {
        const nuevo = { nombre, telefono: $("#p-tel").value.trim(), direccion: $("#p-dir").value.trim(), notas: "", lat: null, lng: null, creado: hoyISO() };
        nuevoId = await store.agregar("clientes", nuevo);
        c = { ...nuevo, id: nuevoId };
      }
      await store.agregar("pedidos", { ...base, clienteId: c.id, clienteNombre: c.nombre, entregado: false, creado: hoyISO() });
      if (nuevoId && c.direccion) ubicarYGuardar(c);
    }
    $("#d-pedido").close();
  } catch (x) {
    err.textContent = "No se pudo guardar: " + x.message;
  } finally { btn.disabled = false; }
});

// =====================================================================
// Geocodificación (OpenStreetMap / Nominatim)
// =====================================================================
function ciudad() {
  const app = datos.config.find((c) => c.id === "precios");
  return (app && app.ciudad) || "Medellín";
}
async function geocodificar(direccion) {
  const limpia = direccion.replace(/#/g, " ").replace(/\s+/g, " ").trim();
  const intentos = [limpia + ", " + ciudad() + ", Colombia", limpia];
  for (const q of intentos) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co&accept-language=es&q=" + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) continue;
    const j = await r.json();
    if (j.length) return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  }
  return null;
}
async function ubicarYGuardar(c) {
  try {
    const pos = await geocodificar(c.direccion);
    if (pos) await store.actualizar("clientes", c.id, pos);
  } catch (e) { console.warn(e); }
}

// =====================================================================
// 3. CLIENTES
// =====================================================================
function estadisticas(c) {
  const ps = datos.pedidos.filter((p) => p.clienteId === c.id).sort((a, b) => a.fechaPedido.localeCompare(b.fechaPedido));
  const gastado = ps.reduce((t, p) => t + (p.total || 0), 0);
  const paquetes = ps.reduce((t, p) => t + (p.paquetes || 0), 0);
  let cada = null;
  if (ps.length > 1) {
    const dias = (new Date(ps[ps.length - 1].fechaPedido) - new Date(ps[0].fechaPedido)) / 86400000;
    cada = Math.round(dias / (ps.length - 1));
  }
  return { pedidos: ps.length, gastado, paquetes, ultimo: ps.length ? ps[ps.length - 1].fechaPedido : "", cada, debe: ps.filter((p) => !p.pagado).reduce((t, p) => t + p.total, 0) };
}

$("#cl-buscar").oninput = pintarClientes;
$("#cl-orden").onchange = pintarClientes;
$("#btn-cliente-nuevo").onclick = () => abrirCliente(null);

function pintarClientes() {
  const q = norm($("#cl-buscar").value);
  const orden = $("#cl-orden").value;
  let filas = datos.clientes.map((c) => ({ c, e: estadisticas(c) }))
    .filter(({ c }) => !q || norm(c.nombre + " " + c.telefono + " " + c.direccion).includes(q));
  const cmp = {
    nombre: (a, b) => a.c.nombre.localeCompare(b.c.nombre),
    pedidos: (a, b) => b.e.pedidos - a.e.pedidos || b.e.gastado - a.e.gastado,
    gastado: (a, b) => b.e.gastado - a.e.gastado,
    reciente: (a, b) => b.e.ultimo.localeCompare(a.e.ultimo)
  }[orden];
  filas.sort(cmp);
  const sinDir = datos.clientes.filter((c) => !tienePin(c)).length;
  const recurrentes = datos.clientes.filter((c) => estadisticas(c).pedidos > 1).length;
  $("#cl-resumen").innerHTML = '<span class="chip rust">' + datos.clientes.length + " clientes</span>" +
    '<span class="chip">' + recurrentes + " repiten</span>" +
    (sinDir ? '<span class="chip rojo">' + sinDir + " sin pin</span>" : "");
  $("#cl-tabla").innerHTML = "<thead><tr><th>Cliente</th><th>Teléfono</th><th>Dirección</th><th class=num>Pedidos</th><th class=num>Paquetes</th><th class=num>Compras</th><th>Último pedido</th><th>Frecuencia</th></tr></thead><tbody>" +
    (filas.length ? filas.map(({ c, e }) =>
      '<tr data-acc="cliente" data-id="' + c.id + '"><td><strong>' + esc(c.nombre) + "</strong>" + (e.debe ? '<br><span class="tag rojo">Debe ' + plata(e.debe) + "</span>" : "") + "</td>" +
      "<td>" + (c.telefono ? esc(c.telefono) : '<span class="sin-dir">—</span>') + "</td>" +
      "<td>" + (c.direccion ? esc(c.direccion) + (tienePin(c) ? ' <span class="tag verde">pin</span>' : ' <span class="tag rojo">sin pin</span>') : '<span class="sin-dir">Agregar</span>') + "</td>" +
      '<td class="num">' + e.pedidos + '</td><td class="num">' + e.paquetes + '</td><td class="num">' + plata(e.gastado) + "</td>" +
      "<td>" + fechaCorta(e.ultimo) + "</td><td>" + (e.cada === null ? (e.pedidos ? "Primera compra" : "—") : "Cada " + e.cada + " días") + "</td></tr>"
    ).join("") : '<tr class="vacia"><td colspan="8">No hay clientes con esa búsqueda.</td></tr>') + "</tbody>";
}

// ---------- Editar cliente ----------
let clienteEditando = null, mapaCliente, pinCliente, posCliente = null, pinManual = false;

function ponerPin(lat, lng, manual) {
  posCliente = { lat, lng };
  if (manual) pinManual = true;
  if (!pinCliente) {
    pinCliente = L.marker([lat, lng], { draggable: true, icon: icono("neutro", "") }).addTo(mapaCliente);
    pinCliente.on("dragend", () => { const p = pinCliente.getLatLng(); ponerPin(p.lat, p.lng, true); });
  } else pinCliente.setLatLng([lat, lng]);
  mapaCliente.setView([lat, lng], Math.max(mapaCliente.getZoom(), 16));
  $("#k-estado").textContent = manual ? "Pin ajustado a mano." : "Pin ubicado.";
}

function abrirCliente(c) {
  clienteEditando = c;
  $("#d-cliente-t").textContent = c ? c.nombre : "Cliente nuevo";
  $("#k-nombre").value = c ? c.nombre : "";
  $("#k-tel").value = c ? c.telefono || "" : "";
  $("#k-dir").value = c ? c.direccion || "" : "";
  $("#k-notas").value = c ? c.notas || "" : "";
  $("#k-error").textContent = ""; $("#k-estado").textContent = "";
  $("#k-borrar").hidden = !c;
  posCliente = null; pinManual = false;
  $("#d-cliente").showModal();
  if (window.L) {
    if (!mapaCliente) {
      mapaCliente = L.map("k-mapa").setView([6.2442, -75.5812], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapaCliente);
      mapaCliente.on("click", (e) => ponerPin(e.latlng.lat, e.latlng.lng, true));
    }
    if (pinCliente) { pinCliente.remove(); pinCliente = null; }
    setTimeout(() => {
      mapaCliente.invalidateSize();
      if (tienePin(c)) { ponerPin(c.lat, c.lng, false); $("#k-estado").textContent = "Este cliente ya tiene pin."; }
      else mapaCliente.setView([6.2442, -75.5812], 12);
    }, 60);
  }
}

$("#k-buscar").onclick = async () => {
  const dir = $("#k-dir").value.trim();
  if (!dir) { $("#k-estado").textContent = "Escribe la dirección primero."; return; }
  $("#k-estado").textContent = "Buscando…";
  try {
    const pos = await geocodificar(dir);
    if (pos) { pinManual = false; ponerPin(pos.lat, pos.lng, false); }
    else $("#k-estado").textContent = "No la encontré. Toca el mapa en el punto de entrega.";
  } catch (e) { $("#k-estado").textContent = "No se pudo buscar: " + e.message; }
};

$("#f-cliente").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancelar") return;
  e.preventDefault();
  const nombre = $("#k-nombre").value.trim();
  if (!nombre) { $("#k-error").textContent = "El nombre es obligatorio."; return; }
  const otro = datos.clientes.find((x) => norm(x.nombre) === norm(nombre) && (!clienteEditando || x.id !== clienteEditando.id));
  if (otro) { $("#k-error").textContent = "Ya existe un cliente con ese nombre."; return; }
  const cambios = { nombre, telefono: $("#k-tel").value.trim(), direccion: $("#k-dir").value.trim(), notas: $("#k-notas").value.trim() };
  const dirCambio = !clienteEditando || cambios.direccion !== (clienteEditando.direccion || "");
  if (posCliente) Object.assign(cambios, posCliente);
  else if (dirCambio && cambios.direccion) {
    $("#k-estado").textContent = "Ubicando la dirección…";
    try { const pos = await geocodificar(cambios.direccion); if (pos) Object.assign(cambios, pos); } catch (x) { /* se guarda sin pin */ }
    if (cambios.lat == null) {
      $("#k-estado").textContent = "";
      if (!confirm("No encontré la dirección en el mapa. ¿Guardar sin pin? (Puedes tocar el mapa para ponerlo a mano.)")) return;
      cambios.lat = null; cambios.lng = null;
    }
  } else if (dirCambio && !cambios.direccion) { cambios.lat = null; cambios.lng = null; }
  try {
    if (clienteEditando) {
      await store.actualizar("clientes", clienteEditando.id, cambios);
      // Mantiene el nombre de los pedidos al día
      const ps = datos.pedidos.filter((p) => p.clienteId === clienteEditando.id && p.clienteNombre !== nombre);
      if (ps.length) await store.lote(ps.map((p) => ["actualizar", "pedidos", p.id, { clienteNombre: nombre }]));
    } else {
      await store.agregar("clientes", { lat: null, lng: null, ...cambios, creado: hoyISO() });
    }
    $("#d-cliente").close();
  } catch (x) { $("#k-error").textContent = "No se pudo guardar: " + x.message; }
});

$("#k-borrar").onclick = async () => {
  const c = clienteEditando;
  const n = datos.pedidos.filter((p) => p.clienteId === c.id).length;
  if (n) { alert(c.nombre + " tiene " + n + " pedido(s). Bórralos primero para no perder la contabilidad."); return; }
  if (!confirm("¿Borrar a " + c.nombre + "?")) return;
  await store.borrar("clientes", c.id);
  $("#d-cliente").close();
};

// =====================================================================
// 2. CONTABILIDAD
// =====================================================================
$("#c-mes").value = ui.mes;
$("#c-mes").onchange = () => { ui.mes = $("#c-mes").value || hoyISO().slice(0, 7); pintarContabilidad(); };

function fila(dt, dd, clase) { return '<div class="' + (clase || "") + '" style="display:contents"><dt>' + dt + "</dt><dd>" + dd + "</dd></div>"; }

const NOMBRE_MOV = { gasto: "Gasto", liquidacion: "Liquidación", inversion: "Inversión", proveedor: "Proveedor" };

// Detalle de un movimiento en la tabla del mes
function detalleMov(m) {
  if (m.tipo === "gasto") return [m.categoria, m.descripcion];
  if (m.tipo === "proveedor") return [m.proveedor, m.paquetes ? m.paquetes + " " + plural(Number(m.paquetes), "paquete", "paquetes") : "", m.descripcion];
  return [m.socio || (m.tipo === "inversion" ? "Ambos socios" : ""), m.descripcion];
}

function pintarContabilidad() {
  const r = resumenMes(datos, ui.mes);
  const s = saldos(datos);
  $("#c-titulo").textContent = nombreMes(ui.mes);
  pintarNequiYFabrica(s);
  $("#c-cuentas").innerHTML =
    fila("Ventas cobradas (" + r.pagados.length + " pedidos, " + r.paquetes + " paq.)", plata(r.ventas)) +
    fila("Costo de chorizos y aguardiente", "−" + plata(r.costoProducto), "menos") +
    fila("<strong>Ganancia bruta</strong>", "<strong>" + plata(r.gananciaBruta) + "</strong>") +
    '<div class="sep"></div>' +
    fila("Domicilios al fondo de gasolina", "−" + plata(r.fondoGasolina), "menos") +
    fila("Otros gastos", "−" + plata(r.otrosGastos), "menos") +
    fila("Ganancia neta", plata(r.gananciaNeta), "suma") +
    fila("Daniel (50%)", plata(r.gananciaNeta / 2)) +
    fila("Mariana (50%)", plata(r.gananciaNeta / 2)) +
    '<div class="sep"></div>' +
    fila("Domis cobrados a clientes", plata(r.domiCobrado)) +
    fila("Por cobrar este mes", plata(r.porCobrar));

  $("#c-fondo").innerHTML =
    fila("Apartado este mes", plata(r.fondoGasolina)) +
    fila("Gastado en gasolina este mes", "−" + plata(r.gasolinaGastada), "menos") +
    fila("Saldo total del fondo", plata(s.saldoFondo), "suma");
  $("#c-invertido").textContent = plata(s.invertidoTotal);

  $("#c-socios").innerHTML = SOCIOS.map((n) => {
    const x = s.socios[n];
    return '<div class="tarjeta socio"><p class="socio-nombre">' + n + '</p><p class="cifra">' + plata(x.disponible) + "</p>" +
      '<dl class="cuentas">' + fila("Ganancia acumulada (50%)", plata(x.ganado)) + fila("Liquidado", "−" + plata(x.liquidado), "menos") +
      fila("Invertido en el negocio", "−" + plata(x.invertido), "menos") + fila("Disponible", plata(x.disponible), "suma") + "</dl></div>";
  }).join("");

  const movs = datos.movimientos.filter((m) => (m.fecha || "").startsWith(ui.mes)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  $("#c-movs").innerHTML = "<thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class=num>Monto</th><th></th></tr></thead><tbody>" +
    (movs.length ? movs.map((m) => "<tr><td>" + fechaCorta(m.fecha) + "</td><td>" + NOMBRE_MOV[m.tipo] + "</td><td>" +
      esc(detalleMov(m).filter(Boolean).join(" · ")) +
      '</td><td class="num">' + plata(m.monto) + '</td><td><button class="x" data-acc="borrar-mov" data-id="' + m.id + '" aria-label="Borrar">✕</button></td></tr>').join("")
      : '<tr class="vacia"><td colspan="5">Sin movimientos este mes.</td></tr>') + "</tbody>";

  const ps = r.pedidos.slice().sort((a, b) => b.fechaPedido.localeCompare(a.fechaPedido));
  $("#c-pedidos").innerHTML = "<thead><tr><th>Pedido</th><th>Entrega</th><th>Cliente</th><th>Producto</th><th class=num>Total</th><th class=num>Ganancia</th><th>Pago</th></tr></thead><tbody>" +
    (ps.length ? ps.map((p) => "<tr><td>" + fechaCorta(p.fechaPedido) + "</td><td>" + fechaCorta(p.fechaEntrega) + "</td><td>" + esc((cliente(p.clienteId) || {}).nombre || p.clienteNombre) +
      "</td><td>" + esc(p.resumen) + '</td><td class="num">' + plata(p.total) + '</td><td class="num">' + plata(p.ganancia) +
      '</td><td><button class="tag ' + (p.pagado ? "verde" : "rojo") + '" data-acc="pagado" data-id="' + p.id + '">' + (p.pagado ? "Pagado" : "Pendiente") + "</button></td></tr>").join("")
      : '<tr class="vacia"><td colspan="7">Sin pedidos este mes.</td></tr>') + "</tbody>";

  pintarPrecios();
}

// ---------- Nequi y fábrica (de todo el tiempo, no del mes elegido) ----------
// Hasta qué viernes ya se le pidió producción a la fábrica: el de la próxima entrega
// A la fábrica se le pide cuando cierra el corte del jueves: hasta ahí cuentan los paquetes de esta semana
const viernesFabrica = () => { const v = viernesActual(); return pasoElCorte(v) ? v : sumarDias(v, -7); };
const fabrica = () => cuentaFabrica(datos.pedidos.filter(confirmado), datos.movimientos, viernesFabrica(), precios(datos).costoPaquete);

function pintarNequiYFabrica(s) {
  const n = saldoNequi(datos);
  const f = fabrica();
  $("#c-nequi").textContent = plata(n.saldo);
  $("#c-nequi-det").innerHTML =
    fila("Cobrado a clientes", plata(n.cobrado)) +
    fila("Pagado a proveedores", "−" + plata(n.proveedores), "menos") +
    fila("Gastos (gasolina y otros)", "−" + plata(n.gastos), "menos") +
    fila("Liquidado a los socios", "−" + plata(n.liquidado), "menos") +
    fila("Inversiones", "−" + plata(n.invertido), "menos");
  $("#c-nequi-nota").textContent = "Desde el primer pedido, suponiendo que toda la plata entra y sale por Nequi. De esa plata, " +
    plata(Math.max(0, s.saldoFondo)) + " son del fondo de gasolina y " + plata(f.debePlata) + " es lo que le debemos a la fábrica.";

  const paq = (x) => x + " paq.";
  $("#c-fabrica").innerHTML =
    fila("Pedidos a la fábrica (hasta el " + fechaCorta(viernesFabrica()).replace(/ \d{4}$/, "") + ")", paq(f.pedidos)) +
    fila("Pagados", paq(f.pagados), "menos") +
    fila("Debemos", paq(f.deben), "suma") +
    fila("Valor de lo que debemos", plata(f.debePlata)) +
    (f.adelantados ? fila("Pagados por adelantado", paq(f.adelantados)) : "") +
    fila("Pagado a la fábrica en total", plata(f.pagadoPlata));
  const vs = f.viernes.slice().reverse();
  $("#c-fabrica-caja").hidden = !vs.length;
  $("#c-fabrica-viernes").innerHTML = "<thead><tr><th>Viernes</th><th class=num>Paq.</th><th class=num>Pagados</th><th>Estado</th></tr></thead><tbody>" +
    vs.map((x) => "<tr><td>" + fechaCorta(x.viernes).replace(/ \d{4}$/, "") + '</td><td class="num">' + x.paquetes + '</td><td class="num">' + x.pagados + "</td><td>" +
      (x.debe ? '<span class="tag rojo">Debemos ' + x.debe + "</span>" : '<span class="tag verde">Pagado</span>') + "</td></tr>").join("") + "</tbody>";
}

// ---------- Pago a proveedor ----------
// Solo la fábrica y la licorera: lo que se les paga ya se resta de la ganancia con el costo por paquete
// y por litro de cada pedido pagado. Lo demás (empaques, insumos) se resta aparte, como gasto.
const PROVEEDORES = {
  fabrica: { nombre: "Fábrica de chorizos", nota: "el costo de los chorizos ya se resta en cada pedido pagado." },
  licorera: { nombre: "Licorera", nota: "el costo del aguardiente ya se resta en cada pedido pagado." },
};
let montoProveedorTocado = false;
$("#btn-proveedor").addEventListener("click", () => {
  const f = fabrica();
  $("#pv-tipo").value = "fabrica";
  $("#pv-paq").value = f.deben || "";
  $("#pv-monto").value = "";
  $("#pv-fecha").value = hoyISO();
  $("#pv-desc").value = "";
  $("#pv-error").textContent = "";
  montoProveedorTocado = false;
  formaProveedor();
  $("#d-proveedor").showModal();
});

// Muestra los campos según el proveedor y calcula el monto de los paquetes si no lo escribieron a mano
function formaProveedor() {
  const tipo = $("#pv-tipo").value;
  const esFabrica = tipo === "fabrica";
  const prov = PROVEEDORES[tipo];
  $("#pv-error").textContent = "";
  // Un campo escondido no debe frenar el Guardar: deshabilitado, el navegador no lo valida
  $("#pv-campos").hidden = !prov;
  ["#pv-paq", "#pv-monto", "#pv-fecha", "#pv-desc"].forEach((sel) => { $(sel).disabled = !prov; });
  $("#pv-paq-l").hidden = !esFabrica;
  $("#pv-paq").disabled = !esFabrica;
  $("#pv-paq").required = esFabrica;
  $("#pv-guardar").textContent = prov ? "Guardar" : "Ir a gasto";
  const costo = precios(datos).costoPaquete;
  const f = fabrica();
  $("#pv-deuda").textContent = esFabrica
    ? (f.deben ? "Debemos " + f.deben + " " + plural(f.deben, "paquete", "paquetes") + " (" + plata(f.debePlata) + ")." : "No debemos paquetes a la fábrica.") +
      " Cada paquete cuesta " + plata(costo) + " (se cambia en Precios y costos)."
    : prov ? ""
    : "Los empaques, insumos y demás compras no están en el costo por paquete ni por litro, así que se restan de la ganancia del mes: se registran como gasto.";
  $("#pv-nota").textContent = prov ? "Sale de Nequi. No cambia la ganancia del mes: " + prov.nota : "";
  if (!montoProveedorTocado) {
    const n = esFabrica ? Number($("#pv-paq").value) || 0 : 0;
    $("#pv-monto").value = n > 0 ? plata(n * costo) : "";
  }
}
$("#pv-tipo").addEventListener("change", formaProveedor);
$("#pv-paq").addEventListener("input", formaProveedor);
$("#pv-monto").addEventListener("input", (e) => {
  montoProveedorTocado = true;
  const v = leerPlata(e.target.value);
  e.target.value = v ? plata(v) : "";
});

$("#f-proveedor").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancelar") return;
  e.preventDefault();
  const tipo = $("#pv-tipo").value;
  const prov = PROVEEDORES[tipo];
  if (!prov) { $("#d-proveedor").close(); abrirMov("gasto", "Insumos"); return; }
  const esFabrica = tipo === "fabrica";
  const monto = leerPlata($("#pv-monto").value);
  const paquetes = esFabrica ? Number($("#pv-paq").value) : 0;
  if (esFabrica && !(Number.isInteger(paquetes) && paquetes >= 1)) { $("#pv-error").textContent = "Escribe cuántos paquetes se pagan."; return; }
  if (!monto) { $("#pv-error").textContent = "Escribe el monto."; return; }
  const f = fabrica();
  if (esFabrica && paquetes > f.deben &&
    !confirm("Se deben " + f.deben + " " + plural(f.deben, "paquete", "paquetes") + " y vas a pagar " + paquetes + ". ¿Guardar los demás como pagados por adelantado?")) return;
  const mov = { tipo: "proveedor", proveedor: prov.nombre, monto, fecha: $("#pv-fecha").value, descripcion: $("#pv-desc").value.trim(), creado: new Date().toISOString() };
  if (esFabrica) mov.paquetes = paquetes;
  try { await store.agregar("movimientos", mov); $("#d-proveedor").close(); }
  catch (x) { $("#pv-error").textContent = "No se pudo guardar: " + x.message; }
});

// ---------- Movimientos ----------
let tipoMov = null;
document.querySelectorAll("[data-mov]").forEach((b) => b.addEventListener("click", () => abrirMov(b.dataset.mov, b.dataset.cat)));

function abrirMov(tipo, cat) {
  tipoMov = tipo;
  const titulos = { gasto: "Registrar gasto", liquidacion: "Liquidar ganancias", inversion: "Invertir en el negocio" };
  $("#d-mov-t").textContent = cat === "Gasolina" ? "Registrar tanqueada" : titulos[tipo];
  $("#m-socio").innerHTML = (tipo === "inversion" ? '<option value="">Ambos (50% y 50%)</option>' : "") + SOCIOS.map((s) => "<option>" + s + "</option>").join("");
  $("#m-socio-l").hidden = tipo === "gasto";
  $("#m-cat-l").hidden = tipo !== "gasto";
  $("#m-cat").value = cat || "Insumos";
  $("#m-todo-caja").hidden = tipo === "gasto";
  $("#m-todo").hidden = tipo !== "liquidacion";
  $("#m-monto").value = ""; $("#m-desc").value = ""; $("#m-fecha").value = hoyISO(); $("#m-error").textContent = "";
  $("#m-ayuda").textContent = {
    gasto: "La gasolina sale del fondo de gasolina. Los demás gastos se restan de la ganancia neta del mes.",
    liquidacion: "Plata que el socio saca del negocio. Se descuenta de su disponible.",
    inversion: "Plata de las ganancias que se queda en el negocio (equipos, empaques, más producto). Se descuenta del disponible."
  }[tipo];
  mostrarDisponible();
  $("#d-mov").showModal();
}
function mostrarDisponible() {
  const s = saldos(datos);
  const x = s.socios[$("#m-socio").value];
  $("#m-disp").textContent = x ? "Disponible: " + plata(x.disponible) : "";
}
$("#m-socio").onchange = mostrarDisponible;
$("#m-todo").onclick = () => {
  const x = saldos(datos).socios[$("#m-socio").value];
  if (x) $("#m-monto").value = plata(Math.max(0, x.disponible));
};
$("#m-monto").addEventListener("input", (e) => { const v = leerPlata(e.target.value); e.target.value = v ? plata(v) : ""; });

$("#f-mov").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancelar") return;
  e.preventDefault();
  const monto = leerPlata($("#m-monto").value);
  if (!monto) { $("#m-error").textContent = "Escribe el monto."; return; }
  const mov = { tipo: tipoMov, monto, fecha: $("#m-fecha").value, descripcion: $("#m-desc").value.trim(), creado: new Date().toISOString() };
  if (tipoMov === "gasto") mov.categoria = $("#m-cat").value;
  else mov.socio = $("#m-socio").value;
  if (tipoMov === "liquidacion") {
    const x = saldos(datos).socios[mov.socio];
    if (monto > x.disponible + 0.5 && !confirm(mov.socio + " tiene disponible " + plata(x.disponible) + ". ¿Liquidar " + plata(monto) + " de todos modos?")) return;
  }
  try { await store.agregar("movimientos", mov); $("#d-mov").close(); }
  catch (x) { $("#m-error").textContent = "No se pudo guardar: " + x.message; }
});

// ---------- Precios y costos ----------
const CAMPOS_PRECIO = [
  ["precio1", "1 paquete"], ["precio2", "2 paquetes"], ["precio3", "3 paquetes (promo)"],
  ["precioAsado", "Combo Asado"], ["precioFinquero", "Combo Finquero"],
  ["domi", "Domi para 1 o 2 paquetes"], ["envio", "Fondo de gasolina por pedido"],
  ["costoPaquete", "Costo de un paquete"], ["costoLitro", "Costo de un litro de aguardiente"]
];
let preciosPintados = false;
function pintarPrecios() {
  if (preciosPintados && document.activeElement && $("#f-precios").contains(document.activeElement)) return;
  preciosPintados = true;
  const p = precios(datos);
  $("#f-precios").innerHTML = '<div class="fila2">' + CAMPOS_PRECIO.map(([k, n]) =>
    '<label class="etq">' + n + ' <input class="campo" inputmode="numeric" name="' + k + '" value="' + plata(p[k]) + '"></label>').join("") +
    '<label class="etq">Ciudad para ubicar direcciones <input class="campo" name="ciudad" value="' + esc(ciudad()) + '"></label>' +
    '<label class="etq">Nequi para pagos (lo ven los clientes) <input class="campo" name="nequi" inputmode="tel" value="' + esc(p.nequi || "") + '" placeholder="300 123 4567"></label>' +
    '<label class="etq">WhatsApp del negocio (lo ven los clientes) <input class="campo" name="whatsapp" inputmode="tel" value="' + esc(p.whatsapp || "") + '" placeholder="300 123 4567"></label></div>' +
    '<p class="nota">Los pedidos ya creados conservan los precios con que se guardaron.</p>' +
    '<div class="botonera"><button type="button" class="btn btn-sec btn-chico" id="pr-base">Volver a los de octubre 2026</button><button class="btn btn-chico">Guardar precios</button></div>';
  $("#pr-base").onclick = async () => { await store.fijar("config", "precios", { ...PRECIOS_BASE, ciudad: ciudad() }); preciosPintados = false; pintarPrecios(); };
}
$("#f-precios").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const doc = {};
  CAMPOS_PRECIO.forEach(([k]) => { doc[k] = leerPlata(f.get(k)); });
  doc.ciudad = String(f.get("ciudad") || "Medellín").trim();
  doc.nequi = String(f.get("nequi") || "").trim();
  doc.whatsapp = String(f.get("whatsapp") || "").trim();
  await store.fijar("config", "precios", doc);
  alert("Precios guardados.");
});

// =====================================================================
// 4. INVENTARIO / PRODUCCIÓN
// =====================================================================
// viernesProd null = la vista sigue sola a la próxima entrega, aunque la app quede abierta varios días
const elegirViernesProd = (f) => { ui.viernesProd = f === viernesActual() ? null : f; pintarProduccion(); };
$("#pr-ant").onclick = () => elegirViernesProd(sumarDias(ui.viernesProd || viernesActual(), -7));
$("#pr-sig").onclick = () => elegirViernesProd(sumarDias(ui.viernesProd || viernesActual(), 7));
function irAFila(e) {
  const tr = e.target.closest("tr[data-viernes]");
  if (!tr) return;
  if (e.type === "keydown") { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); }
  elegirViernesProd(tr.dataset.viernes);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("#pr-proximas").addEventListener("click", irAFila);
$("#pr-proximas").addEventListener("keydown", irAFila);
// Al volver a la app (p. ej. el sábado), repinta aunque no haya cambiado ningún pedido
document.addEventListener("visibilitychange", () => { if (!document.hidden && $("#cargando").hidden) pintar(); });

const plural = (n, uno, varios) => (n === 1 ? uno : varios);

function pintarProduccion() {
  const proxima = viernesActual();
  const v = ui.viernesProd || proxima;
  const esProxima = v === proxima;
  const n = necesidadesEntrega(datos.pedidos.filter(confirmado), v, esProxima);
  const espera = necesidadesEntrega(datos.pedidos.filter((p) => !confirmado(p)), v, esProxima);
  $("#pr-titulo").textContent = fechaLarga(v);

  const frase = esProxima ? "Para la próxima entrega debemos tener"
    : v > proxima ? "Para el " + fechaLarga(v) + " debemos tener"
    : "Para el " + fechaLarga(v) + " se necesitaron";
  $("#pr-frase-paq").textContent = frase;
  $("#pr-frase-lit").textContent = frase;

  $("#pr-paquetes").textContent = n.paquetes;
  $("#pr-paquetes-u").textContent = plural(n.paquetes, "paquete de chorizos", "paquetes de chorizos");
  $("#pr-paquetes-det").textContent = n.pedidos.length
    ? n.chorizos + " chorizos · " + n.pedidos.length + " " + plural(n.pedidos.length, "pedido", "pedidos")
    : "Todavía no hay pedidos para este viernes.";

  $("#pr-litros").textContent = n.litros;
  $("#pr-litros-u").textContent = plural(n.litros, "litro de guaro", "litros de guaro");
  const combos = n.porProducto.filter((x) => x.litros).map((x) => x.unidades + " " + (x.unidades === 1 ? x.nombre : x.nombre.replace("Combo", "Combos"))).join(" y ");
  $("#pr-litros-det").textContent = n.litros
    ? "Aguardiente Antioqueño tapa roja · " + combos
    : "Ningún combo pedido para este viernes.";

  const avance = [];
  if (n.pedidos.length) {
    avance.push('<span class="chip rojo">Por entregar: ' + n.porEntregar.paquetes + " paq. · " + n.porEntregar.litros + " L</span>");
    avance.push('<span class="chip verde">Entregado: ' + n.entregados.paquetes + " paq. · " + n.entregados.litros + " L</span>");
  }
  if (espera.pedidos.length) {
    avance.push('<span class="chip app">Esperando pago en la app: ' + espera.pedidos.length + " " + plural(espera.pedidos.length, "pedido", "pedidos") +
      " · " + espera.paquetes + " paq. · " + espera.litros + " L</span>");
  }
  $("#pr-avance").innerHTML = avance.join("");
  $("#pr-nota").textContent = n.atrasados
    ? "Incluye " + n.atrasados + " " + plural(n.atrasados, "pedido", "pedidos") + " de viernes anteriores que no se ha" + (n.atrasados === 1 ? "" : "n") +
      " entregado (" + n.paquetesAtrasados + " paq." + (n.litrosAtrasados ? " y " + n.litrosAtrasados + " L" : "") + ")."
    : "";

  $("#pr-desglose").innerHTML = "<thead><tr><th>Producto</th><th class=num>Cantidad</th><th class=num>Paquetes</th><th class=num>Litros</th></tr></thead><tbody>" +
    (n.porProducto.length
      ? n.porProducto.map((x) => "<tr><td><strong>" + esc(x.nombre) + "</strong><br><small>" + esc(x.detalle) + '</small></td><td class="num">' + x.unidades +
          '</td><td class="num">' + x.paquetes + '</td><td class="num">' + x.litros + "</td></tr>").join("") +
        '<tr class="suma"><td>Total</td><td></td><td class="num">' + n.paquetes + '</td><td class="num">' + n.litros + "</td></tr>"
      : '<tr class="vacia"><td colspan="4">Sin pedidos para este viernes.</td></tr>') + "</tbody>";

  const viernes = viernesConPedidos(datos.pedidos.filter(confirmado), proxima);
  if (!viernes.includes(proxima)) viernes.unshift(proxima);
  $("#pr-proximas").innerHTML = "<thead><tr><th>Viernes</th><th class=num>Pedidos</th><th class=num>Paquetes</th><th class=num>Litros</th></tr></thead><tbody>" +
    viernes.map((f) => {
      const x = necesidadesEntrega(datos.pedidos.filter(confirmado), f, f === proxima);
      return '<tr tabindex="0" data-viernes="' + f + '"' + (f === v ? ' class="sel" aria-current="true"' : "") + "><td>" + fechaCorta(f) + (f === proxima ? " <span class=\"tag verde\">próxima</span>" : "") +
        '</td><td class="num">' + x.pedidos.length + '</td><td class="num">' + x.paquetes + '</td><td class="num">' + x.litros + "</td></tr>";
    }).join("") + "</tbody>";
}

iniciar();
