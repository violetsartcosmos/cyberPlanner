import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, mkdtemp, readdir, realpath, rmdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function findSevenZip() {
  const candidates = [
    "7z",
    "7zz",
    ...(process.platform === "win32" && process.env.ProgramFiles
      ? [join(process.env.ProgramFiles, "7-Zip", "7z.exe")]
      : []),
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["i"], { stdio: "ignore" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("7-Zip was not found. Install 7-Zip and make 7z or 7zz available on PATH.");
}

function runSevenZip(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`7-Zip failed (exit ${result.status ?? "unknown"}): ${(result.stderr || result.stdout).trim()}`);
  }
}

export async function backupBooks(source, destination, executable = findSevenZip()) {
  source = resolve(source);
  destination = resolve(destination);
  const requestedLocation = relative(source, destination);
  if (!requestedLocation || (!requestedLocation.startsWith(`..${sep}`) && requestedLocation !== ".." && !isAbsolute(requestedLocation))) {
    throw new Error("The backup destination must be outside the source folder.");
  }
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("The source must be a regular directory, not a link.");
  async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("The source folder contains a symbolic link. Remove it before creating a backup.");
      if (entry.isDirectory()) await checkDirectory(join(directory, entry.name));
      else if (!entry.isFile()) throw new Error("The source folder contains a non-file item that cannot be safely backed up.");
    }
  }
  await checkDirectory(source);
  await mkdir(destination, { recursive: true });
  const insideSource = relative(await realpath(source), await realpath(destination));
  if (!insideSource || (!insideSource.startsWith(`..${sep}`) && insideSource !== ".." && !isAbsolute(insideSource))) {
    throw new Error("The backup destination must be outside the source folder.");
  }
  const staging = await mkdtemp(join(destination, ".building-"));
  const temporaryArchive = join(staging, "library.7z");
  try {
    runSevenZip(executable, ["a", "-t7z", "-mx=9", "-m0=lzma2", "-mmt=2", "-bso0", "-bsp0", temporaryArchive, basename(source)], dirname(source));
    runSevenZip(executable, ["t", "-bso0", "-bsp0", temporaryArchive], dirname(source));
    const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
    const output = join(destination, `${basename(source)}-${timestamp}-${randomBytes(4).toString("hex")}.7z`);
    try {
      await link(temporaryArchive, output);
    } catch (error) {
      if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(error.code)) throw error;
      await copyFile(temporaryArchive, output, constants.COPYFILE_EXCL);
    }
    return { path: output, bytes: (await stat(output)).size };
  } finally {
    try {
      await unlink(temporaryArchive);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rmdir(staging);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const source = process.argv[2] ?? "ebooks";
    if ((source !== "ebooks" && source !== "audiblebooks") || process.argv.length > 3) {
      throw new Error("Choose either ebooks or audiblebooks as the source.");
    }
    console.log("Creating and verifying a maximum-compression 7z snapshot. This may take a while.");
    const result = await backupBooks(source, "ebook-backups");
    console.log(`Created ${result.path} (${(result.bytes / 1024 ** 3).toFixed(2)} GiB).`);
  } catch (error) {
    console.error(`Book backup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
