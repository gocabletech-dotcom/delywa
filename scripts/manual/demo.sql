-- Datos de demostración SOLO para las capturas del manual (base local aparte, nunca producción).
-- Los aplica scripts/manual/capturas.mjs sobre una base D1 local nueva (.wrangler/manual).
INSERT INTO "colmados" ("id","nombre","slug","whatsapp_numero","direccion","ciudad","provincia","plan_id","estado","owner_user_id","whatsapp_phone_number_id","whatsapp_access_token","fecha_suscripcion","tipo_negocio","impuesto","fecha_inicio_plan","fecha_vencimiento","estado_suscripcion","dia_corte","dias_gracia","logo","color_primario","descripcion","encargado_nombre","telefono_alternativo","latitud","longitud","costo_delivery","radio_entrega","tiempo_estimado","pedido_minimo","hora_apertura","hora_cierre","dias_servicio","esta_abierto_manual","mensaje_cerrado","mensaje_bienvenida","mensaje_confirmacion","titulo_compartir_pedido","descripcion_compartir_pedido","evolution_api_url","evolution_api_key","evolution_instance_name","whatsapp_provider","pais_id","codigo_postal","tecnologias_habilitadas","bot_prompt_custom","negocio_principal_id") VALUES(1,'Colmado El Sol','colmado-el-sol','18094440001','Calle 1, Los Mina',NULL,NULL,1,'activo','owner_demo',NULL,NULL,1794519227767,'colmado',0,1794519227767,NULL,'activa',28,6,NULL,'#25D366',NULL,NULL,NULL,'18.48','-69.88',50,5,'20-30 min',0,'00:00','23:59','["lunes","martes","miercoles","jueves","viernes","sabado","domingo"]',1,'Estamos cerrados. Abrimos pronto.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'meta',NULL,NULL,'{}',NULL,NULL);
INSERT INTO "users" ("id","email","first_name","last_name","profile_image_url","whatsapp_numero","password","role","colmado_id","delivery_id","created_at","updated_at") VALUES('owner_demo','demo@delywa.test','Demo',NULL,NULL,NULL,'pbkdf2$100000$VvVSVx91LaQBX86JowENeQ==$Fep8ywb2KsfspfL4Vsn9SCiLTB+uiTsFhDPyRFIwkCU=','colmado_owner',1,NULL,1794519235479,1794519235479);
UPDATE colmados SET estado='activo', hora_apertura='00:00', hora_cierre='23:59', latitud='18.4800000', longitud='-69.8800000', direccion='Calle 1, Los Mina', logo=NULL, costo_delivery='50' WHERE id=1;
INSERT INTO deliveries (id, colmado_id, nombre, whatsapp_numero, estado, codigo_acceso) VALUES (1, 1, 'José Reyes', '+18095559999', 'activo', 'AB3X7K');
INSERT INTO deliveries (id, colmado_id, nombre, whatsapp_numero, estado, codigo_acceso) VALUES (2, 1, 'Ramón Peña', '+18095558877', 'en_descanso', 'QW7K2M');
INSERT INTO empleados (negocio_id, nombres, apellidos, telefono, puesto, estado, tipo_pago, salario_fijo, periodo_pago, moneda, codigo_acceso, fecha_ingreso) VALUES (1, 'Yanet', 'Rosario', '8095551212', 'Despachadora', 'activo', 'salario', '18000', 'quincenal', 'DOP', 'EMP7Q2', '2026-03-01');
INSERT INTO empleados (negocio_id, nombres, apellidos, telefono, puesto, estado, tipo_pago, tarifa_hora, periodo_pago, moneda, codigo_acceso, fecha_ingreso) VALUES (1, 'Kelvin', 'Martínez', '8095553434', 'Ayudante', 'activo', 'por_hora', '120', 'semanal', 'DOP', 'EMP9X4', '2026-06-15');
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion) VALUES (1,'Ana Pérez','18095550001','Calle Sol #5, Los Mina','[{"nombre":"Arroz (libras)","cantidad":2,"monto":null},{"nombre":"Aceite","cantidad":1,"monto":null},{"nombre":"Ajo (RD$10)","cantidad":1,"monto":10}]','0',NULL,'pendiente_confirmacion','efectivo','500',(unixepoch()-180)*1000);
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion) VALUES (1,'Luis Gómez','18095550002','Av. Duarte 12','[{"nombre":"Hielo (funda)","cantidad":1,"monto":null},{"nombre":"Cerveza Presidente","cantidad":6,"monto":null}]','0',NULL,'pendiente_confirmacion','transferencia','0',(unixepoch()-420)*1000);
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,costo_delivery_aplicado) VALUES (1,'Marta Díaz','18095550003','Calle 4 #21','[{"nombre":"Pan","cantidad":1,"monto":50},{"nombre":"Malta Morena","cantidad":1,"monto":90},{"nombre":"Queso","cantidad":1,"monto":500}]','690','690','en_preparacion','tarjeta','0',(unixepoch()-840)*1000,'50');
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,necesita_devuelta,cliente_latitud,cliente_longitud) VALUES (1,'Félix Almonte','18095550008','Calle 7 #3','[{"nombre":"Salami","cantidad":1,"monto":350},{"nombre":"Huevos","cantidad":12,"monto":15}]','580','580','listo','efectivo','1000',(unixepoch()-1080)*1000,1,'18.4870000','-69.8710000');
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,delivery_id,necesita_devuelta,vuelto_entregado,vuelto_entregado_al_delivery,cliente_latitud,cliente_longitud) VALUES (1,'Pedro Santos','18095550004','Av. Venezuela 55','[{"nombre":"Botellón de agua","cantidad":1,"monto":80},{"nombre":"Pollo","cantidad":2,"monto":450}]','1030','1030','en_camino','efectivo','2000',(unixepoch()-1560)*1000,1,1,'970',1,'18.4910000','-69.8600000');
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,delivery_id,motivo_retorno,vuelto_entregado,vuelto_entregado_al_delivery) VALUES (1,'Juan Castillo','18095550007','Calle Las Flores 9','[{"nombre":"Leche","cantidad":2,"monto":95},{"nombre":"Café Santo Domingo","cantidad":1,"monto":190}]','430','430','retorno','efectivo','500',(unixepoch()-2880)*1000,1,'No contesta el teléfono','70',1);
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,delivery_id,fecha_entrega) VALUES (1,'Carla Rosario','18095550005','Calle Luna #8','[{"nombre":"Pan","cantidad":1,"monto":50},{"nombre":"Malta","cantidad":1,"monto":150}]','250','250','entregado','efectivo','250',(unixepoch()-4200)*1000,1,(unixepoch()-3000)*1000);
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,delivery_id,fecha_entrega) VALUES (1,'Rosa Marte','18095550006','Calle 9 #14','[{"nombre":"Leche","cantidad":2,"monto":225}]','500','500','entregado','efectivo','500',(unixepoch()-5700)*1000,1,(unixepoch()-4800)*1000);
INSERT INTO pedidos (colmado_id,cliente_nombre,cliente_whatsapp,cliente_ubicacion,productos,total,total_confirmado,estado,metodo_pago,monto_pago,fecha_creacion,delivery_id,fecha_entrega) VALUES (1,'Miguel Tavárez','18095550009','Res. Las Palmas, Apto 3B','[{"nombre":"Refresco 2 litros","cantidad":2,"monto":120},{"nombre":"Pica pollo","cantidad":1,"monto":350}]','640','640','entregado','tarjeta','0',(unixepoch()-9000)*1000,1,(unixepoch()-8400)*1000);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550001', 'Ana Pérez', NULL);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550002', 'Luis Gómez', NULL);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550003', 'Marta Díaz', NULL);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550004', 'Pedro Santos', NULL);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550005', 'Carla Rosario', NULL);
INSERT INTO clientes (colmado_id, whatsapp_numero, nombre, direccion_texto) VALUES (1, '18095550006', 'Rosa Marte', NULL);
INSERT INTO pedidos (colmado_id, cliente_nombre, cliente_whatsapp, cliente_ubicacion, productos, total, total_confirmado, estado, metodo_pago, monto_pago, fecha_creacion, delivery_id, cliente_latitud, cliente_longitud) VALUES (1, 'Sandra Peña', '18095550010', 'Calle Duarte 40, Los Mina', '[{"nombre":"Arroz (libras)","cantidad":5,"monto":45},{"nombre":"Aceite","cantidad":1,"monto":280}]', '555', '555', 'en_camino', 'transferencia', '0', (unixepoch()-1200)*1000, 1, '18.4835000', '-69.8655000');
INSERT INTO metodos_pago (colmado_id, efectivo, transferencia, tarjeta, bancos) VALUES (1, 1, 1, 1, '[{"nombre":"Banco Popular","numeroCuenta":"812345678","tipoCuenta":"Ahorro","titular":"Colmado El Sol"},{"nombre":"Banreservas","numeroCuenta":"960123456","tipoCuenta":"Corriente","titular":"Juan Pérez"}]');
INSERT INTO ventas (colmado_id, fecha, total_ventas, pedidos_entregados, pedidos_cancelados) VALUES (1, (unixepoch()-60)*1000, '1390', 3, 0);
UPDATE pedidos SET vuelto_entregado_at = fecha_creacion + 120000 WHERE vuelto_entregado_al_delivery = 1;

