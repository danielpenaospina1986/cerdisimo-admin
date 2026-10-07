// Ajuste de un solo uso (octubre de 2026): recalcula costoProducto y ganancia de los pedidos
// que ya existen con el costo por paquete y por litro que está hoy en Precios y costos.
// No cambia precios, domicilios, totales, pagos ni entregas. Los pedidos nuevos ya guardan
// el costo vigente al crearse, así que esto solo hace falta cuando se quiere corregir el pasado.
import { crearStore, modoPrueba } from "../store.js";
import { precios, plata, fechaCorta, saldos, SOCIOS } from "../negocio.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;

let store;
let datos = null;
let aplicando = false;
let aplicados = 0;

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

// Lo que cambiaría en cada pedido con los costos de hoy
export function calcularCambios(d) {
  const p = precios(d);
  return d.pedidos.map((x) => {
    const costo = num(x.paquetes) * p.costoPaquete + num(x.litros) * p.costoLitro;
    const ganancia = num(x.total) - costo - num(x.envio);
    return { pedido: x, costoAntes: num(x.costoProducto), costo, gananciaAntes: num(x.ganancia), ganancia };
  }).filter((c) => c.costo !== num(c.pedido.costoProducto) || c.ganancia !== num(c.pedido.ganancia))
    .sort((a, b) => (a.pedido.fechaEntrega || "").localeCompare(b.pedido.fechaEntrega || "") || (a.pedido.clienteNombre || "").localeCompare(b.pedido.clienteNombre || ""));
}

function fila(dt, dd, clase) { return '<div class="' + (clase || "") + '" style="display:contents"><dt>' + dt + "</dt><dd>" + dd + "</dd></div>"; }

function pintar() {
  const p = precios(datos);
  const cambios = calcularCambios(datos);
  const paquetes = cambios.reduce((t, c) => t + num(c.pedido.paquetes), 0);
  const costoAntes = cambios.reduce((t, c) => t + c.costoAntes, 0);
  const costoDespues = cambios.reduce((t, c) => t + c.costo, 0);

  $("#explicacion").innerHTML = "Recalcula el costo de los pedidos que ya están en la app con los valores de hoy en Precios y costos: <strong>" +
    plata(p.costoPaquete) + " por paquete</strong> y <strong>" + plata(p.costoLitro) + " por litro de aguardiente</strong>. " +
    "No cambia lo que paga el cliente, los domis, los pagos ni las entregas.";

  // Efecto en la contabilidad acumulada y en lo disponible de cada socio
  const simulado = { ...datos, pedidos: datos.pedidos.map((x) => { const c = cambios.find((k) => k.pedido.id === x.id); return c ? { ...x, costoProducto: c.costo, ganancia: c.ganancia } : x; }) };
  const antes = saldos(datos), despues = saldos(simulado);

  $("#resumen").innerHTML = !cambios.length ? fila("Ganancia neta acumulada", plata(antes.neta)) :
    fila("Pedidos que cambian", String(cambios.length)) +
    fila("Paquetes en esos pedidos", String(paquetes)) +
    fila("Costo de producto antes", plata(costoAntes)) +
    fila("Costo de producto después", plata(costoDespues)) +
    fila("Diferencia", (costoDespues >= costoAntes ? "+" : "") + plata(costoDespues - costoAntes), "suma") +
    '<div class="sep"></div>' +
    fila("Ganancia neta acumulada antes", plata(antes.neta)) +
    fila("Ganancia neta acumulada después", plata(despues.neta));

  $("#socios").hidden = !cambios.length;
  $("#socios").innerHTML = SOCIOS.map((s) =>
    '<div class="tarjeta"><p class="socio-nombre">' + s + '</p><dl class="cuentas">' +
    fila("Disponible antes", plata(antes.socios[s].disponible)) +
    fila("Disponible después", plata(despues.socios[s].disponible), "suma") + "</dl></div>").join("");

  $("#tabla-t").hidden = !cambios.length;
  $("#tabla").parentElement.hidden = !cambios.length;
  // En el celular se ven primero las columnas que importan; producto y fecha quedan a la derecha
  $("#tabla").innerHTML = "<thead><tr><th>Cliente</th><th class=num>Costo antes</th><th class=num>Costo nuevo</th><th class=num>Ganancia nueva</th><th>Producto</th><th>Entrega</th></tr></thead><tbody>" +
    cambios.map((c) => "<tr><td>" + esc(c.pedido.clienteNombre) + '</td><td class="num">' + plata(c.costoAntes) + '</td><td class="num">' + plata(c.costo) +
      '</td><td class="num">' + plata(c.ganancia) + "</td><td>" + esc(c.pedido.resumen) + "</td><td>" + fechaCorta(c.pedido.fechaEntrega) + "</td></tr>").join("") + "</tbody>";

  const btn = $("#aplicar");
  btn.hidden = !cambios.length;
  btn.disabled = aplicando;
  btn.textContent = aplicando ? "Actualizando…" : "Actualizar " + cambios.length + (cambios.length === 1 ? " pedido" : " pedidos");

  const hecho = $("#hecho");
  if (!cambios.length) {
    hecho.hidden = false;
    // En Firestore la vista local cambia antes de que el servidor confirme
    hecho.textContent = aplicando ? "Guardando los cambios…"
      : (aplicados ? "Listo: se actualizaron " + aplicados + (aplicados === 1 ? " pedido" : " pedidos") + ". " : "") +
        "Todos los pedidos ya usan " + plata(p.costoPaquete) + " por paquete. Puedes volver a la app.";
  } else hecho.hidden = true;
}

$("#aplicar").addEventListener("click", async () => {
  if (aplicando || !datos) return;
  const cambios = calcularCambios(datos);
  if (!cambios.length) return;
  const p = precios(datos);
  if (!(p.costoPaquete > 0) || !(p.costoLitro > 0)) {
    $("#error").textContent = "El costo por paquete o por litro está en $0 en Precios y costos. Corrígelo en la app antes de actualizar.";
    return;
  }
  if (!confirm("¿Actualizar el costo de " + cambios.length + (cambios.length === 1 ? " pedido" : " pedidos") + " a " + plata(p.costoPaquete) +
    " por paquete y " + plata(p.costoLitro) + " por litro de aguardiente?")) return;
  aplicando = true; $("#error").textContent = ""; pintar();
  try {
    // Uno por uno: cada escritura valida las reglas por separado (un lote grande puede pasar el
    // límite de consultas de las reglas). Si alguno falla, al recargar quedan solo los pendientes.
    await Promise.all(cambios.map((c) => store.actualizar("pedidos", c.pedido.id, { costoProducto: c.costo, ganancia: c.ganancia })));
    aplicados = cambios.length;
  } catch (e) {
    $("#error").textContent = "No se pudo actualizar: " + e.message + ". No se perdió nada; recarga la página e inténtalo otra vez.";
  } finally {
    aplicando = false;
    pintar();
  }
});

async function iniciar() {
  if (modoPrueba) $("#aviso-prueba").hidden = false;
  try {
    store = await crearStore();
    await store.iniciar(pedirLogin);
    store.escuchar((d) => {
      datos = d;
      $("#cargando").hidden = true;
      $("#contenido").hidden = false;
      pintar();
    });
  } catch (e) {
    $("#cargando").textContent = e.message;
    console.error(e);
  }
}

iniciar();
