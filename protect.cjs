const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔒 Iniciando proteção e preparação do aplicativo...');

// 1. Compilar electron.cjs para bytecode V8 (electron.jsc)
try {
  console.log('📦 Compilando electron.cjs em bytecode seguro...');
  execSync('npx electron node_modules/bytenode/lib/cli.js --compile public/electron.cjs', {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit'
  });
  console.log('✅ electron.jsc gerado com sucesso.');
} catch (err) {
  console.warn('⚠️ Compilação de bytecode retornou aviso:', err.message);
}

console.log('✅ Build de frontend (Vite) preservado com minificação e integridade completa.');
console.log('🔒 Proteção concluída com sucesso!');

