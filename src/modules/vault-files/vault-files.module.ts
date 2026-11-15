import { Module } from "@nestjs/common";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { VaultFilesController } from "./vault-files.controller";
import { VaultFilesService } from "./vault-files.service";

/** VaultFile (E-214). Uploads are E-182 with purpose vault; bytes are counted into the business's usage at confirm. */
@Module({ imports: [StoredFilesModule], controllers: [VaultFilesController], providers: [VaultFilesService] })
export class VaultFilesModule {}