-- Preguntas frecuentes del colmado (lo que el bot contesta).
INSERT INTO conocimiento_archivos (tipo_negocio, nombre, contenido, colmado_id) VALUES
  ('colmado', '¿Venden gas?', 'Sí, cambiamos tanques de 25 y 50 libras. El delivery del gas cuesta RD$100.', 1),
  ('colmado', '¿Fían?', 'Solo a clientes conocidos del barrio, y hay que pagar el viernes.', 1);


-- v2.65 · Datos para los temas nuevos del manual (mostrador, fiado, compras, ofertas, Mi plan, ganancias).
-- La prueba gratis vence en 10 días a partir de hoy, para que el panel no quede en modo limitado.
UPDATE colmados SET fecha_vencimiento = cast(unixepoch('now', '+10 days') * 1000 as integer), estado_suscripcion = 'activa' WHERE id = 1;
INSERT INTO menu_productos (id, colmado_id, nombre, precio, categoria, inventario, inventario_minimo, orden) VALUES
  (1, 1, 'Arroz (libra)', 45, 'Granos', 80, 20, 1),
  (2, 1, 'Aceite Crisol (botella)', 280, 'Despensa', 12, 4, 2),
  (3, 1, 'Huevo', 12, 'Despensa', 90, 30, 3),
  (4, 1, 'Pan de agua', 10, 'Panadería', 40, 10, 4),
  (5, 1, 'Salami Induveca (libra)', 220, 'Embutidos', 6, 3, 5),
  (6, 1, 'Refresco Country Club 2L', 120, 'Bebidas', 24, 6, 6),
  (7, 1, 'Cerveza Presidente grande', 250, 'Bebidas', 3, 12, 7),
  (8, 1, 'Leche Rica (litro)', 95, 'Lácteos', 18, 6, 8),
  (9, 1, 'Habichuela roja (libra)', 75, 'Granos', 30, 10, 9),
  (10, 1, 'Hielo (funda)', 50, 'Bebidas', 15, 5, 10);
