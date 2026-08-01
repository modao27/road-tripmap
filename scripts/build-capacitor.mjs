#!/usr/bin/env node
/**
 * Script de build pour Capacitor
 * Copie les fichiers web nécessaires dans le dossier www/
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');

// Fichiers et dossiers à copier
const filesToCopy = [
  'index.html',
  'map.html',
  'manifest.webmanifest',
  'sw.js',
  'CNAME'
];

const dirsToCopy = [
  'css',
  'fonts',
  'icons',
  'images',
  'src'
];

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

async function build() {
  console.log('🏗️  Building for Capacitor...');
  
  // Nettoyer le dossier www/
  try {
    await fs.rm(wwwDir, { recursive: true, force: true });
  } catch (err) {
    // Le dossier n'existe peut-être pas encore
  }
  
  // Créer le dossier www/
  await fs.mkdir(wwwDir, { recursive: true });
  
  // Copier les fichiers
  for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    const dest = path.join(wwwDir, file);
    try {
      await fs.copyFile(src, dest);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.log(`⚠️  ${file} (not found, skipping)`);
    }
  }
  
  // Copier les dossiers
  for (const dir of dirsToCopy) {
    const src = path.join(rootDir, dir);
    const dest = path.join(wwwDir, dir);
    try {
      await copyRecursive(src, dest);
      console.log(`✓ ${dir}/`);
    } catch (err) {
      console.log(`⚠️  ${dir}/ (error: ${err.message})`);
    }
  }
  
  console.log('✅ Build complete! Files copied to www/');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
