import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import chalk from 'chalk';

export const testCommand = new Command('test')
  .description('Run API tests')
  .option('-w, --watch', 'Watch mode', false)
  .option('-c, --coverage', 'Generate coverage report', false)
  .option('-u, --ui', 'Open test UI', false)
  .option('--filter <pattern>', 'Filter tests by pattern')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '10000')
  .action(async (options) => {
    console.log(chalk.blue('🧪 Running API tests...\n'));

    // Check if vitest is available
    if (!existsSync('node_modules/.bin/vitest') && !existsSync('node_modules/vitest')) {
      console.error(chalk.red('❌ Vitest not found. Install it with: npm install --save-dev vitest'));
      process.exit(1);
    }

    // Build vitest command
    const args = ['vitest'];
    
    if (options.watch) {
      args.push('--watch');
    } else {
      args.push('--run');
    }
    
    if (options.coverage) {
      args.push('--coverage');
    }
    
    if (options.ui) {
      args.push('--ui');
    }
    
    if (options.filter) {
      args.push('--grep', options.filter);
    }
    
    args.push('--testTimeout', options.timeout);

    // Run tests
    const child = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('\n✅ All tests passed!'));
      } else {
        console.log(chalk.red('\n❌ Some tests failed.'));
        process.exit(code);
      }
    });

    child.on('error', (error) => {
      console.error(chalk.red('❌ Failed to run tests:'), error.message);
      process.exit(1);
    });
  });