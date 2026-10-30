# Cerdísimo Chancho · Administración

App web (un solo HTML, sin instalar nada) para Daniel y Mariana, en `/admin/`, con cuatro tableros:

1. **Entregas**: pedidos del viernes, mapa con pines (verde = pagado, rojo = pendiente), botón **Crear pedido**, enlaces a Google Maps y Mapas de iPhone por cliente y ruta completa en Google Maps. El botón **Actualizar puntos** numera las paradas desde la más al norte (la producción sale de Girardota) y de ahí siempre a la más cercana; ese orden queda guardado en cada pedido, así Daniel y Mariana ven los mismos números y no cambian al marcar entregas. Los pedidos nuevos o con el pin movido quedan al final hasta que se vuelva a tocar el botón.
2. **Contabilidad**: por mes, ventas cobradas, costo de producto, ganancia bruta, domicilios al fondo de gasolina, otros gastos y ganancia neta; reparto 50/50, liquidaciones totales o parciales, inversiones, tanqueadas e historial. Muestra cuánta plata debe haber en Nequi y la cuenta con la fábrica (paquetes pedidos, pagados y debidos), con un botón para registrar pagos a proveedores. Incluye el editor de precios y costos.
3. **Clientes**: tabla editable (teléfono, dirección, pin), con cuántas veces y cada cuánto compra cada cliente.
4. **Producción** (inventario): en tiempo real, cuántos paquetes de chorizos y cuántos litros de guaro hay que tener para la próxima entrega. Cuenta todos los pedidos de ese viernes, pagados o no; en la próxima entrega suma también los pedidos de viernes anteriores que no se han entregado. Muestra lo entregado y lo que falta, el detalle por producto y los próximos viernes. La tarjeta **Hoy en bodega** lleva los paquetes que tienen en su poder: suben con *Recibimos de la fábrica*, bajan al marcar un pedido como entregado y se corrigen con *Corregir conteo*. Avisa en rojo (en Producción y arriba en toda la app) si no alcanzan para la próxima entrega, y sugiere cuánto pedir a la fábrica para quedar con 25 después de entregar (el 25 se cambia).

La primera vez que se abre con la base de datos vacía crea los 5 clientes del 6 de octubre de 2026 (1 paquete cada uno, entrega el viernes 9, pendientes de pago y sin dirección).

## App de pedidos para clientes (raíz del sitio)

Fase 1: los clientes entran por la dirección principal del sitio (la raíz, `index.html`; su código está en `pedidos/`). La dirección vieja `/pedidos/` redirige a la raíz. Entran con su cuenta de Google o con un enlace a su correo (sin contraseña), guardan sus datos una vez y piden para el viernes. Usa la misma base de datos que la app admin.

- **Vitrina sin entrar**: cualquiera ve la foto del producto (`assets/chorizos.jpg`, del sistema de diseño), los productos con precio y la preventa del evento, y elige. Solo al tocar *Hacer pedido* o *Comprar preventa* se le pide entrar. Lo elegido se guarda en el navegador y, si entra con el enlace del correo, viaja también en la dirección del enlace (sin las notas), por si lo abre en otro navegador. Desde el navegador de Instagram, donde Google no deja entrar, la pantalla de entrar sugiere el correo.
- **Precios de la vitrina**: quien no ha entrado lee `config/tienda`, una copia de los precios de venta y los datos de pago, sin costos. La app admin la actualiza sola cada vez que se abre con los precios al día. Si no se puede leer, la vitrina muestra los precios de `negocio.js`.

- **Corte**: jueves a las 12 m. Lo pedido antes sale ese viernes; después, el siguiente.
- **Pago**: el cliente paga al QR de Nequi (archivo `assets/nequi-qr.png`) o al número de Nequi que se configura en Contabilidad → Precios y costos, y escribe a nombre de quién sale el traslado. Mariana aprueba cuando ese nombre y el valor coinciden con lo que entró a Nequi.
- **Estados**: *Por pagar* → *Por verificar pago* (el cliente reportó a nombre de quién pagó) → *Pago aprobado* o *Pago rechazado* (lo decide Mariana en Entregas). Un pedido de la app que sigue *Por pagar* o *Rechazado* al corte se cancela solo. Quien quiera pagar contra entrega pide por WhatsApp y se crea a mano, como siempre.
- **En la app admin**: los pedidos de la app llevan la marca «App · CC-XXXXX». Entregas tiene *Aprobar pago*, *Rechazar* y *Avisar por WhatsApp* con el mensaje listo. Producción cuenta los pedidos creados a mano (pagados o no) y los de la app con pago aprobado; los que esperan pago aparecen aparte. Contabilidad solo cuenta pagados, como antes. Los cancelados no aparecen en ninguna pestaña.
- **Seguridad** (`firestore.rules`): cada cliente solo ve y edita su ficha y sus pedidos, lee los precios y nunca puede marcar un pedido como pagado o entregado. Sin entrar solo se puede leer `config/tienda`. Al aprobar, la app admin recalcula el total y avisa si no cuadra con los precios vigentes.

