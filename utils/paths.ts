import path from "path";
import fs from "fs";

export function resolvePath(base: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }
  return path.resolve(base, filePath);
}

export function displayPathRelToCwd(filePath: string, cwd?: string): string {
  try {
    const p = path.normalize(filePath);
    if (cwd) {
      const rel = path.relative(cwd, p);
      if (!rel.startsWith("..")) {
        return rel;
      }
    }
    return p;
  } catch {
    return filePath;
  }
}

export function ensureParentDirectory(filePath: string): string {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  return filePath;
}

export function isBinaryFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    fs.closeSync(fd);
    return buffer.subarray(0, bytesRead).includes(0x00);
  } catch {
    return false;
  }
}
