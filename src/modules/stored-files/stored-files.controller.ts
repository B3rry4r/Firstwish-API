import { Body, Controller, Delete, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import {
  DeleteUploadsByIdBodyDto,
  DeleteUploadsByIdParamsDto,
  PostUploadsBodyDto,
  PostUploadsByIdConfirmBodyDto,
  PostUploadsByIdConfirmParamsDto,
  type StoredFile,
  type UploadTicket,
} from "../../contracts";
import { userOf } from "./principal";
import { StoredFilesService } from "./stored-files.service";

/** E-182..E-184: signed uploads straight to storage, then confirm (registry auth: business; creator; signed in, so any side). */
@Controller("uploads")
export class StoredFilesController {
  constructor(private readonly files: StoredFilesService) {}

  /** E-182 */
  @Roles("person", "creator", "business")
  @Post()
  @HttpCode(201)
  ticket(@Body() body: PostUploadsBodyDto, @CurrentPrincipal() p: Principal | undefined, @Headers("x-business-id") business?: string): Promise<UploadTicket> {
    return this.files.createTicket(userOf(p), body, business === undefined ? {} : { business });
  }

  /** E-184 */
  @Roles("person", "creator", "business")
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(
    @Param() params: PostUploadsByIdConfirmParamsDto,
    @Body() body: PostUploadsByIdConfirmBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
  ): Promise<StoredFile> {
    return this.files.confirm(userOf(p), params.id, body.fileId);
  }

  /** E-183 (X20: answers 204, no body) */
  @Roles("person", "creator", "business")
  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param() params: DeleteUploadsByIdParamsDto,
    @Body() body: DeleteUploadsByIdBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
  ): Promise<void> {
    return this.files.remove(userOf(p), params.id, body ?? {});
  }
}