Para activarla en Firebase: pegar las reglas nuevas y activar el inicio de sesión con enlace al correo (**Authentication → Método de acceso → Correo electrónico/contraseña → Vínculo de correo electrónico**).

### Dominio propio
1. En el proveedor del dominio (GoDaddy), DNS: cuatro registros **A** para `@` con `185.199.108.153`, `185.199.109.153`, `185.199.110.153` y `185.199.111.153`, y un **CNAME** `www` → `TU-USUARIO.github.io`. Borrar el registro A de "Parked".
2. Cuando el dominio ya apunte a GitHub: **Settings → Pages → Custom domain**, escribirlo, guardar y, cuando GitHub lo permita, marcar **Enforce HTTPS**. Las direcciones `github.io` pasan solas al dominio.
3. Firebase, **Authentication → Configuración → Dominios autorizados**: agregar el dominio y su `www`, o no funcionará el inicio de sesión.

## Alertas de pagos

Cuando un cliente reporta un pago en la tienda, el pedido queda *Por verificar pago* y avisa de dos formas:

- **En la administración**: la campanita flotante (abajo a la derecha) cuenta los pagos por revisar de cualquier viernes, y el número también sale en el título de la pestaña. Si llega uno con la administración abierta, suena un timbre y sale un aviso. Al tocar la campanita se ven los pagos con *Aprobar pago*, *Rechazar* y *Ver pedido*.
- **Por correo** (`avisos-correo/`): un script de Google Apps Script revisa Firestore cada minuto y les escribe a los correos de la colección `socios`, con un botón que abre ese pago en la administración (`/admin/#pedido=ID`).

### Activar el aviso por correo
Con la cuenta de Google dueña del proyecto de Firebase:
1. Abrir https://script.new (crea un proyecto nuevo de Apps Script) y ponerle de nombre «Avisos Cerdísimo».
2. Borrar lo que trae `Código.gs` y pegar el contenido de `avisos-correo/Codigo.gs`.
3. En **Configuración del proyecto** (el engranaje) marcar **Mostrar el archivo de manifiesto «appsscript.json» en el editor**; volver al **Editor**, abrir `appsscript.json` y reemplazarlo por `avisos-correo/appsscript.json`. Guardar.
4. Elegir la función `instalar` y tocar **Ejecutar**. Autorizar: *Revisar permisos* → la cuenta → *Configuración avanzada* → *Ir a Avisos Cerdísimo (no seguro)* → marcar **Seleccionar todo** → *Continuar* (Google avisa porque el script es propio y no está publicado).
5. Llega a los socios el correo «Avisos de pagos activados». Para apagarlo, ejecutar `desinstalar`.

El script lee Firestore con los permisos de esa cuenta (no pasa por `firestore.rules`) y recuerda qué pagos ya avisó. Google deja mandar unos 100 correos al día desde una cuenta Gmail; si se acaba el cupo, avisa al día siguiente y la campanita sigue funcionando.

## La Chorizada Real: preventa del evento en Dogstar (20 de noviembre de 2026)

- En la tienda, arriba de los chorizos, sale la tarjeta **La Chorizada Real**: el cliente elige cuántos choripanes quiere ($10.000 cada uno en preventa; en la carpa valen $12.000), paga por Nequi como siempre y lo reclama en la carpa mostrando su código.
- La preventa cierra el sábado 14 de noviembre a las 11:59 p. m., para tener la semana del evento para producir. Lo que no se pague para entonces se cancela solo. La fecha está en `EVENTO.cierre` de `negocio.js`.
- En la administración el evento tiene su propia pestaña, **Chorizada Real**, aparte de Entregas, Producción y la cuenta con la fábrica:
  - **Preventas**: quién compró, con buscador por nombre o código, para ir entregando en la carpa (de a uno o todos). El cliente ve en su app "Entregado en parte" o "Entregado".
  - **Ventas en la carpa**: se anotan con cuántos choripanes y si pagaron por Nequi o en efectivo. Lo de efectivo no se suma a lo que debe haber en Nequi.
  - **Lo que hay que llevar**: chorizos, panes, salsas, carbón, servilletas y papel según los choripanes planeados (por defecto 125).
  - **Pagaron la preventa** (desplegable al final): lista alfabética con nombre, correo, código y choripanes recibidos, con botón **Entregado** para marcar todo de una vez en la carpa.
  - **Cuentas del evento**: ventas menos las compras del evento = ganancia del evento.
  - **Compras del evento**: se registran como inversiones con la casilla «Es para La Chorizada Real (Dogstar)» (desde el botón de la pestaña o desde Contabilidad). En Contabilidad salen con las demás inversiones, marcadas «Dogstar», y la lista se puede filtrar: todas, solo Dogstar o sin Dogstar.
