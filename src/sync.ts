import { addAssetsToAlbum, createAlbum, getAllAlbums, getAllLibraries, init, scanLibrary, searchMetadata, updateAssets } from '@immich/sdk';
import { Glob } from 'bun';
import { promises as fs } from 'fs';
import { resolveAlias, resolvePath } from './utils';
import type { ProjectDefinition } from './index.d';
import { log } from '.';
import { join, parse } from 'path';
import { parseArgs } from 'util';

export async function syncProjects() {
  const plog = log.getSubLogger({ name: 'sync-projects' });

  const { values } = parseArgs({
    args: process.argv,
    options: {
      'filter': {
        type: 'string',
        required: false,
      },
      'skip-scan': {
        type: 'boolean',
        required: false,
      }
    },
    strict: false,
    allowPositionals: true,
  });

  const requiredEnvVars = ['IMMICH_BASE_URL', 'IMMICH_API_KEY', 'IMMICH_LIBRARY_NAME'];
  for (const envVar of requiredEnvVars) {
    if (!Bun.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const fileExtensions: string[] = JSON.parse(Bun.env['IMMICH_FILE_EXTENSIONS'] ?? '[".JPG", ".MOV", ".MP4", ".PNG", ".jpg", ".mov", ".mp4", ".png"]');
  if (Array.isArray(fileExtensions) && fileExtensions.length > 0)
    plog.info('Loaded file extensions:', fileExtensions);

  init({
    baseUrl: Bun.env['IMMICH_BASE_URL']!,
    apiKey: Bun.env['IMMICH_API_KEY']!,
  })

  // Get library
  const library = await getAllLibraries().then((res) => res.find((lib) => lib.name === Bun.env['IMMICH_LIBRARY_NAME']));
  if (!library) {
    throw new Error(`Library ${Bun.env['IMMICH_LIBRARY_NAME']} not found`);
  }
  // Scan library
  if (!values['skip-scan']) {
    plog.info(`Scanning library: ${library.name} (${library.id})`);
    await scanLibrary(library);
  }

  // Retreive paths to search
  const searchPaths: string[] = [];
  if (library.importPaths && Array.isArray(library.importPaths)) {
    for (const importPath of library.importPaths) {
      try {
        await fs.access(resolvePath(importPath));
        plog.info(`Path exists: ${importPath}`);
        searchPaths.push(importPath);
      } catch (error) {
        plog.error(`Path does not exist: ${importPath}`);
      }
    }
  } else {
    throw new Error('Library importPaths is not an array or is missing');
  }

  const immichAlbums = await getAllAlbums({});
  const assetsWithProxies: {
    id: string;
    encodedVideoPath: string;
  }[] = [];
  // Search for project definitions
  for (const searchPath of searchPaths) {
    const albumDefinitionsGlob = new Glob('**/immich-project.json');
    const albumDefinitions = Array.from(albumDefinitionsGlob.scanSync({
      cwd: resolvePath(searchPath),
      absolute: true,
    }))

    for (const albumDefinition of albumDefinitions) {
      const path = albumDefinition.replace(/\/immich-project.json$/, '');
      const project = await Bun.file(albumDefinition).json() as ProjectDefinition;

      if (values.filter && typeof values.filter === 'string' && !new Glob(values.filter).match(project.name)) {
        plog.info(`[${project.name}] Skipping project`);
        continue;
      }

      plog.info(`[${project.name}] Found project definition @ ${path}`);

      const files = Array.from(new Glob(`**/*{${fileExtensions.join(',')}}`).scanSync({
        cwd: resolvePath(path),
        absolute: true,
      }));
      plog.info(`[${project.name}] Found ${files.length} files`);

      // Create project main & sub albums
      let subAlbums = project.subAlbums?.map(async (a) => {
        return {
          name: project.name + a.suffix,
          path: join(path, a.path),
          data: await findOrCreateAlbum(project.name + a.suffix, project),
        }
      }) ?? [];
      let albums = [{
        name: project.name,
        path: path,
        data: await findOrCreateAlbum(project.name, project),
      }, ...await Promise.all(subAlbums)];

      const metaPromises = files.map(async (filePath) => {
        let immichPath = resolveAlias(filePath);

        try {
          const meta = await searchMetadata({
            metadataSearchDto: {
              originalPath: immichPath,
            }
          });

          // Check if a Proxy exists for the file
          const fileName = parse(filePath).name + '.mov';
          const proxyPath = join(parse(filePath).dir, `/Proxy/${fileName}`);
          if (await fs.exists(proxyPath)) {
            const ap = meta.assets.items.map((asset) => {
              return {
                id: asset.id,
                encodedVideoPath: proxyPath
              }
            });
            assetsWithProxies.push(...ap);
          }

          return meta.assets.items.map((asset) => {
            return {
              id: asset.id,
              path: filePath
            }
          });
        } catch (error) {
          plog.error(`[${project.name}] Error searching metadata for file: ${filePath}`, error);
          return [];
        }
      });
      const metaResults = await Promise.all(metaPromises);
      const assets = metaResults.flat()
      plog.info(`[${project.name}] Found ${assets.length} existing assets`);

      for (const album of albums) {
        const albumGlob = new Glob(`${album.path}/**/*{${fileExtensions.join(',')}}`);
        const assetIds = assets.filter((a) => {
          return albumGlob.match(a.path);
        }).map((a) => a.id);

        const res = await addAssetsToAlbum({
          id: album.data.id,
          bulkIdsDto: {
            ids: assetIds,
          }
        });

        plog.info(`[${project.name}] Successfully added ${res.filter(r => r.success).length} assets to album: ${album.name}`);
        const errorCount = res.filter(r => !r.success).length;
        if (errorCount > 0) {
          plog.warn(`[${project.name}] Failed to add ${res.filter(r => !r.success).length} assets to album: ${album.name}`);
          let errors: {
            [key: string]: number;
          } = {};
          res.forEach((r) => {
            if (!r.success && r.error) {
              if (!errors[r.error]) {
                errors[r.error] = 0;
              }
              errors[r.error]++;
            }
          });
          plog.warn(`[${project.name}] Error summary: `, errors);
        }
      }
    }
  }

  if (assetsWithProxies.length > 0) {
    plog.info('Found assets with proxies, generating SQL update script');
    let sql = "";
    for (const asset of assetsWithProxies) {
      sql += `UPDATE assets SET "encodedVideoPath" = '${resolveAlias(asset.encodedVideoPath)}' WHERE id = '${asset.id}';\n`;
    }

    fs.writeFile('update-encoded-video-path.sql', sql);
  }

  async function findOrCreateAlbum(name: string, project: ProjectDefinition) {
    let immichAlbum = immichAlbums.find((a) => a.albumName === name);
    if (!immichAlbum) {
      plog.info(`[${project.name}] Creating album: ${name}`);
      immichAlbum = await createAlbum({
        createAlbumDto: {
          albumName: name,
        }
      });
    }

    return immichAlbum;
  }
}
