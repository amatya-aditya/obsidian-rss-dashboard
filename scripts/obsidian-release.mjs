// Reads Obsidian's own release identity: which desktop app packages exist on
// this machine, and which version each one carries.
//
// The version an Obsidian install runs is not the version of `Obsidian.exe`.
// The executable is permanently the installer's build (1.14.4 here while the
// app ran 1.15.0), because Obsidian ships updates as a downloadable app archive
// (`obsidian-<version>.asar`) that is loaded from the user-data directory at the
// next launch. So "which version is this?" is answered by the asar, not the exe.
//
// Two callers share this module:
//
//   scripts/check-stub-drift.mjs   needs the newest *public* release, downloaded
//   scripts/obsidian-profile.mjs   needs the newest *local* asar, on this machine
//
// Keeping one copy of the release selection and the asar read means the stub
// canary and the test harness cannot disagree about what a version is.
//
//   npm run check:stub-drift                 # newest public stable release
//   node scripts/obsidian-profile.mjs doctor # what this machine actually runs

import { existsSync, readdirSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { extractFile } from "@electron/asar";

/** `1.15.0`, the only shape Obsidian releases use. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * A downloaded app archive in a user-data directory. `*.asar.backup` is the
 * previous build Obsidian keeps beside the current one, and must never be
 * mistaken for it.
 */
export const ASAR_NAME_PATTERN = /^obsidian-(\d+\.\d+\.\d+)\.asar$/;

export const RELEASES_API =
  "https://api.github.com/repos/obsidianmd/obsidian-releases/releases?per_page=100";
export const RELEASE_DOWNLOAD_BASE =
  "https://github.com/obsidianmd/obsidian-releases/releases/download";
export const USER_AGENT = "rss-dashboard-stub-drift";

export class ObsidianReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObsidianReleaseError";
  }
}

/** The release-asset name that carries the desktop asar for `version`. */
export function asarAssetName(version) {
  return `obsidian-${version}.asar.gz`;
}

/** The bare version behind a release tag (`v1.14.4` -> `1.14.4`). */
export function versionFromTag(tag) {
  return String(tag ?? "").replace(/^v/, "");
}

/** The version in an app archive's file name, or undefined for anything else. */
export function asarVersionFromName(name) {
  const match = ASAR_NAME_PATTERN.exec(String(name ?? ""));
  return match ? match[1] : undefined;
}

/** Orders two bare versions numerically, so 1.9.0 sorts below 1.10.0. */
export function compareVersions(a, b) {
  const left = String(a ?? "")
    .split(".")
    .map(Number);
  const right = String(b ?? "")
    .split(".")
    .map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** True when `a` is strictly older than `b`. */
export function isOlder(a, b) {
  return compareVersions(a, b) < 0;
}

/**
 * The newest public stable release that ships a desktop asar.
 *
 * `releases` is the GitHub releases API list, newest first. Drafts and
 * prereleases are skipped, and so is a release with no `obsidian-<v>.asar.gz`
 * asset - the real `v1.13.8` is mobile-only (an APK alone), and the version
 * after it, `v1.13.7`, is the one to pick. Returns `null` when none matches.
 */
export function selectNewestStableRelease(releases) {
  for (const release of releases ?? []) {
    if (!release || release.draft || release.prerelease) {
      continue;
    }
    const version = versionFromTag(release.tag_name);
    const assetName = asarAssetName(version);
    const assets = release.assets ?? [];
    if (assets.some((asset) => asset?.name === assetName)) {
      return {
        version,
        tag: release.tag_name,
        assetName,
        publishedAt: release.published_at ?? "",
      };
    }
  }
  return null;
}

/**
 * Every valid app archive in `directory`, newest first. A missing directory is
 * empty rather than an error: a first run has no profile yet.
 *
 * @param {string} directory
 * @returns {{ version: string, path: string }[]}
 */
export function listLocalAsars(directory) {
  if (!directory || !existsSync(directory)) {
    return [];
  }
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const version = asarVersionFromName(entry.name);
    if (!version) continue;
    found.push({ version, path: join(directory, entry.name) });
  }
  return found.sort((left, right) =>
    compareVersions(right.version, left.version),
  );
}

/** The newest valid app archive in `directory`, or undefined. */
export function newestLocalAsar(directory) {
  return listLocalAsars(directory)[0];
}

/**
 * The version an asar declares for itself, read from its root `package.json`.
 *
 * The file name is only Obsidian's label; this is the archive's own claim, so
 * the two can be compared. Returns undefined when the archive cannot be read,
 * which for a truncated download is the useful answer rather than a throw.
 */
export function readAsarVersion(asarPath) {
  if (!existsSync(asarPath)) {
    return undefined;
  }
  try {
    const text = extractFile(asarPath, "package.json").toString("utf8");
    const parsed = JSON.parse(text);
    const version = String(parsed?.version ?? "");
    return VERSION_PATTERN.test(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Reads any file out of an asar, or undefined when it cannot be read. */
export function readAsarFile(asarPath, name) {
  try {
    return extractFile(asarPath, name).toString("utf8");
  } catch {
    return undefined;
  }
}

/**
 * GETs a URL with Node's `https`, following redirects (GitHub asset downloads
 * redirect to a CDN) and returning the raw body.
 */
export function httpsGet(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } },
      (response) => {
        const { statusCode, headers } = response;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          if (redirectsLeft <= 0) {
            reject(new ObsidianReleaseError(`Too many redirects for ${url}.`));
            return;
          }
          resolve(
            httpsGet(
              new URL(headers.location, url).toString(),
              redirectsLeft - 1,
            ),
          );
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          reject(
            new ObsidianReleaseError(
              `GET ${url} returned ${statusCode} ${response.statusMessage ?? ""}.`,
            ),
          );
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new ObsidianReleaseError(`Timed out requesting ${url}.`));
    });
  });
}

/** The newest public stable release, straight from GitHub. */
export async function fetchNewestRelease() {
  const body = await httpsGet(RELEASES_API);
  let releases;
  try {
    releases = JSON.parse(body.toString("utf8"));
  } catch {
    throw new ObsidianReleaseError("GitHub releases API did not return JSON.");
  }
  const selected = selectNewestStableRelease(releases);
  if (!selected) {
    throw new ObsidianReleaseError(
      "No public stable Obsidian release ships a desktop asar.",
    );
  }
  return selected;
}

/** The gunzipped app archive for `version`, from the public releases. */
export async function downloadReleaseAsar(version) {
  const url = `${RELEASE_DOWNLOAD_BASE}/v${version}/${asarAssetName(version)}`;
  return gunzipSync(await httpsGet(url));
}
