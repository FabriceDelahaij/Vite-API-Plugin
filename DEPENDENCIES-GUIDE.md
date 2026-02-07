# Dependency Management Guide

Complete guide for keeping dependencies updated and secure.

## 🎯 Why Keep Dependencies Updated?

- 🔒 **Security**: Patch known vulnerabilities
- 🐛 **Bug Fixes**: Get latest bug fixes
- ⚡ **Performance**: Benefit from optimizations
- 🆕 **Features**: Access new functionality
- 🔧 **Compatibility**: Stay compatible with ecosystem

## 🚀 Quick Start

### Check Dependencies

```bash
# Check for outdated packages
npm run check-deps

# Or manually
npm outdated
npm audit
```

### Update Dependencies

```bash
# Safe update (patch/minor only)
npm run update-deps

# Security fixes only
npm run update-deps -- --security-only

# Update all to latest (may break)
npm run update-deps -- --all
```

## 📊 Dependency Check Script

### Run Comprehensive Check

```bash
npm run check-deps
```

This checks for:
1. ✅ Outdated packages
2. 🔒 Security vulnerabilities
3. ⚠️ Deprecated packages
4. 📦 package-lock.json status

### Example Output

```
🔍 Dependency Security Check
════════════════════════════════════════════════════════════

📦 Project: vite-api-routes-plugin
   Version: 1.0.0

1️⃣  Checking for outdated packages...

⚠️  Found 3 outdated package(s):

🟡 vite
   Current: 5.0.0
   Latest:  5.1.0
   Type:    devDependency
   Severity: MINOR

🟢 @sentry/node
   Current: 7.0.0
   Latest:  7.0.1
   Type:    optionalDependency
   Severity: PATCH

2️⃣  Checking for security vulnerabilities...

✅ No security vulnerabilities found!

3️⃣  Checking for deprecated packages...

✅ No deprecated packages found!

4️⃣  Checking package-lock.json...

✅ package-lock.json is up to date
```

## 🔄 Update Strategies

### 1. Safe Update (Recommended)

Updates patch and minor versions only (follows semver):

```bash
npm run update-deps
# or
npm update
```

**What it updates:**
- `1.0.0` → `1.0.1` (patch) ✅
- `1.0.0` → `1.1.0` (minor) ✅
- `1.0.0` → `2.0.0` (major) ❌

### 2. Security-Only Update

Fixes only security vulnerabilities:

```bash
npm run update-deps -- --security-only
# or
npm audit fix
```

### 3. Update All (Risky)

Updates all packages to latest versions:

```bash
npm run update-deps -- --all
```

⚠️ **Warning**: May introduce breaking changes!

### 4. Update Specific Package

```bash
# Update to latest compatible version
npm update <package-name>

# Update to absolute latest
npm install <package-name>@latest

# Update to specific version
npm install <package-name>@1.2.3
```

## 🤖 Automated Updates

### GitHub Dependabot

Automatically creates PRs for dependency updates.

**Setup** (already configured in `.github/dependabot.yml`):

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

**Features:**
- ✅ Weekly automated checks
- ✅ Groups patch/minor updates
- ✅ Security updates
- ✅ Automatic PR creation

### Renovate Bot

Alternative to Dependabot with more features.

**Setup** (create `renovate.json`):

```json
{
  "extends": ["config:base"],
  "schedule": ["before 9am on Monday"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "pin", "digest"],
      "automerge": true
    }
  ]
}
```

## 🔒 Security Auditing

### Run Security Audit

```bash
# Check for vulnerabilities
npm audit

# Show detailed report
npm audit --json

# Fix automatically
npm audit fix

# Fix with breaking changes
npm audit fix --force
```

### Audit Levels

```bash
# Fail on moderate or higher
npm audit --audit-level=moderate

# Fail on high or critical only
npm audit --audit-level=high

# Fail on critical only
npm audit --audit-level=critical
```

### Understanding Audit Output

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ Severity      │ Description                                                  │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Critical      │ Immediate action required                                    │
│ High          │ Address as soon as possible                                  │
│ Moderate      │ Address when convenient                                      │
│ Low           │ Address at your discretion                                   │
│ Info          │ Informational only                                           │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

## 🔍 Checking Specific Packages

### Check Single Package

```bash
# Check if package is outdated
npm outdated <package-name>

# Check package info
npm view <package-name>

# Check package versions
npm view <package-name> versions

# Check latest version
npm view <package-name> version
```

### Check Dependencies Tree

```bash
# Show dependency tree
npm list

# Show specific depth
npm list --depth=1

# Show only production dependencies
npm list --prod

# Show only dev dependencies
npm list --dev
```

## 📋 Best Practices

### 1. Regular Schedule

```bash
# Weekly checks
npm outdated

# Monthly updates
npm update

# Before each release
npm audit
```

