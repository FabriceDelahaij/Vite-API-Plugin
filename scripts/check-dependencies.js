#!/usr/bin/env node

/**
 * Check for outdated and vulnerable dependencies
 * Usage: node scripts/check-dependencies.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\n🔍 Dependency Security Check\n');
console.log('═'.repeat(60));

// Check if package.json exists
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('\n❌ package.json not found!');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

console.log(`\n📦 Project: ${packageJson.name || 'Unknown'}`);
console.log(`   Version: ${packageJson.version || 'Unknown'}\n`);

// 1. Check for outdated packages
console.log('1️⃣  Checking for outdated packages...\n');
try {
  const outdated = execSync('npm outdated --json', { encoding: 'utf-8' });
  
  if (outdated) {
    const packages = JSON.parse(outdated);
    const outdatedCount = Object.keys(packages).length;

    if (outdatedCount > 0) {
      console.log(`⚠️  Found ${outdatedCount} outdated package(s):\n`);
      
      for (const [name, info] of Object.entries(packages)) {
        const severity = getUpdateSeverity(info.current, info.latest);
        const icon = severity === 'major' ? '🔴' : severity === 'minor' ? '🟡' : '🟢';
        
        console.log(`${icon} ${name}`);
        console.log(`   Current: ${info.current}`);
        console.log(`   Latest:  ${info.latest}`);
        console.log(`   Type:    ${info.type || 'dependency'}`);
        console.log(`   Severity: ${severity.toUpperCase()}`);
        console.log('');
      }

      console.log('💡 Run "npm update" to update patch/minor versions');
      console.log('💡 Run "npm install <package>@latest" for major updates\n');
    } else {
      console.log('✅ All packages are up to date!\n');
    }
  } else {
    console.log('✅ All packages are up to date!\n');
  }
} catch (error) {
  if (error.stdout) {
    console.log('✅ All packages are up to date!\n');
  } else {
    console.error('⚠️  Could not check outdated packages\n');
  }
}

// 2. Check for security vulnerabilities
console.log('2️⃣  Checking for security vulnerabilities...\n');
try {
  execSync('npm audit --json', { encoding: 'utf-8', stdio: 'pipe' });
  console.log('✅ No security vulnerabilities found!\n');
} catch (error) {
  if (error.stdout) {
    try {
      const audit = JSON.parse(error.stdout);
      
      if (audit.metadata && audit.metadata.vulnerabilities) {
        const vulns = audit.metadata.vulnerabilities;
        const total = vulns.info + vulns.low + vulns.moderate + vulns.high + vulns.critical;

        if (total > 0) {
          console.log(`🚨 Found ${total} vulnerabilit${total === 1 ? 'y' : 'ies'}:\n`);
          
          if (vulns.critical > 0) console.log(`   🔴 Critical: ${vulns.critical}`);
          if (vulns.high > 0) console.log(`   🟠 High:     ${vulns.high}`);
          if (vulns.moderate > 0) console.log(`   🟡 Moderate: ${vulns.moderate}`);
          if (vulns.low > 0) console.log(`   🟢 Low:      ${vulns.low}`);
          if (vulns.info > 0) console.log(`   ℹ️  Info:     ${vulns.info}`);

          console.log('\n💡 Run "npm audit fix" to fix automatically');
          console.log('💡 Run "npm audit fix --force" for breaking changes');
          console.log('💡 Run "npm audit" for detailed report\n');

          // Show vulnerable packages
          if (audit.vulnerabilities) {
            console.log('📋 Vulnerable packages:\n');
            let count = 0;
            for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
              if (count >= 5) {
                console.log(`   ... and ${Object.keys(audit.vulnerabilities).length - 5} more\n`);
                break;
              }
              console.log(`   • ${name}`);
              console.log(`     Severity: ${vuln.severity}`);
              if (vuln.via && vuln.via[0] && vuln.via[0].title) {
                console.log(`     Issue: ${vuln.via[0].title}`);
              }
              console.log('');
              count++;
            }
          }
        } else {
          console.log('✅ No security vulnerabilities found!\n');
        }
      }
    } catch (parseError) {
      console.error('⚠️  Could not parse audit results\n');
    }
  } else {
    console.error('⚠️  Could not run security audit\n');
  }
}

// 3. Check for deprecated packages
console.log('3️⃣  Checking for deprecated packages...\n');
try {
  const list = execSync('npm list --json --depth=0', { encoding: 'utf-8' });
  const packages = JSON.parse(list);
  
  let deprecatedCount = 0;
  const deprecated = [];

  if (packages.dependencies) {
    for (const [name, info] of Object.entries(packages.dependencies)) {
      if (info.deprecated) {
        deprecatedCount++;
        deprecated.push({ name, message: info.deprecated });
      }
    }
  }

  if (deprecatedCount > 0) {
    console.log(`⚠️  Found ${deprecatedCount} deprecated package(s):\n`);
    deprecated.forEach(({ name, message }) => {
      console.log(`   ⚠️  ${name}`);
      console.log(`      ${message}\n`);
    });
    console.log('💡 Consider replacing deprecated packages\n');
  } else {
    console.log('✅ No deprecated packages found!\n');
  }
} catch (error) {
  console.error('⚠️  Could not check for deprecated packages\n');
}

// 4. Check package-lock.json
console.log('4️⃣  Checking package-lock.json...\n');
const lockPath = path.join(process.cwd(), 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lockStat = fs.statSync(lockPath);
  const packageStat = fs.statSync(packageJsonPath);
  
  if (lockStat.mtime < packageStat.mtime) {
    console.log('⚠️  package-lock.json is older than package.json');
    console.log('💡 Run "npm install" to update lock file\n');
  } else {
    console.log('✅ package-lock.json is up to date\n');
  }
} else {
  console.log('⚠️  package-lock.json not found');
  console.log('💡 Run "npm install" to generate lock file\n');
}

// 5. Summary and recommendations
console.log('═'.repeat(60));
console.log('\n📊 Summary and Recommendations:\n');

console.log('✅ Regular maintenance tasks:');
console.log('   • Run "npm outdated" weekly');
console.log('   • Run "npm audit" before each deployment');
console.log('   • Update dependencies monthly');
console.log('   • Review changelogs for major updates\n');

console.log('🔒 Security best practices:');
console.log('   • Enable Dependabot/Renovate for automated updates');
console.log('   • Set up CI/CD security checks');
console.log('   • Monitor security advisories');
console.log('   • Keep Node.js version updated\n');

console.log('📚 Useful commands:');
console.log('   npm outdated              - Check for updates');
console.log('   npm update                - Update to latest compatible');
console.log('   npm audit                 - Security audit');
console.log('   npm audit fix             - Auto-fix vulnerabilities');
console.log('   npm install <pkg>@latest  - Update specific package\n');

console.log('═'.repeat(60));
console.log('\n✨ Dependency check complete!\n');

/**
 * Determine update severity based on semver
 */
function getUpdateSeverity(current, latest) {
  const currentParts = current.replace(/[^0-9.]/g, '').split('.');
  const latestParts = latest.replace(/[^0-9.]/g, '').split('.');

  if (currentParts[0] !== latestParts[0]) return 'major';
  if (currentParts[1] !== latestParts[1]) return 'minor';
  return 'patch';
}
