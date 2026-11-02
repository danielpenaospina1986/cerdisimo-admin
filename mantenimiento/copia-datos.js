// Copia de solo lectura de pedidos, movimientos y config para revisar las cuentas (arqueo).
// No escribe nada en la base de datos. Deja por fuera la ficha de los clientes (teléfono, dirección).
import { crearStore } from "../store.js";
import { hoyISO } from "../negocio.js";

const $ = (s) => document.querySelector(s);
let texto = "";

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
const avisar = (t) => { const h = $("#hecho"); h.hidden = false; h.textContent = t; };

function pintar(d) {
  const copia = { generado: new Date().toISOString(), pedidos: d.pedidos, movimientos: d.movimientos, config: d.config };
  texto = JSON.stringify(copia, null, 1);
  $("#resumen").innerHTML = fila("Pedidos", String(d.pedidos.length)) + fila("Movimientos", String(d.movimientos.length));
}

$("#descargar").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  a.download = "cerdisimo-datos-" + hoyISO() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  avisar("Listo: se descargó el archivo. Mándaselo a Claude en el hilo.");
});

$("#copiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(texto); avisar("Copiado. Pégalo en el hilo con Claude."); }
  catch (e) { avisar("No se pudo copiar: usa «Descargar archivo»."); }
});

async function iniciar() {
  try {
    const store = await crearStore();
    await store.iniciar(pedirLogin);
    store.escuchar((d) => { $("#cargando").hidden = true; $("#contenido").hidden = false; pintar(d); });
  } catch (e) {
    $("#cargando").textContent = e.message;
    console.error(e);
  }
}

iniciar();
