/**
 * Build script for Electrobun Viewer
 * Copies web-viewer build to Electrobun views directory
 */

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths
const ROOT_DIR = join(__dirname, '..');
const PACKAGES_DIR = join(ROOT_DIR, '..');
const WEB_VIEWER_DIR = join(PACKAGES_DIR, 'web-viewer');
const WEB_VIEWER_BUILD = join(WEB_VIEWER_DIR, 'build');
const VIEWER_DEST = join(ROOT_DIR, 'src', 'views', 'viewer');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Electrobun Viewer - Build Script');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Step 1: Build web-viewer if needed
console.log('📦 Step 1: Building web-viewer...');

if (!existsSync(WEB_VIEWER_BUILD)) {
  console.log('   Building web-viewer from source...');
  try {
    execSync('npm run build', {
      cwd: WEB_VIEWER_DIR,
      stdio: 'inherit',
    });
    console.log('   ✓ Web-viewer built successfully');
  } catch (error) {
    console.error('   ✗ Failed to build web-viewer');
    process.exit(1);
  }
} else {
  console.log('   ✓ Web-viewer build already exists');
}

// Step 2: Copy build to views directory
console.log('');
console.log('📁 Step 2: Copying to views/viewer...');

// Clean existing viewer directory
if (existsSync(VIEWER_DEST)) {
  console.log('   Cleaning existing viewer directory...');
  rmSync(VIEWER_DEST, { recursive: true });
}

// Create destination directory
mkdirSync(VIEWER_DEST, { recursive: true });

// Copy build files
const clientDir = join(WEB_VIEWER_BUILD, 'client');
if (existsSync(clientDir)) {
  // SvelteKit adapter-node output structure
  console.log('   Copying client files...');
  cpSync(clientDir, VIEWER_DEST, { recursive: true });
} else {
  // Direct build output
  console.log('   Copying build files...');
  cpSync(WEB_VIEWER_BUILD, VIEWER_DEST, { recursive: true });
}

console.log('   ✓ Files copied successfully');

// Step 3: Show summary
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Build Complete!');
console.log('═══════════════════════════════════════════════════════════════');

function getDirectorySize(dirPath: string): { files: number; size: number } {
  let files = 0;
  let size = 0;
  
  if (!existsSync(dirPath)) return { files, size };
  
  const items = readdirSync(dirPath);
  for (const item of items) {
    const itemPath = join(dirPath, item);
    const stat = statSync(itemPath);
    if (stat.isDirectory()) {
      const subStats = getDirectorySize(itemPath);
      files += subStats.files;
      size += subStats.size;
    } else {
      files++;
      size += stat.size;
    }
  }
  
  return { files, size };
}

const stats = getDirectorySize(VIEWER_DEST);
console.log(`  Files: ${stats.files}`);
console.log(`  Size:  ${(stats.size / 1024).toFixed(1)} KB`);
console.log('');
console.log('  Next steps:');
console.log('    bun start     - Run in development mode');
console.log('    bun build:prod - Build for production');
console.log('');
