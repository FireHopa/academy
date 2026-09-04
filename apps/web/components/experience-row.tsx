import Link from "next/link";
import { ExperienceCourse } from "@/lib/experience";
import { ExperienceCourseCard } from "./experience-course-card";
import { GoogleText } from "./google-text";

export function ExperienceRow({ title, items, href }: { title: string; items: ExperienceCourse[]; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="row">
      <div className="row-head"><h2><GoogleText>{title}</GoogleText></h2>{href && <Link href={href}>Ver tudo</Link>}</div>
      <div className="cards experience-cards">
        {items.map(course => <ExperienceCourseCard key={course.id} course={course} />)}
      </div>
    </section>
  );
}
