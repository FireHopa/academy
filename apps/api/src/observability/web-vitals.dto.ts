import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

export class WebVitalDto {
  @IsIn(["LCP", "INP", "CLS", "TTFB", "FCP"])
  name!: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  value!: number;

  @IsOptional()
  @IsIn(["good", "needs-improvement", "poor"])
  rating?: "good" | "needs-improvement" | "poor";

  @IsOptional()
  @IsString()
  @MaxLength(180)
  route?: string;
}

export class WebVitalsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WebVitalDto)
  metrics!: WebVitalDto[];
}