### 2. Test After Updates

```bash
# Update dependencies
npm update

# Run tests
npm test

# Run build
npm run build

# Manual testing
npm run dev
```

### 3. Review Changelogs

Before major updates, review:
- 📝 CHANGELOG.md
- 🔗 GitHub releases
- 📚 Migration guides
- ⚠️ Breaking changes

### 4. Update One at a Time

For major updates:

```bash
# Update one package
npm install vite@latest

# Test thoroughly
npm test

# Commit
git commit -m "chore: update vite to 5.0.0"

# Repeat for next package
```

### 5. Use Lock Files

```bash
# Always commit package-lock.json
git add package-lock.json

# Use npm ci in CI/CD
npm ci  # Instead of npm install
```

### 6. Monitor Security Advisories

- 📧 Subscribe to security mailing lists
- 🔔 Enable GitHub security alerts
- 📱 Use Snyk or similar tools
- 🌐 Follow security blogs

## 🛠️ CI/CD Integration

### GitHub Actions

**Security Audit** (`.github/workflows/security-audit.yml`):

```yaml
name: Security Audit

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm audit --audit-level=moderate
      - run: node scripts/check-dependencies.js
```

**Dependency Review** (`.github/workflows/dependency-review.yml`):

```yaml
name: Dependency Review

on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: moderate
```

## 📊 Monitoring Tools

### 1. npm audit

Built-in security auditing:

```bash
npm audit
npm audit fix
```

### 2. Snyk

Advanced security scanning:

```bash
# Install
npm install -g snyk

# Authenticate
snyk auth

# Test for vulnerabilities
snyk test

# Monitor project
snyk monitor
```

### 3. Socket.dev

Supply chain security:

```bash
# Install
npm install -g socket

# Scan dependencies
socket npm audit
```

### 4. Dependabot

GitHub's automated dependency updates:
- Automatic PR creation
- Security updates
- Version updates

### 5. Renovate

Advanced dependency management:
- Flexible scheduling
- Auto-merge options
- Custom rules

## 🚨 Handling Vulnerabilities

### 1. Assess Severity

```bash
npm audit

# Check if vulnerability affects your code
# Review CVE details
# Check if fix is available
```

### 2. Update if Possible

```bash
# Try automatic fix
npm audit fix

# Try with force (may break)
npm audit fix --force

# Update specific package
npm install <package>@latest
```

### 3. If No Fix Available

Options:
1. **Wait for fix** - Monitor for updates
2. **Find alternative** - Replace package
3. **Fork and patch** - Fix yourself
4. **Accept risk** - Document decision

### 4. Document Exceptions

```bash
# Create audit exceptions file
npm audit --json > audit-exceptions.json

# Add to .npmrc
audit-level=moderate
```

## 📝 Dependency Policy

### Version Pinning Strategy

```json
{
  "dependencies": {
    "vite": "^5.0.0",        // Allow minor/patch updates
    "express": "~4.18.0",    // Allow patch updates only
    "lodash": "4.17.21"      // Exact version (pinned)
  }
}
```

**Recommendations:**
- Production: Use `~` (patch only)
- Development: Use `^` (minor/patch)
- Critical: Pin exact version

### Update Frequency

| Type | Frequency | Method |
|------|-----------|--------|
| Security | Immediate | `npm audit fix` |
| Patch | Weekly | `npm update` |
| Minor | Monthly | `npm update` |
| Major | Quarterly | Manual review |

## 🔧 Troubleshooting

### Dependency Conflicts

```bash
# Clear cache
npm cache clean --force

# Remove node_modules and lock file
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Peer Dependency Warnings

```bash
# Install peer dependencies
npm install <peer-dependency>

# Or use --legacy-peer-deps
npm install --legacy-peer-deps
```

### Breaking Changes

```bash
# Restore from backup
mv package.json.backup package.json
npm install

# Or use git
git checkout package.json package-lock.json
npm install
```

## 📚 Resources

- [npm Documentation](https://docs.npmjs.com/)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Dependabot](https://docs.github.com/en/code-security/dependabot)
- [Renovate](https://docs.renovatebot.com/)
- [Snyk](https://snyk.io/learn/)
- [OWASP Dependency Check](https://owasp.org/www-project-dependency-check/)
- [Semantic Versioning](https://semver.org/)

## 🎯 Quick Reference

```bash
# Check status
npm outdated                    # Check for updates
npm audit                       # Security audit
npm list                        # Show dependencies

# Update
npm update                      # Safe update
npm audit fix                   # Fix vulnerabilities
npm install <pkg>@latest        # Update specific package

# Scripts
npm run check-deps              # Comprehensive check
npm run update-deps             # Safe update
npm run update-deps -- --all    # Update all

# CI/CD
npm ci                          # Clean install (CI)
npm audit --audit-level=high    # Audit with threshold
```
