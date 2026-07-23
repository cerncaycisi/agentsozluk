#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

function fail(code) {
  process.stderr.write(`RELEASE_ARTIFACT_FAIL code=${code}\n`);
  process.exit(90);
}

const [bundleDirectory, candidateSha] = process.argv.slice(2);
if (!bundleDirectory || !/^[0-9a-f]{40}$/u.test(candidateSha ?? "")) {
  fail("INVALID_ARGUMENTS");
}

const expectedKeys = [
  "format",
  "source_sha",
  "image_ref",
  "image_id",
  "runtime_abi",
  "image_archive",
  "image_sha256",
  "image_bytes",
  "runtime_archive",
  "runtime_sha256",
  "runtime_bytes",
  "total_bytes",
];
const manifestPath = path.join(bundleDirectory, "manifest.env");
let manifestText;
try {
  manifestText = readFileSync(manifestPath, "utf8");
} catch {
  fail("MANIFEST_MISSING");
}
const lines = manifestText.trimEnd().split("\n");
if (lines.length !== expectedKeys.length) fail("MANIFEST_FIELD_COUNT");
const manifest = new Map();
for (const [index, line] of lines.entries()) {
  const separator = line.indexOf("=");
  if (separator <= 0) fail("MANIFEST_SYNTAX");
  const key = line.slice(0, separator);
  const value = line.slice(separator + 1);
  if (key !== expectedKeys[index] || manifest.has(key)) fail("MANIFEST_SCHEMA");
  manifest.set(key, value);
}

const value = (key) => manifest.get(key) ?? fail("MANIFEST_SCHEMA");
if (value("format") !== "agent-sozluk-release-v1") fail("FORMAT_MISMATCH");
if (value("source_sha") !== candidateSha) fail("SOURCE_SHA_MISMATCH");
if (value("image_ref") !== `agent-sozluk:${candidateSha}`) fail("IMAGE_REF_MISMATCH");
if (!/^sha256:[0-9a-f]{64}$/u.test(value("image_id"))) fail("IMAGE_ID_INVALID");
if (value("runtime_abi") !== "linux-x64-glibc-node-abi-127") fail("RUNTIME_ABI_MISMATCH");
if (value("image_archive") !== "app-image.tar.zst") fail("IMAGE_ARCHIVE_INVALID");
if (value("runtime_archive") !== "runtime-release.tar.zst") {
  fail("RUNTIME_ARCHIVE_INVALID");
}
for (const key of ["image_sha256", "runtime_sha256"]) {
  if (!/^[0-9a-f]{64}$/u.test(value(key))) fail("ARCHIVE_HASH_INVALID");
}
for (const key of ["image_bytes", "runtime_bytes", "total_bytes"]) {
  if (!/^[1-9][0-9]*$/u.test(value(key))) fail("ARCHIVE_SIZE_INVALID");
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const imagePath = path.join(bundleDirectory, value("image_archive"));
const runtimePath = path.join(bundleDirectory, value("runtime_archive"));
const checksumPath = path.join(bundleDirectory, "SHA256SUMS");
let imageSize;
let runtimeSize;
try {
  if (lstatSync(bundleDirectory).isSymbolicLink()) fail("BUNDLE_SYMLINK");
  if (lstatSync(manifestPath).isSymbolicLink()) fail("MANIFEST_SYMLINK");
  if (
    lstatSync(imagePath).isSymbolicLink() ||
    lstatSync(runtimePath).isSymbolicLink() ||
    lstatSync(checksumPath).isSymbolicLink()
  ) {
    fail("ARCHIVE_SYMLINK");
  }
  const realBundle = realpathSync(bundleDirectory);
  for (const file of [manifestPath, imagePath, runtimePath, checksumPath]) {
    if (!realpathSync(file).startsWith(`${realBundle}${path.sep}`)) fail("BUNDLE_PATH_ESCAPE");
  }
  imageSize = statSync(imagePath).size;
  runtimeSize = statSync(runtimePath).size;
} catch {
  fail("ARCHIVE_MISSING");
}
if (imageSize !== Number(value("image_bytes"))) fail("IMAGE_SIZE_MISMATCH");
if (runtimeSize !== Number(value("runtime_bytes"))) fail("RUNTIME_SIZE_MISMATCH");
if (imageSize + runtimeSize !== Number(value("total_bytes"))) fail("TOTAL_SIZE_MISMATCH");
if ((await sha256(imagePath)) !== value("image_sha256")) fail("IMAGE_HASH_MISMATCH");
if ((await sha256(runtimePath)) !== value("runtime_sha256")) {
  fail("RUNTIME_HASH_MISMATCH");
}

const checksumText = readFileSync(checksumPath, "utf8");
const expectedChecksumText =
  `${value("image_sha256")}  ${value("image_archive")}\n` +
  `${value("runtime_sha256")}  ${value("runtime_archive")}\n`;
if (checksumText !== expectedChecksumText) fail("CHECKSUM_RECEIPT_MISMATCH");

process.stdout.write(
  JSON.stringify({
    imageId: value("image_id"),
    imagePath,
    runtimeAbi: value("runtime_abi"),
    runtimePath,
    sourceSha: candidateSha,
    totalBytes: imageSize + runtimeSize,
  }),
);
