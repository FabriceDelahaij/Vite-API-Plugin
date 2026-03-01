#!/usr/bin/env node

// Check if CLI dependencies are available
try {
  await import('commander');
  await import('chalk');
  await import('inquirer');
} catch (error) {
  console.error('❌ CLI dependencies not found. Install them with:');
  console.error('npm install commander chalk inquirer');
  console.error('\nOr use the plugin without CLI features.');
  process.exit(1);
}

import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

program
  .name('vite-api-routes')
  .description('CLI tool for Vite API Routes Plugin (optional)')
  .version(packageJson.version);

// Import commands
import { initCommand } from '../cli/commands/init.js';
import { generateCommand } from '../cli/commands/generate.js';
import { migrateCommand } from '../cli/commands/migrate.js';
import { testCommand } from '../cli/commands/test.js';
import { docsCommand } from '../cli/commands/docs.js';

// Register commands
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(migrateCommand);
program.addCommand(testCommand);
program.addCommand(docsCommand);

program.parse();