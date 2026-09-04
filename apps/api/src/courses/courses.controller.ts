import { Controller, Get, Param } from "@nestjs/common";
import { CoursesService } from "./courses.service";
import { Public } from "../auth/public.decorator";

@Public()
@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list() { return this.courses.listPublished(); }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string) { return this.courses.getBySlug(slug); }
}
