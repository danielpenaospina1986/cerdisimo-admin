// Ajuste de un solo uso: arqueo del 2 de noviembre de 2026 (confirmado por Daniel).
// 1. Anota 4 paquetes que Mariana recogió en la fábrica después del 25 de octubre y no se habían anotado.
// 2. El pago a la fábrica del 18 de octubre pasa de 37 a 40 paquetes (los 3 de las primeras semanas ya
//    estaban pagos por fuera), sin cambiar el monto de $518.000.
// Después de esto la app debe decir 10 paquetes en bodega y que se le debe 1 paquete a la fábrica.
import { crearStore } from "../store.js";
import {
  precios, bodega, cuentaFabrica, viernesActual, pasoElCorte, sumarDias, esDelEvento, plata
} from "../negocio.js";

const $ = (s) => document.querySelector(s);
const ARQUEO = "2026-11-02";
const PAGO_ID = "5PKhhQHAH8rrwX7868Pp"; // pago a la fábrica del 18 de octubre
const NOTA_PAGO = " (incluye 3 paquetes pagados por fuera)";

let store, datos = null, aplicando = false;

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

const fila = (dt, dd) => '<div style="display:contents"><dt>' + dt + "</dt><dd>" + dd + "</dd></div>";
const paq = (n) => n + (Math.abs(n) === 1 ? " paquete" : " paquetes");

// Las mismas cuentas que la app (Producción y Contabilidad)
function cuentas(d) {
  const normales = d.pedidos.filter((p) => !esDelEvento(p));
  const confirmado = (p) => p.origen !== "web" || !!p.pagado;
  const v = viernesActual();
  const vf = pasoElCorte(v) ? v : sumarDias(v, -7);
  return {
    bodega: bodega(normales, d.movimientos, v, null).enBodega,
    deben: cuentaFabrica(d.pedidos.filter(confirmado), d.movimientos, vf, precios(d).costoPaquete).deben
  };
}

function pendientes(d) {
  const recibido = d.movimientos.some((m) => m.arqueo === ARQUEO);
  const pago = d.movimientos.find((m) => m.id === PAGO_ID);
  return { recibido: !recibido, pago: !!pago && Number(pago.paquetes) === 37, pagoExiste: !!pago, pagoObj: pago };
}

function simular(d, f) {
  const movs = d.movimientos.map((m) => (f.pago && m.id === PAGO_ID ? { ...m, paquetes: 40 } : m));
  if (f.recibido) movs.push({ tipo: "bodega", motivo: "recibido", paquetes: 4, fecha: ARQUEO });
  return { ...d, movimientos: movs };
}

function pintar() {
  const f = pendientes(datos);
  const antes = cuentas(datos), despues = cuentas(simular(datos, f));
  $("#lista").innerHTML =
    "<li>Anotar <strong>4 paquetes recibidos</strong> (los que recogió Mariana)" + (f.recibido ? "" : " — <em>ya está hecho</em>") + ".</li>" +
    "<li>Pago a la fábrica del 18 de octubre: de <strong>37 a 40 paquetes</strong>, el monto sigue en " + plata(518000) +
    (f.pago ? "" : f.pagoExiste ? " — <em>ya está hecho</em>" : " — <em>no se encontró ese pago</em>") + ".</li>";
  $("#resumen").innerHTML =
    fila("En bodega ahora", paq(antes.bodega)) + fila("En bodega después", "<strong>" + paq(despues.bodega) + "</strong>") +
    fila("Le debemos a la fábrica ahora", paq(antes.deben)) + fila("Le debemos después", "<strong>" + paq(despues.deben) + "</strong>");
  const falta = f.recibido || f.pago;
  $("#aplicar").hidden = !falta;
  $("#aplicar").disabled = aplicando;
  $("#aplicar").textContent = aplicando ? "Guardando…" : "Hacer los ajustes";
  $("#hecho").hidden = falta;
  $("#hecho").textContent = "Listo: los ajustes ya están hechos. La app debe decir " + paq(antes.bodega) + " en bodega y que le deben " + paq(antes.deben) + " a la fábrica.";
}

$("#aplicar").addEventListener("click", async () => {
  if (aplicando || !datos) return;
  const f = pendientes(datos);
  if (!f.recibido && !f.pago) return;
  aplicando = true; $("#error").textContent = ""; pintar();
  try {
    const ahora = new Date().toISOString();
    if (f.pago) {
      await store.actualizar("movimientos", PAGO_ID, {
        paquetes: 40, monto: 518000,
        descripcion: (f.pagoObj.descripcion || "Pago a la fábrica") + NOTA_PAGO, editado: ahora
      });
    }
    if (f.recibido) {
      await store.agregar("movimientos", {
        tipo: "bodega", motivo: "recibido", paquetes: 4, fecha: ARQUEO,
        descripcion: "Recogidos por Mariana en la fábrica (arqueo del 2 nov)", arqueo: ARQUEO, creado: ahora
      });
    }
  } catch (e) {
    $("#error").textContent = "No se pudo guardar: " + e.message + ". Recarga la página e inténtalo otra vez.";
  } finally {
    aplicando = false;
    pintar();
  }
});

async function iniciar() {
  try {
    store = await crearStore();
    await store.iniciar(pedirLogin);
    store.escuchar((d) => { datos = d; $("#cargando").hidden = true; $("#contenido").hidden = false; pintar(); });
  } catch (e) {
    $("#cargando").textContent = e.message;
    console.error(e);
  }
}

iniciar();
