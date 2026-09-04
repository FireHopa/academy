import { apiFetch } from "./api";

export type ExperienceCourse = {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string | null;
  description?: string | null;
  cardImageUrl?: string | null;
  heroImageUrl?: string | null;
  featured?: boolean;
  categories: Array<{ id: string; name: string; slug: string }>;
  favorite: boolean;
  enrolled: boolean;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  nextLessonId?: string | null;
  lastActivityAt?: string | null;
  durationSec: number;
};

export type LearningPathCard = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  heroImageUrl?: string | null;
  totalCourses: number;
  enrolledCourses: number;
};

export async function toggleFavorite(course: ExperienceCourse) {
  if (course.favorite) {
    await apiFetch(`/experience/favorites/${course.id}`, { method: "DELETE" });
    return false;
  }
  await apiFetch(`/experience/favorites/${course.id}`, { method: "POST" });
  return true;
}

export function formatDuration(totalSec: number) {
  if (!totalSec) return "";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.round((totalSec % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return `${hours}h ${minutes ? `${minutes}min` : ""}`.trim();
}
