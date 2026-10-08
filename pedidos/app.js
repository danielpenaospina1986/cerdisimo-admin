// App de pedidos para clientes de Cerdísimo Chancho.
// Los pedidos caen en la misma base de datos que la app admin con estado "por_pagar";
// el cliente reporta el comprobante de Nequi y Mariana aprueba el pago desde la app admin.
import { crearStore, modoPrueba } from "./datos.js";
import {
  PRODUCTOS, precios, calcularPedido, hoyISO, fechaLarga, plata, enlaceWhatsApp,
  ESTADOS, CORTE, viernesParaPedidoWeb, corteDe, venceAlCorte, codigoPedido
} from "../negocio.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let store, usuario = null, ficha = null, pedidos = [], config = null;
const cantidades = {};
const ui = { vista: "pedir", pagando: null, cargados: { ficha: false, pedidos: false, precios: false } };

const P = () => precios({ config: config ? [{ ...config, id: "precios" }] : [] });

// ---------- Arranque ----------
async function iniciar() {
  if (modoPrueba) $("#aviso-prueba").hidden = false;
  try {
    store = await crearStore();
    try { await store.completarEnlace(); }
    catch (e) { $("#login-error").textContent = "No se pudo entrar con el enlace: " + e.message + " Pide uno nuevo."; }
    store.estadoSesion((u) => (u ? entrar(u) : mostrarLogin()));
  } catch (e) {
    $("#cargando").textContent = "No se pudo cargar: " + e.message;
    console.error(e);
  }
}

function mostrarLogin() {
  usuario = null;
  $("#cargando").hidden = true;
  $("#pestanas").hidden = true;
  $("#salir").hidden = true;
  mostrar("login");
}

$("#entrar-google").onclick = async () => {
  $("#login-error").textContent = "";
  try { await store.entrarConGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user") $("#login-error").textContent = "No se pudo entrar: " + e.message; }
};

$("#f-enlace").addEventListener("submit", async (e) => {
  e.preventDefault();
  const correo = $("#correo").value.trim();
  $("#login-error").textContent = "";
  $("#enlace-estado").textContent = "Enviando…";
  try {
    await store.enviarEnlace(correo);
    $("#enlace-estado").textContent = "Listo. Abre el enlace que te llegó a " + correo + " desde este mismo celular (revisa también la carpeta de spam).";
  } catch (x) {
    $("#enlace-estado").textContent = "";
    $("#login-error").textContent = "No se pudo enviar el enlace: " + x.message;
  }
});

function entrar(u) {
  if (usuario && usuario.uid === u.uid) return;
  usuario = u;
  $("#cargando").hidden = false;
  mostrar(null);
  $("#salir").hidden = false;
  $("#salir").onclick = () => store.salir();
  store.escucharPrecios((c) => { config = c; ui.cargados.precios = true; listo(); });
  store.escucharFicha(u.uid, (f) => { ficha = f; ui.cargados.ficha = true; listo(); });
  store.escucharPedidos(u.uid, (ps) => {
    // Lo que siguió sin pagar al corte del jueves se cancela solo
    ps.filter((p) => venceAlCorte(p)).forEach((p) => {
      store.actualizarPedido(p.id, { estado: "cancelado", canceladoPor: "corte", canceladoEn: new Date().toISOString() }).catch(console.warn);
    });
    pedidos = ps.map((p) => (venceAlCorte(p) ? { ...p, estado: "cancelado", canceladoPor: "corte" } : p));
    ui.cargados.pedidos = true;
    listo();
  });
}

let primeraVez = true;
function listo() {
  if (!ui.cargados.ficha || !ui.cargados.pedidos || !ui.cargados.precios) return;
  $("#cargando").hidden = true;
  $("#pestanas").hidden = false;
  if (primeraVez) {
    primeraVez = false;
    if (!ficha) ui.vista = "datos";
    else if (pedidos.some((p) => p.estado === "por_pagar" || p.estado === "rechazado")) ui.vista = "mis";
  }
  pintar();
}

// ---------- Navegación ----------
document.querySelectorAll("#pestanas button").forEach((b) => {
  b.addEventListener("click", () => { ui.vista = b.dataset.vista; pintar(); window.scrollTo(0, 0); });
});

function mostrar(vista) {
  ["login", "pedir", "pagar", "mis", "datos"].forEach((v) => { $("#vista-" + v).hidden = v !== vista; });
}

function pintar() {
  if (!usuario) return;
  if (!ficha && ui.vista !== "datos") ui.vista = "datos";
  const tab = ui.vista === "pagar" ? "mis" : ui.vista;
  document.querySelectorAll("#pestanas button").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.vista === tab)));
  mostrar(ui.vista);
  if (ui.vista === "pedir") pintarPedir();
  if (ui.vista === "pagar") pintarPagar();
  if (ui.vista === "mis") pintarMis();
  if (ui.vista === "datos") pintarDatos();
}

