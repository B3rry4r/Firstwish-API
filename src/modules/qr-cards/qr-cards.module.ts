import { Module } from "@nestjs/common";
import { PriceBookModule } from "../price-book/price-book.module";
import { ServerFilesModule } from "../server-files/server-files";
import { QrCardsController } from "./qr-cards.controller";
import { QrCardsService } from "./qr-cards.service";

/** The QR card (B19, E-141). */
@Module({ imports: [PriceBookModule, ServerFilesModule], controllers: [QrCardsController], providers: [QrCardsService], exports: [QrCardsService] })
export class QrCardsModule {}
