# Punto de Venta

Programa de punto de venta de escritorio para Windows, de uso personal. Reproduce las funciones y los atajos de teclado documentados en el manual público de eleventa, pero el código, el nombre y el diseño son propios.

## Instalación en Windows

En la carpeta `dist/` hay dos archivos:

- `Punto de Venta Setup 1.0.0.exe`: instalador. Crea un acceso directo en el escritorio.
- `Punto de Venta 1.0.0.exe`: versión portable. Se ejecuta sin instalar, por ejemplo desde una USB.

Windows puede mostrar "Windows protegió su PC" porque el programa no está firmado. Haz clic en **Más información → Ejecutar de todas formas**.

La primera vez se abre un asistente que pide los datos del negocio, la moneda, las funciones y las formas de pago.

- Usuario inicial: `admin`
- Contraseña inicial: `12345`, o la que pongas en el asistente.

Los datos se guardan en `%APPDATA%\Punto de Venta\puntoventa.db`. Haz respaldos desde **Configuración → Base de datos y respaldos**.

## Teclas de la pantalla de ventas

| Tecla | Acción |
|---|---|
| ENTER | Agregar el producto del código (`5*código` agrega 5) |
| INS | Varios (código + cantidad) |
| CTRL+P | Artículo común (no registrado) |
| F10 | Buscar producto (`%texto` busca en cualquier parte de la descripción) |
| F11 | Precio de mayoreo (activa o quita) |
| F7 / F8 | Entrada / salida de efectivo |
| DEL | Borrar artículo |
| F9 | Verificador de precios |
| + / − | Más o menos cantidad del renglón |
| CTRL+D | Descuento al renglón (clic en el total = descuento a toda la venta) |
| = | Asignar cliente |
| F5 / F6 | Cambiar ticket / dejar ticket pendiente |
| F12 | Cobrar (en el cobro: F1 cobra e imprime, F2 cobra sin imprimir, F4 notas, Alt+número cambia la forma de pago) |

Para ir a los módulos: **F1** Ventas · **F2** Créditos · **F3** Productos · **F4** Inventario. Clientes, Compras, Configuración, Corte y Reportes se abren con clic.

## Desarrollo

```bash
npm install
npm start             # abrir la app
npm run dist:win      # generar los .exe de Windows en dist/
```

Si lo ejecutas desde la terminal de VS Code, usa `env -u ELECTRON_RUN_AS_NODE npm start`.

La especificación funcional completa está en `docs/ESPECIFICACION.md`.

## Pendiente

- Varias cajas en red (MultiCaja).
- Lectura de báscula por puerto serial. Las etiquetas impresas por la báscula sí funcionan.
- Apertura del cajón por comando directo. Hoy se abre mediante la configuración del controlador de la impresora.
- Envío de cortes y órdenes de compra por correo.
- Facturación electrónica DIAN.