INSERT INTO producto_costos (menu_producto_id, costo) VALUES (1, 36), (2, 235), (3, 9), (5, 175), (6, 92), (7, 205), (8, 78), (9, 58);
INSERT INTO fiado_cuentas (id, colmado_id, nombre, telefono, limite, saldo, ultimo_movimiento) VALUES
  (1, 1, 'Doña Carmen', '18095550011', 3000, 1450, cast(unixepoch('now', '-1 day') * 1000 as integer)),
  (2, 1, 'Pedro el mecánico', '18095550012', 2000, 380, cast(unixepoch('now', '-3 days') * 1000 as integer)),
  (3, 1, 'Yolanda Santos', '18095550013', NULL, 0, cast(unixepoch('now', '-10 days') * 1000 as integer));
INSERT INTO fiado_movimientos (cuenta_id, colmado_id, tipo, monto, nota, usuario, fecha) VALUES
  (1, 1, 'fiado', 950, 'Compra de la semana', 'Demo', cast(unixepoch('now', '-6 days') * 1000 as integer)),
  (1, 1, 'fiado', 700, 'Arroz, aceite y salami', 'Demo', cast(unixepoch('now', '-2 days') * 1000 as integer)),
  (1, 1, 'abono', 200, NULL, 'Demo', cast(unixepoch('now', '-1 day') * 1000 as integer)),
  (2, 1, 'fiado', 380, 'Refresco y pan', 'Demo', cast(unixepoch('now', '-3 days') * 1000 as integer));