// =====================================================================
// Pedir
// =====================================================================
function pintarPedir() {
  const v = viernesParaPedidoWeb();
  $("#saludo").textContent = "Hola, " + (ficha.nombre || "").split(" ")[0];
  $("#entrega-info").innerHTML = "Llega el <strong>" + fechaLarga(v) + "</strong>. Recibimos pedidos para ese viernes hasta el " +
    fechaLarga(isoDe(corteDe(v))) + " a las 12 m.";
  pintarProductos();
}
const isoDe = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function pintarProductos() {
  const p = P();
  $("#productos").innerHTML = '<legend class="etq">Elige tus chorizos</legend>' + PRODUCTOS.map((prod) =>
    '<div class="prod' + (cantidades[prod.id] ? " activo" : "") + '"><div class="prod-n">' + prod.nombre + " · " + plata(p[prod.precio]) +
    "<small>" + prod.detalle + '</small></div><div class="stepper">' +
    '<button type="button" data-paso="-1" data-prod="' + prod.id + '" aria-label="Quitar ' + prod.nombre + '">−</button>' +
    "<output>" + (cantidades[prod.id] || 0) + "</output>" +
    '<button type="button" data-paso="1" data-prod="' + prod.id + '" aria-label="Agregar ' + prod.nombre + '">+</button></div></div>'
  ).join("");
  actualizarTotal();
}

$("#productos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-paso]");
  if (!b) return;
  cantidades[b.dataset.prod] = Math.max(0, (cantidades[b.dataset.prod] || 0) + Number(b.dataset.paso));
  pintarProductos();
});
document.querySelectorAll('input[name="recibe"]').forEach((r) => r.addEventListener("change", actualizarTotal));
const recoge = () => $('input[name="recibe"]:checked').value === "recoge";

function actualizarTotal() {
  const p = P();
  const c = calcularPedido(cantidades, p, recoge());
  $("#total").innerHTML = c.paquetes
    ? "Total: <strong>" + plata(c.total) + "</strong><br>" + c.resumen +
      (c.domi ? " + domicilio " + plata(c.domi) : recoge() ? " · lo recoges" : " · domicilio gratis")
    : "Agrega al menos un producto.";
  $("#dir-pedido").textContent = recoge()
    ? "Te escribimos por WhatsApp para acordar dónde recogerlo."
    : ficha && ficha.direccion ? "Lo llevamos a: " + ficha.direccion + (ficha.notas ? " · " + ficha.notas : "") : "";
  $("#pedir-btn").disabled = !c.paquetes;
  if (c.domi) $("#total").insertAdjacentHTML("beforeend", "<br><small>Domicilio gratis desde " + p.gratisDesde + " paquetes.</small>");
}

