import Link from "next/link";
import type { LearningPathCard } from "@/lib/experience";
import { contentBackgroundImage } from "@/lib/placeholders";
import { GoogleText } from "./google-text";

export function PathCard({ path }: { path: LearningPathCard }) {
  const style = { backgroundImage: contentBackgroundImage(path.heroImageUrl, `path:${path.id}`, ["linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.08))"]) };
  return (
    <Link href={`/paths/${path.slug}`} className="path-card" style={style}>
      <div className="path-badge">TRILHA</div>
      <div>
        <h3><GoogleText>{path.title}</GoogleText></h3>
        <p><GoogleText>{path.description}</GoogleText></p>
        <span>{path.totalCourses} cursos · {path.enrolledCourses} na sua biblioteca</span>
      </div>
    </Link>
  );
}
