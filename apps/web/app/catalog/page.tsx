import { CatalogClient } from "./catalog-client";

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const parsedPage = typeof params.page === "string" ? Math.floor(Number(params.page)) : 1;
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  return <CatalogClient initialQuery={q} initialCategory={category} initialPage={page} />;
}
