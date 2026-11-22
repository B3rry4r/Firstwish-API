// Request validation for bank-account endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { PostBankAccountsBody } from "../types";

/** E-22 POST /v1/bank-accounts (body). */
export class PostBankAccountsBodyDto implements PostBankAccountsBody {
  @IsString()
  accountNumber!: string;
  @IsString()
  bankCode!: string;
}
