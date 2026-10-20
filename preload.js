const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  query: (sql, params = []) => ipcRenderer.invoke('db:query', sql, params),
  run: (sql, params = []) => ipcRenderer.invoke('db:run', sql, params),
  tx: pasos => ipcRenderer.invoke('db:tx', pasos),
  hashClave: clave => ipcRenderer.invoke('auth:hash', clave),
  verificarClave: (clave, guardada) => ipcRenderer.invoke('auth:verificar', clave, guardada),
  salir: () => ipcRenderer.invoke('app:salir'),
  rutaBD: () => ipcRenderer.invoke('app:rutaBD'),
  respaldoAutomatico: carpeta => ipcRenderer.invoke('respaldo:automatico', carpeta),
  elegirCarpeta: () => ipcRenderer.invoke('respaldo:elegirCarpeta'),
  crearRespaldo: () => ipcRenderer.invoke('respaldo:crear'),
  restaurarRespaldo: () => ipcRenderer.invoke('respaldo:restaurar'),
  guardarTexto: (nombre, contenido) => ipcRenderer.invoke('archivo:guardarTexto', nombre, contenido),
  abrirTexto: extensiones => ipcRenderer.invoke('archivo:abrirTexto', extensiones),
  listarImpresoras: () => ipcRenderer.invoke('impresoras:listar'),
  imprimirTicket: (html, opciones) => ipcRenderer.invoke('ticket:imprimir', html, opciones),
});
