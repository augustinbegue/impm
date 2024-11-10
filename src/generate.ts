import { parseArgs } from "util"
import { join } from "path";
import { promises as fs } from 'fs';
import { log } from ".";

export async function generateProject() {
  const plog = log.getSubLogger({ name: 'generate-project' });

  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      'generate': {
        type: 'boolean',
        required: true,
      },
      'name': {
        type: 'string',
        required: true,
      },
      'path': {
        type: 'string',
        required: true,
      },
      'directories': {
        type: 'string',
        required: false,
      },
    },
    strict: true,
    allowPositionals: true,
  })

  if (!values.path || !values.name || !values.directories) {
    console.log(`Invalid command.
Usage: bun --generate --name <name> --path <path> [--directories <directories>]`)
    return;
  }

  try {
    await fs.access(values.path!, fs.constants.R_OK)
  } catch (error) {
    try {
      await fs.mkdir(values.path!, {
        recursive: true,
      })
      plog.info(`Created directory: ${values.path!}`);
    } catch (error) {
      plog.error(`Error accessing directory: ${values.path!}`, error)
    }
  }


  const subDirectories = values.directories?.split(',') ?? ['photo', 'video', 'export'];
  await Promise.all(subDirectories.map(async (subDirectory) => {
    try {
      await fs.mkdir(join(values.path!, subDirectory))
      plog.info(`Created subdirectory: ${subDirectory}`);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        plog.warn(`Subdirectory already exists: ${subDirectory}`);
        return;
      }
      plog.error(`Error creating directory: ${subDirectory}`, error)
    }
  }));

  const projectDefinition = {
    name: values.name,
    subAlbums: [
      subDirectories.includes('export') ? { suffix: ' / Export', path: 'export' } : undefined,
    ]
  }
  await Bun.write(
    Bun.file(join(values.path!, "immich-project.json")),
    JSON.stringify(projectDefinition, null, 2)
  )
  plog.info(`Generated project: ${values.name}`);
}
