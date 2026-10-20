# Especificación funcional — Punto de Venta de escritorio (equivalente funcional a "eleventa" 5.x)

> **Propósito.** Este documento describe el *comportamiento funcional* que debe tener nuestra aplicación de punto de venta (POS) de escritorio para ofrecer una funcionalidad equivalente a la del software comercial "eleventa" (versión 5.x, manual en línea y manual PDF v5.50, consultados en octubre de 2026).
>
> **Reglas de originalidad.** No se copia código, marca, logotipos, imágenes ni textos. Todo lo que aquí aparece es una descripción funcional redactada de forma independiente: pantallas, flujos, campos, atajos de teclado y reglas de negocio. Los nombres de botones se indican como referencia de *comportamiento*; en nuestra app podemos usar etiquetas propias (se sugiere mantener las teclas, que son estándar de facto en POS de México/Latam).
>
> **Convenciones.**
> - **(no confirmado)** = deducido de capturas o del contexto, pero no documentado explícitamente por la fuente.
> - **[Adaptación]** = sugerencia nuestra para nuestro mercado (p. ej. Colombia), no forma parte del original.
> - Fuera de alcance: facturación electrónica CFDI/SAT, terminales Mercado Pago / Prosepago / TPV, recargas electrónicas, pago de servicios, nube, "pulso", tarjetas virtuales, catálogo en línea "presto", licenciamiento.

---

## Índice