INSERT INTO suplidores (id, colmado_id, nombre, rnc, telefono, vendedor, dias_credito) VALUES
  (1, 1, 'Distribuidora La Fe', '130123456', '8095551200', 'Manuel', 15),
  (2, 1, 'Cervecería Nacional Dominicana', '101001234', '8095551300', 'Rosa', 7);
INSERT INTO compras (id, colmado_id, suplidor_id, factura, ncf, fecha, subtotal, itbis, descuento, total, forma_pago, vence, saldo, estado, usuario) VALUES
  (1, 1, 1, 'F-20431', 'B0100004521', date('now', '-4 days'), 6200, 0, 0, 6200, 'credito', date('now', '+11 days'), 6200, 'registrada', 'Demo'),
  (2, 1, 2, 'CND-88120', 'B0100009910', date('now', '-1 day'), 4100, 738, 0, 4838, 'efectivo', NULL, 0, 'registrada', 'Demo');
INSERT INTO compra_lineas (compra_id, descripcion, menu_producto_id, cantidad, unidades_por_paquete, costo, total, unidades_sumadas, costo_unitario) VALUES
  (1, 'ARROZ SELECTO SACO 100LB', 1, 1, 100, 3600, 3600, 100, 36),
  (1, 'ACEITE CRISOL 12/1', 2, 1, 12, 2600, 2600, 12, 216.67),
  (2, 'PRESIDENTE GDE CJ 12', 7, 2, 12, 2050, 4100, 24, 205);
INSERT INTO ofertas (colmado_id, texto, hasta, activa, aviso, creado_por) VALUES
  (1, '🍺 Jumbo Presidente a RD$230 hasta el domingo. ¡Pídela fría!', cast(unixepoch('now', '+3 days') * 1000 as integer), 1, 'enviado', 'Demo');
UPDATE deliveries SET modelo_pago = 'mixto', salario_monto = 2500, comision_fija = 25, comision_porcentaje = 0, periodo_pago = 'semanal' WHERE id = 1;
INSERT INTO pagos_delivery (delivery_id, colmado_id, periodo_inicio, periodo_fin, total_pedidos, total_ventas, modelo_pago, salario_calculado, comision_calculada, monto_total, estado, fecha_pago, pagado_por, metodo_pago) VALUES
  (1, 1, cast(unixepoch('now', '-14 days') * 1000 as integer), cast(unixepoch('now', '-8 days') * 1000 as integer), 22, 0, 'mixto', 2500, 550, 3050, 'pagado', cast(unixepoch('now', '-7 days') * 1000 as integer), 'Demo', 'efectivo');
