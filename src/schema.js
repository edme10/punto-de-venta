// Esquema de la base de datos. Se ejecuta en cada arranque (CREATE IF NOT EXISTS).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS cajas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  ultimo_uso TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  clave TEXT NOT NULL,
  nombre TEXT NOT NULL,
  es_admin INTEGER NOT NULL DEFAULT 0,
  permisos TEXT NOT NULL DEFAULT '[]',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY,
  caja_id INTEGER NOT NULL REFERENCES cajas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  inicio TEXT NOT NULL,
  fin TEXT,
  fondo REAL NOT NULL DEFAULT 0,
  esperado REAL,
  contado REAL,
  diferencia REAL,
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  corte TEXT
);

CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  representante TEXT,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  tipo_venta TEXT NOT NULL DEFAULT 'U',      -- U = unidad, G = granel, K = kit
  unidad TEXT,
  costo REAL NOT NULL DEFAULT 0,
  ganancia REAL NOT NULL DEFAULT 0,
  precio REAL NOT NULL DEFAULT 0,
  mayoreo REAL NOT NULL DEFAULT 0,
  departamento_id INTEGER REFERENCES departamentos(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  usa_inventario INTEGER NOT NULL DEFAULT 0,
  existencia REAL NOT NULL DEFAULT 0,
  minimo REAL NOT NULL DEFAULT 0,
  maximo REAL NOT NULL DEFAULT 0,
  favorito INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_productos_desc ON productos(descripcion);

CREATE TABLE IF NOT EXISTS kit_componentes (
  kit_id INTEGER NOT NULL REFERENCES productos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL,
  PRIMARY KEY (kit_id, producto_id)
);

CREATE TABLE IF NOT EXISTS promociones (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  desde REAL NOT NULL,
  hasta REAL NOT NULL,
  precio REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS impuestos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tasa REAL NOT NULL,
  auto_nuevos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS producto_impuestos (
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  impuesto_id INTEGER NOT NULL REFERENCES impuestos(id),
  PRIMARY KEY (producto_id, impuesto_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT,
  telefono TEXT,
  email TEXT,
  domicilio1 TEXT,
  domicilio2 TEXT,
  colonia TEXT,
  municipio TEXT,
  estado TEXT,
  cp TEXT,
  notas TEXT,
  nit TEXT,
  razon_social TEXT,
  credito INTEGER NOT NULL DEFAULT 0,
  limite REAL,                                 -- NULL = ilimitado
  saldo REAL NOT NULL DEFAULT 0,
  es_sistema INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY,
  caja_id INTEGER NOT NULL,
  turno_id INTEGER NOT NULL REFERENCES turnos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id INTEGER REFERENCES clientes(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  nombre_ticket TEXT,
  subtotal REAL NOT NULL,                      -- suma de importes antes de redondeo
  descuento REAL NOT NULL DEFAULT 0,           -- informativo: precio original - precio final
  impuestos REAL NOT NULL DEFAULT 0,           -- impuestos incluidos en el total
  redondeo REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,                         -- subtotal + redondeo
  comision REAL NOT NULL DEFAULT 0,            -- comisión por tarjeta (no es ganancia)
  articulos REAL NOT NULL DEFAULT 0,
  forma_pago TEXT NOT NULL,                    -- EFECTIVO, CREDITO, DOLARES, VALE, TARJETA, TRANSFERENCIA, CHEQUE, MIXTO
  pago_con REAL NOT NULL DEFAULT 0,
  cambio REAL NOT NULL DEFAULT 0,
  saldo_pendiente REAL NOT NULL DEFAULT 0,     -- parte a crédito aún no pagada
  notas TEXT,
  referencia TEXT,
  estado TEXT NOT NULL DEFAULT 'COBRADA',      -- COBRADA, CANCELADA
  cancelada_fecha TEXT,
  cancelada_turno_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS ix_ventas_turno ON ventas(turno_id);

CREATE TABLE IF NOT EXISTS venta_renglones (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER REFERENCES productos(id),  -- NULL = artículo común
  codigo TEXT,
  descripcion TEXT NOT NULL,
  tipo_venta TEXT NOT NULL DEFAULT 'U',
  unidad TEXT,
  departamento_id INTEGER,
  cantidad REAL NOT NULL,
  precio_original REAL NOT NULL,
  precio REAL NOT NULL,                        -- precio unitario final (incluye impuestos)
  costo REAL NOT NULL DEFAULT 0,
  importe REAL NOT NULL,
  impuesto REAL NOT NULL DEFAULT 0,            -- monto de impuesto incluido en el importe
  tasas TEXT,                                  -- JSON [{id, nombre, tasa}]
  es_mayoreo INTEGER NOT NULL DEFAULT 0,
  devuelto REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_renglones_venta ON venta_renglones(venta_id);

CREATE TABLE IF NOT EXISTS venta_pagos (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  forma TEXT NOT NULL,
  monto REAL NOT NULL,                         -- en moneda local, neto aplicado a la venta
  monto_extranjero REAL,
  tipo_cambio REAL,
  referencia TEXT
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  renglon_id INTEGER REFERENCES venta_renglones(id),
  cantidad REAL NOT NULL,
  monto REAL NOT NULL,
  costo REAL NOT NULL DEFAULT 0,               -- costo de lo devuelto (para ganancia)
  forma_reembolso TEXT NOT NULL,               -- EFECTIVO o CREDITO
  tipo TEXT NOT NULL,                          -- DEVOLUCION o CANCELACION
  turno_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id INTEGER PRIMARY KEY,
  turno_id INTEGER NOT NULL REFERENCES turnos(id),
  tipo TEXT NOT NULL,                          -- ENTRADA o SALIDA
  monto REAL NOT NULL,
  descripcion TEXT,
  usuario_id INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cancelado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL,                          -- ENTRADA, SALIDA, AJUSTE, DEVOLUCION
  cantidad REAL NOT NULL,                      -- con signo
  habia REAL NOT NULL,
  hay REAL NOT NULL,
  costo REAL NOT NULL DEFAULT 0,
  motivo TEXT,
  es_kit INTEGER NOT NULL DEFAULT 0,
  usuario_id INTEGER,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_movinv_prod ON movimientos_inventario(producto_id, fecha);

CREATE TABLE IF NOT EXISTS cambios_precio (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  campo TEXT NOT NULL,
  anterior REAL,
  nuevo REAL,
  usuario_id INTEGER,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS movimientos_credito (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL,                          -- VENTA, ABONO, LIQUIDAR, DEV_ABONO, DEVOLUCION
  venta_id INTEGER REFERENCES ventas(id),
  ref_id INTEGER,                              -- DEV_ABONO: id del abono cancelado
  monto REAL NOT NULL,                         -- con signo: + aumenta la deuda
  saldo REAL NOT NULL,                         -- saldo resultante
  comentario TEXT,
  forma_pago TEXT,
  turno_id INTEGER,
  usuario_id INTEGER,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cancelado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id INTEGER PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  estado TEXT NOT NULL DEFAULT 'BORRADOR',     -- BORRADOR, ENVIADA, RECIBIDA, CANCELADA
  notas TEXT,
  usuario_id INTEGER,
  creada TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  enviada TEXT,
  recibida TEXT,
  cancelada TEXT
);

CREATE TABLE IF NOT EXISTS orden_renglones (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_compra(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL,
  costo REAL NOT NULL DEFAULT 0,
  recibido REAL,
  costo_recibido REAL,
  precio_nuevo REAL,
  mayoreo_nuevo REAL
);

CREATE TABLE IF NOT EXISTS lista_compras (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id),
  cantidad REAL NOT NULL DEFAULT 1,
  proveedor_id INTEGER REFERENCES proveedores(id)
);

CREATE TABLE IF NOT EXISTS tickets_pendientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  datos TEXT NOT NULL,                         -- JSON del ticket en memoria
  usuario_id INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`;

module.exports = { SCHEMA };
