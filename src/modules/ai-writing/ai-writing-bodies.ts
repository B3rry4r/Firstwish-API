import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/**
 * E-12 and E-14 (GC1, DEC-203). A voice file is audio and R13 says no audio reaches the AI (the browser's own dictation gives text).
 * `transcript` is the sender's words as text; `voiceFileId` stays accepted (optional) and is only recorded, never read. These classes
 * keep the checks the generated bodies do not carry (the ids are uuids, the words are capped), over the same fields.
 */
export class AiWordsBodyDto {
  @IsUUID(undefined, { message: "Must be the id of one of your wishes." })
  wishId!: string;

  @IsString({ message: "Must be text." })
  @MaxLength(20000, { message: "Too long." })
  transcript!: string;

  @IsOptional()
  @IsUUID(undefined, { message: "Must be a file id." })
  voiceFileId?: string;
}

/** E-13: the photos to order, by file id; the AI sees only their captions. */
export class AiPickPhotosBodyDto {
  @IsUUID(undefined, { message: "Must be the id of one of your wishes." })
  wishId!: string;

  @IsArray({ message: "Must be a list of file ids." })
  @ArrayMinSize(1, { message: "Send at least one photo." })
  @ArrayMaxSize(50, { message: "At most 50 photos." })
  @IsUUID(undefined, { each: true, message: "Each must be a file id." })
  fileIds!: string[];
}
