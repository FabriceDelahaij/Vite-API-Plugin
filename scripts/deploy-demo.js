#!/usr/bin/env node

/**
 * Deploy demo to GitHub Pages
 * This script prepares the test-dist-project for GitHub Pages deployment
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Preparing demo for GitHub Pages deployment...\n');

const testProjectDir = path.join(process.cwd(), 'test-dist-project');

try {
  // 1. Build the main plugin
  console.log('📦 Building plugin distribution...');
  execSync('node scripts/build-plugin.js', { stdio: 'inherit' });

  // 2. Install dependencies in test project
  console.log('\n📥 Installing test project dependencies...');
  execSync('npm install', { cwd: testProjectDir, stdio: 'inherit' });

  // 3. Install Vite if not present
  console.log('\n🔧 Installing Vite...');
  execSync('npm install vite --save-dev', { cwd: testProjectDir, stdio: 'inherit' });

  // 4. Install the built plugin
  console.log('\n🔌 Installing plugin from distribution...');
  execSync('npm install file:../dist', { cwd: testProjectDir, stdio: 'inherit' });

  // 5. Build the test project
  console.log('\n🏗️  Building test project...');
  execSync('npm run build', { 
    cwd: testProjectDir, 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  // 6. Verify build output
  const distDir = path.join(testProjectDir, 'dist');
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    console.log('\n✅ Build successful! Generated files:');
    files.forEach(file => {
      console.log(`   📄 ${file}`);
    });
  }

  console.log('\n🎉 Demo is ready for GitHub Pages deployment!');
  console.log('\n📁 Built files are in: test-dist-project/dist/');
  console.log('🌐 The GitHub Actions workflow will automatically deploy these files.');

} catch (error) {
  console.error('\n❌ Deployment preparation failed:', error.message);
  process.exit(1);
}