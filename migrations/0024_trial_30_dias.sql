-- La página dice «1 mes gratis»: el plan de prueba pasa de 15 a 30 días.
-- Solo si sigue con los 15 días de fábrica (no pisa un cambio hecho a mano en Plataforma → Planes).
UPDATE `planes` SET `duracion_dias` = 30, `descripcion_corta` = 'Prueba gratis por 1 mes',
  `caracteristicas` = '["1 mes de prueba gratis","1 delivery incluido","Hasta 20 pedidos diarios","Soporte por WhatsApp"]'
WHERE `es_trial` = 1 AND `duracion_dias` = 15;
