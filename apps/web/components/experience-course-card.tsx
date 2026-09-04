"use client";

import Link from "next/link";
import { MouseEvent, useState } from "react";
import { ExperienceCourse, toggleFavorite } from "@/lib/experience";
import { contentBackgroundImage } from "@/lib/placeholders";
import { GoogleText } from "./google-text";
import { FEATURES } from "@/lib/features";

export function ExperienceCourseCard({ course, onFavoriteChange }: { course: ExperienceCourse; onFavoriteChange?: (favorite: boolean) => void }) {
  const [favorite, setFavorite] = useState(course.favorite);
  const [busy, setBusy] = useState(false);

  async function favoriteClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const value = await toggleFavorite({ ...course, favorite });
      setFavorite(value);
      onFavoriteChange?.(value);
    } finally {
      setBusy(false);
    }
  }

  const artStyle = {
    backgroundImage: contentBackgroundImage(course.cardImageUrl, course.id || course.slug, [
      "linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.05) 70%)",
    ]),
  };

  return (
    <Link className="experience-card" href={`/course/${course.slug}`}>
      <div className="experience-card-art" style={artStyle}>
        <button className={`favorite-dot ${favorite ? "active" : ""}`} onClick={favoriteClick} disabled={busy} aria-label={favorite ? "Remover da minha lista" : "Adicionar à minha lista"}>{favorite ? "✓" : "+"}</button>
        <div className="experience-card-copy">
          <small><GoogleText>{FEATURES.categoriesAndPaths && course.categories[0]?.name ? course.categories[0].name : course.enrolled ? "Minha biblioteca" : "Curso"}</GoogleText></small>
          <strong><GoogleText>{course.title}</GoogleText></strong>
        </div>
      </div>
      {course.enrolled && course.progressPercent > 0 && (
        <div className="progress-track"><div className="progress-fill" style={{ width: `${course.progressPercent}%` }} /></div>
      )}
      <div className="experience-meta">
        <span>{course.totalLessons} aulas</span>
        {course.enrolled && <span>{course.progressPercent}%</span>}
      </div>
    </Link>
  );
}