$("#f-pedir").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#pedir-error");
  err.textContent = "";
  const items = {};
  PRODUCTOS.forEach((x) => { if (cantidades[x.id]) items[x.id] = cantidades[x.id]; });
  const calc = calcularPedido(items, P(), recoge());
  if (!calc.paquetes) { err.textContent = "Agrega al menos un producto."; return; }
  if (!recoge() && !ficha.direccion) { err.textContent = "Agrega tu dirección en Mis datos o elige recogerlo."; return; }
  const btn = $("#pedir-btn"); btn.disabled = true;
  try {
    const hoy = hoyISO();
    const id = await store.crearPedido({
      origen: "web", uid: usuario.uid, clienteId: usuario.uid, clienteNombre: ficha.nombre,
      fechaPedido: hoy, fechaEntrega: viernesParaPedidoWeb(), items, recoge: recoge(), ...calc,
      pagado: false, entregado: false, estado: "por_pagar", notas: $("#pedir-notas").value.trim(),
      creado: hoy, creadoEn: new Date().toISOString()
    });
    Object.keys(cantidades).forEach((k) => delete cantidades[k]);
    $("#pedir-notas").value = "";
    irAPagar(id);
  } catch (x) {
    err.textContent = "No se pudo guardar el pedido: " + x.message;
  } finally { btn.disabled = false; }
});

// =====================================================================
// Pagar
// =====================================================================
function irAPagar(id) { ui.pagando = id; ui.vista = "pagar"; pintar(); window.scrollTo(0, 0); }
$("#pagar-volver").onclick = () => { ui.vista = "mis"; pintar(); };

// El QR va en assets/nequi-qr.png; mientras no exista se muestra un recuadro en su lugar
const qr = $("#qr");
qr.addEventListener("load", () => { qr.hidden = false; $("#qr-falta").hidden = true; });
qr.addEventListener("error", () => { qr.hidden = true; $("#qr-falta").hidden = false; });
qr.src = "../assets/nequi-qr.png";

function pintarPagar() {
  const p = pedidos.find((x) => x.id === ui.pagando);
  if (!p) { $("#pagar-total").textContent = "…"; return; }
  if (p.estado !== "por_pagar" && p.estado !== "rechazado") { ui.vista = "mis"; pintar(); return; }
  const cfg = P();
  const codigo = codigoPedido(p);
  $("#pagar-codigo").textContent = "Pedido " + codigo;
  $("#pagar-codigo-2").textContent = codigo;
  $("#pagar-total").textContent = plata(p.total);
  $("#pagar-nequi").innerHTML = cfg.nequi
    ? "También puedes enviarlo a Nequi al número <strong>" + esc(cfg.nequi) + "</strong>."
    : "";
  $("#comprobante").value = p.comprobante || "";
  $("#pagar-error").textContent = p.estado === "rechazado" && p.notaPago ? "No encontramos tu pago: " + p.notaPago + ". Revisa y vuelve a enviarlo." : "";
  const wa = $("#pagar-whatsapp");
  if (cfg.whatsapp) {
    wa.hidden = false;
    wa.href = enlaceWhatsApp(cfg.whatsapp, "Hola, pagué el pedido " + codigo + " por " + plata(p.total) + ". Te mando la captura del comprobante.");
  } else wa.hidden = true;
  $("#pagar-corte").textContent = "Si no pagas antes del " + fechaLarga(isoDe(corteDe(p.fechaEntrega))) + " a las 12 m., el pedido se cancela solo. " +
    "Si prefieres pagar contra entrega, pídelo por WhatsApp.";
}

$("#f-pagar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const comprobante = $("#comprobante").value.trim();
  if (!comprobante) return;
  try {
    await store.actualizarPedido(ui.pagando, { estado: "por_verificar", comprobante, reportadoEn: new Date().toISOString() });
    ui.vista = "mis"; pintar();
  } catch (x) { $("#pagar-error").textContent = "No se pudo guardar: " + x.message; }
});

// =====================================================================
// Mis pedidos
// =====================================================================
const COLOR = { por_pagar: "rojo", rechazado: "rojo", por_verificar: "amarillo", aprobado: "verde", cancelado: "gris" };
const AYUDA = {
  por_pagar: "Falta el pago por Nequi.",
  por_verificar: "Estamos revisando tu pago en Nequi.",
  aprobado: "Pago aprobado. Te llega el viernes.",
  rechazado: "No encontramos tu pago.",
  cancelado: ""
};

