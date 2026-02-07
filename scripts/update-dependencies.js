#!/usr/bin/env node

/**
 * Interactive dependency updater
 * Usage: node scripts/update-dependencies.js [--all] [--security-only]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const updateAll = args.includes('--all');
const securityOnly = args.includes('--security-only');

console.log('\n🔄 Dependency Updater\n');
console.log('═'.repeat(60));

if (securityOnly) {
  console.log('\n🔒 Security-only mode: Fixing vulnerabilities...\n');
  
  try {
    console.log('Running npm audit fix...\n');
    execSync('npm audit fix', { stdio: 'inherit' });
    
    console.log('\n✅ Security fixes applied!');
    console.log('💡 Run "npm audit" to verify\n');
  } catch (error) {
    console.error('\n⚠️  Some vulnerabilities could not be fixed automatically');
    console.log('💡 Try "npm audit fix --force" (may introduce breaking changes)\n');
  }
  
  process.exit(0);
}

if (updateAll) {
  console.log('\n⚠️  WARNING: Updating all dependencies to latest versions');
  console.log('   This may introduce breaking changes!\n');
  
  // Backup package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const backupPath = path.join(process.cwd(), 'package.json.backup');
  
  fs.copyFileSync(packageJsonPath, backupPath);
  console.log('✅ Created backup: package.json.backup\n');
  
  try {
    console.log('Updating all dependencies...\n');
    
    // Update all dependencies to latest
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    if (packageJson.dependencies) {
      console.log('📦 Updating dependencies...');
      for (const pkg of Object.keys(packageJson.dependencies)) {
        try {
          console.log(`   Updating ${pkg}...`);
          execSync(`npm install ${pkg}@latest`, { stdio: 'pipe' });
        } catch (error) {
          console.error(`   ⚠️  Failed to update ${pkg}`);
        }
      }
    }
    
    if (packageJson.devDependencies) {
      console.log('\n🛠️  Updating devDependencies...');
      for (const pkg of Object.keys(packageJson.devDependencies)) {
        try {
          console.log(`   Updating ${pkg}...`);
          execSync(`npm install ${pkg}@latest --save-dev`, { stdio: 'pipe' });
        } catch (error) {
          console.error(`   ⚠️  Failed to update ${pkg}`);
        }
      }
    }
    
    console.log('\n✅ All dependencies updated!');
    console.log('💡 Test your application thoroughly');
    console.log('💡 Restore backup if needed: mv package.json.backup package.json\n');
    
  } catch (error) {
    console.error('\n❌ Update failed!');
    console.log('💡 Restoring backup...');
    fs.copyFileSync(backupPath, packageJsonPath);
    console.log('✅ Backup restored\n');
    process.exit(1);
  }
  
  process.exit(0);
}

// Default: Safe update (patch and minor only)
console.log('\n🔄 Safe update mode: Updating patch and minor versions...\n');

try {
  console.log('Running npm update...\n');
  execSync('npm update', { stdio: 'inherit' });
  
  console.log('\n✅ Dependencies updated successfully!');
  console.log('💡 Run "npm outdated" to check for major updates\n');
  
} catch (error) {
  console.error('\n❌ Update failed!\n');
  process.exit(1);
}

console.log('═'.repeat(60));
console.log('\n📚 Update modes:\n');
console.log('   node scripts/update-dependencies.js');
console.log('   → Safe update (patch/minor only)\n');
console.log('   node scripts/update-dependencies.js --security-only');
console.log('   → Fix security vulnerabilities only\n');
console.log('   node scripts/update-dependencies.js --all');
console.log('   → Update all to latest (may break)\n');
console.log('═'.repeat(60));
console.log('\n✨ Update complete!\n');
