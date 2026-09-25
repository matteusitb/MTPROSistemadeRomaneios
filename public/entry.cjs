const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// No desenvolvimento, o app não está empacotado.
// Em produção (instalador), o app está empacotado.
if (app.isPackaged) {
  let loaded = false;
  const jscPath = path.join(__dirname, 'electron.jsc');

  if (fs.existsSync(jscPath)) {
    try {
      require('bytenode');
      require(jscPath);
      loaded = true;
    } catch (err) {
      console.error('Aviso: Falha ao carregar bytecode do Electron, executando fallback electron.cjs:', err.message);
    }
  }

  if (!loaded) {
    require('./electron.cjs');
  }
} else {
  // Sempre carrega o original durante o desenvolvimento
  require('./electron.cjs');
}

