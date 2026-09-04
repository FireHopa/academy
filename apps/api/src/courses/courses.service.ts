import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      select: { id: true, title: true, slug: true, shortDescription: true, cardImageUrl: true, featured: true },
    });
  }

  async getBySlug(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true, title: true, slug: true, shortDescription: true, description: true,
        heroImageUrl: true, cardImageUrl: true, featured: true, publishedAt: true,
        categories: { select: { id: true, name: true, slug: true } },
        modules: {
          orderBy: { position: "asc" },
          select: {
            id: true, title: true, position: true,
            lessons: {
              where: { published: true }, orderBy: { position: "asc" },
              select: { id: true, title: true, description: true, type: true, position: true, durationSec: true, preview: true },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("Curso não encontrado");
    return course;
  }
}
