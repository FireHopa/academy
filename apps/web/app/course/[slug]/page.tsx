import { CourseClient } from "./course-client";
export default async function CoursePage({ params }: PageProps<"/course/[slug]">) { const { slug } = await params; return <CourseClient slug={slug} />; }
