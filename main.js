const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const { SCHEMA } = require('./src/schema');

function hashClave(clave, sal = crypto.randomBytes(8).toString('hex')) {
  const h = crypto.createHash('sha256').update(sal + ':' + clave).digest('hex');
  return `${sal}$${h}`;
}

function verificarClave(clave, guardada) {
  const [sal] = String(guardada).split('$');
  return hashClave(clave, sal) === guardada;
}

function datosIniciales() {
  db.run("INSERT INTO cajas (id, nombre) VALUES (1, 'Caja principal')");
  db.run(
    "INSERT INTO usuarios (usuario, clave, nombre, es_admin, permisos) VALUES ('admin', ?, 'Administrador', 1, '[]')",
    [hashClave('12345')]
  );
  db.run("INSERT INTO clientes (id, nombres, es_sistema) VALUES (1, 'Público en general', 1)");
}

let db;
let dbPath;
let win;
let saveTimer = null;

function guardarAhora() {
  if (!db) return;
  const data = Buffer.from(db.export());
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dbPath);
}

function programarGuardado() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(guardarAhora, 300);
}

async function abrirBaseDatos() {
  const SQL = await initSqlJs({
    locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f),
  });
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'puntoventa.db');
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const n = db.exec('SELECT COUNT(*) FROM usuarios')[0].values[0][0];
  if (n === 0) datosIniciales();
  guardarAhora();
}

ipcMain.handle('auth:hash', (_e, clave) => hashClave(clave));
ipcMain.handle('auth:verificar', (_e, clave, guardada) => verificarClave(clave, guardada));
ipcMain.handle('app:salir', () => {
  guardarAhora();
  app.quit();
});
ipcMain.handle('app:rutaBD', () => dbPath);
ipcMain.handle('respaldo:automatico', (_e, carpeta) => {
  if (!carpeta) return false;
  fs.mkdirSync(carpeta, { recursive: true });
  guardarAhora();
  const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const destino = path.join(carpeta, `respaldo-${sello}.db`);
  fs.copyFileSync(dbPath, destino);
  return destino;
});
ipcMain.handle('respaldo:elegirCarpeta', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

function consultar(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function ejecutar(sql, params = []) {
  db.run(sql, params);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  return { id, cambios: db.getRowsModified() };
}

// Ejecuta varias sentencias en una sola transacción. Cada paso puede usar
// '$ref:N' como parámetro para referirse al id insertado por el paso N.
function transaccion(pasos) {
  const ids = [];
  db.run('BEGIN');
  try {
    for (const p of pasos) {
      const params = (p.params || []).map(v =>
        typeof v === 'string' && v.startsWith('$ref:') ? ids[Number(v.slice(5))] : v
      );
      ids.push(ejecutar(p.sql, params).id);
    }
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  programarGuardado();
  return ids;
}

ipcMain.handle('db:query', (_e, sql, params) => consultar(sql, params));
ipcMain.handle('db:run', (_e, sql, params) => {
  const r = ejecutar(sql, params);
  programarGuardado();
  return r;
});
ipcMain.handle('db:tx', (_e, pasos) => transaccion(pasos));

ipcMain.handle('respaldo:crear', async () => {
  const fecha = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: 'Guardar respaldo',
    defaultPath: `respaldo-puntoventa-${fecha}.db`,
    filters: [{ name: 'Base de datos', extensions: ['db'] }],
  });
  if (r.canceled) return false;
  guardarAhora();
  fs.copyFileSync(dbPath, r.filePath);
  return r.filePath;
});

ipcMain.handle('respaldo:restaurar', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Restaurar respaldo',
    filters: [{ name: 'Base de datos', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return false;
  guardarAhora();
  fs.copyFileSync(dbPath, dbPath + '.antes-de-restaurar');
  fs.copyFileSync(r.filePaths[0], dbPath);
  await abrirBaseDatos();
  return true;
});

ipcMain.handle('archivo:guardarTexto', async (_e, nombre, contenido) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: nombre });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, '﻿' + contenido, 'utf8');
  return r.filePath;
});

ipcMain.handle('archivo:abrirTexto', async (_e, extensiones) => {
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: 'Archivo', extensions: extensiones }],
    properties: ['openFile'],
  });
  if (r.canceled) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('impresoras:listar', async () =>
  (await win.webContents.getPrintersAsync()).map(p => p.name)
);

// Imprime un ticket HTML en una ventana oculta.
ipcMain.handle('ticket:imprimir', async (_e, html, opciones = {}) => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return new Promise(resolve => {
    w.webContents.print(
      {
        silent: !!opciones.impresora,
        deviceName: opciones.impresora || undefined,
        printBackground: true,
        margins: { marginType: 'none' },
      },
      (ok, err) => {
        w.close();
        resolve(ok ? true : err);
      }
    );
  });
});

async function crearVentana() {
  await abrirBaseDatos();
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Punto de Venta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  if (process.env.PV_PRUEBA) {
    // Modo de prueba: reenvía la consola del renderer y ejecuta un script de prueba.
    win.webContents.on('console-message', (_e, nivel, msg, linea, fuente) =>
      console.log(`[renderer:${nivel}] ${msg} (${path.basename(fuente || '')}:${linea})`)
    );
    win.webContents.on('did-finish-load', async () => {
      if (process.env.PV_SCRIPT) {
        try {
          const r = await win.webContents.executeJavaScript(fs.readFileSync(process.env.PV_SCRIPT, 'utf8'));
          console.log('[prueba] resultado:', JSON.stringify(r));
        } catch (e) {
          console.log('[prueba] error:', e.message);
        }
      }
      if (process.env.PV_CAPTURA) {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.PV_CAPTURA, img.toPNG());
      }
      if (!process.env.PV_NO_SALIR) setTimeout(() => app.quit(), 300);
    });
  }
  win.maximize();
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools();
}

if (process.env.PV_DATOS) app.setPath('userData', process.env.PV_DATOS);
app.whenReady().then(crearVentana);
app.on('before-quit', guardarAhora);
app.on('window-all-closed', () => {
  guardarAhora();
  app.quit();
});
