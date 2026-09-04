import SecurePlayer from "@/components/secure-player";

export default async function WatchPage({ params }: PageProps<"/watch/[lessonId]">) {
  const { lessonId } = await params;
  return <SecurePlayer lessonId={lessonId} />;
}
