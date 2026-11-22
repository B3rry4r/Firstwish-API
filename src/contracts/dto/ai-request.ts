// Request validation for ai-request endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { Allow, IsArray, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { PostAiLetterBody, PostAiPickPhotosBody, PostAiReasonsBody, PostAiStudioChangeBody, PostAiStudioDraftBody } from "../types";

/** E-12 POST /v1/ai/letter (body). */
export class PostAiLetterBodyDto implements PostAiLetterBody {
  @IsString()
  transcript!: string;
  @IsOptional()
  @IsString()
  voiceFileId?: string;
  @IsString()
  wishId!: string;
}

/** E-13 POST /v1/ai/pick-photos (body). */
export class PostAiPickPhotosBodyDto implements PostAiPickPhotosBody {
  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];
  @IsString()
  wishId!: string;
}

/** E-14 POST /v1/ai/reasons (body). */
export class PostAiReasonsBodyDto implements PostAiReasonsBody {
  @IsString()
  transcript!: string;
  @IsOptional()
  @IsString()
  voiceFileId?: string;
  @IsString()
  wishId!: string;
}

/** E-15 POST /v1/ai/studio-change (body). */
export class PostAiStudioChangeBodyDto implements PostAiStudioChangeBody {
  @IsOptional()
  @IsString()
  ask?: string;
  @IsOptional()
  @IsString()
  @MaxLength(240)
  instruction?: string;
  @IsOptional()
  @Allow()
  style?: unknown;
  @IsOptional()
  @IsString()
  styleId?: string;
  @IsOptional()
  @IsObject()
  target?: Record<string, unknown>;
}

/** E-16 POST /v1/ai/studio-draft (body). */
export class PostAiStudioDraftBodyDto implements PostAiStudioDraftBody {
  @IsOptional()
  @IsString()
  base?: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @Allow()
  made?: unknown;
  @IsOptional()
  @IsString()
  prompt?: string;
  @IsOptional()
  @IsString()
  styleId?: string;
}
