const CONTENT_PLACEHOLDERS = [
  "/placeholders/course-blue.webp",
  "/placeholders/course-green.webp",
  "/placeholders/course-amber.webp",
  "/placeholders/course-violet.webp",
] as const;

function seedIndex(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CONTENT_PLACEHOLDERS.length;
}

export function placeholderImage(seed?: string | null) {
  return CONTENT_PLACEHOLDERS[seedIndex(seed?.trim() || "academy-play")];
}

function cssUrl(url: string) {
  return `url(${JSON.stringify(url)})`;
}

/**
 * Keeps the local placeholder as the last CSS layer. If a configured remote
 * image is empty or fails to load, the browser still has a crisp local cover.
 */
export function contentBackgroundImage(
  imageUrl: string | null | undefined,
  seed: string,
  overlays: string[] = [],
) {
  const configuredImage = imageUrl?.trim();
  const layers = [...overlays];
  if (configuredImage) layers.push(cssUrl(configuredImage));
  layers.push(cssUrl(placeholderImage(seed)));
  return layers.join(", ");
}
