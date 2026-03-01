import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

export const migrateCommand = new Command('migrate')
  .description('Migrate from other frameworks to Vite API Routes')
  .option('--from <framework>', 'Source framework (nextjs, express, fastify)')
  .option('--src <directory>', 'Source directory', 'pages/api')
  .option('--dest <directory>', 'Destination directory', 'pages/api')
  .option('--typescript', 'Convert to TypeScript', false)
  .option('--dry-run', 'Show what would be migrated without making changes', false)
  .action(async (options) => {
    console.log(chalk.blue('🔄 Starting migration...\n'));

    if (!options.from) {
      const { framework } = await inquirer.prompt([
        {
          type: 'list',
          name: 'framework',
          message: 'Which framework are you migrating from?',
          choices: [
            { name: 'Next.js API Routes', value: 'nextjs' },
            { name: 'Express.js', value: 'express' },
            { name: 'Fastify', value: 'fastify' },
            { name: 'Koa.js', value: 'koa' },
          ]
        }
      ]);
      options.from = framework;
    }

    try {
      const migrator = createMigrator(options.from);
      await migrator.migrate(options);
      
      console.log(chalk.green('\n✅ Migration completed successfully!'));
      console.log(chalk.yellow('\nNext steps:'));
      console.log('1. Review the migrated files');
      console.log('2. Update your vite.config.js');
      console.log('3. Test your API routes');
      console.log('4. Update any client-side code');
    } catch (error) {
      console.error(chalk.red('❌ Migration failed:'), error.message);
      process.exit(1);
    }
  });

function createMigrator(framework) {
  switch (framework) {
    case 'nextjs':
      return new NextJSMigrator();
    case 'express':
      return new ExpressMigrator();
    case 'fastify':
      return new FastifyMigrator();
    case 'koa':
      return new KoaMigrator();
    default:
      throw new Error(`Unsupported framework: ${framework}`);
  }
}

class BaseMigrator {
  async migrate(options) {
    const { src, dest, typescript, dryRun } = options;
    
    if (!existsSync(src)) {
      throw new Error(`Source directory ${src} does not exist`);
    }

    const files = this.findFiles(src);
    console.log(chalk.blue(`Found ${files.length} files to migrate\n`));

    const migrations = [];

    for (const file of files) {
      try {
        const migration = await this.migrateFile(file, src, dest, typescript);
        if (migration) {
          migrations.push(migration);
          
          if (dryRun) {
            console.log(chalk.yellow(`Would migrate: ${file} -> ${migration.dest}`));
          } else {
            this.writeFile(migration.dest, migration.content);
            console.log(chalk.green(`Migrated: ${file} -> ${migration.dest}`));
          }
        }
      } catch (error) {
        console.error(chalk.red(`Failed to migrate ${file}:`), error.message);
      }
    }

    if (dryRun) {
      console.log(chalk.yellow(`\nDry run completed. ${migrations.length} files would be migrated.`));
    } else {
      console.log(chalk.green(`\nMigrated ${migrations.length} files successfully.`));
    }

    return migrations;
  }

  findFiles(directory, extensions = ['.js', '.ts', '.jsx', '.tsx']) {
    const files = [];
    
    function scan(dir) {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (extensions.includes(extname(item))) {
          files.push(fullPath);
        }
      }
    }
    
    scan(directory);
    return files;
  }

  writeFile(filePath, content) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content);
  }

  async migrateFile(file, src, dest, typescript) {
    // Override in subclasses
    throw new Error('migrateFile must be implemented by subclass');
  }
}

class NextJSMigrator extends BaseMigrator {
  async migrateFile(file, src, dest, typescript) {
    const content = readFileSync(file, 'utf8');
    const relativePath = file.replace(src, '').replace(/^\//, '');
    
    // Convert to modern App Router style
    const migratedContent = this.convertToModernStyle(content, typescript);
    
    // Determine output file extension
    const ext = typescript ? '.ts' : '.js';
    const destFile = join(dest, relativePath.replace(/\.(js|ts|jsx|tsx)$/, ext));
    
    return {
      source: file,
      dest: destFile,
      content: migratedContent,
    };
  }

  convertToModernStyle(content, typescript) {
    // Parse the existing Next.js handler
    const handlerMatch = content.match(/export\s+default\s+(?:async\s+)?function\s+\w*\s*\([^)]*\)\s*{([\s\S]*)}/);
    
    if (!handlerMatch) {
      return content; // Return original if can't parse
    }

    const handlerBody = handlerMatch[1];
    const imports = this.extractImports(content);
    const typeImports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
    
    // Extract method handlers
    const methods = this.extractMethods(handlerBody);
    
    let result = '';
    
    // Add imports
    if (imports) {
      result += imports + '\n';
    }
    if (typeImports) {
      result += typeImports + '\n';
    }
    result += '\n';

    // Generate method exports
    for (const [method, methodBody] of Object.entries(methods)) {
      const requestType = typescript ? ': ApiRequest' : '';
      const responseType = typescript ? ': Promise<Response>' : '';
      
      result += `export async function ${method}(request${requestType})${responseType} {\n`;
      result += this.convertMethodBody(methodBody, method);
      result += '}\n\n';
    }

    return result;
  }

