// Reglas del negocio: precios, costos, domicilio, fechas y reparto de ganancias.
// Valores base de la calculadora "Ganancias por pedido" (octubre de 2026). Se pueden cambiar
// desde Contabilidad → Precios y costos; cada pedido guarda los valores con que se creó.
export const PRECIOS_BASE = {
  costoPaquete: 13000,  // costo de un paquete de 5 chorizos
  costoLitro: 49300,    // litro de Aguardiente Antioqueño tapa roja
  envio: 2000,          // por pedido, al fondo de gasolina y carro
  domi: 2000,           // lo paga el cliente cuando lleva 1 o 2 paquetes
  gratisDesde: 3,       // domi gratis desde esta cantidad de paquetes
  precio1: 20000,
  precio2: 40000,
  precio3: 55000,
  precioAsado: 140000,
  precioFinquero: 330000
};

export const PRODUCTOS = [
  { id: "p1", nombre: "1 paquete", detalle: "5 chorizos", paquetes: 1, litros: 0, precio: "precio1" },
  { id: "p2", nombre: "2 paquetes", detalle: "10 chorizos", paquetes: 2, litros: 0, precio: "precio2" },
  { id: "p3", nombre: "3 paquetes", detalle: "Promo · 15 chorizos", paquetes: 3, litros: 0, precio: "precio3" },
  { id: "asado", nombre: "Combo Asado", detalle: "5 paquetes + 1 L de aguardiente", paquetes: 5, litros: 1, precio: "precioAsado" },
  { id: "finquero", nombre: "Combo Finquero", detalle: "10 paquetes + 3 L de aguardiente", paquetes: 10, litros: 3, precio: "precioFinquero" }
];

export const SOCIOS = ["Daniel", "Mariana"];

export function precios(datos) {
  const doc = datos && datos.config ? datos.config.find((c) => c.id === "precios") : null;
  return Object.assign({}, PRECIOS_BASE, doc || {});
}

// items: { p1: 2, asado: 1, ... }
export function calcularPedido(items, p, recoge) {
  let precio = 0, paquetes = 0, litros = 0;
  const lineas = [];
  PRODUCTOS.forEach((prod) => {
    const n = Number(items[prod.id] || 0);
    if (!n) return;
    precio += n * p[prod.precio];
    paquetes += n * prod.paquetes;
    litros += n * prod.litros;
    lineas.push(n + " × " + prod.nombre);
  });
  const domi = !recoge && paquetes > 0 && paquetes < p.gratisDesde ? p.domi : 0;
  const envio = recoge || paquetes === 0 ? 0 : p.envio;
  const costoProducto = paquetes * p.costoPaquete + litros * p.costoLitro;
  return {
    precio, domi, total: precio + domi, paquetes, litros, costoProducto, envio,
    ganancia: precio + domi - costoProducto - envio,
    resumen: lineas.join(", ")
  };
}

// ---------- Fechas (siempre "AAAA-MM-DD" en hora local) ----------
export function hoyISO() { return aISO(new Date()); }
export function aISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function deISO(s) { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); }
export function sumarDias(s, n) { const d = deISO(s); d.setDate(d.getDate() + n); return aISO(d); }

// El viernes de entrega de un pedido: el próximo viernes después de la fecha del pedido.
// Un pedido hecho un viernes pasa al viernes siguiente.
export function viernesDeEntrega(fechaPedido) {
  const d = deISO(fechaPedido);
  const faltan = ((5 - d.getDay() + 7) % 7) || 7;
  return sumarDias(fechaPedido, faltan);
}
// El viernes que se muestra por defecto en Entregas: hoy si es viernes, si no el próximo.
export function viernesActual() {
  const hoy = hoyISO();
  return deISO(hoy).getDay() === 5 ? hoy : viernesDeEntrega(hoy);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export function fechaLarga(s) { const d = deISO(s); return DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()]; }
export function fechaCorta(s) { if (!s) return "—"; const d = deISO(s); return d.getDate() + " " + MESES[d.getMonth()].slice(0, 3) + " " + d.getFullYear(); }
export function nombreMes(m) { const [a, mm] = m.split("-").map(Number); return MESES[mm - 1] + " de " + a; }