function pintarMis() {
  const lista = pedidos.slice().sort((a, b) => (b.creadoEn || b.fechaPedido || "").localeCompare(a.creadoEn || a.fechaPedido || ""));
  $("#mis-lista").innerHTML = lista.length ? lista.map((p) => {
    const estado = p.entregado ? "entregado" : p.estado;
    const nombreEstado = p.entregado ? "Entregado" : ESTADOS[p.estado] || p.estado;
    const ayuda = p.entregado ? "¡Que lo disfrutes!"
      : p.estado === "cancelado" ? (p.canceladoPor === "corte" ? "Se canceló porque no se pagó antes del corte." : "Lo cancelaste.")
      : p.estado === "rechazado" && p.notaPago ? "No encontramos tu pago: " + esc(p.notaPago)
      : AYUDA[p.estado] || "";
    const puedePagar = !p.entregado && (p.estado === "por_pagar" || p.estado === "rechazado");
    const puedeCancelar = !p.entregado && ["por_pagar", "por_verificar", "rechazado"].includes(p.estado);
    return '<article class="pedido ' + (estado === "cancelado" ? "cancelado" : p.pagado ? "pagado" : "pendiente") + '">' +
      '<div class="pedido-cab"><p class="pedido-nombre"><span class="pedido-codigo">' + codigoPedido(p) + "</span></p>" +
      '<span class="estado ' + (p.entregado ? "verde" : COLOR[p.estado] || "gris") + '">' + nombreEstado + "</span>" +
      '<span class="pedido-total">' + plata(p.total) + "</span></div>" +
      "<p>" + esc(p.resumen) + (p.domi ? " + domicilio " + plata(p.domi) : p.recoge ? " · lo recoges" : " · domicilio gratis") + "</p>" +
      "<p>Entrega: " + fechaLarga(p.fechaEntrega) + "</p>" +
      (ayuda ? "<p><em>" + ayuda + "</em></p>" : "") +
      '<div class="pedido-acc">' +
      (puedePagar ? '<button class="btn btn-chico" data-acc="pagar" data-id="' + p.id + '">Pagar</button>' : "") +
      '<button class="btn btn-sec btn-chico" data-acc="repetir" data-id="' + p.id + '">Repetir pedido</button>' +
      (puedeCancelar ? '<button class="btn btn-peligro btn-chico" data-acc="cancelar" data-id="' + p.id + '">Cancelar</button>' : "") +
      "</div></article>";
  }).join("") : '<div class="tarjeta vacio"><p>Todavía no tienes pedidos.</p><button class="btn" data-acc="ir-pedir">Hacer mi primer pedido</button></div>';
}

$("#mis-lista").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-acc]");
  if (!b) return;
  const p = pedidos.find((x) => x.id === b.dataset.id);
  if (b.dataset.acc === "ir-pedir") { ui.vista = "pedir"; pintar(); }
  if (b.dataset.acc === "pagar" && p) irAPagar(p.id);
  if (b.dataset.acc === "repetir" && p) {
    Object.keys(cantidades).forEach((k) => delete cantidades[k]);
    Object.assign(cantidades, p.items || {});
    document.querySelector('input[name="recibe"][value="' + (p.recoge ? "recoge" : "domi") + '"]').checked = true;
    ui.vista = "pedir"; pintar(); window.scrollTo(0, 0);
  }
  if (b.dataset.acc === "cancelar" && p && confirm("¿Cancelar el pedido " + codigoPedido(p) + "?" + (p.estado === "por_verificar" ? "\nSi ya pagaste, escríbenos por WhatsApp para devolverte la plata." : ""))) {
    try { await store.actualizarPedido(p.id, { estado: "cancelado", canceladoPor: "cliente", canceladoEn: new Date().toISOString() }); }
    catch (x) { alert("No se pudo cancelar: " + x.message); }
  }
});

// =====================================================================
// Mis datos
// =====================================================================
let mapa, pin, pos = null, datosPintados = false;