  extractImports(content) {
    const importMatches = content.match(/^import.*$/gm);
    return importMatches ? importMatches.join('\n') : '';
  }

  extractMethods(handlerBody) {
    const methods = {};
    
    // Look for method checks
    const methodChecks = handlerBody.match(/if\s*\(\s*req\.method\s*===\s*['"`](\w+)['"`]\s*\)\s*{([^}]*)}/g);
    
    if (methodChecks) {
      for (const check of methodChecks) {
        const match = check.match(/if\s*\(\s*req\.method\s*===\s*['"`](\w+)['"`]\s*\)\s*{([\s\S]*)}/);
        if (match) {
          methods[match[1]] = match[2];
        }
      }
    } else {
      // If no method checks, assume it's a GET handler
      methods.GET = handlerBody;
    }

    return methods;
  }

  convertMethodBody(body, method) {
    // Convert Next.js style to modern style
    let converted = body;
    
    // Convert req.query to URL parsing
    converted = converted.replace(/req\.query/g, 'Object.fromEntries(new URL(request.url).searchParams)');
    
    // Convert req.body to await request.json()
    converted = converted.replace(/req\.body/g, 'await request.json()');
    
    // Convert res.status().json() to Response
    converted = converted.replace(/res\.status\((\d+)\)\.json\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($2), { status: $1, headers: { "Content-Type": "application/json" } })');
    
    // Convert res.json() to Response
    converted = converted.replace(/res\.json\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($1), { status: 200, headers: { "Content-Type": "application/json" } })');
    
    // Convert res.status() to Response
    converted = converted.replace(/res\.status\((\d+)\)\.end\(\)/g, 
      'return new Response(null, { status: $1 })');

    return converted;
  }
}

class ExpressMigrator extends BaseMigrator {
  async migrateFile(file, src, dest, typescript) {
    const content = readFileSync(file, 'utf8');
    
    // Convert Express routes to Vite API routes
    const migratedContent = this.convertExpressToViteAPI(content, typescript);
    
    const relativePath = file.replace(src, '').replace(/^\//, '');
    const ext = typescript ? '.ts' : '.js';
    const destFile = join(dest, relativePath.replace(/\.(js|ts)$/, ext));
    
    return {
      source: file,
      dest: destFile,
      content: migratedContent,
    };
  }

  convertExpressToViteAPI(content, typescript) {
    const typeImports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
    
    let result = typeImports ? typeImports + '\n\n' : '';
    
    // Extract Express route handlers
    const routeMatches = content.match(/app\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?:async\s+)?\([^)]*\)\s*=>\s*{([^}]*)}/g);
    
    if (routeMatches) {
      for (const routeMatch of routeMatches) {
        const match = routeMatch.match(/app\.(\w+)\s*\([^,]+,\s*(?:async\s+)?\([^)]*\)\s*=>\s*{([\s\S]*)}/);
        if (match) {
          const method = match[1].toUpperCase();
          const body = match[2];
          
          const requestType = typescript ? ': ApiRequest' : '';
          const responseType = typescript ? ': Promise<Response>' : '';
          
          result += `export async function ${method}(request${requestType})${responseType} {\n`;
          result += this.convertExpressBody(body);
          result += '}\n\n';
        }
      }
    }

    return result;
  }

  convertExpressBody(body) {
    let converted = body;
    
    // Convert req.params to URL parsing
    converted = converted.replace(/req\.params/g, 'extractRouteParams(request.url)');
    
    // Convert req.query to URL parsing
    converted = converted.replace(/req\.query/g, 'Object.fromEntries(new URL(request.url).searchParams)');
    
    // Convert req.body to await request.json()
    converted = converted.replace(/req\.body/g, 'await request.json()');
    
    // Convert res.json() to Response
    converted = converted.replace(/res\.json\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($1), { status: 200, headers: { "Content-Type": "application/json" } })');
    
    // Convert res.status().json()
    converted = converted.replace(/res\.status\((\d+)\)\.json\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($2), { status: $1, headers: { "Content-Type": "application/json" } })');

    return converted;
  }
}

class FastifyMigrator extends BaseMigrator {
  async migrateFile(file, src, dest, typescript) {
    const content = readFileSync(file, 'utf8');
    const migratedContent = this.convertFastifyToViteAPI(content, typescript);
    
    const relativePath = file.replace(src, '').replace(/^\//, '');
    const ext = typescript ? '.ts' : '.js';
    const destFile = join(dest, relativePath.replace(/\.(js|ts)$/, ext));
    
    return {
      source: file,
      dest: destFile,
      content: migratedContent,
    };
  }

  convertFastifyToViteAPI(content, typescript) {
    const typeImports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
    
    let result = typeImports ? typeImports + '\n\n' : '';
    
    // Extract Fastify route handlers
    const routeMatches = content.match(/fastify\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?:async\s+)?\([^)]*\)\s*=>\s*{([^}]*)}/g);
    
    if (routeMatches) {
      for (const routeMatch of routeMatches) {
        const match = routeMatch.match(/fastify\.(\w+)\s*\([^,]+,\s*(?:async\s+)?\([^)]*\)\s*=>\s*{([\s\S]*)}/);
        if (match) {
          const method = match[1].toUpperCase();
          const body = match[2];
          
          const requestType = typescript ? ': ApiRequest' : '';
          const responseType = typescript ? ': Promise<Response>' : '';
          
          result += `export async function ${method}(request${requestType})${responseType} {\n`;
          result += this.convertFastifyBody(body);
          result += '}\n\n';
        }
      }
    }

    return result;
  }

  convertFastifyBody(body) {
    let converted = body;
    
    // Convert request.params to URL parsing
    converted = converted.replace(/request\.params/g, 'extractRouteParams(request.url)');
    
    // Convert request.query to URL parsing
    converted = converted.replace(/request\.query/g, 'Object.fromEntries(new URL(request.url).searchParams)');
    
    // Convert request.body to await request.json()
    converted = converted.replace(/request\.body/g, 'await request.json()');
    
    // Convert reply.send() to Response
    converted = converted.replace(/reply\.send\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($1), { status: 200, headers: { "Content-Type": "application/json" } })');
    
    // Convert reply.code().send()
    converted = converted.replace(/reply\.code\((\d+)\)\.send\(([^)]+)\)/g, 
      'return new Response(JSON.stringify($2), { status: $1, headers: { "Content-Type": "application/json" } })');

    return converted;
  }
}

class KoaMigrator extends BaseMigrator {
  async migrateFile(file, src, dest, typescript) {
    const content = readFileSync(file, 'utf8');
    const migratedContent = this.convertKoaToViteAPI(content, typescript);
    
    const relativePath = file.replace(src, '').replace(/^\//, '');
    const ext = typescript ? '.ts' : '.js';
    const destFile = join(dest, relativePath.replace(/\.(js|ts)$/, ext));
    
    return {
      source: file,
      dest: destFile,
      content: migratedContent,
    };
  }

  convertKoaToViteAPI(content, typescript) {
    const typeImports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
    
    let result = typeImports ? typeImports + '\n\n' : '';
    
    // Extract Koa middleware
    const middlewareMatch = content.match(/(?:async\s+)?\([^)]*\)\s*=>\s*{([\s\S]*)}/);
    
    if (middlewareMatch) {
      const body = middlewareMatch[1];
      
      // Assume GET method if no method detection
      const requestType = typescript ? ': ApiRequest' : '';
      const responseType = typescript ? ': Promise<Response>' : '';
      
      result += `export async function GET(request${requestType})${responseType} {\n`;
      result += this.convertKoaBody(body);
      result += '}\n\n';
    }

    return result;
  }

  convertKoaBody(body) {
    let converted = body;
    
    // Convert ctx.params to URL parsing
    converted = converted.replace(/ctx\.params/g, 'extractRouteParams(request.url)');
    
    // Convert ctx.query to URL parsing
    converted = converted.replace(/ctx\.query/g, 'Object.fromEntries(new URL(request.url).searchParams)');
    
    // Convert ctx.request.body to await request.json()
    converted = converted.replace(/ctx\.request\.body/g, 'await request.json()');
    
    // Convert ctx.body = to Response
    converted = converted.replace(/ctx\.body\s*=\s*([^;]+);?/g, 
      'return new Response(JSON.stringify($1), { status: 200, headers: { "Content-Type": "application/json" } });');
    
    // Convert ctx.status =
    converted = converted.replace(/ctx\.status\s*=\s*(\d+);?/g, 
      'return new Response(null, { status: $1 });');

    return converted;
  }
}