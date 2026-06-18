#!/usr/bin/env -S node --import tsx

/**
 * Checks that the marketing/display version string is consistent across
 * package.json, Android build.gradle.kts, iOS Info.plist, and macOS Info.plist.
 *
 * Build codes (versionCode, CFBundleVersion) are allowed to differ since they
 * use platform-specific formats.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VersionEntry {
  file: string;
  version: string;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function extractPlistString(content: string, key: string): string | undefined {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
  const match = re.exec(content);
  return match?.[1];
}

function extractGradleVersionName(content: string): string | undefined {
  const match = /versionName\s*=\s*"([^"]+)"/.exec(content);
  return match?.[1];
}

function main() {
  const entries: VersionEntry[] = [];
  const missing: string[] = [];

  // package.json
  const pkgPath = resolve("package.json");
  try {
    const pkg = readJson(pkgPath);
    if (typeof pkg.version === "string") {
      entries.push({ file: "package.json", version: pkg.version });
    } else {
      missing.push("package.json (no version field)");
    }
  } catch {
    missing.push("package.json (not found)");
  }

  // Android
  const gradlePath = resolve("apps/android/app/build.gradle.kts");
  try {
    const gradle = readFileSync(gradlePath, "utf8");
    const ver = extractGradleVersionName(gradle);
    if (ver) {
      entries.push({ file: "apps/android/app/build.gradle.kts", version: ver });
    } else {
      missing.push("build.gradle.kts (no versionName)");
    }
  } catch {
    missing.push("build.gradle.kts (not found)");
  }

  // iOS
  const iosPlistPath = resolve("apps/ios/Sources/Info.plist");
  try {
    const plist = readFileSync(iosPlistPath, "utf8");
    const ver = extractPlistString(plist, "CFBundleShortVersionString");
    if (ver) {
      entries.push({ file: "apps/ios/Sources/Info.plist", version: ver });
    } else {
      missing.push("iOS Info.plist (no CFBundleShortVersionString)");
    }
  } catch {
    missing.push("iOS Info.plist (not found)");
  }

  // macOS
  const macosPlistPath = resolve("apps/macos/Sources/OpenClaw/Resources/Info.plist");
  try {
    const plist = readFileSync(macosPlistPath, "utf8");
    const ver = extractPlistString(plist, "CFBundleShortVersionString");
    if (ver) {
      entries.push({ file: "apps/macos/Sources/OpenClaw/Resources/Info.plist", version: ver });
    } else {
      missing.push("macOS Info.plist (no CFBundleShortVersionString)");
    }
  } catch {
    missing.push("macOS Info.plist (not found)");
  }

  // Report
  if (entries.length === 0) {
    console.error("version-consistency: no version entries found.");
    process.exit(1);
  }

  const canonical = entries[0].version;
  const mismatches = entries.filter((e) => e.version !== canonical);

  console.log(`version-consistency: canonical version = ${canonical}`);
  for (const entry of entries) {
    const status = entry.version === canonical ? "OK" : "MISMATCH";
    console.log(`  ${status}  ${entry.file} → ${entry.version}`);
  }

  if (missing.length > 0) {
    console.log("  Skipped (not found):");
    for (const m of missing) {
      console.log(`    - ${m}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `\nversion-consistency: ${mismatches.length} mismatch(es) found. All platforms must match ${canonical}.`,
    );
    process.exit(1);
  }

  console.log("\nversion-consistency: all versions match.");
}

main();
