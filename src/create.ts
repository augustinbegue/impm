import { parseArgs } from "util"
import { join } from "path";
import { promises as fs } from 'fs';
import { log } from ".";
import prompts from 'prompts';

export async function createProject() {
  const plog = log.getSubLogger({ name: 'create-project' });

  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      'name': {
        type: 'string',
        required: false,
      },
      'path': {
        type: 'string',
        required: false,
      },
      'directories': {
        type: 'string',
        required: false,
      },
    },
    strict: true,
    allowPositionals: true,
  })

  if (!values.name) {
    const res = await prompts({
      type: 'text',
      name: 'name',
      message: "Enter the project's name",
      validate: (name: string) => {
        if (!name) return 'Name cannot be empty';
        return true;
      }
    }, {
      onCancel: () => {
        plog.error('User cancelled the operation');
        process.exit(1);
      }
    })
    values.name = res.name;
  }

  if (!values.path) {
    const res = await prompts({
      type: 'text',
      name: 'path',
      message: "Enter the project's path",
      validate: (path: string) => {
        if (!path) return 'Path cannot be empty';
        return true;
      },
    }, {
      onCancel: () => {
        plog.error('User cancelled the operation');
        process.exit(1);
      }
    })
    values.path = res.path;
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
