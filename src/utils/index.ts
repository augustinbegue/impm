import { promises as fs } from 'fs';
import { log } from "../";

let pathAliases: {
  [key: string]: string;
};

function loadPathAliases() {
  pathAliases = JSON.parse(Bun.env['IMMICH_LIBRARY_PATH_ALIASES'] ?? '{}');
  if (typeof pathAliases === 'object' && Object.keys(pathAliases).length > 0)
    log.info('Loaded path aliases:', pathAliases);
}

/**
 * Convert an aliased path to a resolved path
 * @param path 
 * @returns Resolved path
 */
export function resolvePath(path: string): string {
  if (!pathAliases)
    loadPathAliases();

  for (const [alias, resolvedPath] of Object.entries(pathAliases)) {
    if (path.startsWith(alias)) {
      return path.replace(alias, resolvedPath);
    }
  }

  return path;
}

/**
 * Convert a path to an alias if it starts with a resolved path
 * @param path 
 * @returns Aliased path
 */
export function resolveAlias(path: string): string {
  if (!pathAliases)
    loadPathAliases();

  for (const [alias, resolvedPath] of Object.entries(pathAliases)) {
    if (path.startsWith(resolvedPath)) {
      return path.replace(resolvedPath, alias);
    }
  }

  return path;
}

export async function ensureDirectoryExists(directoryPath: string) {
  try {
    await fs.access(directoryPath, fs.constants.W_OK);
  } catch (error) {
    try {
      await fs.mkdir(directoryPath, {
        recursive: true,
      });
      log.info(`Created directory: ${directoryPath}`);
    } catch (error) {
      log.error(`Error accessing directory: ${directoryPath}`, error);
      throw error;
    }
  }
}
