import { crearStore, sembrarSiHaceFalta, modoPrueba } from "./store.js";
import {
  PRODUCTOS, PRECIOS_BASE, SOCIOS, precios, calcularPedido, hoyISO, sumarDias, viernesDeEntrega, viernesActual,
  fechaLarga, fechaCorta, nombreMes, plata, leerPlata, resumenMes, saldos,
  enlaceGoogle, enlaceApple, enlaceWhatsApp, ordenarRuta, enlaceRutaGoogle
} from "./negocio.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let store;
let datos = { clientes: [], pedidos: [], movimientos: [], config: [] };
const ui = { vista: "entregas", viernes: viernesActual(), mes: hoyISO().slice(0, 7) };

// ---------- Arranque ----------
async function iniciar() {
  if (modoPrueba) $("#aviso-prueba").hidden = false;
  try {
    store = await crearStore();
    const sesion = await store.iniciar(pedirLogin);
    if (!modoPrueba) { $("#salir").hidden = false; $("#salir").onclick = () => store.salir(); }
    let sembrado = false;
    store.escuchar(async (d) => {
      datos = d;
      if (!sembrado) {
        sembrado = true;
        try { if (await sembrarSiHaceFalta(store, d)) return; } catch (e) { console.error(e); }
      }
      $("#cargando").hidden = true;
      pintar();
    });
    return sesion;
  } catch (e) {
    $("#cargando").textContent = e.message;
    console.error(e);
  }
}

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
  ["entregas", "contabilidad", "clientes"].forEach((v) => { $("#vista-" + v).hidden = v !== ui.vista; });
  if (ui.vista === "entregas") pintarEntregas();
  if (ui.vista === "contabilidad") pintarContabilidad();
  if (ui.vista === "clientes") pintarClientes();
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
  return '<article class="pedido ' + (p.pagado ? "pagado" : "pendiente") + (p.entregado ? " entregado" : "") + '">' +
    '<div class="pedido-cab">' + (n ? '<span class="pedido-num">' + n + "</span>" : "") +
    '<p class="pedido-nombre">' + esc(nombre) + "</p>" +
    '<span class="estado ' + color + '">' + (p.pagado ? "Pagado" : "Pendiente de pago") + "</span>" +
    '<span class="pedido-total">' + plata(p.total) + "</span></div>" +
    "<p>" + esc(p.resumen) + (p.domi ? " + domi " + plata(p.domi) : p.recoge ? " · lo recoge" : " · domi gratis") +
    (p.entregado ? " · <strong>Entregado</strong>" : "") + "</p>" +
    "<p>" + dir + "</p><p>" + tel + "</p>" +
    (p.notas ? "<p><em>" + esc(p.notas) + "</em></p>" : "") +
    '<div class="pedido-acc">' +
    '<button class="btn btn-chico" data-acc="pagado" data-id="' + p.id + '">' + (p.pagado ? "Marcar sin pagar" : "Marcar pagado") + "</button>" +
    '<button class="btn btn-sec btn-chico" data-acc="entregado" data-id="' + p.id + '">' + (p.entregado ? "No entregado" : "Entregado") + "</button>" +
    mapas +
    '<button class="btn btn-sec btn-chico" data-acc="editar" data-id="' + p.id + '">Editar</button>' +
    (c.id ? '<button class="btn btn-sec btn-chico" data-acc="cliente" data-id="' + c.id + '">' + (c.direccion ? "Datos del cliente" : "Agregar dirección") + "</button>" : "") +
    "</div></article>";
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
  $("#v-resumen").innerHTML =
    '<span class="chip rust">' + delDia.length + " pedidos</span>" +
    '<span class="chip">' + paquetes + " paquetes</span>" +
    (litros ? '<span class="chip">' + litros + " L de aguardiente</span>" : "") +
    '<span class="chip verde">Pagado ' + plata(cobrado) + "</span>" +
    '<span class="chip rojo">Por cobrar ' + plata(porCobrar) + "</span>";

  // Paradas con pin, ordenadas por cercanía, numeradas igual en la lista y el mapa
  const conPin = delDia.filter((p) => !p.recoge && tienePin(cliente(p.clienteId)))
    .map((p) => ({ ...cliente(p.clienteId), pedido: p }));
  const ruta = ordenarRuta(conPin.filter((x) => !x.pedido.entregado));
  const numero = new Map();
  ruta.forEach((x, i) => numero.set(x.pedido.id, i + 1));

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

  const faltan = delDia.filter((p) => !p.recoge && !tienePin(cliente(p.clienteId)));
  $("#sin-pin").textContent = faltan.length
    ? faltan.length + (faltan.length === 1 ? " pedido no tiene" : " pedidos no tienen") + " pin en el mapa: agrega su dirección en Clientes."
    : "";

  $("#v-lista").innerHTML = delDia.length
    ? delDia.map((p) => tarjetaPedido(p, numero.get(p.id))).join("")
    : '<p class="nota">No hay pedidos para este viernes.</p>';

  const atrasados = datos.pedidos.filter((p) => p.fechaEntrega < v && (!p.entregado || !p.pagado) && v === viernesActual());
  $("#v-atrasados").innerHTML = atrasados.length
    ? '<h2 class="seccion">De viernes anteriores (sin entregar o sin pagar)</h2><div class="lista">' +
      atrasados.sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega)).map((p) => tarjetaPedido(p)).join("") + "</div>"
    : "";
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-acc]");
  if (!b) return;
  const id = b.dataset.id;
  const p = datos.pedidos.find((x) => x.id === id);
  if (b.dataset.acc === "pagado" && p) await store.actualizar("pedidos", id, { pagado: !p.pagado });
  if (b.dataset.acc === "entregado" && p) await store.actualizar("pedidos", id, { entregado: !p.entregado });
  if (b.dataset.acc === "editar" && p) abrirPedido(p);
  if (b.dataset.acc === "cliente") abrirCliente(cliente(id));
  if (b.dataset.acc === "borrar-mov" && confirm("¿Borrar este movimiento?")) await store.borrar("movimientos", id);
  if (b.dataset.acc === "borrar-pedido" && p && confirm("¿Borrar el pedido de " + p.clienteNombre + "?")) await store.borrar("pedidos", id);
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

const NOMBRE_MOV = { gasto: "Gasto", liquidacion: "Liquidación", inversion: "Inversión" };

function pintarContabilidad() {
  const r = resumenMes(datos, ui.mes);
  const s = saldos(datos);
  $("#c-titulo").textContent = nombreMes(ui.mes);
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
      esc([m.tipo === "gasto" ? m.categoria : m.socio || (m.tipo === "inversion" ? "Ambos socios" : ""), m.descripcion].filter(Boolean).join(" · ")) +
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
  $("#m-todo-caja").hidden = tipo !== "liquidacion";
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
    '<label class="etq">Ciudad para ubicar direcciones <input class="campo" name="ciudad" value="' + esc(ciudad()) + '"></label></div>' +
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
  await store.fijar("config", "precios", doc);
  alert("Precios guardados.");
});

iniciar();
