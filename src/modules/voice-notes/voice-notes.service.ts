import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import type { VoiceNote } from "../../contracts";
import { isUuid } from "../stored-files/file-rules";
import { SignedUrlsService } from "../stored-files/signed-urls.service";

/** VoiceNote: a voice note recorded for a wish; its audio is a StoredFile with the same id. */
@Injectable()
export class VoiceNotesService {
  constructor(
    private readonly db: PrismaService,
    private readonly reads: SignedUrlsService,
  ) {}

  /** E-216: the owner's own voice note; `data` and `audio.url` are a signed GET good for 10 minutes. */
  async get(accountId: string, id: string): Promise<VoiceNote> {
    if (!isUuid(id)) throw AppError.notFound("No such voice note.");
    const note = await this.db.voiceNote.findFirst({
      where: { id, audio: { path: ["fileId"], equals: id } },
    });
    const file = note
      ? await this.db.storedFile.findFirst({ where: { id, ownerAccountId: accountId, purpose: "voice_note", status: { in: ["ready", "screening"] } } })
      : null;
    if (!note || !file) throw AppError.notFound("No such voice note.");
    const read = await this.reads.signedRead({ fileId: id }, { type: "owner", accountId });
    return {
      wishId: note.wishId as string,
      seconds: note.seconds ?? 0,
      sound: note.sound ?? "voice",
      voice: note.voice,
      data: read.url,
      audio: { fileId: id, contentType: file.contentType, status: file.status, url: read.url, expiresAt: read.expiresAt },
    };
  }
}
