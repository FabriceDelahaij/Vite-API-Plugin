import { Command } from 'commander';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, relative } from 'path';
import chalk from 'chalk';

export const docsCommand = new Command('docs')
  .description('Generate API documentation')
  .option('-o, --output <directory>', 'Output directory', 'docs')
  .option('-f, --format <format>', 'Output format (markdown, html, json)', 'markdown')
  .option('--include-examples', 'Include code examples', true)
  .option('--include-tests', 'Include test examples', false)
  .action(async (options) => {
    console.log(chalk.blue('📚 Generating API documentation...\n'));

    try {
      const generator = new DocsGenerator(options);
      await generator.generate();
      
      console.log(chalk.green('\n✅ Documentation generated successfully!'));
      console.log(chalk.yellow(`📁 Output: ${options.output}/`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to generate docs:'), error.message);
      process.exit(1);
    }
  });

class DocsGenerator {
  constructor(options) {
    this.options = options;
    this.routes = [];
  }

  async generate() {
    // Scan for API routes
    await this.scanRoutes('pages/api');
    
    // Create output directory
    if (!existsSync(this.options.output)) {
      mkdirSync(this.options.output, { recursive: true });
    }

    // Generate documentation
    switch (this.options.format) {
      case 'markdown':
        await this.generateMarkdown();
        break;
      case 'html':
        await this.generateHTML();
        break;
      case 'json':
        await this.generateJSON();
        break;
      default:
        throw new Error(`Unsupported format: ${this.options.format}`);
    }
  }

  async scanRoutes(directory) {
    if (!existsSync(directory)) {
      console.warn(chalk.yellow(`Directory ${directory} not found`));
      return;
    }

    const items = readdirSync(directory);
    
    for (const item of items) {
      const fullPath = join(directory, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        await this.scanRoutes(fullPath);
      } else if (['.js', '.ts', '.jsx', '.tsx'].includes(extname(item))) {
        const route = await this.analyzeRoute(fullPath);
        if (route) {
          this.routes.push(route);
          console.log(chalk.green(`Analyzed: ${route.path}`));
        }
      }
    }
  }

  async analyzeRoute(filePath) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const relativePath = relative('pages/api', filePath);
      const routePath = this.filePathToRoute(relativePath);
      
      const route = {
        path: routePath,
        file: filePath,
        methods: [],
        description: this.extractDescription(content),
        parameters: this.extractParameters(content, routePath),
        examples: this.options.includeExamples ? this.extractExamples(content) : [],
      };

      // Extract HTTP methods
      const methods = this.extractMethods(content);
      route.methods = methods;

      return route;
    } catch (error) {
      console.warn(chalk.yellow(`Failed to analyze ${filePath}: ${error.message}`));
      return null;
    }
  }

  filePathToRoute(filePath) {
    let route = filePath
      .replace(/\\/g, '/')
      .replace(/\.(js|ts|jsx|tsx)$/, '')
      .replace(/\/index$/, '');

    // Handle dynamic routes: [id].js -> {id}
    route = route.replace(/\[([^\]]+)\]/g, '{$1}');

    return '/api' + (route ? '/' + route : '');
  }

  extractMethods(content) {
    const methods = [];
    
    // Look for exported functions (App Router style)
    const exportMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
    if (exportMatches) {
      for (const match of exportMatches) {
        const methodMatch = match.match(/export\s+(?:async\s+)?function\s+(\w+)/);
        if (methodMatch) {
          const method = methodMatch[1].toUpperCase();
          if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) {
            methods.push({
              method,
              description: this.extractMethodDescription(content, methodMatch[1]),
              parameters: this.extractMethodParameters(content, methodMatch[1]),
              responses: this.extractMethodResponses(content, methodMatch[1]),
            });
          }
        }
      }
    }

    // Look for default export (Next.js style)
    if (methods.length === 0 && content.includes('export default')) {
      const methodChecks = content.match(/req\.method\s*===\s*['"`](\w+)['"`]/g);
      if (methodChecks) {
        for (const check of methodChecks) {
          const methodMatch = check.match(/req\.method\s*===\s*['"`](\w+)['"`]/);
          if (methodMatch) {
            methods.push({
              method: methodMatch[1],
              description: '',
              parameters: [],
              responses: [],
            });
          }
        }
      } else {
        // Assume GET if no method checks
        methods.push({
          method: 'GET',
          description: '',
          parameters: [],
          responses: [],
        });
      }
    }

    return methods;
  }

  extractDescription(content) {
    // Look for JSDoc comments
    const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*([^\n]*)/);
    if (jsdocMatch) {
      return jsdocMatch[1].trim();
    }

    // Look for single-line comments
    const commentMatch = content.match(/\/\/\s*(.+)/);
    if (commentMatch) {
      return commentMatch[1].trim();
    }

    return '';
  }

  extractParameters(content, routePath) {
    const parameters = [];
    
    // Extract path parameters
    const pathParams = routePath.match(/\{([^}]+)\}/g);
    if (pathParams) {
      for (const param of pathParams) {
        const name = param.slice(1, -1);
        parameters.push({
          name,
          in: 'path',
          required: true,
          type: 'string',
          description: `Path parameter: ${name}`,
        });
      }
    }

    // Extract query parameters from code
    const queryMatches = content.match(/url\.searchParams\.get\(['"`]([^'"`]+)['"`]\)/g);
    if (queryMatches) {
      for (const match of queryMatches) {
        const paramMatch = match.match(/url\.searchParams\.get\(['"`]([^'"`]+)['"`]\)/);
        if (paramMatch) {
          parameters.push({
            name: paramMatch[1],
            in: 'query',
            required: false,
            type: 'string',
            description: `Query parameter: ${paramMatch[1]}`,
          });
        }
      }
    }

    return parameters;
  }

  extractMethodDescription(content, methodName) {
    // Look for comment above method
    const methodRegex = new RegExp(`\\/\\/\\s*([^\\n]*)\\s*\\n\\s*export\\s+(?:async\\s+)?function\\s+${methodName}`, 'i');
    const match = content.match(methodRegex);
    return match ? match[1].trim() : '';
  }

  extractMethodParameters(content, methodName) {
    // Extract from method body
    const methodRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${methodName}\\s*\\([^)]*\\)\\s*{([^}]*)}`, 's');
    const match = content.match(methodRegex);
    
    if (match) {
      const body = match[1];
      const parameters = [];
      
      // Look for request.json() calls
      if (body.includes('request.json()')) {
        parameters.push({
          name: 'body',
          in: 'body',
          required: true,
          type: 'object',
          description: 'Request body (JSON)',
        });
      }
      
      return parameters;
    }
    
    return [];
  }

  extractMethodResponses(content, methodName) {
    const responses = [];
    
    // Extract Response objects
    const methodRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${methodName}\\s*\\([^)]*\\)\\s*{([^}]*)}`, 's');
    const match = content.match(methodRegex);
    
    if (match) {
      const body = match[1];
      const responseMatches = body.match(/new Response\([^,]*,\s*{\s*status:\s*(\d+)/g);
      
      if (responseMatches) {
        for (const responseMatch of responseMatches) {
          const statusMatch = responseMatch.match(/status:\s*(\d+)/);
          if (statusMatch) {
            const status = statusMatch[1];
            responses.push({
              status,
              description: this.getStatusDescription(status),
              contentType: 'application/json',
            });
          }
        }
      }
    }
    
    return responses;
  }

  getStatusDescription(status) {
    const descriptions = {
      '200': 'Success',
      '201': 'Created',
      '400': 'Bad Request',
      '401': 'Unauthorized',
      '403': 'Forbidden',
      '404': 'Not Found',
      '405': 'Method Not Allowed',
      '429': 'Too Many Requests',
      '500': 'Internal Server Error',
    };
    
    return descriptions[status] || 'Unknown';
  }

  extractExamples(content) {
    const examples = [];
    
    // Look for example comments
    const exampleMatches = content.match(/\/\*\*[\s\S]*?@example[\s\S]*?\*\//g);
    if (exampleMatches) {
      for (const match of exampleMatches) {
        const exampleContent = match.match(/@example\s*([\s\S]*?)\*\//);
        if (exampleContent) {
          examples.push(exampleContent[1].trim());
        }
      }
    }
    
    return examples;
  }

  async generateMarkdown() {
    let markdown = '# API Documentation\n\n';
    markdown += `Generated on ${new Date().toISOString()}\n\n`;
    markdown += '## Table of Contents\n\n';
    
    // Table of contents
    for (const route of this.routes) {
      markdown += `- [${route.path}](#${route.path.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()})\n`;
    }
    
    markdown += '\n## Routes\n\n';
    
    // Route details
    for (const route of this.routes) {
      markdown += `### ${route.path}\n\n`;
      
      if (route.description) {
        markdown += `${route.description}\n\n`;
      }
      
      markdown += `**File:** \`${route.file}\`\n\n`;
      
      // Methods
      if (route.methods.length > 0) {
        markdown += '#### Methods\n\n';
        
        for (const method of route.methods) {
          markdown += `##### ${method.method}\n\n`;
          
          if (method.description) {
            markdown += `${method.description}\n\n`;
          }
          
          // Parameters
          if (method.parameters.length > 0) {
            markdown += '**Parameters:**\n\n';
            markdown += '| Name | Type | In | Required | Description |\n';
            markdown += '|------|------|----|---------|--------------|\n';
            
            for (const param of method.parameters) {
              markdown += `| ${param.name} | ${param.type} | ${param.in} | ${param.required ? 'Yes' : 'No'} | ${param.description} |\n`;
            }
            markdown += '\n';
          }
          
          // Responses
          if (method.responses.length > 0) {
            markdown += '**Responses:**\n\n';
            markdown += '| Status | Description | Content Type |\n';
            markdown += '|--------|-------------|---------------|\n';
            
            for (const response of method.responses) {
              markdown += `| ${response.status} | ${response.description} | ${response.contentType} |\n`;
            }
            markdown += '\n';
          }
        }
      }
      
      // Examples
      if (route.examples.length > 0) {
        markdown += '#### Examples\n\n';
        for (const example of route.examples) {
          markdown += '```javascript\n';
          markdown += example;
          markdown += '\n```\n\n';
        }
      }
      
      markdown += '---\n\n';
    }
    
    writeFileSync(join(this.options.output, 'README.md'), markdown);
    console.log(chalk.green('Generated README.md'));
  }

  async generateHTML() {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .route { border: 1px solid #ddd; margin: 20px 0; padding: 20px; border-radius: 5px; }
        .method { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 3px; }
        .method-name { font-weight: bold; color: #007acc; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>API Documentation</h1>
    <p>Generated on ${new Date().toISOString()}</p>
    
    <h2>Table of Contents</h2>
    <ul>
        ${this.routes.map(route => `<li><a href="#${route.path.replace(/[^a-zA-Z0-9]/g, '')}">${route.path}</a></li>`).join('')}
    </ul>
    
    <h2>Routes</h2>
    ${this.routes.map(route => this.generateRouteHTML(route)).join('')}
</body>
</html>`;
    
    writeFileSync(join(this.options.output, 'index.html'), html);
    console.log(chalk.green('Generated index.html'));
  }

  generateRouteHTML(route) {
    return `
    <div class="route" id="${route.path.replace(/[^a-zA-Z0-9]/g, '')}">
        <h3>${route.path}</h3>
        ${route.description ? `<p>${route.description}</p>` : ''}
        <p><strong>File:</strong> <code>${route.file}</code></p>
        
        ${route.methods.map(method => `
        <div class="method">
            <div class="method-name">${method.method}</div>
            ${method.description ? `<p>${method.description}</p>` : ''}
            
            ${method.parameters.length > 0 ? `
            <h4>Parameters</h4>
            <table>
                <tr><th>Name</th><th>Type</th><th>In</th><th>Required</th><th>Description</th></tr>
                ${method.parameters.map(param => `
                <tr>
                    <td>${param.name}</td>
                    <td>${param.type}</td>
                    <td>${param.in}</td>
                    <td>${param.required ? 'Yes' : 'No'}</td>
                    <td>${param.description}</td>
                </tr>
                `).join('')}
            </table>
            ` : ''}
            
            ${method.responses.length > 0 ? `
            <h4>Responses</h4>
            <table>
                <tr><th>Status</th><th>Description</th><th>Content Type</th></tr>
                ${method.responses.map(response => `
                <tr>
                    <td>${response.status}</td>
                    <td>${response.description}</td>
                    <td>${response.contentType}</td>
                </tr>
                `).join('')}
            </table>
            ` : ''}
        </div>
        `).join('')}
        
        ${route.examples.length > 0 ? `
        <h4>Examples</h4>
        ${route.examples.map(example => `<pre><code>${example}</code></pre>`).join('')}
        ` : ''}
    </div>`;
  }

  async generateJSON() {
    const apiDoc = {
      openapi: '3.0.0',
      info: {
        title: 'API Documentation',
        version: '1.0.0',
        description: 'Generated API documentation',
        generatedAt: new Date().toISOString(),
      },
      paths: {},
    };
    
    for (const route of this.routes) {
      apiDoc.paths[route.path] = {};
      
      for (const method of route.methods) {
        apiDoc.paths[route.path][method.method.toLowerCase()] = {
          summary: method.description || `${method.method} ${route.path}`,
          description: route.description,
          parameters: method.parameters.map(param => ({
            name: param.name,
            in: param.in,
            required: param.required,
            schema: { type: param.type },
            description: param.description,
          })),
          responses: method.responses.reduce((acc, response) => {
            acc[response.status] = {
              description: response.description,
              content: {
                [response.contentType]: {
                  schema: { type: 'object' },
                },
              },
            };
            return acc;
          }, {}),
        };
      }
    }
    
    writeFileSync(join(this.options.output, 'openapi.json'), JSON.stringify(apiDoc, null, 2));
    console.log(chalk.green('Generated openapi.json'));
  }
}