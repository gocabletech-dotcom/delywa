// Delywa · Contenido del manual interactivo (mismo modelo que el de FoodPOS).
// Cada módulo usa una captura real (cap) y puntos (spots): [selector CSS que ubica el punto en
// la captura, texto que se muestra]. Las posiciones las calcula scripts/manual/capturas.mjs y
// quedan en capturas.json; si un selector no aparece en la captura, ese punto no se muestra.

export type Icono =
  | "map" | "home" | "package" | "check" | "chef" | "truck" | "undo" | "history" | "chat" | "bike" | "phone"
  | "clipboard" | "money" | "chart" | "users" | "contact" | "gear" | "link" | "whatsapp" | "building" | "key"
  | "login" | "route" | "pause" | "store" | "cart" | "pin" | "card" | "eye";

export interface Modulo {
  id: string;
  icono: Icono;
  titulo: string;
  /** Pantalla del panel que explica (para "Abrir esta pantalla"). */
  ruta?: string;
  que: string;
  cap?: string;
  spots: Array<[string, string]>;
  pasos?: string[];
  tips?: string[];
  faq?: Array<[string, string]>;
}

export interface Manual {
  titulo: string;
  corto: string;
  icono: Icono;
  color: string;
  intro: string;
  /** Dirección que se muestra en la barra del marco de la captura. */
  url: string;
  empieza: string[];
  grupos: Array<[string, string[]]>;
  modulos: Modulo[];
}

export type ClaveManual = "negocio" | "repartidor" | "cliente";

