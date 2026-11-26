// Delywa · English version of the interactive manual. Same topics, screenshots and spots as guia.ts:
// only the text changes. The app itself is in Spanish, so button names are kept in Spanish
// «like this» with the English meaning next to them.
import { GUIA, type ClaveManual, type Manual } from "./guia";

type ModuloEN = { titulo: string; que: string; spots: string[]; pasos?: string[]; tips?: string[]; faq?: Array<[string, string]> };
type ManualEN = { titulo: string; corto: string; intro: string; grupos: string[]; modulos: Record<string, ModuloEN> };

export const EN: Record<ClaveManual, ManualEN> = {
  // ============================================================ BUSINESS
  negocio: {
    titulo: "Business manual",
    corto: "Business",
    intro: "Everything you need to run your colmado with Delywa: take orders through the chat, confirm them, prepare them, send them with your delivery person, reconcile the cash and see your numbers.",
    grupos: ["Start here", "Day to day", "Chats", "Delivery", "Money", "My business", "Settings"],
    modulos: {
      moverte: {
        titulo: "Getting around Delywa",
        que: "The menu on the left follows this manual: at the top what you use every day («Inicio», «Pedidos» and «Chats» — Home, Orders, Chats) and below My business, Money and Settings. On a phone the menu is at the bottom.",
        spots: [
          "Your business and your role (Owner, «Colmadero» manager or «Despachador» counter staff). If you have branches, this shows which one you are working in.",
          "«Pedidos» (Orders): the number tells you how many are waiting for you to confirm them.",
          "«Chats»: your customers' messages, like WhatsApp. The number is the unread messages.",
          "My business: delivery people, customers and employees.",
          "Money: today's sales, delivery cash reconciliations and reports. The «Despachador» role does not see this part.",
          "Settings: configuration, WhatsApp, branches and users.",
          "Refresh: loads the data again. Usually not needed: the screen updates by itself when something new comes in.",
        ],
        pasos: [
          "What you use most is at the top: «Inicio», «Pedidos» and «Chats».",
          "On a phone use the bottom menu: «Inicio», «Pedidos», «Chats», «Reparto» (Delivery) and «Más» (More, with the other options).",
          "My business: delivery people («Repartidores»), customers («Clientes») and employees («Empleados»).",
          "Money: sales («Ventas»), cash reconciliations («Cuadres»), reports («Reportes») and e-invoicing.",
          "Settings: configuration, WhatsApp, branches («Sucursales») and users and permissions.",
          "At the end of the menu is «Mi contraseña» (My password), to change yours.",
          "The user manual is at the end of the menu; from each topic you can open the screen it explains.",
        ],
        tips: [
          "Screens update by themselves: when a customer orders or a delivery person delivers, you see it right away without reloading.",
          "Each person only sees what their role allows. For example, the «Despachador» does not see Money or Settings.",
        ],
        faq: [
          ["Why don't I see Settings or Sales?", "Your user is a «Despachador». Those screens are for the Owner and the «Colmadero». Ask the owner to change your role if you need them."],
          ["Does the session close by itself?", "Yes, after a while without use, for security. Sign in again with your email and password."],
        ],
      },
      inicio: {
        titulo: "Home",
        que: "The summary of your day: what you have sold, what is still to be confirmed, your delivery people and the latest orders.",
        spots: [
          "Orders waiting for confirmation. Tap it to go straight to confirming them.",
          "Sold today: only delivered orders count.",
          "Orders that are not closed yet.",
          "Delivery people available right now.",
          "The latest orders. Tap one to see it in «Pedidos».",
          "Your delivery people and their status. From here you can put them on a break.",
        ],
        pasos: ["Open «Inicio» when you start the day.", "If the yellow notice shows up, confirm those orders first.", "Make sure you have delivery people available before orders arrive."],
        tips: ["Today's sales use your country's time, not the server's."],
      },
      pedidos: {
        titulo: "Orders: the day's board",
        que: "All of today's orders in four columns, left to right: to confirm, preparing, on the way and closed. Each card has a big button with what to do next.",
        spots: [
          "How many orders are in each column. On a phone, tap one to see it. «Vendido hoy» (sold today) only adds up delivered orders.",
          "To confirm: new orders that came in through the chat. You set the prices and confirm them.",
          "Preparing: confirmed orders being put together or ready to go out.",
          "On the way: a delivery person has them. Orders that could not be delivered also show up here.",
          "Closed today: delivered, cancelled and returns already received.",
          "The button for the next step: «Confirmar pedido» (confirm), «Empezar a preparar» (start preparing), «Marcar listo» (mark ready), «Asignar repartidor» (assign delivery), «Marcar entregado» (mark delivered)…",
          "More options (the three dots): edit, switch to pick-up at the colmado, merge with another order, print, share tracking or cancel.",
          "«Preparación»: a separate screen for whoever puts the orders together.",
        ],
        pasos: [
          "A new order arrives in «Por confirmar» with the label «Sin precio» (no price).",
          "Confirm it with the prices. It moves to «Preparando».",
          "Tap «Empezar a preparar» and, once it is packed, «Marcar listo».",
          "Tap «Asignar repartidor». It moves to «En camino».",
          "The delivery person marks it delivered from their portal (or you do). It moves to «Cerrados».",
        ],
        tips: [
          "On a phone you see one column at a time: switch with the tabs at the top.",
          "«Ver detalle» opens the whole order: products, address, distance, payment method and customer notes.",
          "If the customer comes to pick it up, use More options → «Cambiar a recoger»: it no longer goes through a delivery person.",
        ],
        faq: [
          ["Where are yesterday's orders?", "In the «Historial» (History) tab above the board. «Hoy» shows only today and whatever is still open."],
          ["A customer ordered twice, what do I do?", "In More options → «Juntar con otro pedido» you merge both into one."],
        ],
      },
      confirmar: {
        titulo: "Confirming an order",
        que: "Before preparing, you check what the customer ordered, set the prices, fix whatever is needed and send them the total. A fixed panel opens on the right (full screen on a phone) that does not close if you tap outside, so you don't lose the prices.",
        spots: [
          "The product. If you don't have that brand or size, change the name to what you do have; the customer sees it in the confirmation.",
          "The price of each product. Items the customer ordered by amount («10 pesos de ajo» — 10 pesos' worth of garlic) already come with their price.",
          "Add a product the customer asked for separately or that was missed.",
          "«Confirmar y enviar al cliente» (confirm and send): the customer gets the list with prices and the total, and the order moves to «Preparando». If they pay by bank transfer, they also get your accounts.",
        ],
        pasos: [
          "In «Por confirmar», tap «Confirmar pedido».",
          "Type the price of each product.",
          "If you don't have something, change the name to what you have or remove it with the ×.",
          "Check the delivery fee and the total the customer pays.",
          "Tap «Confirmar y enviar al cliente».",
        ],
        tips: [
          "If the colmado has WhatsApp connected, the message goes out by WhatsApp; if not, WhatsApp opens with the message ready for you to send. In the colmado's chat the customer gets it instantly.",
          "You can't confirm with products without a price: the screen tells you which one is missing.",
          "To fix an order that is already confirmed, use More options → «Editar»: you change products and the total.",
        ],
        faq: [
          ["The customer said «dame 10 de ajo», is that 10 garlic bulbs?", "No. When the number comes with «pesos», «RD$» or is 5 or more without a unit, the bot takes it as money: «RD$10 de ajo» (RD$10 worth of garlic)."],
          ["What if I don't have a product?", "Remove it with the × or change the name to something you have. If it is a big change, message the customer first in «Chats»."],
        ],
      },
      preparar: {
        titulo: "Preparing the order",
        que: "In the «Preparando» column each order goes through two steps: «Empezar a preparar» (start preparing) and «Marcar listo» (mark ready). That way everyone knows what is being packed and what can go out.",
        spots: [
          "Order being packed: when you finish, tap «Marcar listo».",
          "In a hurry? «Asignar repartidor ya» sends it without waiting for it to be ready.",
          "Order ready: you can now assign it a delivery person.",
          "«Preparación»: a screen with only what needs packing, handy on a tablet at the counter.",
        ],
        pasos: ["Tap «Empezar a preparar».", "Pack the order with the list on the card.", "Tap «Marcar listo».", "Assign the delivery person."],
        tips: ["If the customer comes to pick it up, after «Marcar listo» the button says «Entregado al cliente» (handed to the customer)."],
      },
      asignar: {
        titulo: "Assigning a delivery person",
        que: "You choose who takes the order. The delivery person gets it in their portal and the customer is told it is on the way.",
        spots: [
          "Tap the delivery person who will take the order. «Activo» means available.",
          "Send the order to that delivery person by WhatsApp, if you prefer to tell them that way.",
          "A delivery person on a break: not taking orders right now.",
        ],
        pasos: ["On the ready order, tap «Asignar repartidor».", "Tap the delivery person.", "If the customer pays cash and needs change, continue with the change (next topic)."],
        tips: ["To change the delivery person use More options → «Reasignar»."],
      },
      devuelta: {
        titulo: "Change for the delivery person",
        que: "If the customer pays cash with a large bill, you give the delivery person the change («devuelta») before they leave. It is recorded and they reconcile it when they return.",
        spots: [
          "How much you give them. It is already calculated from what the customer said they will pay with.",
          "Confirm you handed it over. It shows in their portal and in their reconciliation.",
        ],
        pasos: ["Count the change.", "Give it to the delivery person.", "Confirm you handed over the change."],
        tips: [
          "If you forgot, the on-the-way card shows «Falta darle la devuelta al repartidor» (change still to give) with a «Registrar» button.",
          "In «Cuadres» you have the history of all the change you gave each delivery person.",
        ],
        faq: [["What if the order isn't delivered?", "The delivery person brings back the order and that change. It is taken into account in their reconciliation."]],
      },
      transferencia: {
        titulo: "Bank transfer payments",
        que: "When the customer pays by bank transfer, they get your accounts and are asked for a photo of the receipt. It shows small on the order; tap it to see it large, check it and approve the payment. Until you approve it, the order can't be assigned to delivery.",
        spots: [
          "Payment status: whether the receipt is missing or the customer already sent it.",
          "«Pedir comprobante» (ask for receipt): the customer gets your accounts and is asked to send the photo. Once they do, «Ver comprobante» (see receipt) shows here.",
          "«Aprobar pago» (approve payment): when you see the money in your bank. The customer gets the confirmation and the order can be delivered.",
        ],
        pasos: [
          "Add your accounts in Settings → «Formas de pago» (bank, type, number and account holder).",
          "The customer picks «Transferencia» and gets your accounts in the chat.",
          "If they haven't sent the photo, tap «Pedir comprobante».",
          "When the customer sends it, a small photo appears on the order: tap it to see it large.",
          "Check in your bank that it arrived and tap «Es real · aprobar pago». If it didn't arrive or doesn't match, tap «No es válido · pedir otro comprobante».",
          "Once the payment is approved, assign it to delivery as usual.",
        ],
        tips: [
          "The delivery person sees «Transferencia sin aprobar» (transfer not approved) in their portal and a button to call you.",
          "If the delivery person delivers without approval and the receipt turns out to be fake, they pay that money (the portal tells them so).",
        ],
        faq: [
          ["Where is the photo stored?", "On the order, small: tap it to see it large. It also stays in the customer's conversation."],
          ["Can I send it with delivery before approving?", "No. The receipt is checked first; that way the delivery person never leaves with an unpaid order."],
        ],
      },
      retorno: {
        titulo: "Couldn't be delivered (returns)",
        que: "If the customer wasn't there, didn't answer or refused the order, the delivery person marks it as not delivered. The order shows in red until it is back at the colmado.",
        spots: [
          "The reason, who is bringing it back and the change they must return.",
          "Did the customer show up or ask for it to be brought? Mark it delivered while the delivery person still has it.",
          "When the delivery person arrives with the order, tap «Recibir devolución» (receive return).",
          "More options. On an order on the way, «No se pudo entregar» (couldn't be delivered) is here in case you mark it yourself.",
        ],
        pasos: [
          "The delivery person taps «Retorno» in their portal and picks the reason. The customer gets a message.",
          "If the customer shows up, mark it delivered.",
          "If not, when the delivery person returns, tap «Recibir devolución».",
          "If the customer still wants it, tap «Volver a enviar» (send again): a new identical order is created, ready to prepare.",
        ],
        tips: [
          "The original order stays as returned: that way the change reconciles with the delivery person who took it.",
          "Stock doesn't change on returns.",
        ],
        faq: [["Can I deliver one I already received back?", "Not with the same order: use «Volver a enviar». That way it's clear who takes it and who collects."]],
      },
      historial: {
        titulo: "Order history",
        que: "All the month's orders, with filters by day and status, and the total sold for the period.",
        spots: [
          "The month you want to see. It starts on the current month.",
          "Optional: a single day of the month.",
          "Period total: how many orders and how much was sold.",
          "Filter by status: delivered, cancelled, returned…",
          "The list. Tap an order to see the full card with its options.",
        ],
        pasos: ["Open the «Historial» tab in «Pedidos».", "Pick the month and, if you want, a day.", "Tap a status to filter.", "Tap an order to see the details."],
      },
      chats: {
        titulo: "Chats with your customers",
        que: "Your customers' conversations, like WhatsApp. The bot takes the order; you can write whenever you want and the customer sees it in their chat.",
        spots: [
          "Search a customer by name or phone.",
          "Filter: all, with a pending order, delivered or cancelled.",
          "Each chat shows the last message, the time and unread messages.",
          "The QR code of your colmado's chat, to print or share.",
        ],
        pasos: ["Open «Chats».", "Search or filter the customer.", "Tap the conversation to open it."],
        tips: [
          "Whatever the bot doesn't understand is left for you to answer; no message is lost.",
          "Bank account numbers are not accepted in the chat: for security, payment methods are set in Settings.",
        ],
      },
      "chat-abierto": {
        titulo: "Replying in a chat",
        que: "When you open a chat you see everything the customer wrote and what the bot answered. You can write to them at any time.",
        spots: [
          "The conversation: at the top the customer, their order status and phone.",
          "Type your reply here. The customer gets it instantly.",
          "Hold to record a voice note (if your WhatsApp allows it).",
        ],
        pasos: ["Tap the conversation.", "Read what they ordered.", "Type your reply and send it."],
        tips: ["The phone at the top calls the customer; the trash can deletes the conversation (Owner and «Colmadero» only)."],
      },
      repartidores: {
        titulo: "Delivery people",
        que: "Add your delivery people, send them their access and see where they are. Each one signs in to their portal from their phone with their number and a 6-letter code.",
        spots: [
          "Add a delivery person: name and WhatsApp number.",
          "Their access code. Only the owner and the «Colmadero» see it.",
          "Send access by WhatsApp: they get a link that signs them in to the portal automatically.",
          "Put them on a break (no orders) or disable them (can't sign in).",
          "Live map: where each delivery person is while they have the portal open.",
          "How you pay them: salary, per delivery or commission. Used for their payroll.",
        ],
        pasos: [
          "Tap «Agregar repartidor» and type their name and WhatsApp.",
          "Tap «Enviar acceso por WhatsApp».",
          "The delivery person opens the link and lands in their portal.",
          "Ask them to set «Disponible» (available) to get orders.",
        ],
        tips: [
          "If a delivery person stops working with you, tap «Cambiar el código»: the old one stops working.",
          "Share the delivery manual with your delivery person: delywa.com/manual?solo=repartidor",
        ],
        faq: [["The delivery person says they can't sign in", "Check that they're not disabled and that they use the number you registered. If needed, change their code and send the access again."]],
      },
      cuadres: {
        titulo: "Cash reconciliations",
        que: "When they finish, the delivery person reconciles from their portal the cash they collected, minus the change they gave, plus the change from orders that came back. You confirm how much you received.",
        spots: [
          "Delivered orders that haven't been reconciled yet.",
          "Reconciliations the delivery person sent that are waiting for you to confirm.",
          "Each reconciliation: delivery person, date, orders and the net they must hand over.",
          "«Ver»: opens the reconciliation to count and confirm it.",
          "History of the change you gave each delivery person.",
        ],
        pasos: [
          "The delivery person taps «Cuadrar» in their portal and picks the orders.",
          "In «Cuadres», open the pending reconciliation.",
          "Count the money and type how much you received.",
          "Confirm. If money is short or over, the difference is kept as the delivery person's balance.",
        ],
        tips: ["A delivery person with an unconfirmed reconciliation can't get new orders until you confirm it."],
      },
      "confirmar-cuadre": {
        titulo: "Confirming a reconciliation",
        que: "You open the reconciliation the delivery person sent, count the money and type how much you received. If it's short or over, Delywa records it as the delivery person's balance.",
        spots: [
          "What the delivery person must hand over to you.",
          "What you actually received.",
          "Confirm. The reconciliation closes and the delivery person can take orders again.",
        ],
        pasos: ["Tap «Ver» on the pending reconciliation.", "Count the money.", "Type what you received.", "Tap «Confirmar»."],
        tips: ["Balances (what they owe or are owed) are settled from the same «Cuadres» screen."],
        faq: [["What is «neto a entregar»?", "What the delivery person must give you: cash collected, minus change given to customers, plus the change from returned orders."]],
      },
      ventas: {
        titulo: "Sales and cash register",
        que: "What you sold today and this month, and the day's cash register closing.",
        spots: [
          "Today's sales: delivered orders in your local time.",
          "Whether today's register is already closed.",
          "Close today's register when you finish.",
          "The month's summary: total, delivered and cancelled.",
          "Reports: by period and by branch.",
        ],
        pasos: ["When closing, open «Ventas».", "Check today's sales.", "Tap «Cuadrar la caja de hoy».", "Below you see the last 30 days, day by day."],
        tips: ["Only the Owner and the «Colmadero» see «Ventas».", "To compare periods or branches, tap «Ver reportes por periodo y por sucursal»."],
      },
      reportes: {
        titulo: "Reports",
        que: "How much you sold in a period, day by day, and how much each branch sold. Only delivered orders count.",
        spots: [
          "Choose the period: today, the last 7 days, this month or last month.",
          "Sold in the period.",
          "Average per order: sales divided by delivered orders.",
          "Sales per day for the branch you are in. Move your finger or mouse over a bar to see the amount.",
        ],
        pasos: ["Open «Reportes».", "Choose the period at the top.", "Look at sales and the average per order.", "Scroll to «Por sucursal» to compare your branches: sales, delivered, cancelled and each one's share of the total."],
        tips: ["The chart is for the active branch: to see another, switch to it from the menu.", "Only the Owner and the «Colmadero» see «Reportes»."],
      },
      factura: {
        titulo: "Electronic invoicing (DGII)",
        que: "The guide for the DGII (Dominican tax office) to authorize your business to issue electronic invoices (e-CF). There are 10 steps in 4 stages; the ones done at the DGII you mark here when you finish them.",
        spots: [
          "How far along you are: the percentage and how many steps are done.",
          "Tax details: type your RNC or ID number and tap «Verificar con la DGII». If it is active, the legal name fills in by itself, as at the DGII.",
          "The digital certificate of the person who signs. Only the owner uploads it; it is stored encrypted.",
          "The steps done at the DGII: open it, follow the instructions and mark it with «Ya lo hice» (done).",
        ],
        pasos: [
          "Open Money → «Factura electrónica».",
          "Type your RNC or ID number and tap «Verificar con la DGII».",
          "If it shows as active, fill in the address and taxpayer type and save.",
          "Get the digital certificate (Cámara de Comercio, AVANSI or OGTIC) and upload it with its password.",
          "Do the steps each card describes in the DGII Virtual Office, and mark them with «Ya lo hice».",
          "When the DGII authorizes you, enter the date and record your sequences.",
        ],
        tips: [
          "Each card has a link to the DGII page where that step is done.",
          "Only the Owner and the «Colmadero» see this screen. Only the Owner uploads the certificate.",
          "For any tax question, check with your accountant.",
        ],
        faq: [
          ["What do I do if it says my RNC is suspended?", "Go to the DGII (office or Virtual Office) and resolve the suspension: catch up on returns and payments. Once the DGII activates it, come back and tap «Verificar con la DGII». The DGII list can take a day or two to update."],
          ["Can I change the legal name?", "No: it is taken as is from the DGII, which is how it must appear on the invoice. If it is wrong, fix it at the DGII and verify again."],
          ["Does Delywa issue invoices already?", "Not yet. This guide gets you ready for the DGII; issuing is turned on when Delywa connects the certified provider."],
        ],
      },
      clientes: {
        titulo: "Customers",
        que: "Everyone who has messaged or ordered from you, with their phone and address. They are saved automatically when they order through the chat.",
        spots: [
          "Search by name or phone.",
          "Each customer: name, phone, orders and total spent (only delivered orders count).",
        ],
        tips: ["If the customer saved their home in the chat, the order shows «🏠 Casa (guardada)» (home, saved) with the address."],
      },
      empleados: {
        titulo: "Employees, attendance and payroll",
        que: "Your colmado staff: each employee clocks in and out with a code, and Delywa calculates the payroll.",
        spots: [
          "Your business's attendance link. Copy it and give it to your employees: that's where they clock in and out with their code.",
          "Three parts: employees, attendance and payroll.",
          "New employee: name, position, how they're paid (hourly or salary) and their code.",
          "Each employee: position, phone, pay and access code.",
        ],
        pasos: [
          "Tap «Nuevo empleado» and fill in their details.",
          "Give them their code and the attendance link («Copiar enlace» button at the top).",
          "The employee opens the link, types their code and clocks in or out.",
          "In «Asistencia» you see their hours and can correct a punch.",
          "In «Nómina» you calculate the period, close it and mark it paid.",
        ],
        tips: ["Payroll uses your country's rules (holidays and overtime) and local time.", "An employee's code only works on your business's link."],
        faq: [["My employee says their link no longer works", "Since November 2026 each business has its own attendance link. Copy it in «Empleados» and send it to them; their code stays the same."]],
      },
      configuracion: {
        titulo: "Business settings",
        que: "Your colmado's details organized in sections: details, logo, location, hours, delivery, payment methods and the chat. Everything is saved with a single button.",
        spots: [
          "Search a setting by name («horario» hours, «costo» cost, «mapa» map).",
          "The sections: tap one to see it. «Falta el mapa» (map missing) tells you what is incomplete.",
          "Hours: when the colmado is closed, the chat says so and doesn't take orders.",
          "Delivery: delivery fee, minimum order, radius and estimated time.",
          "Payment methods: cash, card and bank transfer (with your accounts).",
          "«Guardar cambios» (save changes): saves all sections at once.",
        ],
        pasos: [
          "Check the business details and upload your logo.",
          "In «Ubicación» (location) mark your colmado on the map.",
          "Set your hours.",
          "Set the delivery fee.",
          "Tick your payment methods.",
          "Tap «Guardar cambios».",
        ],
        tips: ["Only the Owner changes the name, WhatsApp and logo."],
      },
      "chat-pagina": {
        titulo: "Your colmado's chat (link and QR)",
        que: "Your colmado has its own chat on delywa.com. The customer writes like on WhatsApp, the bot takes the order and it reaches you in «Pedidos», even without WhatsApp Business.",
        spots: [
          "Your chat link. Share it on your WhatsApp status, Instagram or Facebook.",
          "Copy the link.",
          "The QR code to print and stick in the colmado. «Descargar QR» saves it as an image.",
          "Opens your chat as the customer sees it, to try it.",
        ],
        pasos: ["Open Settings → «Chat de mi página».", "Copy the link or download the QR.", "Share it with your customers.", "Place a test order yourself."],
        tips: ["Share the customer manual with your customers: delywa.com/manual?solo=cliente"],
      },
      preguntas: {
        titulo: "Bot FAQ",
        que: "What the bot answers about your colmado when a customer asks: whether you sell gas, whether you give credit, how far delivery goes. The bot only uses the answer related to the question.",
        spots: [
          "The question, as a customer would write it.",
          "The short answer you want the bot to give.",
          "Add the question.",
          "Your questions: edit or delete them with each one's buttons.",
        ],
        pasos: [
          "Open Settings → «Preguntas frecuentes».",
          "Type the question and the answer.",
          "Tap «Agregar pregunta».",
          "Test it: open your chat and ask the bot that question.",
        ],
        tips: [
          "Start with what you are asked most: special hours, gas, ice, credit, delivery areas.",
          "Don't put prices that change often: the bot never gives prices, you confirm them on the order.",
          "They apply to all your branches. Up to 30 questions.",
        ],
        faq: [["Does the bot make up answers?", "No. If the question isn't on your list or in Delywa's general information, the bot tells the customer the colmado will answer, and it reaches you in «Chats»."]],
      },
      whatsapp: {
        titulo: "WhatsApp",
        que: "If the platform enabled WhatsApp for you, here you connect your number and the notices (confirmation, on the way, delivered) go out automatically by WhatsApp.",
        spots: ["Your number's connection. If it's not enabled, notices are sent with a button that opens WhatsApp with the message ready."],
        tips: ["Without WhatsApp connected everything works the same: your colmado's chat gets the notices instantly."],
      },
      sucursales: {
        titulo: "Branches",
        que: "If you have more than one colmado, create its branches. Each one has its own orders, delivery people and chat, and inherits your settings.",
        spots: ["Add a new branch: name, WhatsApp and address.", "Your branches: edit or deactivate them."],
        tips: ["Only the Owner creates branches."],
      },
      usuarios: {
        titulo: "Users and permissions",
        que: "Create users for your team. There are two roles: «Colmadero» (the manager, almost like the owner) and «Despachador» (serves customers).",
        spots: ["What each role can do.", "Name, email, temporary password (10 or more characters), role and branches."],
        pasos: ["Fill in the person's details.", "Choose the role.", "Tick their branches.", "Tap «Crear usuario» and give them their email and password."],
        tips: [
          "«Colmadero»: orders, delivery people, reconciliations, sales, employees, payroll, reports and day-to-day settings. Can create «Despachadores» in their branches; can't create «Colmaderos» or branches.",
          "«Despachador»: orders, chats, customers, assigning delivery and today's sales. Doesn't see payroll, reconciliations or settings.",
        ],
      },
      mostrador: {
        titulo: "Counter sales",
        que: "For what you sell right there in the colmado, without chat or delivery. Tap the products, charge in cash, card, bank transfer or on credit («fiado»), and the sale adds to «Ventas» and comes off your stock.",
        spots: [
          "Search a product by name.",
          "Tap a product to add it. Each tap adds one.",
          "Not on the list? Add it as a loose item with its name and price.",
          "What the customer is taking and the total.",
          "How they pay: cash, card, transfer or «fiado» (credit).",
          "For cash, type what they pay with: it shows the change.",
          "«Cobrar» (charge): saves the sale. Then you can print the ticket.",
        ],
        pasos: [
          "Open «Venta de mostrador» in the menu.",
          "Tap the products the customer is taking (or search them by name).",
          "Choose how they pay. For cash, type what they pay with and check the change.",
          "Tap «Cobrar». If you want, print the ticket.",
        ],
        tips: [
          "Counter sales don't show on the «Pedidos» board: they're already delivered.",
          "If you charge «fiado», choose the customer and it is added to their account in «Fiado».",
        ],
      },
      fiado: {
        titulo: "Store credit («fiado»)",
        que: "The accounts of customers you give credit to: how much each one owes, their limit, what was put on credit and what they paid back.",
        spots: [
          "What everyone owes you in total.",
          "Search a customer by name or phone.",
          "Each customer with what they owe. Tap it to see their movements.",
          "Open a new customer's account, with their limit and what they already owed.",
          "Record a payment («abono») when they pay you.",
          "Remind them by WhatsApp what they owe (free, opens WhatsApp with the message written).",
        ],
        pasos: [
          "Open «Fiado» and tap «Nuevo cliente». Enter the name, phone and limit.",
          "To give credit, use «Fiado» in the counter sale or «Anotar fiado» in their account.",
          "When they pay, open their account and tap «Registrar abono».",
        ],
        tips: [
          "If a sale goes over the limit, Delywa doesn't let you record it.",
          "Only the owner and the «Colmadero» change the limit or close an account.",
        ],
      },
      compras: {
        titulo: "Purchases and suppliers",
        que: "What you buy from your suppliers. When you save a purchase, it adds to your stock, updates each product's cost and records what you owe if it was on credit. You can take a photo of the invoice and Delywa reads it.",
        spots: [
          "Your purchases for the month.",
          "Each purchase with its supplier, invoice, total and whether it's paid or on credit.",
          "New purchase: by hand or with a photo of the invoice.",
          "To pay: what you owe each supplier and when it's due.",
          "Your suppliers, with their RNC and credit days.",
          "Monthly report: purchases, ITBIS (VAT), what you owe and approximate profit.",
        ],
        pasos: [
          "Tap «Nueva compra» and choose the supplier (or create it).",
          "Take a photo of the invoice or type each line: quantity, units per case and cost.",
          "Check which product each line goes to; anything that doesn't exist is created with its selling price.",
          "Choose how you paid or «A crédito» (on credit) and save.",
        ],
        tips: [
          "Your customers and the «Despachador» never see the cost.",
          "If a product's margin drops below 10 %, Delywa warns you.",
          "This part is in the Full plan.",
        ],
      },
      ofertas: {
        titulo: "Offers",
        que: "Publish an offer and it shows at the top of your colmado's chat and in the bot's greeting. Customers who accepted notifications get it on their phone.",
        spots: [
          "Write the offer, short and clear.",
          "Publish: choose whether it lasts today, 3 days or a week.",
          "Your current offers and how many customers were notified.",
        ],
        pasos: ["Open «Ofertas».", "Write the offer and choose how long it lasts.", "Tap «Publicar»."],
        tips: ["Customers are notified at most once a day, so they don't get tired of it.", "This part is in the Full plan."],
      },
      "mi-plan": {
        titulo: "My plan",
        que: "Your Delywa plan, the days you have left and the plan comparison. From here the owner chooses a plan and pays by card, in US dollars.",
        spots: [
          "Your current plan and how many days you have left.",
          "Colmado: the day-to-day, with artificial intelligence, counter sales and store credit.",
          "Full: all of Delywa, no limits.",
        ],
        pasos: [
          "Open Settings → «Mi plan».",
          "On the plan you want tap «Elegir este plan» (choose this plan) or «Pagar el año» (pay the year, 1 month free).",
          "Pay with your card on the Stripe page. When you come back, your plan is already active.",
        ],
        tips: [
          "You can change plans whenever you want: the difference for the remaining days is charged or credited.",
          "«Cambiar tarjeta o ver facturas» opens your receipts. «Cancelar plan» won't charge you again and you keep using it until the end of what you paid.",
          "When your plan ends you have 3 days of grace. After that the store and the chat don't take orders until you choose a plan; your data is not deleted.",
          "Only the owner can pay for the plan. Branches use the main business's plan.",
        ],
        faq: [
          ["Am I charged automatically when the trial ends?", "No. Nothing is charged when the trial ends: you have to choose a plan."],
          ["Do I get a refund if I cancel?", "What was paid for a period that already started isn't refunded, but you won't be charged again."],
        ],
      },
      "mi-clave": {
        titulo: "My password",
        que: "Each person changes their own password. Changing it signs them out on their other phones and computers.",
        spots: [
          "Your current password.",
          "The new one: 10 or more characters, not used anywhere else.",
          "Change password.",
          "Signs you out on your other devices, without changing the password.",
        ],
        pasos: ["Open «Mi contraseña» at the end of the menu (on a phone: «Más»).", "Type the current one and the new one twice.", "Tap «Cambiar contraseña»."],
        tips: ["If you left the session open on a device that isn't yours, use «Cerrar sesión en los demás equipos».", "When the owner changes an employee's password, that employee has to sign in again on all their devices."],
      },
    },
  },

  // ============================================================ DELIVERY
  repartidor: {
    titulo: "Delivery manual",
    corto: "Delivery",
    intro: "How to use the delivery portal from your phone: sign in, get orders, reach the customer, collect, return what wasn't delivered and reconcile the cash.",
    grupos: ["Start here", "Delivering", "When you finish"],
    modulos: {
      entrar: {
        titulo: "Signing in to the portal",
        que: "The colmado sends you a link by WhatsApp that signs you in automatically. If you sign in by hand, type your number and the 6-letter code the colmado gave you.",
        spots: [
          "Your WhatsApp number, the same one the colmado registered.",
          "Your 6-letter code. When you type the sixth it signs you in.",
          "«Entrar» (sign in).",
        ],
        pasos: ["Open the link the colmado sent you.", "If it asks for details, type your number and your code.", "Save the page to your phone's home screen to open it fast."],
        tips: ["Next time the portal greets you by name and only asks for the code."],
        faq: [["It says the code isn't valid", "Ask the colmado to send you the access again: they may have changed your code."]],
      },
      disponible: {
        titulo: "Available or on a break",
        que: "At the top you see your name, your colmado and whether you're available. You only get orders when you are «Disponible» (available).",
        spots: [
          "You're in your colmado's delivery portal.",
          "Tap to take a break or become available again.",
          "Orders you have to deliver.",
          "The cash you have to reconcile with the colmado.",
          "This manual, in case you have a question.",
          "Sign out of the portal.",
        ],
        tips: ["Your shift ends one hour after the colmado closes; the next day you sign in again."],
      },
      entregas: {
        titulo: "Your deliveries",
        que: "Each order assigned to you shows in «Entregas» (deliveries) with the customer, the address, the products, how much to collect and the change you carry.",
        spots: [
          "The order: customer, address and products. The first one on the list is the next one.",
          "How much to collect and the change you carry for the customer (the one the colmado gave you).",
          "«Cuadrar» (reconcile): when you finish, reconcile the cash with the colmado.",
          "The bottom menu: «Entregas», «Ruta», «Cuadre» and «Historial».",
        ],
        tips: ["If the customer pays by transfer or card, you don't collect cash: the card tells you."],
      },
      entregar: {
        titulo: "Arriving and delivering",
        que: "Further down the card are the address and the buttons to say you're arriving, call and mark the order delivered.",
        spots: [
          "The address: tap to open your phone's map.",
          "Call the customer.",
          "«Ya estoy llegando» (I'm arriving): the customer is told you're close.",
          "Mark as delivered when the customer receives and pays.",
          "«Retorno» (return): if you couldn't deliver because the customer isn't there, doesn't answer or doesn't want it.",
        ],
        pasos: ["Check the products before leaving.", "Tap the address to get there.", "When close, tap «Ya estoy llegando».", "Deliver, collect and give the change.", "Tap «Marcar como entregado»."],
      },
      transferencia: {
        titulo: "Orders paid by bank transfer",
        que: "If the customer pays by transfer, the colmado has to approve the payment before you mark it delivered. Meanwhile the card tells you and the deliver button stays locked.",
        spots: [
          "«Transferencia sin aprobar» (transfer not approved): ask the customer for the receipt.",
          "Call the colmado so they check the receipt and approve the payment.",
        ],
        pasos: ["Ask the customer to show you the receipt.", "Call the colmado.", "When they approve it, the card says «Transferencia aprobada» and you can mark it delivered."],
        tips: ["If you deliver without approval and the receipt turns out to be fake, you pay that money.", "With the transfer approved you don't collect cash."],
      },
      ruta: {
        titulo: "Your route",
        que: "In «Ruta» you see on the map the orders you still have, in the best order. Delivered ones no longer show here: they go to «Historial».",
        spots: [
          "The map with your numbered stops.",
          "Recalculate the order if you got new orders.",
          "The stops in order, with call and directions.",
        ],
        tips: ["When you have nothing pending, «Ruta» says «Terminaste esta ruta» (route finished)."],
      },
      "no-entregado": {
        titulo: "I couldn't deliver it (return)",
        que: "If the customer isn't there, doesn't answer or doesn't want the order, tap «Retorno» on the card and pick the reason. The customer gets a message.",
        spots: [
          "Tap the reason: the order is marked as not delivered right away and moves to «Devolver al colmado» (return to the colmado).",
          "Another reason? Type it and confirm.",
        ],
        pasos: ["Call the customer before giving up.", "Tap «Retorno».", "Tap the reason."],
      },
      devolver: {
        titulo: "Returning to the colmado",
        que: "Undelivered orders show in red with what you must bring back and the change you were given. If the customer shows up, you can still deliver it.",
        spots: [
          "The order, the reason and the products you're bringing back.",
          "Directions to the colmado.",
          "Call the customer in case they want you to bring it.",
          "«Lo entregué» (I delivered it): if the customer showed up and received it.",
        ],
        pasos: ["Bring the products and the change to the colmado.", "The colmado taps «Recibir devolución» and the order leaves your list."],
        tips: ["The change from a returned order is added to what you hand over in the reconciliation."],
      },
      cuadre: {
        titulo: "Reconciling the cash",
        que: "When you finish, you reconcile with the colmado: the cash you collected, minus the change you gave, plus the change from returned orders.",
        spots: [
          "The delivered orders you're going to reconcile.",
          "Returned orders: their change goes back to the colmado.",
          "A note for the colmado, if needed.",
          "Send the reconciliation. The colmado counts and confirms it.",
        ],
        pasos: ["Tap «Cuadrar».", "Check the orders.", "Hand the money to the colmado.", "Tap «Enviar cuadre»."],
        tips: ["While you have an unconfirmed reconciliation, the colmado can't assign you new orders."],
      },
      historial: {
        titulo: "History",
        que: "Your closed orders: delivered, cancelled and returned. Tap one to see the details. At the bottom it shows your Delywa version.",
        spots: [
          "Tap an order to open it.",
          "The details: products, payment method, amount collected, change, address and the reason if it wasn't delivered.",
        ],
      },
      ganancias: {
        titulo: "My earnings and payments",
        que: "What you have earned in the period, when you get paid, your payments and advances. You never see the colmado's sales: only yours.",
        spots: [
          "Earned in the period: salary, commissions and delivery fees.",
          "Today's earnings.",
          "Your reconciliation balance: if it's negative, you owe the colmado.",
          "Ask for an advance: up to half of what you have earned.",
          "Your payments: tap one to see the details and the receipt, and confirm «Recibí mi pago» (I got paid).",
          "My numbers: deliveries, % without failures and average minutes.",
        ],
        pasos: ["Open the «Ganancias» tab.", "Check what you earned and the pay day.", "When you get paid, open the payment and tap «Recibí mi pago»."],
        tips: ["Tips are yours and show separately.", "This tab appears if the colmado's plan includes it."],
      },
    },
  },

  // ============================================================ CUSTOMER
  cliente: {
    titulo: "Customer manual",
    corto: "Customer",
    intro: "How to order from the colmado through its chat: write like on WhatsApp, send your location, choose how to pay and the colmado confirms the total.",
    grupos: ["Ordering", "Afterwards"],
    modulos: {
      entrar: {
        titulo: "Opening the colmado's chat",
        que: "Open the link or scan the colmado's QR code. Type your name and phone once and you can order.",
        spots: [
          "The colmado you are writing to.",
          "Your name.",
          "Your phone: the colmado and the delivery person use it to call you.",
          "Enter the chat.",
        ],
        tips: [
          "If you come back the same day from the same phone, you continue in the same conversation.",
          "After 10 minutes without writing, it asks for your details again for security.",
        ],
      },
      pedir: {
        titulo: "Placing your order",
        que: "Write what you want as you would tell the colmado owner: «2 libras de arroz, un aceite y 10 pesos de ajo» (2 lb of rice, an oil and 10 pesos' worth of garlic). You can also send a voice note.",
        spots: [
          "Your conversation. The bot writes down your order as you go.",
          "Quick buttons: «Eso es todo» (that's all) or «Agregar más» (add more).",
          "Type here. Hold the microphone for a voice note.",
        ],
        pasos: ["Type the products.", "Answer «¿Algo más?» (anything else?).", "When you're done, tap «Eso es todo»."],
        tips: [
          "The bot writes down what you type in your own words (it only fixes spelling) and adds an emoji to each product: 🍚 rice, 🍺 cold beer, 🫒 oil…",
          "«10 pesos de ajo» is written down as RD$10 of garlic, not 10 garlic bulbs.",
          "If there are buttons but you'd rather type, type: the bot answers and then repeats the question.",
          "If the bot doesn't understand something, the colmado reads it and answers you.",
        ],
      },
      ubicacion: {
        titulo: "Your location",
        que: "The colmado asks for your location on every order, because you may be somewhere else. If you saved your home, tap «A mi casa» (to my home).",
        spots: [
          "«📍 Enviar mi ubicación» (send my location) or «🏠 A mi casa» if you already saved it.",
          "The + button also has location and the receipt photo.",
        ],
        tips: ["After your first order, the bot offers to save your home. Your saved address is never shown in the chat."],
      },
      pagar: {
        titulo: "How to pay",
        que: "Choose cash, card or bank transfer. For cash, say what you'll pay with so the delivery person brings your change. For transfer, you get the colmado's accounts and send the receipt photo with the «📸 Enviar comprobante» button.",
        spots: [
          "Choose the payment method and, for cash, what you'll pay with.",
          "Transfer: send the receipt photo with the + button.",
        ],
      },
      seguimiento: {
        titulo: "Confirmation and tracking",
        que: "The colmado checks your order and sends you the prices and the total. Then it tells you when it's on the way, when it's arriving and when it was delivered.",
        spots: [
          "Your order status, always in view. Tap it («Ver cómo va» — see how it's going) to see the steps.",
          "Here you get the summary, the confirmation with the total and the on-the-way and delivered notices.",
        ],
        tips: [
          "Top right, «Mis pedidos» (my orders): the current order with its steps (sent, confirmed, preparing, on the way, delivered) and previous ones. «Volver al chat» takes you back to the conversation.",
          "Another day, the greeting offers «Repetir mi último pedido» (repeat my last order).",
          "To cancel, write «cancelar» before it goes out.",
        ],
        faq: [["Why don't I see my earlier orders?", "For security, «Mis pedidos» only shows the ones you placed from this same phone."]],
      },
    },
  },
};

/** El manual en inglés: misma estructura, selectores y capturas que el español; solo cambia el texto. */
export const GUIA_EN: Record<ClaveManual, Manual> = Object.fromEntries(
  (Object.keys(GUIA) as ClaveManual[]).map((clave) => {
    const es = GUIA[clave], en = EN[clave];
    return [clave, {
      ...es,
      titulo: en.titulo,
      corto: en.corto,
      intro: en.intro,
      grupos: es.grupos.map(([nombre, ids], i) => [en.grupos[i] ?? nombre, ids] as [string, string[]]),
      modulos: es.modulos.map((m) => {
        const t = en.modulos[m.id];
        if (!t) return m;
        return {
          ...m,
          titulo: t.titulo,
          que: t.que,
          spots: m.spots.map(([sel, texto], i) => [sel, t.spots[i] ?? texto] as [string, string]),
          pasos: t.pasos ?? m.pasos,
          tips: t.tips ?? m.tips,
          faq: t.faq ?? m.faq,
        };
      }),
    }];
  }),
) as Record<ClaveManual, Manual>;