export function plata(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("es-CO").replace(/,/g, ".");
}
export function leerPlata(s) { return Number(String(s).replace(/\D/g, "")) || 0; }

// ---------- Contabilidad ----------
// Un pedido cuenta como ingreso cuando está pagado, en el mes de su viernes de entrega.
export function resumenMes(datos, mes) {
  const pedidos = datos.pedidos.filter((x) => (x.fechaEntrega || "").startsWith(mes));
  const pagados = pedidos.filter((x) => x.pagado);
  const sum = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
  const ventas = sum(pagados, (x) => x.total);
  const domiCobrado = sum(pagados, (x) => x.domi);
  const costoProducto = sum(pagados, (x) => x.costoProducto);
  const fondoGasolina = sum(pagados, (x) => x.envio);
  const movs = datos.movimientos.filter((m) => (m.fecha || "").startsWith(mes));
  const otrosGastos = sum(movs.filter((m) => m.tipo === "gasto" && m.categoria !== "Gasolina"), (m) => m.monto);
  const gasolinaGastada = sum(movs.filter((m) => m.tipo === "gasto" && m.categoria === "Gasolina"), (m) => m.monto);
  const gananciaBruta = ventas - costoProducto;
  const gananciaNeta = gananciaBruta - fondoGasolina - otrosGastos;
  return {
    pedidos, pagados, ventas, domiCobrado, costoProducto, fondoGasolina, gasolinaGastada,
    otrosGastos, gananciaBruta, gananciaNeta,
    porCobrar: sum(pedidos.filter((x) => !x.pagado), (x) => x.total),
    paquetes: sum(pagados, (x) => x.paquetes)
  };
}

// Saldos de todo el tiempo: ganancia neta acumulada, fondo de gasolina y lo de cada socio.
export function saldos(datos) {
  const meses = new Set();
  datos.pedidos.forEach((x) => x.fechaEntrega && meses.add(x.fechaEntrega.slice(0, 7)));
  datos.movimientos.forEach((m) => m.fecha && meses.add(m.fecha.slice(0, 7)));
  let neta = 0, fondo = 0, gasolina = 0;
  meses.forEach((m) => { const r = resumenMes(datos, m); neta += r.gananciaNeta; fondo += r.fondoGasolina; gasolina += r.gasolinaGastada; });
  const socios = {};
  SOCIOS.forEach((s) => { socios[s] = { ganado: neta / 2, liquidado: 0, invertido: 0 }; });
  let invertidoTotal = 0;
  datos.movimientos.forEach((m) => {
    if (m.tipo === "liquidacion" && socios[m.socio]) socios[m.socio].liquidado += Number(m.monto) || 0;
    if (m.tipo === "inversion") {
      invertidoTotal += Number(m.monto) || 0;
      if (m.socio && socios[m.socio]) socios[m.socio].invertido += Number(m.monto) || 0;
      else SOCIOS.forEach((s) => { socios[s].invertido += (Number(m.monto) || 0) / 2; });
    }
  });
  SOCIOS.forEach((s) => { const x = socios[s]; x.disponible = x.ganado - x.liquidado - x.invertido; });
  return { neta, fondo, gasolina, saldoFondo: fondo - gasolina, socios, invertidoTotal };
}

// Enlaces de mapas para un punto
export function enlaceGoogle(c) { return "https://www.google.com/maps/search/?api=1&query=" + c.lat + "," + c.lng; }
export function enlaceApple(c) { return "https://maps.apple.com/?ll=" + c.lat + "," + c.lng + "&q=" + encodeURIComponent(c.nombre || "Entrega"); }
export function enlaceWhatsApp(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10) d = "57" + d;
  return "https://wa.me/" + d;
}

// Ordena las paradas por cercanía (vecino más cercano) desde el primer punto o un origen.
export function ordenarRuta(paradas, origen) {
  const pend = paradas.slice();
  const ruta = [];
  let actual = origen || pend.shift();
  if (!origen && actual) ruta.push(actual);
  while (pend.length) {
    let mejor = 0, dmin = Infinity;
    pend.forEach((p, i) => { const d = (p.lat - actual.lat) ** 2 + (p.lng - actual.lng) ** 2; if (d < dmin) { dmin = d; mejor = i; } });
    actual = pend.splice(mejor, 1)[0];
    ruta.push(actual);
  }
  return ruta;
}

