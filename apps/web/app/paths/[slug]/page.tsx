import { PathClient } from "./path-client";
export default async function PathPage({ params }: PageProps<"/paths/[slug]">) { const { slug } = await params; return <PathClient slug={slug} />; }