function pintarDatos() {
  $("#datos-primera").hidden = !!ficha;
  $("#datos-correo").textContent = usuario.email ? "Entraste como " + usuario.email + "." : "";
  $("#datos-btn").textContent = ficha ? "Guardar cambios" : "Guardar y seguir a pedir";
  if (!datosPintados || !$("#f-datos").contains(document.activeElement)) {
    datosPintados = true;
    const f = ficha || {};
    $("#d-nombre").value = f.nombre || usuario.displayName || "";
    $("#d-tel").value = f.telefono || "";
    $("#d-dir").value = f.direccion || "";
    $("#d-notas").value = f.notas || "";
    $("#d-autoriza").checked = !!f.autorizaDatos;
    pos = typeof f.lat === "number" ? { lat: f.lat, lng: f.lng } : null;
  }
  if (!window.L) return;
  if (!mapa) {
    mapa = L.map("d-mapa").setView([6.2442, -75.5812], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
    mapa.on("click", (e) => ponerPin(e.latlng.lat, e.latlng.lng, true));
  }
  setTimeout(() => { mapa.invalidateSize(); if (pos) ponerPin(pos.lat, pos.lng, false); }, 60);
}

function ponerPin(lat, lng, manual) {
  pos = { lat, lng };
  const icono = L.divIcon({ className: "", html: '<div class="pin neutro"><span></span></div>', iconSize: [30, 30], iconAnchor: [15, 30] });
  if (!pin) {
    pin = L.marker([lat, lng], { draggable: true, icon: icono }).addTo(mapa);
    pin.on("dragend", () => { const p = pin.getLatLng(); ponerPin(p.lat, p.lng, true); });
  } else pin.setLatLng([lat, lng]);
  mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16));
  $("#d-estado").textContent = manual ? "Pin ajustado." : "Pin ubicado.";
}

async function geocodificar(direccion) {
  const ciudad = P().ciudad || "Medellín";
  const limpia = direccion.replace(/#/g, " ").replace(/\s+/g, " ").trim();
  for (const q of [limpia + ", " + ciudad + ", Colombia", limpia]) {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co&accept-language=es&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
    if (!r.ok) continue;
    const j = await r.json();
    if (j.length) return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  }
  return null;
}

$("#d-buscar").onclick = async () => {
  const dir = $("#d-dir").value.trim();
  if (!dir) { $("#d-estado").textContent = "Escribe tu dirección primero."; return; }
  $("#d-estado").textContent = "Buscando…";
  try {
    const p = await geocodificar(dir);
    if (p) ponerPin(p.lat, p.lng, false);
    else $("#d-estado").textContent = "No la encontré. Toca el mapa en tu casa.";
  } catch (e) { $("#d-estado").textContent = "No se pudo buscar: " + e.message; }
};

$("#f-datos").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#datos-error");
  err.textContent = "";
  const nueva = {
    nombre: $("#d-nombre").value.trim(), telefono: $("#d-tel").value.trim(),
    direccion: $("#d-dir").value.trim(), notas: $("#d-notas").value.trim(),
    email: usuario.email || "", origen: "web", autorizaDatos: $("#d-autoriza").checked
  };
  if (!nueva.nombre || !nueva.telefono) { err.textContent = "Escribe tu nombre y tu celular."; return; }
  if (!nueva.autorizaDatos) { err.textContent = "Para guardar tus datos necesitamos tu autorización."; return; }
  if (!pos && nueva.direccion) {
    $("#d-estado").textContent = "Ubicando tu dirección…";
    try { const p = await geocodificar(nueva.direccion); if (p) ponerPin(p.lat, p.lng, false); } catch (x) { /* se guarda sin pin */ }
  }
  nueva.lat = pos ? pos.lat : null;
  nueva.lng = pos ? pos.lng : null;
  if (!ficha) { nueva.creado = hoyISO(); nueva.autorizaDatosEn = new Date().toISOString(); }
  const btn = $("#datos-btn"); btn.disabled = true;
  try {
    const primera = !ficha;
    await store.guardarFicha(usuario.uid, nueva);
    datosPintados = false;
    if (primera) { ui.vista = "pedir"; pintar(); window.scrollTo(0, 0); }
    else { $("#d-estado").textContent = "Datos guardados ✓"; }
  } catch (x) { err.textContent = "No se pudo guardar: " + x.message; }
  finally { btn.disabled = false; }
});
// Si cambia la dirección, el pin anterior deja de valer hasta ubicarla de nuevo o tocar el mapa
$("#d-dir").addEventListener("input", () => {
  pos = null;
  if (pin) { pin.remove(); pin = null; }
  $("#d-estado").textContent = "";
});

iniciar();
