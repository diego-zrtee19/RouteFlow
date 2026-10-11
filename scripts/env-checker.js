#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Cargar .env.local si existe (simulando dotenv para verificar carga)
const envPath = path.resolve(__dirname, '..', '.env.local');
let loaded = {};

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') ||
                             (v[0] === "'" && v[v.length - 1] === "'"))) {
        v = v.slice(1, -1);
      }
      loaded[k] = v;
    }
  });
}

// Verificar qué variables relevantes están en process.env del proceso actual
const relevant = ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
                  'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'CLERK_SECRET_KEY',
                  'FEDEX_CLIENT_ID', 'FEDEX_ACCOUNT_NUMBER', 'DHL_API_KEY', 'DHL_API_SECRET'];

console.log('=== Verificar variables relevantes disponibles en process.env del proceso actual ===');
let allAvailable = true;
for (const key of relevant) {
  const present = process.env[key] ? 'presente' : 'ausente';
  if (!process.env[key]) allAvailable = false;
  console.log('  ' + key + ': ' + present + ' ' + (process.env[key] ? '(' + process.env[key].substring(0, 10) + '...)' : ''));
}

console.log('');
console.log('=== Variables cargadas desde .env.local (simulacion dotenv) ===');
for (const key of relevant) {
  const fromEnv = process.env[key] ? 'process.env' : 'no en process.env';
  const fromFile = loaded[key] ? loaded[key].substring(0, 10) + '...' : 'ausente';
  console.log('  ' + key + ': src=' + fromEnv + ' valorArchivo=' + fromFile);
}

console.log('');
console.log('=== Resumen ===');
console.log('Variables en process.env del proceso actual:', Object.keys(process.env).filter(k => relevant.includes(k)).length, 'de', relevant.length);
console.log('Todas las variables relevantes disponibles:', allAvailable ? 'SI' : 'NO');
