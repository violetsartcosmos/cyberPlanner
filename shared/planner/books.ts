export type LibraryBook = {
  path: string;
  title: string;
  format: "epub" | "pdf" | "m4b";
  library?: "audiblebooks";
  storagePath?: string;
};

export type WikipediaDetails = {
  url: string;
  description: string;
  sections?: Array<{ title: string; level: number; text: string }>;
  image: null | {
    url: string;
    page: string;
    title: string;
    author: string;
    license: string;
    cached?: boolean;
  };
};

export type BookBookmark = {
  id: string;
  position: string;
  label: string;
  createdAt: string;
};

export const MAX_WIKIPEDIA_TEXT_LENGTH = 300_000;

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

export function isCommonsFileUrl(value: unknown): value is string {
  return validUrl(value, /^commons\.wikimedia\.org$/, "/wiki/File:");
}

export function isWikipediaDetails(value: unknown): value is WikipediaDetails {
  if (!isRecord(value) || !isWikipediaUrl(value.url) ||
      typeof value.description !== "string" || value.description.length > MAX_WIKIPEDIA_TEXT_LENGTH) return false;
  if (value.sections !== undefined) {
    if (!Array.isArray(value.sections) || value.sections.length > 1000) return false;
    let length = value.description.length;
    for (const section of value.sections) {
      if (!isRecord(section) || typeof section.title !== "string" || !section.title.trim() ||
          section.title.length > 500 || !Number.isInteger(section.level) ||
          typeof section.level !== "number" || section.level < 2 || section.level > 6 ||
          typeof section.text !== "string") return false;
      length += section.title.length + section.text.length;
      if (length > MAX_WIKIPEDIA_TEXT_LENGTH) return false;
    }
  }
  if (value.image === null) return true;
  if (!isRecord(value.image)) return false;
  const image = value.image;
  return validUrl(image.url, /^(upload|thumb)\.wikimedia\.org$/, "/") &&
    (isCommonsFileUrl(image.page) || validUrl(image.page, /^[a-z][a-z0-9-]*\.wikipedia\.org$/, "/wiki/File:")) &&
    [image.title, image.author, image.license].every(
      (field) => typeof field === "string" && field.length > 0 && field.length <= 1000,
    );
}
