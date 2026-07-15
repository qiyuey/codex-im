#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CACHEBUSTER_PATTERN = /^[0-9A-Za-z.-]+$/;

export function nextVersion(version, cachebuster) {
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("plugin manifest version must be a non-empty string");
  }
  if (!CACHEBUSTER_PATTERN.test(cachebuster)) {
    throw new Error("cachebuster must contain only letters, digits, dots, and hyphens");
  }

  const baseVersion = version.split("+", 1)[0];
  if (!baseVersion) throw new Error("plugin manifest version must have a base version");
  return `${baseVersion}+codex.${cachebuster}`;
}

export function utcCachebuster(now = new Date()) {
  return now
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}

export async function updateCachebuster(pluginRoot, cachebuster = utcCachebuster()) {
  const manifestPath = resolve(pluginRoot, ".codex-plugin", "plugin.json");
  const source = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(source);
  const previousVersion = manifest.version;
  const version = nextVersion(previousVersion, cachebuster);
  const versionProperties = [...source.matchAll(/"version"\s*:/g)];
  if (versionProperties.length !== 1) {
    throw new Error("plugin manifest must contain exactly one version property");
  }
  const updatedSource = source.replace(
    /("version"\s*:\s*)"[^"\\]*(?:\\.[^"\\]*)*"/,
    `$1${JSON.stringify(version)}`,
  );

  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, updatedSource, "utf8");
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return { manifestPath, previousVersion, version };
}

function parseArguments(argv) {
  let pluginRoot = ".";
  let cachebuster;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cachebuster") {
      cachebuster = argv[index + 1];
      if (!cachebuster) throw new Error("--cachebuster requires a value");
      index += 1;
    } else if (argument?.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      pluginRoot = argument;
    }
  }

  return { pluginRoot, cachebuster };
}

async function main() {
  const { pluginRoot, cachebuster } = parseArguments(process.argv.slice(2));
  const result = await updateCachebuster(pluginRoot, cachebuster);
  process.stdout.write(`${result.previousVersion} -> ${result.version}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
