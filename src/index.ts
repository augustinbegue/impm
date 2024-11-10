#!/usr/bin/env bun

import { parseArgs } from "util"
import { syncProjects } from "./sync"
import { generateProject } from "./generate"
import { Logger } from "tslog"
import { offload } from "./offload";

export const log = new Logger({
  name: "core",
  prettyLogTemplate: "{{dateIsoStr}} {{logLevelName}} {{name}} ",
});

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    'sync': {
      type: 'boolean',
      required: false,
    },
    'generate': {
      type: 'boolean',
      required: false,
    },
    'offload': {
      type: 'boolean',
      required: false,
    },
  },
  strict: false
})

if (values['sync']) {
  syncProjects()
} else if (values['generate']) {
  generateProject()
} else if (values['offload']) {
  offload()
} else {
  console.log(`Invalid command.
Usage: bun --sync | --generate | --offload`)
}

