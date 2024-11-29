import { getAlbumInfo, getAllAlbums, getAllLibraries, init } from "@immich/sdk";
import { Glob } from "bun";
import { resolvePath } from "./utils";
import { log } from ".";
import { access } from "fs/promises";
import type { ProjectDefinition } from "./index.d";
import { parseArgs } from 'util';
import { ResolveImportScript } from "./utils/drb";


init({
  baseUrl: Bun.env['IMMICH_BASE_URL']!,
  apiKey: Bun.env['IMMICH_API_KEY']!,
});
const plog = log.getSubLogger({ name: 'export-projects' });

const { values } = parseArgs({
  args: process.argv,
  options: {
    'filter': {
      type: 'string',
      required: false,
    }
  },
  strict: false,
  allowPositionals: true,
});

// Get library
const library = await getAllLibraries().then((res) => res.find((lib) => lib.name === Bun.env['IMMICH_LIBRARY_NAME']));
if (!library) {
  throw new Error(`Library ${Bun.env['IMMICH_LIBRARY_NAME']} not found`);
}
// Retreive paths to search
const searchPaths: string[] = [];
if (library.importPaths && Array.isArray(library.importPaths)) {
  for (const importPath of library.importPaths) {
    try {
      await access(resolvePath(importPath));
      plog.info(`Path exists: ${importPath}`);
      searchPaths.push(importPath);
    } catch (error) {
      plog.error(`Path does not exist: ${importPath}`);
    }
  }
} else {
  throw new Error('Library importPaths is not an array or is missing');
}

for (const searchPath of searchPaths) {
  const albums = await getAllAlbums({});
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
    const immichAlbums = albums.filter((album) => album.albumName.startsWith(project.name));
    plog.info(`[${project.name}] Exporting ${immichAlbums.length} albums`);
    const scriptGen = new ResolveImportScript();

    for (const immichAlbum of immichAlbums) {
      const immichAlbumInfo = await getAlbumInfo({
        id: immichAlbum.id,
      });
      const files: string[] = await Promise.all(immichAlbumInfo.assets.map(async (asset) => {
        return resolvePath(asset.originalPath)
      }));

      if (files.length === 0) {
        plog.warn(`[${project.name}] Album ${immichAlbumInfo.albumName} has no assets`);
        continue;
      }

      const folderName = immichAlbumInfo.albumName.replace(project.name, '').replace(' /', '').trim();
      if (folderName.length > 0) {
        scriptGen.createSubfolderWithFiles(folderName, files);
      }
    }

    const outputPath = `./scripts/${project.name.replace(' / ', '/')}.py`;
    plog.info(`[${project.name}] Writing script to ${outputPath}`);
    Bun.write(outputPath, scriptGen.generateScript());
  }
}