// Orden de reparto: arranca en la parada más al norte (la producción sale de Girardota, al norte
// de Medellín) y de ahí sigue siempre a la más cercana.
export function ordenarDesdeElNorte(paradas) {
  if (!paradas.length) return [];
  const norte = paradas.reduce((a, b) => (b.lat > a.lat ? b : a));
  return [norte].concat(ordenarRuta(paradas.filter((p) => p !== norte), norte));
}

// Orden de las paradas de un viernes ({ ...cliente, pedido }). Si ya se guardó con "Actualizar
// puntos" se respeta ese orden, y las paradas nuevas o con el pin movido van al final (de la más
// cercana a la última en adelante). Si no hay nada guardado, se ordena desde el norte.
export function ordenDeReparto(paradas, viernes) {
  const guardado = (x) => {
    const r = x.pedido.ruta;
    return r && r.viernes === viernes && r.lat === x.lat && r.lng === x.lng && Number.isFinite(r.orden) ? r.orden : null;
  };
  const conOrden = paradas.filter((x) => guardado(x) !== null).sort((a, b) => guardado(a) - guardado(b));
  const sueltas = paradas.filter((x) => guardado(x) === null);
  if (!conOrden.length) return { orden: ordenarDesdeElNorte(sueltas), sueltas: 0 };
  return { orden: conOrden.concat(ordenarRuta(sueltas, conOrden[conOrden.length - 1])), sueltas: sueltas.length };
}

// Ruta de Google Maps desde la ubicación actual por todas las paradas (máximo 10 por enlace).
export function enlaceRutaGoogle(ruta) {
  if (!ruta.length) return null;
  const pts = ruta.slice(0, 10).map((c) => c.lat + "," + c.lng);
  const destino = pts.pop();
  let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + destino;
  if (pts.length) url += "&waypoints=" + encodeURIComponent(pts.join("|"));
  return url;
}

// ---------- Inventario / producción ----------
export const CHORIZOS_POR_PAQUETE = 5;

// Lo que hay que tener listo para un viernes: todos sus pedidos (pagados o no, con domi o
// para recoger). Si es la próxima entrega, suma también los pedidos de viernes anteriores
// que siguen sin entregar, porque salen en ese mismo reparto.
export function necesidadesEntrega(pedidos, viernes, conAtrasados) {
  const delViernes = pedidos.filter((p) => p.fechaEntrega === viernes);
  const atrasados = conAtrasados ? pedidos.filter((p) => p.fechaEntrega && p.fechaEntrega < viernes && !p.entregado) : [];
  const todos = delViernes.concat(atrasados);
  const sum = (arr, k) => arr.reduce((t, p) => t + (Number(p[k]) || 0), 0);
  const porProducto = PRODUCTOS.map((prod) => {
    const unidades = todos.reduce((t, p) => t + (Number((p.items || {})[prod.id]) || 0), 0);
    return { ...prod, unidades, paquetes: unidades * prod.paquetes, litros: unidades * prod.litros };
  }).filter((x) => x.unidades);
  const porEntregar = todos.filter((p) => !p.entregado);
  const paquetes = sum(todos, "paquetes");
  return {
    pedidos: todos,
    paquetes,
    litros: sum(todos, "litros"),
    chorizos: paquetes * CHORIZOS_POR_PAQUETE,
    porProducto,
    atrasados: atrasados.length,
    paquetesAtrasados: sum(atrasados, "paquetes"),
    litrosAtrasados: sum(atrasados, "litros"),
    porEntregar: { pedidos: porEntregar.length, paquetes: sum(porEntregar, "paquetes"), litros: sum(porEntregar, "litros") },
    entregados: { pedidos: todos.length - porEntregar.length, paquetes: paquetes - sum(porEntregar, "paquetes"), litros: sum(todos, "litros") - sum(porEntregar, "litros") }
  };
}

// Viernes desde `desde` (incluido) que tienen pedidos, en orden.
export function viernesConPedidos(pedidos, desde) {
  return [...new Set(pedidos.map((p) => p.fechaEntrega).filter((f) => f && f >= desde))].sort();
}