1. [Visión general y arquitectura funcional](#1-visión-general-y-arquitectura-funcional)
2. [Navegación global y atajos de teclado](#2-navegación-global-y-atajos-de-teclado)
3. [Inicio de sesión, turnos y fondo de caja](#3-inicio-de-sesión-turnos-y-fondo-de-caja)
4. [Módulo Ventas (F1)](#4-módulo-ventas-f1)
5. [Cobro y formas de pago](#5-cobro-y-formas-de-pago)
6. [Historial: ventas del día, devoluciones y cancelaciones](#6-historial-ventas-del-día-devoluciones-y-cancelaciones)
7. [Entradas y salidas de efectivo](#7-entradas-y-salidas-de-efectivo)
8. [Módulo Créditos (F2)](#8-módulo-créditos-f2)
9. [Módulo Clientes](#9-módulo-clientes)
10. [Módulo Productos (F3)](#10-módulo-productos-f3)
11. [Actualizador masivo de productos](#11-actualizador-masivo-de-productos)
12. [Módulo Inventario (F4)](#12-módulo-inventario-f4)
13. [Módulo Compras y Proveedores](#13-módulo-compras-y-proveedores)
14. [Módulo Corte (cortes y turnos)](#14-módulo-corte-cortes-y-turnos)
15. [Módulo Reportes](#15-módulo-reportes)
16. [Módulo Configuración](#16-módulo-configuración)
17. [Dispositivos (impresora, cajón, lector, báscula)](#17-dispositivos)
18. [Modelo de datos sugerido](#18-modelo-de-datos-sugerido)
19. [Reglas de negocio transversales y cálculos](#19-reglas-de-negocio-transversales-y-cálculos)
20. [Matriz de permisos](#20-matriz-de-permisos)
21. [Pendientes / no confirmados](#21-pendientes--no-confirmados)
22. [Fuentes consultadas](#22-fuentes-consultadas)

---

## 1. Visión general y arquitectura funcional

- Aplicación de escritorio para pequeños comercios (abarrotes, ferreterías, cremerías, papelerías, restaurantes sencillos).
- Dos ediciones de despliegue:
  - **MonoCaja**: una sola computadora, base de datos local.
  - **MultiCaja**: una computadora "Caja principal (servidor)" que aloja la base de datos y N "cajas adicionales" en red LAN que comparten datos. Cada caja tiene un **nombre** (p. ej. "Caja mostrador"); los reportes y cortes pueden filtrarse por caja.
- **Guardado automático**: toda operación se persiste inmediatamente; no existen botones "Guardar" globales (excepto en formularios de alta/edición). En Configuración los cambios se guardan al momento.
- Interfaz pensada para uso **100 % con teclado** en la pantalla de venta (teclas de función), y con ratón en pantallas administrativas.
- Moneda, separador de miles y decimal configurables. Cantidades a granel con hasta 3 decimales.
- Asistente de bienvenida en el primer arranque (ver §16.1).

### 1.1 Módulos principales

| Módulo | Tecla | Propósito |
|---|---|---|
| Ventas | **F1** | Pantalla principal de venta (aparece al iniciar). |
| Créditos | **F2** | Estado de cuenta y saldos de clientes a crédito. |
| Clientes | — | Alta/edición/baja de clientes. |
| Productos | **F3** | Catálogo, departamentos, promociones, importación, reportes por período. |
| Inventario | **F4** | Entradas, ajustes, reportes, kardex. |
| Compras | — | Proveedores, compras sugeridas, lista de compras, órdenes de compra, histórico. |
| Configuración | — | Todas las opciones del sistema. |
| Facturas | — | (fuera de alcance) |
| Corte | — | Corte de turno / del día, cierre de turno, historial. |
| Reportes | — | Reporte de ventas y ganancias por período, ventas por cliente. |

---

## 2. Navegación global y atajos de teclado

### 2.1 Estructura de la ventana principal

1. **Encabezado**: logotipo del negocio (configurable, 300×63 px aprox.), a la derecha "Le atiende: *nombre del cajero*".
2. **Barra de navegación superior** (botones grandes con ícono + texto, en este orden):
   `F1 Ventas` · `F2 Créditos` · `Clientes` · `F3 Productos` · `F4 Inventario` · `Compras` · `Configuración` · `Facturas` · `Corte` · `Reportes`.
   El botón del módulo activo aparece deshabilitado/resaltado.
3. A la derecha de la barra: botón **minimizar** y botón **Salir** (abre el diálogo de salida / cierre de turno, §3.4).
4. **Barra de título del módulo** (franja de color con el nombre del módulo, p. ej. "VENTA - Ticket 1", "PRODUCTOS", "INVENTARIO").
5. **Sub-barra de acciones** del módulo (botones de submenú).
6. **Barra de estado** inferior: versión, fecha y hora.

### 2.2 Atajos globales

| Tecla | Acción |
|---|---|
| F1 | Ir a Ventas |
| F2 | Ir a Créditos |
| F3 | Ir a Productos |
| F4 | Ir a Inventario |
| — | Clientes, Compras, Configuración, Corte, Reportes, Facturas no tienen tecla rápida (se acceden con clic). |

> Nota: dentro de diálogos modales (Cobrar, Verificador, etc.) las teclas F1/F2/F4 se reutilizan con significado local (ver tablas de cada diálogo). Los atajos globales solo aplican cuando no hay un diálogo modal abierto.

### 2.3 Atajos de la pantalla de Ventas (resumen)

| Tecla | Acción |
|---|---|
| ENTER | Agregar el producto cuyo código está en el campo "Código del producto" |
| `cantidad*código` + ENTER | Agregar N unidades (ej. `5*7501055341344`) |
| INS | "Varios": diálogo para capturar código + cantidad |
| CTRL+P | Artículo común (producto no registrado) |
| F10 | Buscar producto (diálogo de búsqueda) |
| F11 | Aplicar precio de mayoreo al renglón seleccionado (alternar) |
| F7 | Entrada de efectivo |
| F8 | Salida de efectivo |
| DEL / Supr | Borrar artículo seleccionado del ticket |
| F9 | Verificador de precios |
| + / − | Aumentar / disminuir en 1 la cantidad del renglón seleccionado |
| ↑ / ↓ | Moverse entre renglones del ticket |
| CTRL+D | Descuento al renglón seleccionado (también doble clic sobre el renglón) |
| = | Asignar cliente a la venta / desasignar si ya hay uno |
| F5 | Cambiar de ticket (lista de tickets pendientes) |
| F6 | Poner ticket actual como pendiente y abrir uno nuevo |
| F12 | Cobrar |
| — (clic) | Eliminar ticket pendiente, Reimprimir último ticket, Ventas del día y devoluciones, clic en el total para descuento global |

### 2.4 Atajos del diálogo Cobrar

| Tecla | Acción |
|---|---|
| F1 | Cobrar e imprimir ticket |
| F2 | Cobrar sin imprimir (solo registrar) |
| F4 | Ingresar notas al ticket |
| ESC | Cancelar cobro y regresar a la venta |

### 2.5 Otros diálogos

| Diálogo | Teclas |
|---|---|
| Búsqueda de productos | ENTER = Aceptar (agrega a la venta o devuelve el producto al campo que la invocó); ESC = cerrar (no confirmado) |
| Asignar cliente | ENTER = Asignar; F1 = Nuevo cliente; ENTER = Guardar en el alta rápida |
| Verificador de precios | F10 = Buscar por descripción; F11 = ver precio mayoreo; F1 = Agregar a la venta; ESC = Cancelar |
| Historial de ventas | ESC = Cerrar ventana |
| Cantidad a granel | ENTER = Aceptar |
| Formularios de producto | ENTER / TAB / flechas avanzan entre campos; F10 abre el buscador en cualquier campo "código" |

---

## 3. Inicio de sesión, turnos y fondo de caja

### 3.1 Acceso
- Al abrir la aplicación se pide **Usuario** y **Contraseña**.
- Usuario **admin** siempre existe, no puede eliminarse y tiene todos los permisos. Contraseña inicial por defecto: `12345` (debe forzarse/recomendarse su cambio).
- Recuperación de contraseña de admin: proceso fuera de la app (soporte). **[Adaptación]** podemos ofrecer una clave de recuperación generada al instalar.
- Truco documentado: la contraseña de admin puede capturarse escaneando un código de barras que la contenga (el lector emula teclado). Implicación: los campos de contraseña deben aceptar entrada rápida de lector y ENTER automático.

### 3.2 Inicio de turno
- Al iniciar sesión, si **no hay turno abierto** para esa caja: diálogo **"Efectivo inicial en caja"** (fondo de caja). El monto se registra como **Fondo de caja** del turno. Solo aparece una vez por turno.
- Si la forma de pago **Dólares** está habilitada: diálogo para capturar el **tipo de cambio del día** en cada arranque de la aplicación.

### 3.3 Turno abierto pendiente
- Si la app se cerró con "Dejar turno abierto y salir", al reabrir aparece un aviso de turno abierto con opciones:
  - **Continuar con el mismo cajero** (mismos permisos).
  - **Iniciar con el administrador** (permisos de admin; puede continuar o cerrar el turno).

### 3.4 Salir
- Botón **Salir** → diálogo con:
  - **Cerrar turno…** → flujo de cierre (§14.4).
  - **Dejar turno abierto y salir…** → cierra la aplicación sin cerrar el turno.
  - Cancelar (no confirmado).
- Si el cajero no tiene permiso de Corte, debe salir y entrar un usuario con permiso para cerrar el turno.

### 3.5 Turnos
- Un **turno** = periodo de trabajo de un cajero en una caja, desde la apertura (fondo) hasta el cierre.
- Todas las operaciones (ventas, devoluciones, entradas/salidas, abonos) se ligan a **turno + cajero + caja**.
- Al cerrar el turno la aplicación se cierra y queda lista para un nuevo turno.

---

## 4. Módulo Ventas (F1)

### 4.1 Layout de la pantalla

**Zona superior**
- Título: `VENTA - <nombre del ticket>` (por defecto "Ticket 1"; cambia al nombre del cliente si se asigna).
- Campo **Código del Producto** (con ícono de lector; foco permanente) + botón **ENTER - Agregar Producto**.
- Fila de botones (en este orden): `INS Varios` · `CTRL+P Art. Común` · `F10 Buscar` · `F11 Mayoreo` · `F7 Entradas` · `F8 Salidas` · `DEL Borrar Art.` · `F9 Verificador`.

**Zona central**
- **Pestañas de tickets** (como pestañas de navegador): "Ticket 1", "Mesa 5", "Luis Mireles"…
- **Grilla del ticket** con columnas:
  | # / Código de Barras | Descripción del Producto | Precio Venta | Cant. | Importe | Existencia |
  - "Existencia" muestra el inventario actual o "Ilim" si el producto no usa inventario.
  - Renglón seleccionado resaltado (azul). Precio de mayoreo aplicado → renglón/precio marcado en **amarillo**.
  - Columna Importe con fondo verde claro.

**Zona inferior**
- Texto: `<N> Productos en la venta actual`.
- Botones: `F5 - Cambiar` · `F6 - Pendiente` · `Eliminar` (ticket) · `Asignar cliente` (muestra el nombre del cliente cuando está asignado).
- Bloque de la **última venta cobrada**: `Total`, `Pagó Con`, `Cambio`.
- Botón grande **F12 - Cobrar**.
- **Total** grande de la venta actual, debajo **Subtotal** (y desglose de impuestos si está activado "desglosar impuestos"). Clic en el total → descuento a toda la venta.
- Botones: `Reimprimir Último Ticket` · `Ventas del día y Devoluciones`.

### 4.2 Agregar productos
1. Foco en "Código del Producto". El usuario escribe o escanea el código y presiona ENTER (el lector normalmente envía ENTER).
2. Búsqueda por **código exacto**. Si existe:
   - Producto **por unidad**: se agrega 1 unidad; si el mismo producto ya está en el ticket se incrementa la cantidad (no confirmado; alternativa: nuevo renglón).
   - Producto **a granel**: se abre el diálogo **"¿Cantidad del producto?"** (§4.4) salvo que haya báscula conectada (toma el peso).
   - Producto **kit**: se agrega como un renglón; al cobrar descuenta inventario de sus componentes.
   - Código de **etiqueta de báscula** (13 dígitos con bandera configurada): se decodifica producto + peso/precio (§17.4).
3. Si no existe el código: mensaje de "producto no encontrado" y opción de buscar / dar de alta (no confirmado).
4. Si el producto usa inventario y no hay existencia suficiente: advertencia (comportamiento exacto no confirmado; sugerido: avisar y permitir según configuración).
5. Promociones por cantidad (§10.7) recalculan el precio unitario automáticamente cuando la cantidad del renglón cae en un rango.

### 4.3 Varias unidades
Tres formas:
1. Prefijo `cantidad*código` en el campo de código (ej. `5*7501055341344`). Para granel se permiten decimales (no confirmado).
2. **INS Varios**: diálogo con campos *Código* y *Cantidad*.
3. Seleccionar el renglón y presionar **+** / **−** (incrementa/decrementa en 1).

### 4.4 Productos a granel — diálogo "¿Cantidad del producto?"
- Muestra la descripción del producto y **Precio Unitario = $X**.
- Dos campos vinculados con spinner:
  - **Cantidad del producto** (hasta 3 decimales, en la unidad del producto: kg, l, m…).
  - **Importe actual** ($). Si el cajero captura el importe (ej. "$50 de jamón"), se calcula la cantidad = importe / precio; si captura la cantidad, se calcula el importe.
- Botones **Aceptar** (ENTER) y **Cancelar**.
- Con báscula configurada, la cantidad se llena automáticamente con el peso leído.

### 4.5 Artículo común (CTRL+P)
- Para vender algo no registrado (chicles, dulces, artículos esporádicos, consignación).
- Diálogo con: **Descripción**, **Cantidad**, **Precio unitario** (+ casillas de impuestos si hay impuestos activos). ENTER agrega.
- Reglas: no afecta inventario; no tiene costo → en reportes cuenta como **ganancia del 100 %**; no genera detalle por producto en reportes (se agrupa como "producto común").
- Se puede deshabilitar globalmente (Configuración ➜ Opciones habilitadas) o por permiso de cajero.

### 4.6 Eliminar artículo
- Seleccionar renglón y DEL (o botón "DEL Borrar Art."). Requiere permiso "Eliminar artículos de venta".

### 4.7 Precio de mayoreo (F11)
- Sobre el renglón seleccionado, cambia el precio unitario al **precio de mayoreo** del producto (si está definido > 0). El renglón se marca en amarillo. Presionar de nuevo regresa al precio normal (no confirmado).
- Requiere permiso "Aplicar mayoreo".

### 4.8 Descuentos
1. **Descuento por porcentaje** a un renglón: CTRL+D o doble clic → diálogo con % (ej. 10 % sobre $100 = $90).
2. **Descuento por precio** a un renglón: en el mismo diálogo, capturar monto a descontar o nuevo precio (ej. $50 − $10 = $40).
3. **Descuento a toda la venta**: clic en el total → capturar % o nuevo monto total a cobrar.
- Requiere permiso "Aplicar descuento". El descuento debe quedar registrado en la venta (precio original y precio final) para reportes de ganancia.

### 4.9 Asignar cliente (=)
- Tecla `=` o botón **Asignar cliente** → diálogo "Asignar venta a cliente": búsqueda por folio, nombre/apellidos, teléfono, correo, identificación fiscal.
- ENTER = Asignar. **F1 = Nuevo cliente** (alta rápida, ENTER = Guardar).
- Al asignar: la pestaña del ticket toma el nombre del cliente y el botón "Asignar cliente" muestra el nombre.
- Desasignar: `=` otra vez o clic en el nombre → opción **Des-asignar**.
- Venta sin cliente → se asigna al cliente de sistema **"Público en general"**.
- Requiere permiso "Asignar cliente a una venta".

### 4.10 Tickets pendientes / múltiples ventas simultáneas
- **F6 Pendiente**: pide un **nombre** para el ticket (nombre del cliente, "Mesa 5"…), lo deja en espera y abre un ticket nuevo en otra pestaña.
- **F5 Cambiar**: lista de tickets pendientes; seleccionar + ENTER para retomarlo. También clic en la pestaña.
- **Eliminar**: elimina el ticket pendiente seleccionado (con confirmación).
- Regla: un ticket pendiente se conserva **4 días**; después se descarta.
- Uso típico: restaurantes (consumo por mesa), cliente que sigue escogiendo.

### 4.11 Verificador de precios (F9)
- Ventana para consultar precio sin agregar a la venta.
- Campo de código (escanear/escribir); F10 = buscar por descripción.
- Muestra descripción y precio de venta grande; si hay mayoreo, barra amarilla con el precio de mayoreo; F11 alterna a mostrar mayoreo.
- Si hay impuestos configurados, leyenda "Impuestos incluidos".
- **F1 Agregar a venta**, **ESC Cancelar**.

### 4.12 Búsqueda de productos (F10)
- Disponible desde Ventas, Productos (modificar/eliminar), Inventario, Compras, Promociones (ícono de código de barras o F10).
- Campo de texto; búsqueda **por prefijo** de descripción ("Coca Cola" → descripciones que empiezan con eso).
- Prefijo `%` → búsqueda **contiene** ("%chocolate").
- Resultados con columnas: **Descripción**, **Precio de venta**, **Departamento**, **Inventario**.
- Acciones: **ENTER - Aceptar**, **Modificar producto**, **Eliminar producto**, **Marcar como favorito**.
- **Favoritos**: aparecen primero en los resultados (cuando coinciden con la búsqueda) y con descripción en color azul.
- Requiere permiso "Usar buscador de productos".

### 4.13 Reimprimir último ticket
- Botón que reimprime el ticket de la última venta cobrada.

### 4.14 Alertas de contingencia
- Si está configurado, cada *N* ventas cobradas se muestra al cajero un mensaje configurable (ej. "Recuerda lavarte las manos").

### 4.15 Límite de efectivo en caja
- Si está configurado (§14.6), al cobrar se valida el efectivo acumulado y se advierte/bloquea.

---

## 5. Cobro y formas de pago

### 5.1 Diálogo "Cobrar" (F12)
- Título "COBRAR", **total a cobrar** en grande.
- Fila de **formas de pago** (íconos seleccionables, solo las habilitadas): `Efectivo` · `Crédito` · `Dólares` · `Vale` · `Tarjeta` · `Mixto` · `Transferencia` · `Cheque`. Efectivo seleccionado por defecto.
- Panel derecho: **F1 - Cobrar e Imprimir**, **F2 - Cobrar sin imprimir**, **ESC - Cancelar**, **F4 - Ingresar notas**, **Total de artículos**, casilla "Facturar venta" (fuera de alcance).
- Según la forma de pago:
  - **Efectivo**: campo **"Pagó con"** (monto recibido) → muestra **"Su cambio"** = recibido − total.
  - **Crédito**: lista de clientes **con crédito autorizado**; si la venta ya tiene cliente asignado con crédito, se usa ese. Validar límite de crédito (no confirmado cómo: sugerido bloquear si saldo + venta > límite).
  - **Dólares**: monto recibido en USD; conversión con el tipo de cambio del día; cambio entregado en moneda local.
  - **Vale**: monto/tipo de vale (vales de despensa).
  - **Tarjeta**: registra el pago (el cargo se hace en la terminal bancaria externa). Si hay **comisión %** configurada, el total se incrementa en ese porcentaje.
  - **Transferencia**: campo de **referencia** (ej. teléfono del cliente) que se imprime al pie del ticket. El nombre de esta forma de pago es renombrable (ej. "CoDi", "Nequi").
  - **Cheque**: registra el pago.
  - **Mixto**: formulario con un campo por cada forma habilitada (Efectivo, Crédito *(con link para elegir cliente)*, Dólares, Tarjeta, Vales, Transferencia, Cheque). La suma debe cubrir el total; el excedente en efectivo es cambio.
- **F4 Ingresar notas**: texto libre que se guarda con la venta y se imprime en el ticket (dirección de entrega, referencia de transferencia…).
- **F1**: registra la venta, imprime ticket (si hay impresora configurada; si "No usar impresora", no imprime) y abre cajón si está configurado.
- **F2**: registra la venta sin imprimir (se puede reimprimir desde el historial).
- **ESC**: regresa a la venta sin cambios.

### 5.2 Reglas por forma de pago (efecto en el corte)

| Forma | ¿Suma a "Dinero en caja"? | Etiqueta en sección Ventas del corte | Notas |
|---|---|---|---|
| Efectivo | Sí | "En Efectivo" | Opción "No permitir cobrar si el efectivo recibido es menor que el total" → bloquea con advertencia "efectivo insuficiente". |
| Dólares | Sí, convertido (no confirmado) | (no confirmado) | Tipo de cambio capturado al iniciar; editable en Configuración ➜ Formas de pago ➜ Modificar. |
| Tarjeta | No | "Con Tarjeta de Crédito" | Comisión opcional (%) que **no** se cuenta como ganancia. |
| Crédito | No | "A Crédito" | No es ingreso inmediato. Los abonos posteriores aparecen en "Pagos de créditos". |
| Vales | **Ambiguo**: el manual dice que no, la captura del corte muestra "Ventas en Efectivo y Vales" dentro de Dinero en caja (no confirmado) | "Con Vales de Despensa" | |
| Transferencia | No | "Con Transferencia" | Referencia impresa en ticket. Renombrable. |
| Cheque | No | "Con Cheque" | |
| Mixto | Cada parte según su forma | Cada parte en su línea | Comisión de tarjeta aplicada solo a la porción con tarjeta, calculada para que el total pagado incluya la comisión (ej. 3 %: pago $100 = $97.08 + $2.92). |

### 5.3 Ticket de venta impreso (contenido)
- Líneas en blanco superiores (configurable).
- Logotipo (opcional, monocromo).
- Encabezado: nombre del negocio, dirección, teléfono, identificación fiscal, eslogan, página web (líneas configurables).
- Folio / leyenda del folio (configurable), fecha y hora, cajero, caja (no confirmado orden exacto).
- Datos del cliente (si está activado y la venta tiene cliente): campos seleccionables y ordenables (Nombre completo, Domicilio1, Domicilio2, Colonia, Municipio, Estado, Teléfono).
- Detalle: `Cant. | Descripción | [Precio unitario] | Importe`. Granel muestra la unidad (ej. "1Kg").
- "No. de Artículos: N", **Total** (negritas por defecto), desglose de impuestos (opcional), forma de pago, pagó con, cambio (no confirmado).
- Notas de la venta y referencia de transferencia.
- Pie: líneas de agradecimiento/página web, "Líneas adicionales…", líneas en blanco inferiores.

---

## 6. Historial: ventas del día, devoluciones y cancelaciones

Acceso: botón **"Ventas del día y Devoluciones"** en la pantalla de ventas. Ventana "Historial de Tickets / HISTORIAL DE VENTAS".

### 6.1 Panel izquierdo (lista)
- Buscador: "Puedes buscar por folio o nombre del ticket". El valor `%` lista **todas** las ventas históricas.
- Grilla: **Folio · Arts (cantidad de artículos) · Hora · Total**. Ventas a crédito en **verde** (leyenda "Ventas a Crédito").
- Filtros inferiores: **Del día** (selector de fecha + botón **Hoy**), **Cajero**, **Caja** (MultiCaja).

### 6.2 Panel derecho (detalle del ticket)
- Encabezado "Ticket N": **Folio**, **Cajero**, **Cliente**, fecha y hora, ícono de la forma de pago.
- Grilla: **Cant. · Descripción · Importe**.
- Botón **Devolver artículo seleccionado**: devolución parcial; permite indicar cuántas unidades (ej. 2 de 5).
- **Pagó con**, **Total**, botón **Notas** (habilitado si la venta tiene notas).
- Botones: **Cancelar Venta** · **Facturar…** (fuera de alcance) · **Imprimir copia**.
- Botón **Cerrar Ventana** (ESC).

### 6.3 Reglas
- **Cancelar venta**: anula el ticket completo; los productos regresan al inventario; la operación (y el reembolso) se registra en el **turno actual** (no en el turno original).
- **Devolución parcial**: regresa las unidades al inventario (movimiento tipo "Devolución") y registra el monto devuelto.
- Devoluciones de ventas pagadas con tarjeta/transferencia/cheque: recomendación de devolver en **efectivo** desde caja (afecta "Devoluciones en efectivo" del corte).
- Venta a crédito cancelada/devuelta: reduce el saldo del cliente (no confirmado; consistente con el modelo).
- Requiere permisos "Revisar el historial de ventas" y "Cancelar tickets y devolver artículos".

---

## 7. Entradas y salidas de efectivo

- **F7 Entradas** / **F8 Salidas** desde la pantalla de ventas.
- Diálogo **Entrada de efectivo**: *Cantidad* ($), *Comentarios* (por defecto "Entrada de dinero"), botones **Guardar**, **Cancelar**, **Ver entradas pasadas ↓**.
- Diálogo **Salida de efectivo**: *Cantidad*, *Razón o Proveedor*, **Guardar**, **Cancelar**, **Ver salidas pasadas ↓**.
- "Ver … pasadas" expande una lista de los movimientos **del turno en curso** (hora, descripción, monto) con opción de **cancelar** un movimiento (con confirmación).
- Casilla **"Ocultar funciones adicionales"**: muestra solo cantidad + descripción + Guardar/Cancelar.
- Efecto: suman/restan en "Dinero en caja" y aparecen listados en el corte.
- Permisos: "Registrar entradas de efectivo", "Registrar salidas de efectivo".
- Las salidas sirven para cumplir el **límite de efectivo en caja** (§14.6).

---

## 8. Módulo Créditos (F2)

Encabezado "CRÉDITO A CLIENTES". Submenú: **Estado de Cuenta** · **Reporte de Saldos**.
Requiere habilitar "Deseo ofrecer crédito a mis clientes".

### 8.1 Estado de cuenta
- Buscador de clientes (folio, nombre, teléfono) o selección de lista.
- Cabecera: avatar con iniciales, **nombre del cliente**, **saldo actual** (grande) y **Límite: $X**.
- Botones: **Abonar a deuda** · **Liquidar** · **Imprimir Estado de Cuenta**; filtro **Movimientos:** (De siempre / períodos; no confirmado lista exacta).
- Grilla de movimientos:
  | Fecha/Hora | Folio | Movimiento | Descripción | Monto | Saldo actual | Cajero | Facturado |
  - Tipos de movimiento (etiqueta de color): **VENTA** (+), **ABONO** (−), **LIQUIDAR** (−, "Liquidación adeudo: $X"), **DEV ABONO** (+, "Cancelación de abono #N"). Movimientos cancelados aparecen tachados.
- Panel derecho (detalle del movimiento seleccionado): Folio, Cajero, Cliente, fecha, detalle de artículos (Cant., Descripción, Importe), **Total**, **Pago con**, **Monto pendiente**; botones **Re-imprimir** · **Facturar** (fuera de alcance) · **Cancelar**.
- "Consultar crédito anterior": vista de saldo migrado de versiones anteriores (no necesario para nosotros; **[Adaptación]** usar para importar saldos iniciales).

### 8.2 Abonar a deuda
1. Clic **Abonar a deuda**.
2. Capturar **cantidad**.
3. Elegir aplicación: **A todas las ventas no liquidadas por igual** o **Solamente a la venta seleccionada**.
4. **Comentarios** (opcional).
5. Elegir **forma de pago** del abono (pantalla de cobro) e imprimir comprobante opcional.
- Efecto: movimiento ABONO; abonos en efectivo suman a "Abonos en efectivo" de Dinero en caja; todos aparecen en "Pagos de créditos" del corte.

### 8.3 Liquidar
1. Clic **Liquidar** → confirmar **Liquidar adeudo**.
2. Pantalla de cobro con el saldo total → forma de pago e impresión opcional.
- Genera movimiento "Liquidar / Liquidación de adeudo"; aparece en el corte del día.

### 8.4 Cancelar abono o liquidación
- Seleccionar movimiento → **Cancelar** → confirmar. Se crea movimiento **DEV ABONO** y el saldo se restaura. Recomendación: devolver en efectivo si el abono fue con tarjeta/transferencia/cheque.

### 8.5 Reporte de saldos
- **Total de créditos pendientes** (suma de saldos).
- Botón **Imprimir reporte** (impresora de tickets).
- Columnas: **Número (folio cliente) · Nombre / Dirección · Teléfono · Límite de crédito** ("Sin límite" si ilimitado) **· Saldo actual · Último pago** (fecha).
- Orden por cualquier columna (clic en encabezado).

---

## 9. Módulo Clientes

Pantalla "ADMINISTRACIÓN DE CLIENTES" (maestro-detalle):

### 9.1 Panel izquierdo
- Buscador (nombre, folio, correo, teléfono, identificación fiscal).
- Lista con avatar de iniciales (color), **Folio**, **Nombre**, y línea secundaria con correo – teléfono.
- Botón **Exportar…** (Excel/CSV).

### 9.2 Panel derecho (formulario)
- Botones: **Nuevo Cliente** · **Eliminar** · **Guardar**.
- Campos: **Nombres** (obligatorio), **Apellidos**, **Teléfono**, **Correo electrónico**, **Domicilio1**, **Domicilio2**, **Colonia**, **Municipio / Estado** (combos), **Código Postal**, **Notas / Comentarios**.
- Sección **Crédito**: casilla **Tiene crédito autorizado** → opciones **Ilimitado** o **Con límite máximo de $___**.
- Sección **Facturación electrónica** (fuera de alcance; **[Adaptación]** guardar datos fiscales: NIT/CC, razón social, correo de facturación, régimen, dirección fiscal).
- Folio editable; avatar con iniciales del nombre.

### 9.3 Reglas
- Eliminar: confirmación "Borrar cliente"; acción permanente; mensaje "Cliente eliminado exitosamente". (Sugerido: impedir eliminar clientes con saldo > 0.)
- Cliente de sistema **"Público en general"** no eliminable.
- Exportación con columnas: Nombre, Apellido, Email, Teléfono, Domicilio, Colonia, Municipio, Estado, País, CP, Notas, Límite de crédito, Saldo actual, Fecha del último abono, Folio, + datos fiscales.
- Permisos: "Crear, modificar o eliminar clientes", "Asignar o remover crédito a clientes".

---

## 10. Módulo Productos (F3)

Barra "PRODUCTOS" con submenú: **Nuevo** · **Modificar** · **Eliminar** · **Departamentos** · **Ventas por Período** · **Promociones** · **Importar** · **Catálogo**.

### 10.1 Formulario de producto ("NUEVO PRODUCTO" / modificar)
Pestañas: **Producto** · **Impuestos (n)** · (CFDI fuera de alcance) · **Contenido del paquete** (solo si es kit).

Campos de la pestaña Producto:
| Campo | Tipo / Regla |
|---|---|
| Código de Barras | Texto, único, obligatorio. Puede ser código EAN o código interno corto (ej. "TOM"). F10 para buscar. |
| Descripción | Texto, obligatorio, **máx. 30 caracteres** (en el original). Recomendado: marca + presentación. |
| Se vende | Radio: **Por Unidad/Pza** · **A Granel (usa decimales)** · **Como paquete (kit)**. |
| Unidad de medida | Solo visible si hay más de 2 unidades activas en Configuración (§16.9). |
| Precio Costo | Moneda, sin impuestos. |
| Ganancia | % con spinner (opcional). Vinculado: precio venta = costo × (1 + ganancia/100); si se edita el precio venta se recalcula la ganancia. |
| Precio Venta | Moneda, obligatorio. |
| Precio Mayoreo | Moneda, opcional (0 = sin mayoreo). |
| Departamento | Combo editable (escribir uno nuevo) + "Administrar departamentos". |
| Proveedor | Combo (solo si el módulo de compras está configurado). |
| Inventario | Casilla **"Este producto SÍ utiliza inventario"**; si se marca: **Hay** (existencia actual), **Mínimo**, **Máximo**. Solo visible si "Utilizar inventarios" está activo. |
| Botón | **Guardar Producto**. |

Pestaña **Impuestos**: lista de impuestos configurados con casillas para asignar al producto.

Reglas:
- Ingresar costo **sin impuestos**. Si está activo "precios con impuestos incluidos", el sistema calcula el precio base.
- "Calcular automáticamente precio de venta con margen X %" (opción global) prellena la ganancia al crear, modificar o ingresar inventario.
- Navegación por ENTER/TAB/flechas.
- Cambios de existencia deben hacerse preferentemente desde Inventario (para que quede movimiento con motivo); la captura de "Hay" en el alta genera el inventario inicial.

### 10.2 Modificar producto
- Diálogo para capturar/buscar el código → abre el mismo formulario con los datos → **Guardar Producto**.
- Cambios de precio quedan en el kardex.

### 10.3 Eliminar producto
- Capturar/buscar código → ficha resumida → **Eliminar este producto**. Ya no podrá venderse. (Sugerido: borrado lógico para conservar historial.)

### 10.4 Kits (productos compuestos)
- Tipo de venta "Como paquete (kit)". Los componentes deben existir previamente.
- Pestaña **Contenido del paquete**: capturar código (o buscar) → ENTER muestra descripción → **cantidad** → **Agregar**. Lista "Productos contenidos" (con cantidades) y botón **Remover seleccionado**.
- Precio: por defecto se calculan costo y precio de venta como **suma** de los componentes (cantidad × precio); el usuario puede sobrescribir el precio de venta.
- Al vender un kit se descuenta inventario de **cada componente** que use inventario. En reportes de movimientos/kardex se marca que la salida fue "por KIT".
- Caso típico **venta por paquete o unidad**: producto unitario "Refresco" con inventario en piezas + kit "Paquete 6 refrescos" con contenido 6× refresco (código sugerido `PAQ<código>`).
- Las actualizaciones masivas de precio **no** afectan kits.

### 10.5 Departamentos
- Pantalla maestro-detalle: lista a la izquierda; **Nuevo departamento**, nombre, **Guardar departamento**, **Eliminar** (con confirmación).
- También accesible desde el formulario de producto ("Administrar departamentos").

### 10.6 Catálogo
- Lista completa de productos con: buscador (lupa, por descripción), filtro **Departamento** (Todos por defecto), filtro adicional a la derecha (no confirmado cuál: p. ej. con/sin inventario, tipo de venta).
- Casillas de selección por renglón + casilla "seleccionar todos" en el encabezado.
- Botones: **Actualizar varios** (actualizador masivo, §11), **Modificar**, **Exportar** (Excel en el mismo formato que la plantilla de importación).
- Orden ascendente/descendente al hacer clic en encabezados.
- Columnas (no confirmado exacto): Código, Descripción, Costo, Precio venta, Mayoreo, Departamento, Existencia, Tipo de venta.

### 10.7 Promociones (precio por volumen)
- Lista de promociones vigentes + formulario **NUEVA PROMOCIÓN**:
  - **Nombre de la promoción** (ej. "Coca Cola 3x2").
  - **Código de barras** del producto (escribir, escanear o F10) → muestra la descripción.
  - **Cuando la cantidad vaya desde** N **hasta** M.
  - **Usar precio unitario** $P; se muestran como referencia *Precio normal* y *Precio costo* (para no vender bajo costo).
  - **Guardar Nueva Promoción** (activa de inmediato).
- **Eliminar** promoción con confirmación.
- Regla en venta: si la cantidad del renglón ∈ [desde, hasta], el precio unitario de todo el renglón pasa a P. Un producto puede tener varios rangos.
- Permiso: "Crear promociones".

### 10.8 Ventas por período (reporte por producto)
- **Mostrar ventas de**: período predefinido o rango con calendarios.
- **De la caja**: filtro por caja (MultiCaja) o todas.
- Lista de productos vendidos (código, descripción, cantidad, importe… columnas no confirmadas), **Total vendido** abajo a la derecha.
- **Exportar** (Excel), **Imprimir** (ticket).

### 10.9 Importar productos (asistente)
1. Descargar plantilla (Excel).
2. Seleccionar archivo.
3. **Relacionar columnas**: código, descripción, precio costo, precio venta, precio mayoreo, departamento, proveedor (si aplica), cantidad en inventario, inventario mínimo, inventario máximo, tipo de venta, impuestos.
4. Casillas:
   - **Mis precios incluyen impuestos**.
   - **Actualizar los productos cuyo código ya exista** (si no se marca, los existentes se omiten; si se marca → confirmación "Sí, continuar actualizando mis productos").
   - **Actualizar el inventario del producto** (si no, solo precios/propiedades).
5. Progreso en % y lista de errores por renglón.
- Regla original: un archivo por tipo de venta (unidad vs granel). **[Adaptación]** permitir columna "tipo de venta" en un solo archivo.

### 10.10 Exportar productos
- Desde Catálogo → Exportar: genera archivo con el **mismo formato** de la plantilla de importación (para editar y reimportar).

---

## 11. Actualizador masivo de productos

Flujo tipo asistente desde **Productos ➜ Catálogo ➜ (filtrar y seleccionar) ➜ Actualizar varios**:

1. Elegir acción → **Siguiente**.
2. Capturar parámetros → **Siguiente**.
3. **Resumen** (lista de productos y cambios) con **Atrás**, **Cancelar**, **Comenzar**.
4. Confirmación "¿Seguro?" → **Sí** (no se puede detener ni deshacer).
5. Progreso y resumen final de productos modificados → **Finalizar**.

Acciones:
| # | Acción | Parámetros / reglas |
|---|---|---|
| 1 | Aumentar o disminuir precios | (a) **porcentaje** ±; (b) **monto** ± fijo; (c) **precio fijo** (no negativo). No afecta kits. |
| 2 | Actualizar ganancia/utilidad | % de ganancia fijo; recalcula precio venta desde costo. Admite negativo (no recomendado). No modifica productos que ya tienen pérdida. |
| 3 | Actualizar impuestos | Marcar impuestos a agregar / desmarcar a quitar (solo impuestos ya configurados). |
| 4 | Tipo de venta | Por unidad/pza ↔ A granel. |
| 5 | Cambiar departamento | Elegir departamento destino. |
| 6 | Comenzar a usar inventario | Marca los productos como "usa inventario" (vs ilimitado). |
| 7 | Aumentar o disminuir inventario | Cantidad ± a sumar a la existencia de cada producto (genera movimientos). |
| 8 | Cambiar proveedor | Elegir proveedor; pregunta si se desean modificar precios (no confirmado el detalle). |
| 9 | Eliminar productos | Eliminación masiva. |

Permiso: "Modificar varios".

---

## 12. Módulo Inventario (F4)

Requiere "Utilizar inventarios para mis productos". Barra "INVENTARIO" con submenú:
**Agregar** · **Ajustes** · **Productos bajos en inventario** · **Reporte de inventario** · **Reporte de movimientos** · **Kardex de inventario**.

### 12.1 Agregar (entrada de mercancía)
Campos:
- **Código de producto** (escanear/escribir/F10) → **Descripción** (solo lectura).
- **Agregar** (cantidad a sumar) con ícono de **calculadora** (sumar varias cantidades, botón = vuelca el resultado).
- **Precio costo** (con calculadora), **Precio venta**, **Precio mayoreo** (editables; si cambia el costo y hay margen automático, se recalcula el precio).
- Botón **Agregar cantidad a inventario**.
Reglas: movimiento tipo **Entrada**; actualiza costo según método (promedio ponderado o último costo, §19.2).

### 12.2 Ajustes
Campos:
- **Código de producto** / F10, **Descripción**.
- **Diferencia (+/−)**: cantidad a sumar o restar.
- **Nueva cantidad**: se calcula automáticamente (existencia + diferencia); también editable (escribir la cantidad contada y que el sistema calcule la diferencia — no confirmado bidireccional).
- **Costo**, **Precio de venta**, **Precio mayoreo**.
- **Motivo del ajuste** (texto; aparece en reportes).
- **Resumen del ajuste** (recuadro amarillo con los cambios).
- Calculadora en +/−, Nueva cantidad y Costo.
- Botón **Realizar ajuste de inventario**.
Uso: mermas, daños, robo, consumo interno, corrección de conteo. Permiso "Ajustar el inventario".

### 12.3 Productos bajos en inventario
- Lista de productos con existencia **≤ mínimo** (el reporte de inventario dice "igual o menor"; el de bajos dice "por debajo" — usar ≤).
- Columnas: **Código · Descripción · Precio de venta · Departamento · Existencia · Inv. mínimo · Inv. máximo**.
- **Exportar a Excel**.

### 12.4 Reporte de inventario
- Indicadores: **Costo del inventario** = Σ(costo × existencia); **Cantidad de productos en inventario** (Σ existencias).
- Filtro **Departamento**.
- Grilla: **Código · Descripción · Costo · Precio venta · Existencia · Inv. mínimo · Inv. máximo**.
- Botones: **Modificar producto** (abre F3 ➜ Modificar), **Exportar**, **Imprimir…** (elige impresora de tickets o tamaño carta).

### 12.5 Reporte de movimientos
- Filtros: **Del día** (fecha), **Buscar por** (cajero / producto / departamento), **Movimientos** (todos, entradas, salidas, ajustes, devoluciones).
- Columnas: **Hora** (descendente) · **Descripción del producto** · **Movimiento** (motivo capturado o "Ticket N") · **KIT** (indicador) · **Había** · **Tipo** (Entrada / Salida / Devolución / Ajuste) · **Cantidad** · **Hay** · **Cajero**.
- Botones: **Exportar movimientos** (Excel), **Imprimir** (vista previa / PDF).
- Las recepciones de órdenes de compra aparecen como Entradas.

### 12.6 Kardex de inventario
- **Código de producto** (o buscar), **Periodo**.
- Cabecera: descripción, departamento, inv. mínimo, inv. máximo, existencia actual.
- Lista cronológica (fecha, hora, descripción del movimiento — incluye cambios de precio, ventas, devoluciones, ajustes, entradas; marca si fue vendido como parte de un kit) con tres bloques de columnas:
  - **Entradas**: cantidad, costo unitario, total.
  - **Salidas**: cantidad, costo unitario, total.
  - **Existencias**: cantidad resultante, costo unitario, total.
- **Exportar** (Excel), **Imprimir** (o PDF).

### 12.7 Recomendaciones funcionales (incongruencias)
- Todas las variaciones de existencia deben generar movimiento con usuario, fecha, motivo.
- Registrar mermas/consumo interno como ajustes negativos con motivo.

---

## 13. Módulo Compras y Proveedores

Activación: **Configuración ➜ Servicios ➜ Compras / Proveedores ➜ "Configurar compras y proveedores…"** (asistente):
1. Nombre del negocio y datos de contacto que aparecerán en las órdenes.
2. Cuenta de correo (y autorización) para enviar órdenes por e-mail + botón **Probar envío de correo**.
3. Resumen → **Terminar** (el original reinicia la app).

Barra "COMPRAS" con submenú: **Compras sugeridas** · **Lista de compras** · **Órdenes de compra** · **Proveedores** · **Histórico de compras**.

### 13.1 Proveedores
- Lista + **Nuevo proveedor** / **Modificar proveedor** / **Eliminar proveedor** (con confirmación).
- Campos: nombre/razón social, representante, teléfono, correo electrónico (necesario para envío de órdenes), (dirección/notas no confirmado).

### 13.2 Compras sugeridas
- Productos con inventario bajo (≤ mínimo). Deshabilitado si no se usa inventario.
- Casillas por producto, filtro por departamento.
- Botones: **Enviar productos a la lista de compras** o directamente a **Órdenes de compra**.
- Cantidad sugerida (no confirmado): máximo − existencia.

### 13.3 Lista de compras ("carrito")
- Agregar productos por código o buscador (F10).
- Doble clic / **Modificar**: indicar **cantidad a ordenar** y **proveedor** (si el producto no tiene uno; se puede crear proveedor nuevo).
- **Asignar proveedor** masivo a los seleccionados.
- Seleccionar productos → **Crear orden de compra** (se generan órdenes por proveedor).

### 13.4 Órdenes de compra
- Lista con filtro **Mostrar órdenes desde**: 1 semana, 2 semanas, 1 mes, 3 meses, 6 meses, 1 año, siempre; búsqueda por folio o proveedor.
- Estados: **Borrador / en captura** (no confirmado nombre) → **Enviada** → **Recibida** (verde) · **Cancelada**.
- **Nueva orden de compra**: elegir proveedor (o crear), agregar productos (ícono de código / F10) con cantidad, notas para el proveedor → **Continuar con la orden de compra** → **Terminar orden y enviar…** → confirmar "Sí, terminar y enviar orden" → elegir: **Enviar por correo**, **Guardar (PDF)**, **Imprimir (carta)**, o **Finalizar** sin enviar. Estado → Enviada.
- Acciones sobre una orden: **Continuar con orden de compra…**, **Enviar por correo**, **Imprimir**, **Guardar orden** (PDF), **Cancelar/Eliminar orden de compra…** (confirmar "Sí, cancelar orden" → estado Cancelada; no notifica al proveedor).

### 13.5 Recibir orden de compra
1. Doble clic en orden **Enviada** o **Recibir orden de compra**.
2. Por cada producto: doble clic / **Modificar** → ventana de recepción:
   - **Recibí** (cantidad recibida, con calculadora),
   - **Con un costo de** (nuevo costo unitario),
   - **Ganancia** % (recalcula precio venta),
   - **Nuevos precios**: precio venta y precio mayoreo editables.
   → **Aceptar**.
3. **Concluir recepción del pedido** → "Sí, terminar y recibir la orden".
4. Estado → **Recibida**; se genera **Entrada** de inventario por cada producto (visible en Reporte de movimientos) y se actualizan costos/precios.
- Permisos: "Crear órdenes de compra", "Recibir órdenes de compra".

### 13.6 Histórico de compras
- Por producto: historial de costos de compra por proveedor y fecha; último precio de costo; permite comparar qué proveedor ofreció mejor precio.

---

## 14. Módulo Corte (cortes y turnos)

Barra "CORTE" con botones: **Hacer corte de cajero** (turno) · **Hacer corte del día**.
Por seguridad, la pantalla no muestra datos hasta pulsar uno de esos botones.

### 14.1 Encabezado del corte
- "Corte de **<cajero>** iniciado el **<fecha>**" — ambos son enlaces:
  - Clic en la **fecha** → calendario para consultar otro día.
  - Clic en el **cajero** → lista de turnos/cajeros de esa fecha (historial).
- Rango: "De dd/mmm/aaaa hh:mm a dd/mmm/aaaa hh:mm – (Turno actual)", **Duración** del turno, **De la caja** (MultiCaja).
- Botones a la derecha: **Imprimir** (impresora de tickets), **Cerrar turno…** (candado); casilla "Enviar corte por correo electrónico".

### 14.2 Secciones del corte (layout en dos columnas)

**Indicadores**
- **Ventas Totales** = Σ ventas (todas las formas de pago) − devoluciones.
- **Ganancia** = Σ (precio venta − costo) de lo vendido (oculto si el cajero no tiene permiso "Ver la ganancia del día").

**Dinero en Caja** (cálculo del efectivo esperado)
| Línea | Signo |
|---|---|
| Fondo de caja | + |
| Ventas en efectivo (y vales — ver ambigüedad §5.2) | + |
| Abonos en efectivo | + |
| Entradas | + |
| Salidas | − |
| Devoluciones en efectivo | − |
| **Total = efectivo esperado en caja** | |

**Ventas** (desglose por forma de pago)
- En Efectivo · Con Tarjeta de Crédito · A Crédito · Con Vales de Despensa · Con Transferencia · Con Cheque · (Dólares, no confirmado) · **Devoluciones de ventas** (−) · **Total**.

**Ingresos de contado** (ventas cobradas al contado, sin crédito, menos devoluciones)
- Ventas en Efectivo · Ventas con Vales · Ventas con Transferencia · Ventas con Cheque · (Tarjeta: no aparece en la captura; no confirmado) · **Total**.

**Entradas de efectivo**: lista hora + descripción + monto.
**Salidas de efectivo**: lista hora + descripción + monto.
**Ventas por departamento**: departamento + monto.
**Ganancia por departamento** (en corte del día y reportes).
**Devoluciones**: hora, descripción, ticket, monto devuelto.
**Impuestos** (si hay impuestos activos): por cada impuesto dos líneas: "<Impuesto> (tasa) – Cobrado" y "<Impuesto> (tasa) – Ventas gravadas".
**Pagos de créditos**: hora, cliente, forma de pago, monto ("No se recibieron pagos de créditos" si vacío).
**Clientes con más ventas** / **Clientes con más ganancia** ("No hubo ventas" si vacío).

### 14.3 Corte del día
- Mismas secciones, consolidando **todos los turnos** (y cajas) del día calendario 00:00–23:59.
- Permiso "Realizar el corte del día (todos los turnos)".

### 14.4 Cierre de turno
Diálogo "CIERRE DE TURNO" (modo *solicitar dinero esperado*):
- Texto: "Por favor cuenta el dinero en caja e ingrésalo para proceder con el cierre de turno."
- **Efectivo esperado en caja** (si el usuario tiene permiso de verlo).
- **¿Cuánto efectivo hay en caja?** (campo con desplegable que abre una **calculadora** para sumar billetes/monedas; ENTER vuelca el resultado).
- **Diferencia** (contado − esperado), con mensaje "¡Excelente! Todo en orden" si es 0, o advertencia de faltante/sobrante.
- Botones **Cerrar Turno** / **Cancelar**.
Reglas:
- Si el contado es **menor** al esperado, la diferencia se registra automáticamente como **salida de efectivo** (faltante). (Sobrante: no confirmado; sugerido registrar entrada.)
- Al cerrar: se guarda el corte (inmutable), se envía por correo si está configurado, la app se cierra y queda lista para un nuevo turno.
- Modo *no solicitar dinero esperado*: pantalla simple de confirmación; las diferencias solo las ve el dueño en el historial.

### 14.5 Historial
- Los cortes **no se pueden eliminar**.
- Consulta por fecha (calendario) y por cajero/turno; muestra el corte del turno y el consolidado del día.

### 14.6 Configuración del corte (Configuración ➜ Personalización ➜ Corte)
- **Solicitar dinero esperado en caja** (muestra esperado + calculadora) vs **No solicitar** (pantalla simple).
- **Límite de efectivo en caja**: monto máximo + comportamiento:
  - Ignorar el límite.
  - Permitir con advertencia (alerta constante hasta que se haga una salida).
  - No permitir ventas/entradas de efectivo hasta registrar una salida.
- **Mensaje personalizado** para el cajero al alcanzar el límite (puede incluir el monto a retirar y el límite).

### 14.7 Corte por correo
- Configuración ➜ Servicios ➜ Notificaciones por correo: activar, cuenta de correo (OAuth/contraseña), **Probar envío**, activar **"Cierre de un turno"** y destinatarios separados por comas.

---

## 15. Módulo Reportes

Submenú: **Reporte de ventas** (por período) · **Ventas por cliente**. (Además: Ventas por período en Productos, reportes de inventario en Inventario, saldos en Créditos.)

### 15.1 Reporte de ventas
- Período: **Semana actual** (por defecto) · **Mes actual** · **Mes anterior** · **Año actual** · **Periodo…** (rango personalizado).
- Secciones:
  - **Gráfica de ventas**: barras por día (rango ≤ 1 mes), por mes (1–12 meses), por año (> 1 año).
  - **Ventas totales**: número de ventas y monto.
  - **Ganancia**: monto y **% promedio de utilidad**.
  - **Ventas por día/mes/año** (lista).
  - **Ventas por departamento**.
  - **Ganancia por departamento**: los 6 primeros destacados (gráfica) y el resto agrupado en "Otros…".
  - **Ventas por forma de pago**: Bancos (tarjeta/transferencia/cheque), Efectivo, Vales, otros.
  - **Impuestos** (si activos): impuesto cobrado y ventas gravadas.
- Permiso: "Acceder a los reportes de ventas y ganancias".

### 15.2 Ventas por cliente
- Lista de clientes ordenada por monto descendente: **Folio · Nombre · Número de ventas · Monto acumulado · Ganancia**.
- Orden por cualquier columna, **Exportar** (Excel). Filtro de período (no confirmado).

### 15.3 Lista consolidada de reportes de la app
1. Corte de turno / corte del día (Corte).
2. Historial de ventas del día (Ventas).
3. Reporte de ventas y ganancias por período (Reportes).
4. Ventas por cliente (Reportes).
5. Ventas por período por producto (Productos).
6. Catálogo de productos (Productos) + exportación.
7. Productos bajos en inventario (Inventario).
8. Reporte de inventario / valorización (Inventario).
9. Reporte de movimientos de inventario (Inventario).
10. Kardex por producto (Inventario).
11. Estado de cuenta de cliente (Créditos).
12. Reporte de saldos (Créditos).
13. Histórico de compras por producto (Compras).
14. Órdenes de compra (Compras).

Todos los listados importantes ofrecen **Exportar a Excel** y/o **Imprimir** (ticket o carta/PDF).

---

## 16. Módulo Configuración

Pantalla con secciones de íconos y botón **"Mostrar todas las opciones"** (regresa al índice). Los cambios se guardan automáticamente.

| Sección | Opciones |
|---|---|
| **General** | Opciones habilitadas · Cajeros · Base de datos · (presto — fuera) · (Facturación — fuera) · Modificar folios · Administrar cajas |
| **Personalización** | Logotipo del programa · Ticket · Formas de pago · Impuestos · Corte · Símbolo de moneda · Unidades de medida |
| **Dispositivos** | Impresora de tickets · Lector de códigos · Cajón de dinero · Báscula · (Terminal TPV — fuera) |
| **Servicios** | (Recargas — fuera) · (Pago de servicios — fuera) · Compras/Proveedores · (Nube — fuera) · Notificaciones por correo |
| **Mantenimiento** | Respaldo automático · (Licencia — fuera) · Actualizaciones automáticas |

### 16.1 Asistente de bienvenida (primer arranque)
1. (MultiCaja) ¿Esta computadora es la Caja principal? Nombres de cajas adicionales.
2. Nombre y giro del negocio; funcionalidades: usar inventarios (+ método de costo: **promedio** o **último costo**), ofrecer crédito, venta de producto común.
3. Formas de pago aceptadas (efectivo activo por defecto; dólares, tarjeta, vales…). Con 2+ se habilita mixto.
4. Personalización del ticket (datos del negocio, espaciado inicial/final).
5. Clave del usuario admin (default 12345) y alta de cajeros (usuario + clave).
6. Envío de estadísticas anónimas (opcional).
Todo es modificable después.

### 16.2 Opciones habilitadas
- **Utilizar inventarios para mis productos** + **Método costo de inventario**: *Costo promedio ponderado* | *Último costo*.
- **Deseo ofrecer crédito a mis clientes**.
- **Habilitar venta de Producto Común**.
- **Calcular automáticamente precio de venta con el margen de ganancia del N %** al crear, modificar o ingresar inventario.
- **Habilitar redondeo de centavos a cantidad cerrada**: *A décimas* (45.52→45.60, 35.18→35.20) | *A mitad o entero más cercano* (.00 o .50; ej. 48.78→49.00).
- **Alerta de contingencia**: "Mostrar aviso: <texto> cada <N> ventas cobradas" (0 = desactivado).

### 16.3 Cajeros (usuarios y permisos)
- Pantalla: lista de cajeros a la izquierda; datos y permisos a la derecha.
- Campos: **Usuario**, **Contraseña**, **Nombre completo**, **Permisos** (pestañas con casillas, §20).
- Botones: **Guardar cajero y permisos**, **Cancelar**, **Dar de baja cajero**.
- Al entrar a una sección sin permiso → mensaje "no tienes acceso".
- (No confirmado) Al requerir una acción restringida se puede pedir autorización de admin (contraseña) — sugerido implementar "autorización de supervisor".

### 16.4 Base de datos
- (No documentado en el manual en línea; no confirmado) Probablemente restaurar/compactar/ubicación. **[Adaptación]** incluir: respaldar ahora, restaurar desde respaldo, ubicación de BD.

### 16.5 Modificar folios
- Nombre del folio y leyenda que se imprime en el ticket (p. ej. "Nota de venta"). (Folio inicial / serie: no confirmado.)

### 16.6 Administrar cajas (MultiCaja)
- Lista de cajas con fecha de último uso; **Cambiar nombre**; **Eliminar** (solo si la caja lleva ≥ 5 días inactiva; si no, advertencia).

### 16.7 Logotipo del programa
- Imagen JPG/BMP/PNG ~300×63 px que se muestra en el encabezado de la app.

### 16.8 Ticket
- Vista previa del ticket editable (ver §5.3):
  - Spinners de **líneas en blanco** arriba y abajo.
  - **Agregar logotipo… / Quitar logotipo…** (ideal 120×30 px, se imprime en B/N).
  - Líneas de encabezado editables (nombre, dirección, teléfono, identificación fiscal, eslogan) y de pie (agradecimiento, web) + **Líneas adicionales…**.
- Opciones: **Incluir precio unitario** · **Imprimir descripción completa (varios renglones)** · **Probar impresión con último ticket…**.
- **Impresión de datos de cliente**: casilla "Imprimir en todos los tickets los datos del cliente" + selector de dos listas (Campos disponibles ⇄ Campos a imprimir) con flechas para agregar/quitar y subir/bajar orden.

### 16.9 Formas de pago
- **Efectivo**: "No permitir cobrar si el efectivo ingresado es menor que el total".
- **Dólares**: habilitar; **Tipo de cambio** + **Modificar** (se pregunta en cada inicio).
- **Tarjeta**: habilitar; **Cobrar comisión por cobro con tarjeta del N %** (+ aviso legal).
- **Transferencias**: habilitar + **nombre visible editable**.
- **Cheque**, **Vales de despensa**: habilitar.
- **Pagos mixtos**: habilitar.
- **[Adaptación]** Considerar formas de pago configurables genéricas (Nequi, Daviplata, etc.).

### 16.10 Impuestos
- Casilla **"Mis productos manejan impuestos"** → país: *México* (catálogo SAT, fuera de alcance) | *Otro* (nombre + %). **[Adaptación]** Colombia: IVA 19 %, 5 %, 0 %/exento, INC 8 %.
- **Desglosar impuestos en el ticket de venta** (también en la pantalla de ventas).
- **Deseo ingresar mis precios de venta con impuestos incluidos** (el sistema calcula la base; agregar un impuesto nuevo no altera el precio final).
- **Agregar nuevo impuesto**: nombre, porcentaje, ¿aplicar a todos los productos existentes?, ¿aplicar automáticamente a productos nuevos?
- Modificar impuesto (doble clic): nombre, %, auto-aplicar a nuevos; afecta a todos los productos que lo tengan.

### 16.11 Corte
Ver §14.6.

### 16.12 Símbolo de moneda
- **Símbolo** (ej. $, €), **Separador de miles** (`,` o `.`), **Separador decimal**. Requiere reinicio.

### 16.13 Unidades de medida
- Lista de unidades activables (por defecto solo KG/GR). Si hay > 2 activas, aparece el campo "unidad" en el producto.

### 16.14 Notificaciones por correo
- Ver §14.7. Proveedores soportados en el original: Gmail, Outlook/Hotmail/Live, Yahoo.

### 16.15 Respaldo automático
- Carpeta destino (por defecto subcarpeta "respaldos" del directorio de instalación; recomendable disco externo o carpeta sincronizada en la nube).
- **Realizar respaldo en este momento…** (cierra la app y respalda).
- **Realizar respaldo automático al salir del programa**.
- Restaurar a fecha anterior (guía aparte; no confirmado UI).

### 16.16 Actualizaciones automáticas
- "Checar si hay actualizaciones automáticamente al: *iniciar* | *salir* del programa"; botón "Checar ahora"; ventana con novedades y **Actualizar**.

---

## 17. Dispositivos

### 17.1 Impresora de tickets
- Cualquier impresora instalada en el sistema operativo (impresión vía driver, no ESC/POS crudo; **[Adaptación]** soportar ambos).
- Parámetros: **Impresora** (lista + opción "No usar impresora de tickets"), **Tipo de letra** (monoespaciada recomendada, ej. Courier New), **Tamaño de letra** (10 recomendado), **Columnas** (30 por defecto; 30–39 según papel 58/80 mm).
- Apariencia: totales en negritas (defecto) | "Usar fuente normal para los totales" | "Imprimir todas las letras en negritas".
- Impresión de reportes: ticket o tamaño carta (impresora secundaria).

### 17.2 Cajón de dinero
- Conectado a la impresora (RJ11); la apertura se dispara por la impresora.
- Configuración: **modelo de impresora** (lista de comandos de apertura) u opción genérica **"Apertura a través de impresión"** (imprime algo mínimo y avanza papel), **puerto** (USB, COM, LPT…), botón **Probar apertura**.
- Momento de apertura: antes o después de imprimir (configurable).
- **[Adaptación]** comando ESC/POS estándar `ESC p 0 25 250`; abrir también al registrar entradas/salidas (no confirmado en el original).

### 17.3 Lector de códigos de barras
- USB / PS2 en modo emulación de teclado: sin configuración (el campo de código recibe los caracteres + ENTER).
- Serial (COM): casilla "Utilizo un lector de código de barras serial" + parámetros de puerto (velocidad, bits, paridad…).

### 17.4 Báscula
- Configuración: casilla "Tengo conectada una báscula a mi computadora", **marca/modelo** (lista de protocolos: Torrey, Kretz, CAS, Rhino, Toledo, Cardinal, Detecto, Dibatec, etc.), **puerto COM**, guardar y prueba.
- En venta: al agregar un producto a granel, se lee el peso automáticamente y se muestra cantidad e importe.
- **Básculas impresoras de etiquetas** (sección aparte):
  - **Bandera de inicio** (prefijo, ej. "20"/"0200").
  - Tipo: "Mi báscula imprime etiquetas con el **precio**" | "…con el **peso**".
  - Formato del código de 13 dígitos: `[bandera 4 dígitos][código producto 3 dígitos][peso o precio 5 dígitos][dígito verificador 1]`. Si la bandera tiene 2–3 dígitos se completa con ceros; códigos de producto de 2 dígitos se completan con cero a la izquierda.
  - Peso: 5 dígitos con 3 decimales en kg (máx. 99.999 kg). Precio: 5 dígitos con 2 decimales (máx. 999.99).
  - El producto debe existir con el mismo código (ej. "013"). Al escanear la etiqueta se agrega con el peso o importe indicado (si es precio, cantidad = precio / precio unitario).

---

## 18. Modelo de datos sugerido

> Diseño propio, derivado de los requerimientos funcionales.

- **Negocio/Config**: nombre, giro, datos de ticket, moneda, separadores, opciones habilitadas, método de costo, redondeo, margen automático, alertas, límite de efectivo, configuración de corte, formas de pago (habilitada, nombre visible, comisión, tipo de cambio), impresora, cajón, báscula, respaldo.
- **Caja** (terminal): id, nombre, último uso.
- **Usuario/Cajero**: usuario, hash contraseña, nombre completo, activo, es_admin, permisos (set).
- **Turno**: id, caja, cajero, abierto_en, cerrado_en, fondo_inicial, efectivo_esperado, efectivo_contado, diferencia, estado.
- **Departamento**: id, nombre.
- **Proveedor**: id, nombre, representante, teléfono, email, notas.
- **Producto**: id, código (único), descripción, tipo_venta (UNIDAD/GRANEL/KIT), unidad, costo, ganancia_pct, precio_venta, precio_mayoreo, departamento, proveedor, usa_inventario, existencia, minimo, maximo, favorito, activo, impuestos[].
- **KitComponente**: kit_id, producto_id, cantidad.
- **Promoción**: id, nombre, producto_id, desde, hasta, precio_unitario.
- **Impuesto**: id, nombre, porcentaje, auto_aplicar_nuevos.
- **Cliente**: id, folio, nombres, apellidos, teléfono, email, domicilio1, domicilio2, colonia, municipio, estado, cp, notas, credito_habilitado, limite_credito (null = ilimitado), saldo, datos fiscales, es_sistema.
- **Venta (ticket)**: id, folio, caja, turno, cajero, cliente, fecha_hora, subtotal, descuento_global, impuestos, total, total_articulos, estado (PENDIENTE/COBRADA/CANCELADA), nombre_ticket, notas, pagado_con, cambio, es_credito.
- **VentaRenglon**: venta_id, producto_id (null si común), descripción, cantidad, precio_original, precio_unitario, descuento, costo_unitario, importe, es_mayoreo, es_kit, impuestos, cantidad_devuelta.
- **VentaPago**: venta_id, forma (EFECTIVO/CREDITO/DOLARES/VALE/TARJETA/TRANSFERENCIA/CHEQUE), monto, monto_moneda_extranjera, tipo_cambio, comisión, referencia.
- **Devolución**: id, venta_id, renglón, cantidad, monto, turno, cajero, fecha, forma_reembolso.
- **MovimientoCaja**: id, turno, tipo (ENTRADA/SALIDA/FALTANTE/SOBRANTE), monto, descripción, cajero, fecha, cancelado.
- **MovimientoInventario**: id, producto, tipo (ENTRADA/SALIDA/AJUSTE/DEVOLUCION), cantidad, había, hay, costo_unitario, motivo/referencia (ticket, orden de compra), es_kit, cajero, fecha.
- **CambioPrecio** (para kardex): producto, campo, valor_anterior, valor_nuevo, usuario, fecha.
- **MovimientoCredito**: id, folio, cliente, tipo (VENTA/ABONO/LIQUIDACION/DEV_ABONO), venta_id, monto, saldo_resultante, comentario, forma_pago, cajero, fecha, cancelado.
- **OrdenCompra**: id, folio, proveedor, estado, notas, fechas (creada, enviada, recibida, cancelada).
- **OrdenCompraRenglon**: orden_id, producto_id, cantidad_pedida, costo, cantidad_recibida, costo_recibido, precio_venta_nuevo, precio_mayoreo_nuevo.
- **ListaCompras**: producto_id, cantidad, proveedor_id.
- **Corte** (snapshot inmutable): turno o día, todos los totales calculados (JSON).
- **TicketPendiente**: venta con estado PENDIENTE + creado_en (expira a los 4 días).

---

## 19. Reglas de negocio transversales y cálculos

### 19.1 Precios
- `precio_venta = costo × (1 + ganancia% / 100)`; editar precio recalcula `ganancia% = (precio/costo − 1) × 100`.
- Con "precios con impuestos incluidos": `base = precio_final / (1 + Σ tasas)`; sin esa opción, `precio_final = base × (1 + Σ tasas)` (no confirmado si el precio mostrado en venta es con o sin impuestos en este modo; sugerido mostrar precio final).
- Prioridad de precio en un renglón: precio manual/descuento > promoción por cantidad > mayoreo (F11) > precio normal (no confirmado; definir en implementación).
- Redondeo de centavos aplicado al **total** de la venta (no confirmado; sugerido al total a cobrar).

### 19.2 Costo de inventario
- **Último costo**: costo = costo de la última entrada.
- **Costo promedio ponderado**: `nuevo_costo = (exist_actual × costo_actual + cant_entrada × costo_entrada) / (exist_actual + cant_entrada)`.
- El costo unitario vigente se copia al renglón de venta para calcular la ganancia histórica.

### 19.3 Ganancia
- `ganancia = Σ (precio_unitario_final − costo_unitario) × cantidad − devoluciones`.
- Artículo común: costo 0 → ganancia 100 %.
- Comisión por tarjeta no cuenta como ganancia.

### 19.4 Inventario
- Venta → salida; cancelación/devolución → devolución (entrada); kit → salida por componente; productos sin inventario = "Ilim".
- Bajo inventario: `existencia ≤ mínimo`.

### 19.5 Caja
- `efectivo_esperado = fondo + ventas_efectivo (+vales, ambiguo) + abonos_efectivo + entradas − salidas − devoluciones_efectivo`.
- Diferencia en cierre negativa → salida automática "faltante".

### 19.6 Crédito
- `saldo_cliente = Σ ventas a crédito − Σ abonos − liquidaciones + dev_abonos − devoluciones de ventas a crédito`.
- Venta a crédito solo a clientes con crédito autorizado; validar límite (si no ilimitado).
- Abono "a todas por igual" se reparte entre los tickets no liquidados (proporcional o igualitario — no confirmado; sugerido FIFO o proporcional).

### 19.7 Integridad
- Cortes inmutables; ventas canceladas se conservan con estado; toda acción con usuario y marca de tiempo.
- Tickets pendientes expiran a los 4 días.

---

## 20. Matriz de permisos

Pestañas y casillas del formulario de cajero (el admin tiene todos):

**Ventas**
- Utilizar producto común
- Aplicar mayoreo
- Aplicar descuento
- Revisar el historial de ventas
- Registrar entradas de efectivo
- Registrar salidas de efectivo
- Cobrar un ticket
- Cobrar a crédito
- Cancelar tickets y devolver artículos
- Eliminar artículos de venta
- (Facturar / ver facturas — fuera de alcance)
- (Vender pago de servicio — fuera)
- (Vender recargas — fuera)
- Usar buscador de productos

**Clientes**
- Crear, modificar o eliminar clientes
- Asignar cliente a una venta
- Asignar o remover crédito a clientes
- Ver cuenta, recibir abonos y reportes de clientes a crédito

**Productos**
- Crear nuevos productos
- Modificar productos
- Eliminar productos
- Ver reporte de ventas (ventas por período)
- Crear promociones
- Modificar varios (actualizador masivo)

**Inventario**
- Agregar mercancía
- Ver reportes de existencias y mínimos
- Ver movimiento de inventarios
- Ajustar el inventario

**Otros**
- Realizar el corte de su turno y ver efectivo esperado en caja
- Realizar el corte de todos los turnos
- Realizar el corte del día (todos los turnos)
- Ver la ganancia del día
- Cambiar la configuración del programa
- Acceder a los reportes de ventas y ganancias
- Crear órdenes de compra
- Recibir órdenes de compra

---

## 21. Pendientes / no confirmados

1. Comportamiento exacto al escanear dos veces el mismo producto (sumar cantidad vs renglón nuevo).
2. Si F11 alterna (toggle) o solo aplica mayoreo.
3. Validación de límite de crédito al cobrar y mensaje mostrado.
4. Tratamiento de **vales** en "Dinero en caja" (texto vs captura contradictorios) y de **tarjeta** en "Ingresos de contado".
5. Dólares: cómo aparecen en el corte (línea propia, convertidos a moneda local).
6. Sobrante en cierre de turno (¿se registra como entrada?).
7. Filtro adicional "lado derecho" del catálogo.
8. Opciones del filtro "Movimientos" del estado de cuenta.
9. Contenido exacto de "Configuración ➜ Base de datos".
10. Algoritmo de reparto de abonos "a todas por igual".
11. Prioridad entre promoción, mayoreo y descuento manual.
12. Atajos del diálogo Cobrar para elegir forma de pago con teclado (no documentados; sugerido flechas ←/→ o teclas numéricas).
13. Ajuste de inventario: si "Nueva cantidad" es editable directamente.
14. Producto inexistente al escanear: flujo exacto (sugerido ofrecer alta rápida si el usuario tiene permiso).

---

## 22. Fuentes consultadas

Índices: `https://eleventa.com/aprender/` + empezando-con-eleventa, ventas, formas-de-pago, credito-a-clientes, clientes, productos, inventarios, modulo-compras-y-proveedores, cortes-y-turnos, reportes-eleventa, configuracion, tips-para-dominar-eleventa, dispositivos-compatibles, actualizador-masivo, descarga-manual-eleventa.

Artículos (todos bajo `https://eleventa.com/aprender/`): bienvenido, conociendo-eleventa, asistente-de-bienvenida, instalando-eleventa-monocaja, instalando-eleventa-multicaja, agregar-productos-venta, productos-comunes, productos-a-granel, busqueda-de-productos, atender-a-varios, descuentos-precio-mayoreo, asignar-venta, cobrando-una-venta, ventas-devoluciones-y-cancelaciones, entradas-y-salidas, verificador-de-precios, calculadora, venta-por-paquete-unidad, habilitar-formas-pago, forma-pago-efectivo, forma-pago-credito, forma-pago-dolares, forma-pago-vales, tarjeta-de-credito, forma-pago-mixto, forma-pago-transferencia, forma-pago-cheque, administracion-de-creditos, estado-de-cuenta, reporte-de-saldos, abonos-y-liquidaciones, consultar-credito-anterior, administracion-de-clientes, nuevo-cliente, modificar-cliente, eliminar-cliente, tiene-credito-autorizado, exportar-clientes, crear-modificar-eliminar-productos, productos-compuestos-kit, exportar-productos-a-excel, importar-productos, departamentos, promociones, catalogo-de-productos, actualizando-varios-productos, actualizar-precios-masivo, actualizar-ganancia-utilidad, actualizar-sus-impuestos, actualizar-venta-unidad-granel, cambiar-su-departamento, comenzar-a-usar-inventario, aumentar-o-disminuir-inventario, cambiar-su-proveedor, eliminar-productos, ventas-por-periodo, manejo-de-inventario, agregar-inventario, ajustes-de-inventario, productos-bajos-en-inventario, reporte-de-inventario, movimientos-de-inventario, kardex-de-inventario, incongruencias-inventario, compras-y-proveedores, modulo-compras, alta-de-proveedor, ordenes-de-compra, compras-sugeridas, lista-de-compras, generar-orden-de-compra, enviar-orden-de-compra, recibir-orden-de-compra, cancelar-orden-de-compra, cortes, corte-del-turno, corte-del-dia, manejo-de-turnos, historial-de-cortes, corte-por-correo-electronico, corte-de-caja, limitar-efectivo-en-caja, reporte-de-ventas, reporte-ventas-por-cliente, filtros-reportes-excel, modulo-de-configuracion, opciones-generales, cajeros, modificar-folios, administracion-cajas, logotipo-de-tu-negocio, ticket-de-venta, modulo-impuestos, simbolo-de-moneda, unidades-de-medida, impresora-de-tickets, configurando-impresora-de-tickets, configuracion-impresora-windows-7, configuracion-impresora-windows-10, corte-automatico-papel-impresora, compartir-impresora-red-windows, cajon-de-dinero, lector-codigo-de-barras, lector-de-codigos, bascula, bascula-torrey, bascula-rhino-windows10, convertidor-usb-basculas, etiquetas-que-imprime-bascula, que-dispositivos-son-compatibles, notificaciones-por-correo-electronico, respaldo-automatico, actualizaciones-automaticas, contrasena-secreta-admin, recuperar-contrasena-eleventa, cuenta-usuario-a-administrador, manual-eleventa-pdf.

Manual PDF v5.50: `https://descargas.eleventa.com/manual-eleventa-punto-de-venta.pdf` (1049 págs.; usado para índice general, sección "Configurando impuestos" y verificación de atajos).

Capturas de pantalla del manual (assets.eleventa.com) consultadas únicamente para extraer layout, columnas, etiquetas de botones y lista de permisos (no se reproducen).
