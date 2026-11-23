export type LibraryBook = {
  path: string;
  title: string;
  format: "epub" | "pdf" | "m4b";
  library?: "audiblebooks";
};

export type WikipediaDetails = {
  url: string;
  description: string;
  image: null | {
    url: string;
    page: string;
    title: string;
    author: string;
    license: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUrl(value: unknown, host: RegExp, path: string) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      host.test(url.hostname) && url.pathname.startsWith(path);
  } catch {
    return false;
  }
}

export function isWikipediaUrl(value: unknown): value is string {
  return validUrl(value, /^[a-z][a-z0-9-]*\.wikipedia\.org$/, "/wiki/");
}

export function isWikipediaDetails(value: unknown): value is WikipediaDetails {
  if (!isRecord(value) || !isWikipediaUrl(value.url) ||
      typeof value.description !== "string" || value.description.length > 10000) return false;
  if (value.image === null) return true;
  if (!isRecord(value.image)) return false;
  const image = value.image;
  return validUrl(image.url, /^(upload|thumb)\.wikimedia\.org$/, "/") &&
    validUrl(image.page, /^commons\.wikimedia\.org$/, "/wiki/File:") &&
    [image.title, image.author, image.license].every(
      (field) => typeof field === "string" && field.length > 0 && field.length <= 1000,
    );
}