- Precios y costo por choripán (pan, salsas y carbón, sin el chorizo) se cambian en Contabilidad → Precios y costos. Datos del evento en `EVENTO` de `negocio.js`.

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
- Todo movimiento (gasto, tanqueada, liquidación, inversión o pago a proveedor) se puede corregir (✎) o borrar (✕) desde Movimientos del mes. La tarjeta de Inversiones tiene además el desplegable «Inversiones registradas» con todas las inversiones, de cualquier mes.
- Debe haber en Nequi = todo lo cobrado − pagos a proveedores − gastos (gasolina y otros) − liquidaciones − inversiones, desde el primer pedido. Supone que toda la plata entra y sale por Nequi.
- Pagos a proveedores (la fábrica y la licorera): salen de Nequi pero no cambian la ganancia, porque el costo de los chorizos y del aguardiente ya se resta en cada pedido pagado. Un pago a la fábrica lleva cuántos paquetes paga; el monto se calcula con el costo por paquete y se puede cambiar a mano. Empaques, insumos y demás compras no están en ese costo: van como gasto y sí se restan de la ganancia.
- Paquetes pedidos a la fábrica = los paquetes que cuenta Producción (pedidos a mano y pedidos de la app con pago aprobado) con viernes de entrega ya cerrado: el viernes de esta semana entra desde el corte del jueves a las 12 m. A la fábrica se le paga por cortes (cada 15 o 20 días, lo que se deba hasta ese día), así que no hay cuenta por viernes: debemos = paquetes pedidos − paquetes pagados. Cada pago se puede corregir (✎) o borrar (✕) desde la lista «Pagos a la fábrica» o desde Movimientos del mes; dos pagos con la misma fecha, paquetes y monto se marcan «¿Repetido?».
- Bodega (desde el 25 de octubre de 2026, cuando la fábrica les dejó 25 paquetes en su poder): empieza con el primer *Recibimos de la fábrica*. Desde ese día la cuenta con la fábrica suma lo recibido en vez de lo vendido (los pedidos de antes siguen contando como se producían, uno por uno), y los pedidos con entrega desde ese día salen de la bodega cuando se marcan como entregados. En bodega = recibido + ajustes − entregado (pagado o no) + pedidos de antes de la bodega que siguen sin entregar (ya están en la cuenta con la fábrica). Quedan = en bodega − lo que falta entregar hasta el próximo viernes (incluye viernes pasados sin entregar). Sugerido = lo que falta para quedar con el objetivo (25 por defecto) después de entregar. Al corregir el conteo, si hay más de lo que dice la app (por ejemplo, paquetes que uno de los dos recogió directo en la fábrica y entregó), la diferencia se guarda como recibida y sube la deuda; si hay menos (regalados, dañados), solo baja la bodega. El conteo es siempre de hoy y avisa si hay pedidos de hoy o de antes sin marcar como entregados (hay que marcarlos antes de contar). Si la app da menos de 0 en bodega, el aviso pide contar antes de pedir. Cambiar la fecha del primer recibido o borrarlo pide confirmación, porque cambia desde qué día los pedidos salen de la bodega. La nota de Nequi separa lo que se le debe a la fábrica por lo ya vendido de lo que sigue en bodega. Los chorizos de La Chorizada Real van aparte.
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
Sube estos archivos a un repositorio y en **Settings → Pages** elige la rama `main` y la carpeta `/ (root)`. La tienda queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` y la administración en `…/NOMBRE-DEL-REPO/admin/`. En el iPhone, desde Safari: Compartir → Agregar a inicio.

### Modo prueba
Si `firebase-config.js` está vacío, la app funciona igual pero guarda los datos solo en ese navegador.

## Mapas
- Mapa con Leaflet y OpenStreetMap; las direcciones se ubican con Nominatim (OpenStreetMap), agregando la ciudad configurada (Medellín por defecto).
- Las direcciones colombianas con "#" no siempre se encuentran exactas: en Clientes se puede arrastrar el pin o tocar el mapa en el punto correcto.

## Archivos
Administración: `admin/index.html`, `admin/app.js` (pantallas). Compartidos: `styles.css` (tokens del sistema de diseño), `negocio.js` (precios, cuentas y corte), `store.js` (Firestore o modo prueba), `semilla.js` (5 clientes iniciales), `firebase-config.js`, `firestore.rules`. Aviso por correo: `avisos-correo/Codigo.gs` y `avisos-correo/appsscript.json` (Google Apps Script). Tienda para clientes: `index.html`, `pedidos/app.js`, `pedidos/datos.js`, `pedidos/pedidos.css`, `pedidos/animaciones.css` y `pedidos/animar.js` (movimiento de caricatura de los botones), `assets/chorizos.jpg` (`pedidos/index.html` solo redirige a la raíz).

Guía de diseño para Claude: `.claude/skills/frontend-design/` es la skill **frontend-design** de Anthropic ([anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design), licencia Apache 2.0), traída el 30 de octubre de 2026. Claude la usa al cambiar la tienda o la administración; si choca con el sistema de diseño de la marca, manda el sistema de diseño.
