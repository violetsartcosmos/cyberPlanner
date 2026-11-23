import { isCommonsFileUrl, type WikipediaDetails } from "../../../../shared/planner/books";

export function parseWikipediaExtract(extract: string): Pick<WikipediaDetails, "description" | "sections"> {
  const sections: NonNullable<WikipediaDetails["sections"]> = [];
  const lead: string[] = [];
  let current: { title: string; level: number; lines: string[] } | undefined;
  for (const line of extract.split(/\r?\n/)) {
    const heading = /^(={2,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/.exec(line);
    if (heading) {
      if (current) sections.push({ title: current.title, level: current.level, text: current.lines.join("\n").trim() });
      current = { title: heading[2].trim(), level: heading[1].length, lines: [] };
    } else {
      (current ? current.lines : lead).push(line);
    }
  }
  if (current) sections.push({ title: current.title, level: current.level, text: current.lines.join("\n").trim() });
  return { description: lead.join("\n").trim(), sections };
}

export function commonsFileTitle(value: string): string {
  if (isCommonsFileUrl(value)) {
    const title = decodeURIComponent(new URL(value).pathname.slice("/wiki/".length));
    if (title.slice("File:".length).trim()) return title;
    throw new Error("Enter a Wikimedia Commons file page or image URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a Wikimedia Commons file page or image URL.");
  }
  const parts = url.pathname.split("/");
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname) ||
      parts[1] !== "wikipedia" || parts[2] !== "commons") {
    throw new Error("Enter a Wikimedia Commons file page or image URL.");
  }
  const thumbnail = parts[3] === "thumb";
  const offset = thumbnail ? 4 : 3;
  if (parts.length !== offset + 3 + (thumbnail ? 1 : 0) ||
      !/^[a-f0-9]$/i.test(parts[offset]) || !/^[a-f0-9]{2}$/i.test(parts[offset + 1]) ||
      !parts[offset + 2]) {
    throw new Error("Enter a Wikimedia Commons file page or image URL.");
  }
  return `File:${decodeURIComponent(parts[offset + 2])}`;
}

export function wikipediaImageReference(value: string): { origin: string; title: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a Wikipedia or Wikimedia image URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Enter a Wikipedia or Wikimedia image URL.");
  }
  if (url.hostname === "commons.wikimedia.org") return { origin: url.origin, title: commonsFileTitle(value) };
  if (/^[a-z][a-z0-9-]*\.wikipedia\.org$/.test(url.hostname)) {
    const file = url.hash.startsWith("#/media/File:") ? url.hash.slice("#/media/".length)
      : url.pathname.startsWith("/wiki/File:") ? url.pathname.slice("/wiki/".length) : "";
    if (file && decodeURIComponent(file).slice(5).trim()) return { origin: url.origin, title: decodeURIComponent(file) };
  }
  if (/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname)) {
    const parts = url.pathname.split("/");
    const site = parts[2];
    if (parts[1] === "wikipedia" && /^[a-z][a-z0-9-]*$/.test(site)) {
      const commonsUrl = new URL(value);
      commonsUrl.pathname = url.pathname.replace(`/wikipedia/${site}/`, "/wikipedia/commons/");
      const title = commonsFileTitle(commonsUrl.href);
      return { origin: site === "commons" ? "https://commons.wikimedia.org" : `https://${site}.wikipedia.org`, title };
    }
  }
  throw new Error("Enter a Wikipedia or Wikimedia image URL.");
}