export const GUIA: Record<ClaveManual, Manual> = {
  // ============================================================ NEGOCIO
  negocio: {
    titulo: "Manual del negocio",
    corto: "Negocio",
    icono: "store",
    color: "#17804F",
    intro: "Todo lo que necesitas para atender tu colmado con Delywa: recibir pedidos por el chat, confirmarlos, prepararlos, mandarlos con tu repartidor, cuadrar el efectivo y ver tus números.",
    url: "delywa.com/negocio",
    empieza: ["moverte", "configuracion", "chat-pagina", "repartidores", "pedidos", "confirmar"],
    grupos: [
      ["Empieza aquí", ["moverte"]],
      ["El día a día", ["inicio", "pedidos", "confirmar", "preparar", "asignar", "devuelta", "transferencia", "retorno", "historial"]],
      ["Chats", ["chats", "chat-abierto"]],
      ["Reparto", ["repartidores", "cuadres", "confirmar-cuadre"]],
      ["Dinero", ["ventas", "reportes"]],
      ["Mi negocio", ["clientes", "empleados"]],
      ["Ajustes", ["configuracion", "chat-pagina", "whatsapp", "sucursales", "usuarios"]],
    ],
    modulos: [
      {
        id: "moverte", icono: "map", titulo: "Cómo moverte por Delywa", ruta: "dashboard", cap: "inicio",
        que: "El menú de la izquierda está ordenado como este manual: arriba lo de todos los días (Inicio, Pedidos y Chats) y debajo Mi negocio, Dinero y Ajustes. En el celular el menú está abajo.",
        spots: [
          ['[data-testid="text-negocio-name"], [data-testid="text-header-negocio-name"]', "Tu negocio y tu rol (Dueño, Colmadero o Despachador). Si tienes sucursales, aquí ves en cuál estás trabajando."],
          ['[data-testid="nav-pedidos"], [data-testid="bottom-nav-pedidos"]', "Pedidos: el número te dice cuántos esperan que los confirmes."],
          ['[data-testid="nav-conversaciones"], [data-testid="bottom-nav-conversaciones"]', "Chats: los mensajes de tus clientes, como en WhatsApp. El número son los mensajes sin leer."],
          ['[data-testid="nav-deliveries"], [data-testid="bottom-nav-deliveries"]', "Mi negocio: repartidores, clientes y empleados."],
          ['[data-testid="nav-ventas"], [data-testid="bottom-nav-otras"]', "Dinero: ventas del día, cuadres de los repartidores y reportes. El Despachador no ve esta parte."],
          ['[data-testid="nav-settings"]', "Ajustes: configuración, WhatsApp, sucursales y usuarios."],
          ['[data-testid="button-refresh"]', "Actualizar: vuelve a pedir los datos. Normalmente no hace falta: la pantalla se actualiza sola cuando entra algo nuevo."],
        ],
        pasos: [
          "Lo que más usas está arriba: Inicio, Pedidos y Chats.",
          "En el celular usa el menú de abajo: Inicio, Pedidos, Chats, Reparto y Más (ahí están las demás opciones).",
          "Mi negocio: Repartidores, Clientes y Empleados.",
          "Dinero: Ventas, Cuadres y Reportes.",
          "Ajustes: Configuración, WhatsApp, Sucursales y Usuarios y permisos.",
          "El Manual de uso está al final del menú; desde cada tema puedes abrir la pantalla que explica.",
        ],
        tips: [
          "Las pantallas se actualizan solas: si un cliente pide o un repartidor entrega, lo ves al momento sin recargar.",
          "Cada persona ve solo lo que su rol permite. Por ejemplo, el Despachador no ve Dinero ni Configuración.",
        ],
        faq: [
          ["¿Por qué no veo Configuración o Ventas?", "Tu usuario es Despachador. Esas pantallas son del Dueño y del Colmadero. Pídele al dueño que cambie tu rol si lo necesitas."],
          ["¿Se cierra la sesión sola?", "Sí, después de un rato sin uso, por seguridad. Vuelves a entrar con tu correo y contraseña."],
        ],
      },
      {
        id: "inicio", icono: "home", titulo: "Inicio", ruta: "dashboard", cap: "inicio",
        que: "El resumen de tu día: lo que has vendido, lo que falta por confirmar, tus repartidores y los últimos pedidos.",
        spots: [
          ['[data-testid="aviso-por-confirmar"]', "Aviso de pedidos por confirmar. Tócalo para ir directo a confirmarlos."],
          ['[data-testid^="stat-ventas"]', "Lo vendido hoy: solo cuenta los pedidos entregados."],
          ['[data-testid="stat-pendientes"]', "Pedidos que todavía no se han cerrado."],
          ['[data-testid="stat-repartidores"]', "Repartidores disponibles ahora mismo."],
          ['[data-testid^="pedido-"]', "Los últimos pedidos. Toca uno para verlo en Pedidos."],
          ['[data-testid^="delivery-"]', "Tus repartidores y su estado. Desde aquí puedes ponerlos en descanso."],
        ],
        pasos: ["Abre Inicio al empezar el día.", "Si sale el aviso amarillo, confirma esos pedidos primero.", "Revisa que tengas repartidores disponibles antes de que lleguen los pedidos."],
        tips: ["Las ventas de hoy se cuentan con la hora de tu país, no con la del servidor."],
      },
      {
        id: "pedidos", icono: "package", titulo: "Pedidos: el tablero del día", ruta: "pedidos", cap: "pedidos",
        que: "Todos los pedidos de hoy en cuatro columnas, de izquierda a derecha: Por confirmar, Preparando, En camino y Cerrados. Cada tarjeta tiene un botón grande con lo que toca hacer ahora.",
        spots: [
          ['[data-testid="resumen-confirmar"], [data-testid="columna-tab-confirmar"]', "Cuántos pedidos hay en cada columna. En el celular, toca una para verla. Vendido hoy suma solo lo entregado."],
          ['[data-testid="columna-confirmar"]', "Por confirmar: pedidos nuevos que llegaron por el chat. Hay que ponerles precio y confirmarlos."],
          ['[data-testid="columna-preparando"], [data-testid="columna-tab-preparando"]', "Preparando: confirmados que se están armando o ya están listos para salir."],
          ['[data-testid="columna-camino"], [data-testid="columna-tab-camino"]', "En camino: los tiene un repartidor. Aquí también salen los que no se pudieron entregar."],
          ['[data-testid="columna-cerrados"], [data-testid="columna-tab-cerrados"]', "Cerrados hoy: entregados, cancelados y devoluciones ya recibidas."],
          ['[data-testid="columna-confirmar"] [data-testid^="principal-"]', "El botón del paso que toca: Confirmar pedido, Empezar a preparar, Marcar listo, Asignar repartidor, Marcar entregado…"],
          ['[data-testid="columna-confirmar"] [data-testid^="mas-opciones-"]', "Más opciones (los tres puntos): editar, cambiar a recoger en el colmado, juntar con otro pedido, imprimir, compartir el seguimiento o cancelar."],
          ['[data-testid="link-preparacion"]', "Preparación: una pantalla aparte para quien arma los pedidos."],
        ],
        pasos: [
          "Un pedido nuevo entra en Por confirmar con la etiqueta «Sin precio».",
          "Confírmalo con los precios. Pasa a Preparando.",
          "Pulsa «Empezar a preparar» y, cuando esté armado, «Marcar listo».",
          "Pulsa «Asignar repartidor». Pasa a En camino.",
          "El repartidor lo marca entregado desde su portal (o lo marcas tú). Pasa a Cerrados.",
        ],
        tips: [
          "En el celular ves una columna a la vez: cambia de columna con las pestañas de arriba.",
          "«Ver detalle» abre todo el pedido: productos, dirección, distancia, forma de pago y notas del cliente.",
          "Si el cliente viene a buscarlo, usa Más opciones → «Cambiar a recoger»: ya no pasa por repartidor.",
        ],
        faq: [
          ["¿Dónde están los pedidos de ayer?", "En la pestaña Historial, arriba del tablero. Hoy muestra solo lo del día y lo que sigue abierto."],
          ["Un cliente pidió dos veces, ¿qué hago?", "En Más opciones → «Juntar con otro pedido» unes los dos en uno solo."],
        ],
      },
      {
        id: "confirmar", icono: "check", titulo: "Confirmar un pedido", ruta: "pedidos", cap: "confirmar",
        que: "Antes de preparar, revisas lo que pidió el cliente, pones los precios, corriges lo que haga falta y le mandas el total. Se abre un panel fijo a la derecha (en el celular, la pantalla completa) que no se cierra si tocas fuera, para que no pierdas los precios.",
        spots: [
          ['[role="dialog"] input[type="text"], [role="dialog"] input:not([type])', "El producto. Si no tienes esa marca o presentación, cambia el nombre por lo que sí tienes; el cliente lo ve en la confirmación."],
          ['[role="dialog"] input[step="0.01"]', "El precio de cada producto. Los que el cliente pidió por dinero («10 pesos de ajo») ya vienen con su precio."],
          ['[data-testid="input-new-product-nombre"]', "Agregar un producto que el cliente pidió aparte o que faltó anotar."],
          ['[data-testid="button-enviar-confirmacion"]', "Confirmar y enviar al cliente: recibe la lista con precios y el total, y el pedido pasa a Preparando. Si paga por transferencia, también le llegan tus cuentas."],
        ],
        pasos: [
          "En Por confirmar, pulsa «Confirmar pedido».",
          "Escribe el precio de cada producto.",
          "Si no tienes algo, cambia el nombre por lo que sí tienes o quítalo con la ×.",
          "Revisa el delivery y el total que paga el cliente.",
          "Pulsa «Confirmar y enviar al cliente».",
        ],
        tips: [
          "Si el colmado tiene WhatsApp conectado, el aviso sale por WhatsApp; si no, se abre WhatsApp con el mensaje listo para que lo envíes tú. En el chat del colmado el cliente lo recibe al momento.",
          "No se puede confirmar con productos sin precio: la pantalla te avisa cuál falta.",
          "Para corregir un pedido ya confirmado usa Más opciones → Editar: cambias productos y el total.",
        ],
        faq: [
          ["El cliente dijo «dame 10 de ajo», ¿son 10 ajos?", "No. Cuando el número va con «pesos», «RD$» o es 5 o más sin unidad, el bot lo toma como dinero: «RD$10 de ajo»."],
          ["¿Y si no tengo un producto?", "Quítalo con la × o cambia el nombre por otro que sí tengas. Si es un cambio grande, escríbele antes al cliente por Chats."],
        ],
      },
      {
        id: "preparar", icono: "chef", titulo: "Preparar el pedido", ruta: "pedidos", cap: "preparar",
        que: "En la columna Preparando cada pedido pasa por dos pasos: «Empezar a preparar» y «Marcar listo». Así todos saben qué se está armando y qué ya puede salir.",
        spots: [
          ['[data-testid="principal-3"]', "Pedido que se está armando: cuando termines, pulsa «Marcar listo»."],
          ['[data-testid="asignar-ya-3"]', "¿Hay prisa? «Asignar repartidor ya» lo manda sin esperar a que esté listo."],
          ['[data-testid="principal-4"]', "Pedido listo: ya puedes asignarle un repartidor."],
          ['[data-testid="link-preparacion"]', "Preparación: pantalla solo con lo que hay que armar, útil en una tableta en el mostrador."],
        ],
        pasos: ["Pulsa «Empezar a preparar».", "Arma el pedido con la lista de la tarjeta.", "Pulsa «Marcar listo».", "Asigna el repartidor."],
        tips: ["Si el cliente viene a buscarlo, después de «Marcar listo» el botón dice «Entregado al cliente»."],
      },
      {
        id: "asignar", icono: "truck", titulo: "Asignar repartidor", ruta: "pedidos", cap: "asignar",
        que: "Eliges quién lleva el pedido. El repartidor lo recibe en su portal y el cliente recibe el aviso de que va en camino.",
        spots: [
          ['[data-testid="select-delivery-1"]', "Toca el repartidor que va a llevar el pedido. «Activo» quiere decir que está disponible."],
          ['[data-testid="whatsapp-delivery-1"]', "Mandarle el pedido a ese repartidor por WhatsApp, si prefieres avisarle así."],
          ['[data-testid="select-delivery-2"]', "Un repartidor en descanso: no está recibiendo pedidos en este momento."],
        ],
        pasos: ["En el pedido listo, pulsa «Asignar repartidor».", "Toca el repartidor.", "Si paga en efectivo y necesita cambio, sigue con la devuelta (próximo tema)."],
        tips: ["Para cambiar de repartidor usa Más opciones → Reasignar."],
      },
      {
        id: "devuelta", icono: "money", titulo: "La devuelta del repartidor", ruta: "pedidos", cap: "devuelta",
        que: "Si el cliente paga en efectivo con un billete grande, le das al repartidor el cambio (la devuelta) antes de salir. Queda anotado y él lo cuadra al volver.",
        spots: [
          ['[data-testid^="asignar-input-vuelto"]', "Cuánto le das. Ya viene calculado con lo que el cliente dijo que paga."],
          ['[data-testid^="asignar-entregar-vuelto"]', "Confirma que se lo entregaste. Sale en su portal y en su cuadre."],
        ],
        pasos: ["Cuenta la devuelta.", "Dásela al repartidor.", "Confirma la entrega de la devuelta."],
        tips: [
          "Si se te olvidó, la tarjeta en camino muestra «Falta darle la devuelta al repartidor» con el botón Registrar.",
          "En Cuadres tienes el historial de todas las devueltas que le diste a cada repartidor.",
        ],
        faq: [["¿Y si el pedido no se entrega?", "El repartidor te devuelve el pedido y esa devuelta. Se descuenta en su cuadre."]],
      },
      {
        id: "transferencia", icono: "card", titulo: "Pagos por transferencia", ruta: "pedidos", cap: "transferencia",
        que: "Cuando el cliente paga por transferencia, le llegan tus cuentas y se le pide la foto del comprobante. Tú la revisas y apruebas el pago. Mientras no lo apruebes, nadie puede marcar el pedido entregado.",
        spots: [
          ['[data-testid="transferencia-10"]', "El estado del pago: si falta el comprobante o si el cliente ya lo envió."],
          ['[data-testid="pedir-comprobante-10"], [data-testid="ver-comprobante-tarjeta-10"]', "Pedir comprobante: al cliente le llegan tus cuentas y que debe enviar la foto. Cuando la envíe, aquí sale «Ver comprobante»."],
          ['[data-testid="principal-10"]', "Aprobar pago: cuando veas el dinero en tu banco. Al cliente le llega la confirmación y ya se puede entregar."],
        ],
        pasos: [
          "Pon tus cuentas en Configuración → Formas de pago (banco, tipo, número y a nombre de quién).",
          "El cliente elige Transferencia y recibe tus cuentas en el chat.",
          "Si no ha enviado la foto, pulsa «Pedir comprobante».",
          "Revisa la foto y tu banco, y pulsa «Aprobar pago».",
          "El pedido puede salir antes de aprobarlo, pero el repartidor no lo podrá marcar entregado hasta que lo apruebes.",
        ],
        tips: [
          "El repartidor ve en su portal «Transferencia sin aprobar» y un botón para llamarte.",
          "Si el repartidor entrega sin aprobación y el comprobante resulta falso, ese dinero lo paga él (así se lo dice el portal).",
        ],
        faq: [["¿Dónde se guarda la foto?", "En el pedido: «Ver comprobante» la abre. También queda en la conversación del cliente."]],
      },
      {
        id: "retorno", icono: "undo", titulo: "No se pudo entregar (devoluciones)", ruta: "pedidos", cap: "retorno",
        que: "Si el cliente no estaba, no contestó o rechazó el pedido, el repartidor lo marca como no entregado. El pedido sale en rojo hasta que vuelve al colmado.",
        spots: [
          ['[data-testid="retorno-abierto-6"]', "El motivo, quién lo trae de vuelta y la devuelta que debe devolver."],
          ['[data-testid="entregar-retorno-6"]', "¿El cliente apareció o pidió que se lo lleven? Márcalo entregado mientras el repartidor todavía lo tiene."],
          ['[data-testid="principal-6"]', "Cuando el repartidor llegue con el pedido, pulsa «Recibir devolución»."],
          ['[data-testid="mas-opciones-6"]', "Más opciones. En un pedido en camino, aquí está «No se pudo entregar» por si lo marcas tú."],
        ],
        pasos: [
          "El repartidor pulsa «Retorno» en su portal y elige el motivo. Al cliente le llega un aviso.",
          "Si el cliente aparece, márcalo entregado.",
          "Si no, cuando el repartidor vuelva, pulsa «Recibir devolución».",
          "Si el cliente todavía lo quiere, pulsa «Volver a enviar»: se crea un pedido nuevo igual, listo para preparar.",
        ],
        tips: [
          "El pedido original se queda como devuelto: así la devuelta cuadra con el repartidor que lo llevó.",
          "El inventario no cambia: Delywa no descuenta productos con los pedidos.",
        ],
        faq: [["¿Puedo entregar uno que ya recibí de vuelta?", "No con el mismo pedido: usa «Volver a enviar». Así queda claro quién lo lleva y quién cobra."]],
      },
      {
        id: "historial", icono: "history", titulo: "Historial de pedidos", ruta: "pedidos", cap: "historial",
        que: "Todos los pedidos del mes, con filtros por día y por estado, y el total vendido del periodo.",
        spots: [
          ['[data-testid="filtro-mes"]', "El mes que quieres ver. Empieza en el mes actual."],
          ['[data-testid="filtro-dia"]', "Opcional: un solo día del mes."],
          ['[data-testid="resumen-historial"]', "Total del periodo: cuántos pedidos y cuánto se vendió."],
          ['[data-testid^="filter-chip-"]', "Filtra por estado: entregados, cancelados, devueltos…"],
          ['[data-testid="lista-historial"]', "La lista. Toca un pedido para ver la tarjeta completa con sus opciones."],
        ],
        pasos: ["Abre la pestaña Historial en Pedidos.", "Elige el mes y, si quieres, un día.", "Toca un estado para filtrar.", "Toca un pedido para ver el detalle."],
      },
      {
        id: "chats", icono: "chat", titulo: "Chats con tus clientes", ruta: "conversaciones", cap: "chats",
        que: "Las conversaciones de tus clientes, como en WhatsApp. El bot toma el pedido; tú puedes escribir cuando quieras y el cliente lo ve en su chat.",
        spots: [
          ['[data-testid="input-search-cliente"]', "Busca un cliente por nombre o teléfono."],
          ['[data-testid="tab-pendiente"]', "Filtra: todos, con pedido pendiente, entregados o cancelados."],
          ['[data-testid^="conversacion-"]', "Cada chat muestra el último mensaje, la hora y los mensajes sin leer."],
          ['[data-testid="button-show-qr"]', "El código QR del chat de tu colmado, para imprimirlo o compartirlo."],
        ],
        pasos: ["Abre Chats.", "Busca o filtra el cliente.", "Toca la conversación para abrirla."],
        tips: [
          "Lo que el bot no entiende queda para que tú lo respondas; no se pierde ningún mensaje.",
          "En el chat no se aceptan números de cuenta bancaria: por seguridad, las formas de pago se configuran en Ajustes.",
        ],
      },
      {
        id: "chat-abierto", icono: "chat", titulo: "Responder en un chat", ruta: "conversaciones", cap: "chat-abierto",
        que: "Al abrir un chat ves todo lo que el cliente escribió y lo que el bot le respondió. Puedes escribirle tú en cualquier momento.",
        spots: [
          ['[data-testid="pantalla-chat"]', "La conversación: arriba el cliente, el estado de su pedido y su teléfono."],
          ['[data-testid="input-message"]', "Escribe aquí tu respuesta. El cliente la recibe al instante."],
          ['[data-testid="button-start-recording"]', "Mantén para grabar una nota de voz (si tu WhatsApp lo permite)."],
        ],
        pasos: ["Toca la conversación.", "Lee lo que pidió.", "Escribe tu respuesta y envíala."],
        tips: ["El teléfono de arriba llama al cliente; la papelera borra la conversación (solo el Dueño y el Colmadero)."],
      },
      {
        id: "repartidores", icono: "bike", titulo: "Repartidores", ruta: "deliveries", cap: "repartidores",
        que: "Agrega a tus repartidores, mándales su acceso y mira dónde están. Cada uno entra a su portal desde el celular con su número y un código de 6 letras.",
        spots: [
          ['[data-testid="button-agregar-delivery"]', "Agregar un repartidor: nombre y número de WhatsApp."],
          ['[data-testid^="codigo-acceso-"]', "Su código de acceso. Solo lo ven el dueño y el colmadero."],
          ['[data-testid^="whatsapp-codigo-"]', "Enviar acceso por WhatsApp: le llega un enlace que entra solo al portal, sin escribir nada."],
          ['[data-testid^="descanso-delivery-"]', "Ponerlo en descanso (no recibe pedidos) o deshabilitarlo (no puede entrar)."],
          ['[data-testid="tab-mapa"]', "Mapa en vivo: dónde está cada repartidor mientras tiene el portal abierto."],
          ['[data-testid="tab-configuracion"]', "Cómo le pagas: salario, por entrega o comisión. Sirve para su nómina."],
        ],
        pasos: [
          "Pulsa «Agregar repartidor» y escribe su nombre y WhatsApp.",
          "Pulsa «Enviar acceso por WhatsApp».",
          "El repartidor abre el enlace y queda dentro de su portal.",
          "Pídele que ponga «Disponible» para recibir pedidos.",
        ],
        tips: [
          "Si un repartidor deja de trabajar contigo, pulsa «Cambiar el código»: el viejo deja de servir.",
          "Comparte con tu repartidor el Manual del repartidor: delywa.com/manual?solo=repartidor",
        ],
        faq: [["El repartidor dice que no puede entrar", "Revisa que no esté deshabilitado y que use el número que registraste. Si hace falta, cámbiale el código y envíale el acceso otra vez."]],
      },
      {
        id: "cuadres", icono: "clipboard", titulo: "Cuadres de efectivo", ruta: "cuadres", cap: "cuadres",
        que: "Al terminar, el repartidor cuadra desde su portal el efectivo que cobró, menos las devueltas que dio, más las devueltas de los pedidos que volvieron. Tú confirmas cuánto recibiste.",
        spots: [
          ['[data-testid="banner-pedidos-sin-cuadre"], [data-testid="chip-sin-cuadre"]', "Pedidos entregados que todavía no se han cuadrado."],
          ['[data-testid="filter-cuadre-pendiente"]', "Cuadres que mandó el repartidor y esperan que los confirmes."],
          ['[data-testid^="cuadre-card-"]', "Cada cuadre: repartidor, fecha, pedidos y el neto que debe entregarte."],
          ['[data-testid^="ver-cuadre-"]', "Ver: abre el cuadre para contarlo y confirmarlo."],
          ['[data-testid^="vuelto-log-"]', "Historial de las devueltas que le diste a cada repartidor."],
        ],
        pasos: [
          "El repartidor pulsa «Cuadrar» en su portal y elige los pedidos.",
          "En Cuadres, abre el cuadre pendiente.",
          "Cuenta el dinero y escribe cuánto recibiste.",
          "Confirma. Si falta o sobra, la diferencia queda como saldo del repartidor.",
        ],
        tips: ["Un repartidor con un cuadre sin confirmar no puede recibir pedidos nuevos hasta que lo confirmes."],
      },
      {
        id: "confirmar-cuadre", icono: "check", titulo: "Confirmar un cuadre", ruta: "cuadres", cap: "cuadre-ver",
        que: "Abres el cuadre que mandó el repartidor, cuentas el dinero y escribes cuánto recibiste. Si falta o sobra, Delywa lo anota como saldo del repartidor.",
        spots: [
          ['[data-testid^="cuadre-neto-modal-"]', "Lo que el repartidor debe entregarte."],
          ['[data-testid^="input-monto-recibido-"]', "Lo que de verdad recibiste."],
          ['[data-testid^="button-confirmar-cuadre-"]', "Confirmar. El cuadre queda cerrado y el repartidor puede volver a recibir pedidos."],
        ],
        pasos: ["Pulsa «Ver» en el cuadre pendiente.", "Cuenta el dinero.", "Escribe lo recibido.", "Pulsa «Confirmar»."],
        tips: ["Los saldos (lo que debe o lo que se le debe) se saldan desde la misma pantalla de Cuadres."],
        faq: [["¿Qué es «neto a entregar»?", "Lo que el repartidor te debe dar: lo cobrado en efectivo, menos las devueltas que dio a los clientes, más las devueltas de los pedidos que regresaron."]],
      },
      {
        id: "ventas", icono: "money", titulo: "Ventas y caja", ruta: "ventas", cap: "ventas",
        que: "Lo que has vendido hoy y en el mes, y el cierre de caja del día.",
        spots: [
          ['[data-testid="ventas-hoy-total"]', "Ventas de hoy: pedidos entregados en tu hora local."],
          ['[data-testid="estado-caja"]', "Si la caja de hoy ya se cuadró."],
          ['[data-testid="cuadrar-caja-btn"]', "Cuadrar la caja de hoy al cerrar."],
          ['[data-testid="stat-total-mes"]', "El resumen del mes: total, entregados y cancelados."],
        ],
        pasos: ["Al cerrar, abre Ventas.", "Revisa las ventas de hoy.", "Pulsa «Cuadrar la caja de hoy»."],
        tips: ["Solo el Dueño y el Colmadero ven Ventas."],
      },
      {
        id: "reportes", icono: "chart", titulo: "Reportes", ruta: "reportes", cap: "reportes",
        que: "Ventas, pedidos entregados y cancelados de cada sucursal, en una sola tabla.",
        spots: [["main table", "Cada fila es una sucursal: lo vendido, entregados y cancelados."]],
        tips: ["Para ver el detalle de una sucursal, cámbiate a ella desde el menú y abre Ventas o Pedidos."],
      },
      {
        id: "clientes", icono: "users", titulo: "Clientes", ruta: "clientes", cap: "clientes",
        que: "Todas las personas que te han escrito o pedido, con su teléfono y su dirección. Se guardan solas cuando piden por el chat.",
        spots: [
          ['[data-testid="input-search-cliente"]', "Busca por nombre o teléfono."],
          ['[data-testid^="cliente-"]', "Cada cliente: nombre, teléfono, pedidos y total gastado (solo cuenta lo entregado)."],
        ],
        tips: ["Si el cliente guardó su casa en el chat, el pedido te muestra «🏠 Casa (guardada)» con la dirección."],
      },
      {
        id: "empleados", icono: "contact", titulo: "Empleados, asistencia y nómina", ruta: "empleados", cap: "empleados",
        que: "Tu personal del colmado: cada empleado marca su entrada y salida con un código, y Delywa calcula la nómina.",
        spots: [
          ['[data-testid="tabs-empleados"]', "Tres partes: Empleados, Asistencia y Nómina."],
          ['[data-testid="button-nuevo-empleado"]', "Nuevo empleado: nombre, puesto, cómo se le paga (por hora o salario) y su código."],
          ['[data-testid^="empleado-"]', "Cada empleado: puesto, teléfono, pago y su código de acceso."],
        ],
        pasos: [
          "Pulsa «Nuevo empleado» y llena sus datos.",
          "Dale su código: con él marca entrada y salida en el portal del empleado.",
          "En Asistencia ves sus horas y puedes corregir una marca.",
          "En Nómina calculas el periodo, la cierras y la marcas pagada.",
        ],
        tips: ["La nómina usa las reglas de tu país (feriados y horas extra) y la hora local."],
      },
      {
        id: "configuracion", icono: "gear", titulo: "Configuración del negocio", ruta: "settings", cap: "configuracion",
        que: "Los datos de tu colmado ordenados en secciones: datos, logo, ubicación, horario, delivery, formas de pago y el chat. Todo se guarda con un solo botón.",
        spots: [
          ['[data-testid="input-buscar-ajuste"]', "Busca un ajuste por nombre («horario», «costo», «mapa»)."],
          ['[data-testid="seccion-datos"], [data-testid="select-seccion-config"]', "Las secciones: toca una para verla. «Falta el mapa» te avisa lo que está incompleto."],
          ['[data-testid="seccion-horario"]', "Horario: con el colmado cerrado, el chat avisa y no toma pedidos."],
          ['[data-testid="seccion-delivery"]', "Delivery: costo del envío, pedido mínimo, radio y tiempo estimado."],
          ['[data-testid="seccion-pagos"]', "Formas de pago: efectivo, tarjeta y transferencia (con tus cuentas)."],
          ['[data-testid="button-save-settings"]', "Guardar cambios: guarda todas las secciones de una vez."],
        ],
        pasos: [
          "Revisa Datos del negocio y sube tu logo.",
          "En Ubicación marca tu colmado en el mapa.",
          "Pon tu horario.",
          "Pon el costo del delivery.",
          "Marca tus formas de pago.",
          "Pulsa «Guardar cambios».",
        ],
        tips: ["El nombre, el WhatsApp y el logo solo los cambia el Dueño."],
      },
      {
        id: "chat-pagina", icono: "link", titulo: "El chat de tu colmado (enlace y QR)", ruta: "settings", cap: "chat-pagina",
        que: "Tu colmado tiene su propio chat en delywa.com. El cliente escribe como en WhatsApp, el bot le toma el pedido y a ti te llega a Pedidos, aunque no tengas WhatsApp Business.",
        spots: [
          ['[data-testid="input-chat-web-link"], [data-testid="text-chat-url"]', "El enlace de tu chat. Compártelo en tu estado de WhatsApp, Instagram o Facebook."],
          ['[data-testid="button-copy-chat-link"]', "Copiar el enlace."],
          ['#colmado-qr', "El código QR para imprimirlo y pegarlo en el colmado. «Descargar QR» lo guarda como imagen."],
          ['[data-testid="link-open-chat"], [data-testid="button-preview-chat"]', "Abre tu chat como lo ve el cliente, para probarlo."],
        ],
        pasos: ["Abre Configuración → Chat de mi página.", "Copia el enlace o descarga el QR.", "Compártelo con tus clientes.", "Haz un pedido de prueba tú mismo."],
        tips: ["Comparte con tus clientes el Manual del cliente: delywa.com/manual?solo=cliente"],
      },
      {
        id: "whatsapp", icono: "whatsapp", titulo: "WhatsApp", ruta: "whatsapp-config", cap: "whatsapp",
        que: "Si la plataforma te habilitó WhatsApp, aquí conectas tu número y los avisos (confirmación, en camino, entregado) salen solos por WhatsApp.",
        spots: [["main", "La conexión de tu número. Si no está habilitada, los avisos se envían con un botón que abre WhatsApp con el mensaje listo."]],
        tips: ["Sin WhatsApp conectado todo funciona igual: el chat de tu colmado recibe los avisos al instante."],
      },
      {
        id: "sucursales", icono: "building", titulo: "Sucursales", ruta: "sucursales", cap: "sucursales",
        que: "Si tienes más de un colmado, crea sus sucursales. Cada una tiene sus pedidos, repartidores y chat, y hereda tu configuración.",
        spots: [
          ['[data-testid="form-sucursal"]', "Datos de la sucursal nueva: nombre, WhatsApp y dirección."],
          ['[data-testid^="sucursal-"]', "Tus sucursales: edítalas o desactívalas."],
        ],
        tips: ["Solo el Dueño crea sucursales."],
      },
      {
        id: "usuarios", icono: "key", titulo: "Usuarios y permisos", ruta: "usuarios", cap: "usuarios",
        que: "Crea usuarios para tu equipo. Hay dos roles: Colmadero (el encargado, casi como el dueño) y Despachador (atiende a la gente).",
        spots: [
          ['[data-testid="descripcion-rol"]', "Qué puede hacer cada rol."],
          ['[data-testid="form-usuario"]', "Nombre, correo, contraseña temporal (10 o más letras), rol y sucursales."],
        ],
        pasos: ["Llena los datos de la persona.", "Elige el rol.", "Marca sus sucursales.", "Pulsa «Crear usuario» y dale su correo y contraseña."],
        tips: [
          "Colmadero: pedidos, repartidores, cuadres, ventas, empleados, nómina, reportes y la configuración del día a día. No crea usuarios ni sucursales.",
          "Despachador: pedidos, chats, clientes, asignar repartidores y ventas de hoy. No ve nómina, cuadres ni configuración.",
        ],
      },
    ],
  },

  // ============================================================ REPARTIDOR
  repartidor: {
    titulo: "Manual del repartidor",
    corto: "Repartidor",
    icono: "bike",
    color: "#1D4ED8",
    intro: "Cómo usar el portal de delivery desde tu celular: entrar, recibir pedidos, llegar al cliente, cobrar, devolver lo que no se entregó y cuadrar el efectivo.",
    url: "delywa.com/repartidor",
    empieza: ["entrar", "disponible", "entregas", "entregar", "cuadre"],
    grupos: [
      ["Empieza aquí", ["entrar", "disponible"]],
      ["Entregar", ["entregas", "entregar", "transferencia", "ruta", "no-entregado", "devolver"]],
      ["Al terminar", ["cuadre", "historial"]],
    ],
    modulos: [
      {
        id: "entrar", icono: "login", titulo: "Entrar al portal", cap: "r-entrar",
        que: "El colmado te manda un enlace por WhatsApp que entra solo. Si entras a mano, escribe tu número y el código de 6 letras que te dio el colmado.",
        spots: [
          ['[data-testid="input-whatsapp-login"]', "Tu número de WhatsApp, el mismo que registró el colmado."],
          ['[data-testid="input-codigo-login"]', "Tu código de 6 letras. Al escribir la sexta entra solo."],
          ['[data-testid="button-login-repartidor"]', "Entrar."],
        ],
        pasos: ["Abre el enlace que te mandó el colmado.", "Si te pide datos, escribe tu número y tu código.", "Guarda la página en la pantalla de inicio del celular para abrirla rápido."],
        tips: ["La próxima vez el portal te saluda por tu nombre y solo te pide el código."],
        faq: [["Me dice que el código no es válido", "Pídele al colmado que te mande el acceso otra vez: puede que te hayan cambiado el código."]],
      },
      {
        id: "disponible", icono: "pause", titulo: "Disponible o en descanso", cap: "r-entregas",
        que: "Arriba ves tu nombre, tu colmado y si estás disponible. Solo te asignan pedidos cuando estás Disponible.",
        spots: [
          ['[data-testid="titulo-portal-repartidor"]', "Estás en el portal de delivery de tu colmado."],
          ['[data-testid="button-toggle-disponibilidad"]', "Toca para tomar un descanso o volver a estar disponible."],
          ['[data-testid="resumen-por-entregar"]', "Pedidos que tienes por entregar."],
          ['[data-testid="resumen-por-cuadrar"]', "El efectivo que tienes que cuadrar con el colmado."],
          ['[data-testid="link-manual-repartidor"]', "Este manual, por si tienes una duda."],
          ['[data-testid="button-logout-repartidor"]', "Salir del portal."],
        ],
        tips: ["Tu turno termina una hora después de que cierra el colmado; al otro día vuelves a entrar."],
      },
      {
        id: "entregas", icono: "package", titulo: "Tus entregas", cap: "r-entregas",
        que: "Cada pedido que te asignan sale en Entregas con el cliente, la dirección, los productos, cuánto cobrar y la devuelta que llevas.",
        spots: [
          ['[data-testid^="pedido-card-"]', "El pedido: cliente, dirección y productos. El primero de la lista es el próximo."],
          ['[data-testid^="cobrar-"]', "Cuánto cobrar y la devuelta que llevas para el cliente (la que te dio el colmado)."],
          ['[data-testid="button-cuadrar"]', "Cuadrar: cuando termines, cuadra el efectivo con el colmado."],
          ['[data-testid="tab-rutas"]', "El menú de abajo: Entregas, Ruta, Cuadre e Historial."],
        ],
        tips: ["Si el cliente paga con transferencia o tarjeta, no cobras efectivo: la tarjeta te lo indica."],
      },
      {
        id: "entregar", icono: "check", titulo: "Llegar y entregar", cap: "r-entregar",
        que: "Más abajo en la tarjeta están la dirección y los botones para avisar que llegas, llamar y marcar el pedido entregado.",
        spots: [
          ['[data-testid^="ubicacion-link-"], [data-testid^="button-navegar-"]', "La dirección: toca para abrir el mapa del celular."],
          ['[data-testid^="telefono-link-"], [data-testid^="button-llamar-"]', "Llamar al cliente."],
          ['[data-testid^="btn-llegando-"], [data-testid^="button-llegando-"]', "«Ya estoy llegando»: el cliente recibe un aviso de que estás cerca."],
          ['[data-testid^="btn-entregado-"], [data-testid^="button-entregado-"]', "Marcar como entregado cuando el cliente lo recibe y paga."],
          ['[data-testid^="btn-retorno-"], [data-testid^="button-retorno-"]', "Retorno: si no pudiste entregarlo porque el cliente no está, no contesta o no lo quiere."],
        ],
        pasos: ["Revisa los productos antes de salir.", "Toca la dirección para llegar.", "Al acercarte, pulsa «Ya estoy llegando».", "Entrega, cobra y da la devuelta.", "Pulsa «Marcar como entregado»."],
      },
      {
        id: "transferencia", icono: "card", titulo: "Pedidos pagados por transferencia", cap: "r-transferencia",
        que: "Si el cliente paga por transferencia, el colmado tiene que aprobar el pago antes de que lo marques entregado. Mientras tanto la tarjeta te lo avisa y el botón de entregar queda bloqueado.",
        spots: [
          ['[data-testid="transferencia-sin-aprobar-10"]', "Transferencia sin aprobar: pídele al cliente el comprobante."],
          ['[data-testid="llamar-colmado-10"]', "Llama al colmado para que revise el comprobante y apruebe el pago."],
        ],
        pasos: ["Pídele al cliente que te enseñe el comprobante.", "Llama al colmado.", "Cuando lo aprueben, la tarjeta dice «Transferencia aprobada» y ya puedes marcarlo entregado."],
        tips: ["Si lo entregas sin aprobación y el comprobante resulta falso, ese dinero lo pagas tú.", "Con la transferencia aprobada no cobras efectivo."],
      },
      {
        id: "ruta", icono: "route", titulo: "Tu ruta", cap: "r-ruta",
        que: "En Ruta ves en el mapa los pedidos que te faltan, en el mejor orden. Los entregados ya no salen aquí: pasan a Historial.",
        spots: [
          ['[data-testid="mapa-ruta"]', "El mapa con tus paradas numeradas."],
          ['[data-testid="button-reoptimizar-ruta"], [data-testid="button-optimizar-ruta"]', "Recalcular el orden si te asignaron pedidos nuevos."],
          ['[data-testid^="parada-"]', "Las paradas en orden, con llamar y cómo llegar."],
        ],
        tips: ["Cuando no te quedan pendientes, Ruta te dice «Terminaste esta ruta»."],
      },
      {
        id: "no-entregado", icono: "undo", titulo: "No pude entregarlo (Retorno)", cap: "r-noentregado",
        que: "Si el cliente no está, no contesta o no quiere el pedido, pulsa «Retorno» en la tarjeta y elige el motivo. Al cliente le llega un aviso.",
        spots: [
          ['[data-testid="retorno-modal"] [data-testid^="btn-motivo-"]', "Toca el motivo: el pedido se marca como no entregado al momento y pasa a «Devolver al colmado»."],
          ['[data-testid="btn-motivo-otro"]', "¿Otro motivo? Escríbelo y confírmalo."],
        ],
        pasos: ["Llama al cliente antes de rendirte.", "Pulsa «Retorno».", "Toca el motivo."],
      },
      {
        id: "devolver", icono: "store", titulo: "Devolver al colmado", cap: "r-devolver",
        que: "Los pedidos no entregados salen en rojo con lo que tienes que llevar de vuelta y la devuelta que te dieron. Si el cliente aparece, todavía puedes entregarlo.",
        spots: [
          ['[data-testid="devolver-6"]', "El pedido, el motivo y los productos que llevas de vuelta."],
          ['[data-testid="ir-al-colmado-6"]', "Cómo llegar al colmado."],
          ['[data-testid="llamar-retorno-6"]', "Llamar al cliente por si quiere que se lo lleves."],
          ['[data-testid="entregar-retorno-6"]', "«Lo entregué»: si el cliente apareció y lo recibió."],
        ],
        pasos: ["Lleva los productos y la devuelta al colmado.", "El colmado pulsa «Recibir devolución» y el pedido sale de tu lista."],
        tips: ["La devuelta de un pedido devuelto se suma a lo que entregas en el cuadre."],
      },
      {
        id: "cuadre", icono: "clipboard", titulo: "Cuadrar el efectivo", cap: "r-cuadre",
        que: "Al terminar, cuadras con el colmado: lo que cobraste en efectivo, menos las devueltas que diste, más las devueltas de los pedidos devueltos.",
        spots: [
          ['[data-testid^="cuadre-pedido-"]', "Los pedidos entregados que vas a cuadrar."],
          ['[data-testid^="cuadre-retorno-"]', "Los pedidos devueltos: su devuelta vuelve al colmado."],
          ['[data-testid="input-notas-cuadre"]', "Una nota para el colmado, si hace falta."],
          ['[data-testid="button-confirmar-cuadre"]', "Enviar el cuadre. El colmado cuenta y lo confirma."],
        ],
        pasos: ["Pulsa «Cuadrar».", "Revisa los pedidos.", "Entrega el dinero al colmado.", "Pulsa «Enviar cuadre»."],
        tips: ["Mientras tengas un cuadre sin confirmar, el colmado no te puede asignar pedidos nuevos."],
      },
      {
        id: "historial", icono: "history", titulo: "Historial", cap: "r-historial",
        que: "Tus pedidos cerrados: entregados, cancelados y devueltos. Toca uno para ver el detalle. Abajo dice la versión de Delywa que tienes.",
        spots: [
          ['[data-testid^="historial-abrir-"]', "Toca un pedido para abrirlo."],
          ['[data-testid^="historial-detalle-"]', "El detalle: productos, forma de pago, lo cobrado, la devuelta, la dirección y el motivo si no se entregó."],
        ],
      },
    ],
  },

  // ============================================================ CLIENTE
  cliente: {
    titulo: "Manual del cliente",
    corto: "Cliente",
    icono: "cart",
    color: "#0F766E",
    intro: "Cómo pedirle al colmado por su chat: escribes como en WhatsApp, mandas tu ubicación, eliges cómo pagar y el colmado te confirma el total.",
    url: "delywa.com/pedir/tu-colmado",
    empieza: ["entrar", "pedir", "ubicacion", "pagar", "seguimiento"],
    grupos: [["Pedir", ["entrar", "pedir", "ubicacion", "pagar"]], ["Después", ["seguimiento"]]],
    modulos: [
      {
        id: "entrar", icono: "login", titulo: "Abrir el chat del colmado", cap: "c-entrar",
        que: "Abre el enlace o escanea el QR del colmado. Escribe tu nombre y tu teléfono una vez y ya puedes pedir.",
        spots: [
          ['[data-testid="text-nombre-colmado"]', "El colmado al que le estás escribiendo."],
          ['[data-testid="input-nombre-chat"]', "Tu nombre."],
          ['[data-testid="input-telefono-chat"]', "Tu teléfono: el colmado y el repartidor lo usan para llamarte."],
          ['[data-testid="button-entrar-chat"]', "Entrar al chat."],
        ],
        tips: [
          "Si vuelves el mismo día desde el mismo celular, sigues en la misma conversación.",
          "Después de 10 minutos sin escribir, por seguridad te pide tus datos otra vez.",
        ],
      },
      {
        id: "pedir", icono: "chat", titulo: "Hacer tu pedido", cap: "c-pedir",
        que: "Escribe lo que quieres como se lo dirías al colmadero: «2 libras de arroz, un aceite y 10 pesos de ajo». También puedes mandar una nota de voz.",
        spots: [
          ['[data-testid="lista-mensajes"]', "Tu conversación. El bot te va anotando el pedido."],
          ['[data-testid="opciones-rapidas"]', "Botones rápidos: «Eso es todo» o «Agregar más»."],
          ['[data-testid="input-mensaje"]', "Escribe aquí. Mantén el micrófono para una nota de voz."],
        ],
        pasos: ["Escribe los productos.", "Responde «¿Algo más?».", "Cuando termines, toca «Eso es todo»."],
        tips: [
          "El bot anota lo que escribes con tus mismas palabras (solo corrige la ortografía) y le pone un emoji a cada producto: 🍚 arroz, 🍺 fría, 🫒 aceite…",
          "«10 pesos de ajo» se anota como RD$10 de ajo, no como 10 ajos.",
          "Si hay botones pero prefieres escribir, escribe: el bot te contesta y después te repite la pregunta.",
          "Si el bot no entiende algo, el colmado lo lee y te responde.",
        ],
      },
      {
        id: "ubicacion", icono: "pin", titulo: "Tu ubicación", cap: "c-ubicacion",
        que: "El colmado te pide la ubicación en cada pedido, porque puedes estar en otro lugar. Si guardaste tu casa, toca «A mi casa».",
        spots: [
          ['[data-testid="opciones-rapidas"]', "«📍 Enviar mi ubicación» o «🏠 A mi casa» si ya la guardaste."],
          ['button[aria-label="Adjuntar ubicación o comprobante"]', "El botón + también tiene ubicación y foto del comprobante."],
        ],
        tips: ["Después de tu primer pedido, el bot te ofrece guardar tu casa. Tu dirección guardada nunca se muestra en el chat."],
      },
      {
        id: "pagar", icono: "card", titulo: "Cómo pagar", cap: "c-pagar",
        que: "Elige efectivo, tarjeta o transferencia. En efectivo, dile con cuánto vas a pagar para que el repartidor lleve tu devuelta. Por transferencia, te llegan las cuentas del colmado y envías la foto del comprobante con el botón «📸 Enviar comprobante».",
        spots: [
          ['[data-testid="opciones-rapidas"]', "Elige la forma de pago y, en efectivo, con cuánto pagas."],
          ['button[aria-label="Adjuntar ubicación o comprobante"]', "Transferencia: manda la foto del comprobante con el botón +."],
        ],
      },
      {
        id: "seguimiento", icono: "eye", titulo: "Confirmación y seguimiento", cap: "c-seguimiento",
        que: "El colmado revisa tu pedido y te manda los precios y el total. Después te avisa cuando va en camino, cuando está llegando y cuando se entregó.",
        spots: [
          ['[data-testid="estado-pedido"]', "El estado de tu pedido, siempre a la vista."],
          ['[data-testid="lista-mensajes"]', "Aquí te llegan el resumen, la confirmación con el total y los avisos de en camino y entregado."],
        ],
        tips: ["Otro día, el saludo te ofrece «Repetir mi último pedido».", "Para cancelar, escribe «cancelar» antes de que salga."],
      },
    ],
  },
};
