/**
 * Dependency Tracker for Smart HMR
 * Tracks module dependencies and determines optimal reload strategies
 */

import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export class DependencyTracker {
  constructor(options = {}) {
    this.options = {
      enableASTAnalysis: true,
      trackNodeModules: false,
      maxDepth: 10,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      ...options,
    };

    this.dependencyGraph = new Map();
    this.reverseDependencyGraph = new Map();
    this.moduleCache = new Map();
    this.analysisCache = new Map();
    this.packageJsonCache = new Map();
  }

  /**
   * Analyze dependencies for a file
   */
  async analyzeDependencies(filePath) {
    const normalizedPath = path.normalize(filePath);
    
    // Check cache first
    const cached = this.analysisCache.get(normalizedPath);
    if (cached && Date.now() - cached.timestamp < this.options.cacheTimeout) {
      return cached.dependencies;
    }

    try {
      const dependencies = await this.extractDependencies(normalizedPath);
      
      // Cache the result
      this.analysisCache.set(normalizedPath, {
        dependencies,
        timestamp: Date.now(),
      });

      // Update dependency graphs
      this.updateDependencyGraphs(normalizedPath, dependencies);

      return dependencies;
    } catch (error) {
      console.warn(`Failed to analyze dependencies for ${filePath}:`, error.message);
      return new Set();
    }
  }

  /**
   * Extract dependencies from a file
   */
  async extractDependencies(filePath) {
    const dependencies = new Set();
    
    if (!fs.existsSync(filePath)) {
      return dependencies;
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    const fileExt = path.extname(filePath);

    // Use AST analysis for JavaScript/TypeScript files
    if (this.options.enableASTAnalysis && /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(fileExt)) {
      await this.extractDependenciesFromAST(content, filePath, dependencies);
    } else {
      // Fallback to regex-based extraction
      this.extractDependenciesFromRegex(content, filePath, dependencies);
    }

    return dependencies;
  }

  /**
   * Extract dependencies using AST analysis
   */
  async extractDependenciesFromAST(content, filePath, dependencies) {
    try {
      const ast = parse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
        ],
      });

      traverse(ast, {
        // Static imports: import ... from '...'
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value;
          this.addDependency(source, filePath, dependencies, 'import');
        },

        // Dynamic imports: import('...')
        CallExpression(nodePath) {
          if (nodePath.node.callee.type === 'Import') {
            const arg = nodePath.node.arguments[0];
            if (arg && arg.type === 'StringLiteral') {
              this.addDependency(arg.value, filePath, dependencies, 'dynamic-import');
            }
          }
        },

        // CommonJS require: require('...')
        CallExpression(nodePath) {
          if (
            nodePath.node.callee.type === 'Identifier' &&
            nodePath.node.callee.name === 'require'
          ) {
            const arg = nodePath.node.arguments[0];
            if (arg && arg.type === 'StringLiteral') {
              this.addDependency(arg.value, filePath, dependencies, 'require');
            }
          }
        },

        // Re-exports: export ... from '...'
        ExportNamedDeclaration(nodePath) {
          if (nodePath.node.source) {
            this.addDependency(nodePath.node.source.value, filePath, dependencies, 'export');
          }
        },

        ExportAllDeclaration(nodePath) {
          this.addDependency(nodePath.node.source.value, filePath, dependencies, 'export-all');
        },
      });
    } catch (error) {
      console.warn(`AST parsing failed for ${filePath}, falling back to regex:`, error.message);
      this.extractDependenciesFromRegex(content, filePath, dependencies);
    }
  }

  /**
   * Extract dependencies using regex (fallback)
   */
  extractDependenciesFromRegex(content, filePath, dependencies) {
    const patterns = [
      // ES6 imports
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g,
      // Dynamic imports
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      // CommonJS require
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      // Re-exports
      /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"`]([^'"`]+)['"`]/g,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        this.addDependency(match[1], filePath, dependencies, 'regex');
      }
    });
  }

  /**
   * Add a dependency with resolution
   */
  addDependency(importPath, fromFile, dependencies, type) {
    try {
      const resolvedPath = this.resolveDependency(importPath, fromFile);
      if (resolvedPath) {
        dependencies.add({
          path: resolvedPath,
          importPath,
          type,
          isNodeModule: this.isNodeModule(importPath),
          isRelative: importPath.startsWith('.'),
        });
      }
    } catch (error) {
      // Dependency resolution failed, skip it
    }
  }

  /**
   * Resolve a dependency path
   */
  resolveDependency(importPath, fromFile) {
    // Skip node_modules unless explicitly tracking them
    if (this.isNodeModule(importPath) && !this.options.trackNodeModules) {
      return null;
    }

    // Handle relative imports
    if (importPath.startsWith('.')) {
      const basePath = path.dirname(fromFile);
      let resolvedPath = path.resolve(basePath, importPath);

      // Try different extensions
      const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json'];
      
      if (fs.existsSync(resolvedPath)) {
        const stat = fs.statSync(resolvedPath);
        if (stat.isFile()) {
          return resolvedPath;
        } else if (stat.isDirectory()) {
          // Try index files
          for (const ext of extensions) {
            const indexPath = path.join(resolvedPath, `index${ext}`);
            if (fs.existsSync(indexPath)) {
              return indexPath;
            }
          }
        }
      } else {
        // Try with extensions
        for (const ext of extensions) {
          const pathWithExt = resolvedPath + ext;
          if (fs.existsSync(pathWithExt)) {
            return pathWithExt;
          }
        }
      }
    }

    // Handle absolute imports (from project root or node_modules)
    if (this.options.trackNodeModules && this.isNodeModule(importPath)) {
      return this.resolveNodeModule(importPath, fromFile);
    }

    return null;
  }

  /**
   * Check if import is from node_modules
   */
  isNodeModule(importPath) {
    return !importPath.startsWith('.') && !importPath.startsWith('/');
  }

  /**
   * Resolve node_modules dependency
   */
  resolveNodeModule(importPath, fromFile) {
    let currentDir = path.dirname(fromFile);
    
    while (currentDir !== path.dirname(currentDir)) {
      const nodeModulesPath = path.join(currentDir, 'node_modules', importPath);
      
      if (fs.existsSync(nodeModulesPath)) {
        const stat = fs.statSync(nodeModulesPath);
        
        if (stat.isFile()) {
          return nodeModulesPath;
        } else if (stat.isDirectory()) {
          // Check package.json for main entry
          const packageJsonPath = path.join(nodeModulesPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            const packageJson = this.readPackageJson(packageJsonPath);
            const mainFile = packageJson.main || packageJson.module || 'index.js';
            const mainPath = path.join(nodeModulesPath, mainFile);
            
            if (fs.existsSync(mainPath)) {
              return mainPath;
            }
          }
        }
      }
      
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  /**
   * Read and cache package.json
   */
  readPackageJson(packageJsonPath) {
    if (this.packageJsonCache.has(packageJsonPath)) {
      return this.packageJsonCache.get(packageJsonPath);
    }

    try {
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);
      this.packageJsonCache.set(packageJsonPath, packageJson);
      return packageJson;
    } catch (error) {
      return {};
    }
  }

  /**
   * Update dependency graphs
   */
  updateDependencyGraphs(filePath, dependencies) {
    // Forward graph: file -> dependencies
    this.dependencyGraph.set(filePath, dependencies);

    // Reverse graph: dependency -> files that depend on it
    for (const dep of dependencies) {
      if (!this.reverseDependencyGraph.has(dep.path)) {
        this.reverseDependencyGraph.set(dep.path, new Set());
      }
      this.reverseDependencyGraph.get(dep.path).add(filePath);
    }
  }

  /**
   * Get all files that depend on a given file
   */
  getDependents(filePath) {
    const dependents = new Set();
    const visited = new Set();
    
    const collectDependents = (path, depth = 0) => {
      if (visited.has(path) || depth > this.options.maxDepth) {
        return;
      }
      
      visited.add(path);
      const directDependents = this.reverseDependencyGraph.get(path) || new Set();
      
      for (const dependent of directDependents) {
        dependents.add(dependent);
        collectDependents(dependent, depth + 1);
      }
    };

    collectDependents(filePath);
    return Array.from(dependents);
  }

  /**
   * Get all dependencies of a given file
   */
  getDependencies(filePath) {
    const dependencies = new Set();
    const visited = new Set();
    
    const collectDependencies = (path, depth = 0) => {
      if (visited.has(path) || depth > this.options.maxDepth) {
        return;
      }
      
      visited.add(path);
      const directDependencies = this.dependencyGraph.get(path) || new Set();
      
      for (const dep of directDependencies) {
        dependencies.add(dep.path);
        collectDependencies(dep.path, depth + 1);
      }
    };

    collectDependencies(filePath);
    return Array.from(dependencies);
  }

  /**
   * Check if a file change affects API routes
   */
  async getAffectedApiRoutes(changedFile, apiRoutes) {
    const affected = new Set();
    
    // Direct API route change
    if (apiRoutes.has(changedFile)) {
      affected.add(changedFile);
    }

    // Check if any API routes depend on this file
    const dependents = this.getDependents(changedFile);
    
    for (const dependent of dependents) {
      if (apiRoutes.has(dependent)) {
        affected.add(dependent);
      }
    }

    return Array.from(affected);
  }

  /**
   * Determine reload strategy based on dependency analysis
   */
  async determineReloadStrategy(changedFile, apiRoutes) {
    const affectedRoutes = await this.getAffectedApiRoutes(changedFile, apiRoutes);
    
    if (affectedRoutes.length === 0) {
      return { type: 'none', reason: 'No API routes affected' };
    }

    if (affectedRoutes.length === 1 && affectedRoutes[0] === changedFile) {
      return { 
        type: 'single', 
        routes: affectedRoutes,
        reason: 'Direct API route change'
      };
    }

    if (affectedRoutes.length <= 5) {
      return { 
        type: 'selective', 
        routes: affectedRoutes,
        reason: `Shared dependency affects ${affectedRoutes.length} routes`
      };
    }

    return { 
      type: 'full', 
      routes: affectedRoutes,
      reason: `Widespread dependency affects ${affectedRoutes.length} routes`
    };
  }

  /**
   * Get dependency statistics
   */
  getStats() {
    const totalFiles = this.dependencyGraph.size;
    const totalDependencies = Array.from(this.dependencyGraph.values())
      .reduce((sum, deps) => sum + deps.size, 0);
    
    const nodeModuleDeps = Array.from(this.dependencyGraph.values())
      .reduce((sum, deps) => {
        return sum + Array.from(deps).filter(dep => dep.isNodeModule).length;
      }, 0);

    return {
      totalFiles,
      totalDependencies,
      nodeModuleDeps,
      relativeDeps: totalDependencies - nodeModuleDeps,
      cacheSize: this.analysisCache.size,
      averageDepsPerFile: totalFiles > 0 ? (totalDependencies / totalFiles).toFixed(2) : 0,
    };
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.analysisCache.clear();
    this.packageJsonCache.clear();
  }

  /**
   * Export dependency graph for debugging
   */
  exportGraph() {
    const graph = {};
    
    for (const [file, deps] of this.dependencyGraph.entries()) {
      graph[file] = Array.from(deps).map(dep => ({
        path: dep.path,
        type: dep.type,
        isNodeModule: dep.isNodeModule,
        isRelative: dep.isRelative,
      }));
    }
    
    return graph;
  }

  /**
   * Cleanup expired cache entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.analysisCache.entries()) {
      if (now - value.timestamp > this.options.cacheTimeout) {
        this.analysisCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Dependency tracker cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Destroy and clear all resources
   */
  destroy() {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();
    this.moduleCache.clear();
    this.analysisCache.clear();
    this.packageJsonCache.clear();
    
    console.log('🧹 Dependency tracker destroyed');
  }
}