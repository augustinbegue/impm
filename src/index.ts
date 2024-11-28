#!/usr/bin/env bun

import { parseArgs } from "util"
import { syncProjects } from "./sync"
import { createProject } from "./create"
import { Logger } from "tslog"
import { offload } from "./offload";

export const log = new Logger({
  name: "core",
  prettyLogTemplate: "{{dateIsoStr}} {{logLevelName}} {{name}} ",
});

export const helpMsg = `impm 0.1.0 / Immich Projects Manager / https://github.com/augustinbegue/impm

Usage: impm <command> [options]

Commands:
  sync      Sync existing projects to Immich
  create    Create a new project
  offload   Offload an external media to a project

Options:
  --help    Display this help message

Run 'impm <command> --help' for more information on a command.`;

const { values, positionals } = parseArgs({
  args: process.argv,
  options: {
    'help': {
      type: 'boolean',
      required: false,
    },
  },
  strict: false,
  allowPositionals: true,
})

if (values.help) {
  console.log(helpMsg)
  process.exit(0)
}

if (positionals[2] === 'sync') {
  syncProjects()
} else if (positionals[2] === 'create') {
  createProject()
} else if (positionals[2] === 'offload') {
  offload()
} else {
  console.log(`Invalid command. Run 'impm --help' for more information.`)
}

