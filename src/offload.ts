import { log } from ".";
import { parseArgs } from "util"
import { promises as fs } from 'fs';
import { Glob } from "bun";
import path from 'path';
import { ensureDirectoryExists } from "./utils";

export async function offload() {
  const plog = log.getSubLogger({ name: 'offload' });

  const { values } = parseArgs({
    args: process.argv,
    options: {
      'offload': {
        type: 'boolean',
        required: true,
      },
      'input': {
        type: 'string',
        required: true,
        alias: 'i',
      },
      'output': {
        type: 'string',
        required: true,
        alias: 'o',
      },
      'move': {
        type: 'boolean',
        required: false,
        alias: 'm',
      },
      'photoGlob': {
        type: 'string',
        required: false,
      },
      'videoGlob': {
        type: 'string',
        required: false,
      },
    },
    strict: true,
    allowPositionals: true,
  })

  if (!values.input || !values.output) {
    console.log(`Invalid command.
Usage: bun --offload --input <input> --output <output>`)
    return;
  }

  plog.info(`Offloading ${values.input} to ${values.output}`);

  try {
    await fs.access(values.input!, fs.constants.W_OK);
  } catch (error) {
    plog.error(`Error accessing input: ${values.input!}`, error)
    return;
  }

  let cpCount = 0;
  let rmCount = 0;
  let eeCount = 0;

  await ensureDirectoryExists(values.output!);

  const photoPath = path.join(values.output!, 'photo');
  await ensureDirectoryExists(photoPath);

  const photoGlob = new Glob(values.photoGlob ?? '**/*.{RW2,JPG,XMP}');
  const photoFiles = Array.from(photoGlob.scanSync({
    cwd: values.input,
    absolute: true,
  }));
  const photoPromises = photoFiles.map(async (photoFile) => {
    try {
      const photoFileStat = await fs.stat(photoFile);
      if (!photoFileStat.isFile()) {
        plog.warn(`Not a file: ${photoFile}`);
        return;
      }

      const photoFileDest = path.join(photoPath, path.basename(photoFile));

      if (!await fs.exists(photoFileDest)) {
        await fs.copyFile(photoFile, photoFileDest);
        cpCount++;
        plog.info(`Copied file: ${photoFile} -> ${photoFileDest}`);
      } else {
        plog.warn(`Skipping file ${photoFileDest}: already exists`);
        eeCount++;
      }

      if (values.move) {
        await fs.unlink(photoFile);
        rmCount++;
      }
    } catch (error) {
      plog.error(`Error processing file: ${photoFile}`, error);
    }
  });

  const videoPath = path.join(values.output!, 'video');
  await ensureDirectoryExists(videoPath);

  const videoGlob = new Glob(values.videoGlob ?? '**/*.{MP4,MOV}');
  const videoFiles = Array.from(videoGlob.scanSync({
    cwd: values.input,
    absolute: true,
  }));
  const videoPromises = videoFiles.map(async (videoFile) => {
    try {
      const videoFileStat = await fs.stat(videoFile);
      if (!videoFileStat.isFile()) {
        plog.warn(`Not a file: ${videoFile}`);
        return;
      }

      const videoFileDest = path.join(videoPath, path.basename(videoFile));

      if (!await fs.exists(videoFileDest)) {
        await fs.copyFile(videoFile, videoFileDest);
        cpCount++;
        plog.info(`Copied file: ${videoFile} -> ${videoFileDest}`);
      } else {
        plog.warn(`Skipping file ${videoFileDest}: already exists`);
        eeCount++;
      }

      if (values.move) {
        await fs.unlink(videoFile);
        rmCount++;
      }
    } catch (error) {
      plog.error(`Error processing file: ${videoFile}`, error);
    }
  });

  await Promise.all([...photoPromises, ...videoPromises]);

  plog.info(`Summary:
  Copied: ${cpCount}
  Removed: ${rmCount}
  Skipped: ${eeCount}`);
}
