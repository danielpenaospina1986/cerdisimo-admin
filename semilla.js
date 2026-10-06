// Los 5 primeros clientes: pidieron 1 paquete cada uno el martes 6 de octubre de 2026,
// para entregar el viernes 9. Las direcciones y teléfonos se completan en Clientes.
import { PRECIOS_BASE, calcularPedido, viernesDeEntrega } from "./negocio.js";

const NOMBRES = ["Lina Castañeda", "Andrea Goez", "Camila Florez", "Daniela Aristizabal", "Susana Ocampo"];
const FECHA = "2026-10-06";

function slug(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function pedidosSemilla() {
  const items = { p1: 1 };
  const calc = calcularPedido(items, PRECIOS_BASE, false);
  return NOMBRES.map((nombre) => {
    const cid = "c-" + slug(nombre);
    return {
      cliente: { id: cid, nombre, telefono: "", direccion: "", notas: "", lat: null, lng: null, creado: FECHA },
      pedido: {
        id: "p-" + FECHA + "-" + slug(nombre),
        clienteId: cid,
        clienteNombre: nombre,
        fechaPedido: FECHA,
        fechaEntrega: viernesDeEntrega(FECHA),
        items,
        recoge: false,
        ...calc,
        pagado: false,
        entregado: false,
        notas: "",
        creado: FECHA
      }
    };
  });
}
