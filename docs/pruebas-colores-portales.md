# Prueba reproducible de colores personalizados por portal

La prueba automatizada del tema está en
`client/src/lib/__tests__/temaNegocio-portales.test.ts`. Ejecutarla desde la
raíz del proyecto:

```bash
npm test -- client/src/lib/__tests__/temaNegocio-portales.test.ts
```

La comprobación cubre:

- Un color no verde (`#7c3aed`) convertido a `--primary`, `--accent` y
  `--ring`, que son las variables usadas por los encabezados y controles con
  las clases `bg-primary`, `text-primary`, `border-primary` y `ring-primary`.
- Texto blanco para fondos oscuros y texto oscuro para fondos claros.
- El fallback verde `#25D366` cuando el negocio es antiguo (sin color) o el
  valor guardado no es un hexadecimal de seis dígitos.
- La conexión de `businessTheme` con el panel del negocio (incluida
  configuración), menú público, portal de pedidos/WhatsApp, seguimiento y
  portal de delivery.

La prueba es un contrato de regresión ejecutable en CI: verifica las variables
de tema y que cada portal conserva su punto de aplicación y sus controles
principales. No depende de datos reales, autenticación, mapas ni servicios
externos, por lo que puede ejecutarse de forma reproducible con el comando
anterior.