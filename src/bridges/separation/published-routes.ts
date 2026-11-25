import { parse, type DefaultTreeAdapterTypes } from "parse5";
import type { Check, HttpResponse, HttpSuccess } from "../../core/types.js";

/** Well-known paths for developer documentation */
export const DOC_PATHS = [
  "/docs",
  "/developers",
  "/developer",
  "/api/docs",
  "/documentation",
] as const;

export function docPathMatches(url: URL, path: string): boolean {
  return (url.pathname.toLowerCase() + "/").includes(path + "/");
}

export function isDeveloperDocsLink(url: URL): boolean {
  return /^(?:docs|developers?)\.[^.]+\./i.test(url.hostname) || DOC_PATHS.some(path => docPathMatches(url, path));
}

/** Internal observations. Raw link URLs are never serialized in route evidence. */
export interface PublishedSources {
  homeLinks: URL[];
  docs: Array<{ requestedUrl: string; response: HttpResponse }>;
}

export function htmlLinks(body: string, documentUrl?: string): URL[] {
  const document = parse(body);
  const nodes: DefaultTreeAdapterTypes.ChildNode[] = [...document.childNodes].reverse();
  const hrefs = new Set<string>();
  let base: string | undefined;
  while (nodes.length) {
    const element = nodes.pop()!;
    if (!("tagName" in element)) continue;
    if (element.namespaceURI === "http://www.w3.org/1999/xhtml") {
      if (element.tagName === "template") continue;
      if (element.tagName === "a" || element.tagName === "base") {
        const href = element.attrs.find(attribute => attribute.name === "href")?.value;
        if (href !== undefined) {
          if (element.tagName === "base") base ??= URL.parse(href, documentUrl)?.href ?? documentUrl;
          else hrefs.add(href);
        }
      }
    }
    for (let i = element.childNodes.length - 1; i >= 0; --i) nodes.push(element.childNodes[i]);
  }
  const urls = new Map<string, URL>();
  for (const href of hrefs) {
    const url = URL.parse(href, base ?? documentUrl);
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) continue;
    url.hash = "";
    urls.set(url.href, url);
  }
  return [...urls.values()];
}

function safeUrl(url: URL): boolean {
  return !url.search && !url.username && !url.password;
}

function cleanFetch(response: HttpSuccess): boolean {
  return [...response.redirects, response.url].every(raw => safeUrl(new URL(raw)));
}

export function completeRepresentation(response: HttpSuccess): boolean {
  return response.status >= 200 && response.status < 300 && response.status !== 206 &&
    !response.bodyIncomplete && response.headers["content-range"] === undefined;
}

function isCompleteHtml(response: HttpSuccess): boolean {
  return completeRepresentation(response) && response.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "text/html";
}

function docFetchFor(link: URL, docs: PublishedSources["docs"]) {
  return docs.find(({ requestedUrl, response }) => requestedUrl === link.href ||
    (response.ok && (response.url === link.href || response.redirects.includes(link.href))));
}

export function linkedDocWasFetched(sources: PublishedSources, homepage: HttpSuccess): boolean {
  return isCompleteHtml(homepage) && cleanFetch(homepage) && sources.homeLinks.some(link => {
    if (!isDeveloperDocsLink(link) || !safeUrl(link)) return false;
    const doc = docFetchFor(link, sources.docs);
    return doc?.response.ok === true && doc.response.url !== homepage.url &&
      isCompleteHtml(doc.response) && cleanFetch(doc.response);
  });
}

/** Entry paths from the homepage, homepage-linked docs, and a catalog used to verify this contract. */
export function contractRoutes(
  spec: Check | undefined, verifiedUrls: string[], homepage: HttpSuccess | undefined,
  sources: PublishedSources | undefined,
) {
  const documentUrl = spec?.data?.documentUrl;
  if (spec?.status !== "pass" || typeof documentUrl !== "string" || spec.data?.documentHasQuery ||
      !verifiedUrls.includes(documentUrl)) return { capabilities: [], complete: false, catalogVerified: false };

  const routes = new Map<string, { source: string; target: string }>();
  const published = spec.data?.catalogRoute as { source?: string; target?: string } | undefined;
  if (spec.data?.source === "api-catalog" && typeof published?.source === "string" &&
      typeof published.target === "string" && verifiedUrls.includes(published.target)) {
    routes.set(published.source + "\n" + published.target, { source: published.source, target: published.target });
  }
  const catalogVerified = routes.size > 0;
  // A hit at a guessed path proves the contract exists, but supplies no published route.
  const capability = { id: "openapi-description", label: "Discover the OpenAPI contract", routes: [...routes.values()] };
  if (!homepage || !sources || !cleanFetch(homepage) || !isCompleteHtml(homepage)) {
    return { capabilities: [capability], complete: false, catalogVerified };
  }

  let complete = true;
  const targets = new Set(verifiedUrls);
  function inspectLinks(source: string, links: URL[]) {
    for (const link of links) {
      const target = link.origin + link.pathname;
      if (!targets.has(target)) continue;
      if (!safeUrl(link)) { complete = false; continue; }
      routes.set(source + "\n" + target, { source, target });
    }
  }
  const homeSource = new URL(homepage.url);
  inspectLinks(homeSource.origin + homeSource.pathname, sources.homeLinks);

  const readDocs = new Set<string>();
  for (const link of sources.homeLinks) {
    if (!isDeveloperDocsLink(link) || targets.has(link.origin + link.pathname)) continue;
    const doc = docFetchFor(link, sources.docs);
    if (!doc || !safeUrl(link)) { complete = false; continue; }
    if (!doc.response.ok) {
      const status = doc.response.response?.status ?? doc.response.error.statusCode;
      const final = URL.parse(doc.response.error.url);
      if (doc.response.error.kind !== "http_error" || !final || !safeUrl(final) ||
          (status !== 404 && status !== 410)) complete = false;
      continue;
    }
    if (!cleanFetch(doc.response) || !isCompleteHtml(doc.response)) { complete = false; continue; }
    if (doc.response.url === homepage.url || readDocs.has(doc.response.url)) continue;
    readDocs.add(doc.response.url);
    const source = new URL(doc.response.url);
    inspectLinks(source.origin + source.pathname, htmlLinks(doc.response.body, source.href));
  }
  capability.routes = [...routes.values()];
  return { capabilities: [capability], complete, catalogVerified };
}
