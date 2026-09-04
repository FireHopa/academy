function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export const FEATURES = {
  categoriesAndPaths: enabled(process.env.FEATURE_CATEGORIES_AND_PATHS ?? process.env.NEXT_PUBLIC_FEATURE_CATEGORIES_AND_PATHS),
} as const;
