# Cerdísimo Chancho · Administración

App web (un solo HTML, sin instalar nada) para Daniel y Mariana, con cuatro tableros:

1. **Entregas**: pedidos del viernes, mapa con pines (verde = pagado, rojo = pendiente), botón **Crear pedido**, enlaces a Google Maps y Mapas de iPhone por cliente y ruta completa en Google Maps.
2. **Contabilidad**: por mes, ventas cobradas, costo de producto, ganancia bruta, domicilios al fondo de gasolina, otros gastos y ganancia neta; reparto 50/50, liquidaciones totales o parciales, inversiones, tanqueadas e historial. Incluye el editor de precios y costos.
3. **Clientes**: tabla editable (teléfono, dirección, pin), con cuántas veces y cada cuánto compra cada cliente.
4. **Producción** (inventario): en tiempo real, cuántos paquetes de chorizos y cuántos litros de guaro hay que tener para la próxima entrega. Cuenta todos los pedidos de ese viernes, pagados o no; en la próxima entrega suma también los pedidos de viernes anteriores que no se han entregado. Muestra lo entregado y lo que falta, el detalle por producto y los próximos viernes.

La primera vez que se abre con la base de datos vacía crea los 5 clientes del 6 de octubre de 2026 (1 paquete cada uno, entrega el viernes 9, pendientes de pago y sin dirección).

## Reglas de negocio (de la calculadora "Ganancias por pedido")

| Producto | Precio |
| --- | --- |
| 1 paquete | $20.000 |
| 2 paquetes | $40.000 |
| 3 paquetes (promo) | $55.000 |
| Combo Asado (5 paq. + 1 L) | $140.000 |
| Combo Finquero (10 paq. + 3 L) | $330.000 |

- Domi: $2.000 que paga el cliente si lleva 1 o 2 paquetes; gratis desde 3. Si lo recoge, no hay domi.
- Cada pedido con domicilio aparta $2.000 al fondo de gasolina (sale de la ganancia).
- Costo: $13.000 por paquete y $49.300 por litro de aguardiente.
- Un pedido cuenta como ingreso cuando está pagado, en el mes de su viernes de entrega.
- Ganancia bruta = ventas − costo de producto. Ganancia neta = bruta − fondo de gasolina − otros gastos. Se reparte 50% Daniel y 50% Mariana.
- Las tanqueadas se registran como gasto "Gasolina" y salen del fondo, no de la ganancia.
- Liquidar e invertir descuentan del disponible de cada socio (una inversión de "ambos" descuenta 50 y 50).
- Viernes de entrega: el próximo viernes después de la fecha del pedido (un pedido hecho un viernes va al siguiente). Se puede cambiar a mano.

## Puesta en marcha

### 1. Firebase (base de datos)
1. En https://console.firebase.google.com crea un proyecto (por ejemplo `cerdisimo-chancho`). Analytics no hace falta.
2. **Build → Firestore Database → Crear base de datos**, modo producción, ubicación `southamerica-east1` o `us-east1`.
3. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
4. **Build → Authentication → Comenzar → Google**: actívalo.
5. **Authentication → Configuración → Dominios autorizados**: agrega `TU-USUARIO.github.io`.
6. **Firestore → Datos → Iniciar colección** `socios`; crea un documento cuyo ID sea el correo de Google de Daniel (campo `nombre: "Daniel"`) y otro con el de Mariana. Solo esas cuentas pueden entrar.
7. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra la app y copia el objeto `firebaseConfig` en `firebase-config.js`.

Las claves de `firebase-config.js` no son secretas: la seguridad la ponen las reglas y la lista de `socios`.

### 2. GitHub Pages
Sube estos archivos a un repositorio y en **Settings → Pages** elige la rama `main` y la carpeta `/ (root)`. La app queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. En el iPhone, desde Safari: Compartir → Agregar a inicio.

### Modo prueba
Si `firebase-config.js` está vacío, la app funciona igual pero guarda los datos solo en ese navegador.

## Mapas
- Mapa con Leaflet y OpenStreetMap; las direcciones se ubican con Nominatim (OpenStreetMap), agregando la ciudad configurada (Medellín por defecto).
- Las direcciones colombianas con "#" no siempre se encuentran exactas: en Clientes se puede arrastrar el pin o tocar el mapa en el punto correcto.

## Archivos
`index.html`, `styles.css` (tokens del sistema de diseño), `app.js` (pantallas), `negocio.js` (precios y cuentas), `store.js` (Firestore o modo prueba), `semilla.js` (5 clientes iniciales), `firebase-config.js`, `firestore.rules`.
