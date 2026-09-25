import { IsString, MaxLength } from "class-validator";

export class AttachVideoUrlDto {
  @IsString()
  @MaxLength(1000)
  url!: string;
}
