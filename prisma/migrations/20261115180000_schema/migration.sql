-- CreateEnum
CREATE TYPE "AccountSides" AS ENUM ('person', 'creator', 'business');

-- CreateEnum
CREATE TYPE "AccountSpace" AS ENUM ('me', 'business', 'creator');

-- CreateEnum
CREATE TYPE "AiRequestKind" AS ENUM ('letter-from-voice', 'reasons-from-voice', 'photo-pick', 'studio-draft', 'studio-change');

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('queued', 'done', 'failed');

-- CreateEnum
CREATE TYPE "AuditEntryActorType" AS ENUM ('staff', 'account', 'system');

-- CreateEnum
CREATE TYPE "AuthCodeChannel" AS ENUM ('sms', 'whatsapp', 'email');

-- CreateEnum
CREATE TYPE "AuthCodePurpose" AS ENUM ('sign-in', 'confirm-phone', 'confirm-email', 'staff-sign-in');

-- CreateEnum
CREATE TYPE "AuthCodeMode" AS ENUM ('up', 'in');

-- CreateEnum
CREATE TYPE "AuthCodeVia" AS ENUM ('phone', 'email');

-- CreateEnum
CREATE TYPE "BanScope" AS ENUM ('publishing', 'account');

-- CreateEnum
CREATE TYPE "ClientWishSet" AS ENUM ('proofs', 'finals');

-- CreateEnum
CREATE TYPE "ConciergeOrderKind" AS ENUM ('single', 'list');

-- CreateEnum
CREATE TYPE "ConciergeOrderStatus" AS ENUM ('brief', 'quoted', 'paid', 'making', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "EventName" AS ENUM ('preview-started', 'preview-finished', 'paid', 'opened', 'kept', 'published', 'style-previewed', 'plan-bought', 'pass-bought', 'vault-billed', 'concierge-paid', 'creator-plan-bought');

-- CreateEnum
CREATE TYPE "EventLine" AS ENUM ('tickets', 'extras', 'keeps', 'pass', 'pro', 'vault', 'concierge', 'creator');

-- CreateEnum
CREATE TYPE "ExternalIdentityProvider" AS ENUM ('google');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('open-wish', 'rest-wish', 'erase-wish', 'restore-window-end', 'erase-now', 'send-notice', 'send-message', 'make-image-sizes', 'screen-file', 'render-video', 'make-qr-card', 'abandon-payment', 'reconcile-ledger', 'pass-period', 'plan-period', 'creator-period', 'vault-billing', 'royalty-accrual', 'payout-run', 'style-level-review', 'upload-cleanup');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('scheduled', 'running', 'succeeded', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "JobRunOutcome" AS ENUM ('succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "LedgerEntryAccount" AS ENUM ('customer-cash', 'provider-clearing', 'revenue-tickets', 'revenue-extras', 'revenue-keeps', 'revenue-pass', 'revenue-pro', 'revenue-vault', 'revenue-concierge', 'revenue-creator', 'vat-payable', 'provider-fees', 'refunds', 'royalties-payable', 'payouts');

-- CreateEnum
CREATE TYPE "LedgerEntryDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "LedgerEntryCurrency" AS ENUM ('NGN');

-- CreateEnum
CREATE TYPE "MessageDeliveryChannel" AS ENUM ('email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "MessageDeliveryPurpose" AS ENUM ('auth-code', 'wish-delivery', 'opened', 'term-notice', 'anniversary', 'date-reminder', 'publish-notice', 'pass', 'plan', 'invite', 'receipt', 'support');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'undeliverable');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('opened', 'term-ends-soon', 'anniversary', 'date-reminder-7d', 'date-reminder-1d', 'pass-ends-soon', 'pass-ended', 'plan-renewal', 'plan-ended', 'publish-notice');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('scheduled', 'sent', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('ticket', 'extra', 'upgrade', 'keep', 'pass', 'pro-plan', 'wish-pack', 'vault-space', 'concierge', 'creator-plan', 'signed', 'credit-pack', 'extra-review');

-- CreateEnum
CREATE TYPE "PaymentCurrency" AS ENUM ('NGN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('started', 'pending', 'succeeded', 'failed', 'abandoned', 'refunded', 'partly-refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('paystack');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'sent', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "PublishRequestLevel" AS ENUM ('public-link', 'now-showing');

-- CreateEnum
CREATE TYPE "PublishRequestScreening" AS ENUM ('pass', 'review', 'reject');

-- CreateEnum
CREATE TYPE "PublishRequestStatus" AS ENUM ('waiting', 'approved', 'refused', 'withdrawn');

-- CreateEnum
CREATE TYPE "PublishRequestDecision" AS ENUM ('approve', 'decline');

-- CreateEnum
CREATE TYPE "QrCardKind" AS ENUM ('wish-card', 'table-card');

-- CreateEnum
CREATE TYPE "QrCardStatus" AS ENUM ('queued', 'done', 'failed');

-- CreateEnum
CREATE TYPE "ReactionReaction" AS ENUM ('love', 'joy', 'clap', 'wow');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('matched', 'mismatch');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('delivery-failed', 'duplicate', 'staff-decision', 'chargeback');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('requested', 'approved', 'sent', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "RenderJobKind" AS ENUM ('status-video', 'premiere-clip', 'keepsake-export');

-- CreateEnum
CREATE TYPE "RenderJobStatus" AS ENUM ('queued', 'rendering', 'done', 'failed');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('this-is-me', 'abuse', 'child', 'copyright', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'upheld', 'dismissed');

-- CreateEnum
CREATE TYPE "ReportDecision" AS ENUM ('take_down', 'keep', 'ban');

-- CreateEnum
CREATE TYPE "RevealLinkSet" AS ENUM ('proofs', 'finals');

-- CreateEnum
CREATE TYPE "RoyaltyAccrualBasis" AS ENUM ('premium-style', 'pro-wish', 'template-share');

-- CreateEnum
CREATE TYPE "ScreeningResultVerdict" AS ENUM ('pass', 'review', 'reject');

-- CreateEnum
CREATE TYPE "ScreeningResultFinalVerdict" AS ENUM ('pass', 'reject');

-- CreateEnum
CREATE TYPE "StaffAccountRoles" AS ENUM ('owner', 'ops', 'moderator', 'reviewer', 'support', 'finance', 'maker');

-- CreateEnum
CREATE TYPE "StaffAccountStatus" AS ENUM ('invited', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "StoredFilePurpose" AS ENUM ('wish-photo', 'voice-note', 'video-clip', 'vault-file', 'studio-asset', 'brand-logo', 'render', 'qr-card', 'export');

-- CreateEnum
CREATE TYPE "StoredFileStatus" AS ENUM ('pending', 'uploaded', 'screening', 'ready', 'rejected', 'deleted');

-- CreateEnum
CREATE TYPE "StoredFileDriver" AS ENUM ('r2', 'spaces');

-- CreateEnum
CREATE TYPE "StyleLevelLevel" AS ENUM ('starter', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "StyleSubmissionStatus" AS ENUM ('review', 'returned', 'live');

-- CreateEnum
CREATE TYPE "StyleSubmissionLevel" AS ENUM ('standard', 'premium');

-- CreateEnum
CREATE TYPE "StyleSubmissionDecision" AS ENUM ('approve', 'return');

-- CreateEnum
CREATE TYPE "SupportMessageFrom" AS ENUM ('customer', 'staff');

-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('open', 'waiting', 'closed');

-- CreateEnum
CREATE TYPE "SupportThreadPriority" AS ENUM ('normal', 'priority');

-- CreateEnum
CREATE TYPE "WishStatus" AS ENUM ('draft', 'sealed', 'live', 'resting', 'removed');

-- CreateEnum
CREATE TYPE "WishTicket" AS ENUM ('moment', 'keepsake', 'signature', 'premiere');

-- CreateEnum
CREATE TYPE "WishKeptBy" AS ENUM ('pass', 'now-showing', 'pro-plan', 'keep');

-- CreateEnum
CREATE TYPE "WishKeep" AS ENUM ('month', 'half', 'year');

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "contact" TEXT,
    "sides" "AccountSides"[] DEFAULT ARRAY[]::"AccountSides"[],
    "lastSide" TEXT NOT NULL,
    "bio" TEXT,
    "business" TEXT,
    "creator" BOOLEAN,
    "dates" JSONB,
    "handle" TEXT,
    "phone" TEXT,
    "pro" JSONB,
    "side" JSONB,
    "space" "AccountSpace",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" "AiRequestKind" NOT NULL,
    "inputFileId" TEXT,
    "transcript" TEXT,
    "output" JSONB,
    "creditsSpent" INTEGER NOT NULL,
    "status" "AiRequestStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ask" TEXT,
    "base" TEXT,
    "description" TEXT,
    "fileIds" JSONB,
    "instruction" TEXT,
    "made" JSONB,
    "prompt" TEXT,
    "styleId" UUID,
    "target" JSONB,
    "voiceFileId" TEXT,
    "wishId" UUID,

    CONSTRAINT "ai_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_date" (
    "id" UUID NOT NULL,
    "key" TEXT,

    CONSTRAINT "approved_date_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entry" (
    "id" UUID NOT NULL,
    "actorType" "AuditEntryActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_code" (
    "id" UUID NOT NULL,
    "channel" "AuthCodeChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "AuthCodePurpose" NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "AuthCodeMode",
    "via" "AuthCodeVia",

    CONSTRAINT "auth_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ban" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "scope" "BanScope" NOT NULL,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMPTZ(3),
    "by" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" UUID NOT NULL,
    "accountNumber" TEXT,
    "bankCode" TEXT,
    "creatorId" UUID,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business" (
    "id" UUID NOT NULL,
    "allowance" INTEGER,
    "brand" JSONB,
    "business" TEXT,
    "invoices" BIGINT,
    "logins" JSONB,
    "month" TEXT,
    "name" TEXT,
    "ownerName" TEXT,
    "pack" INTEGER,
    "packEnds" TIMESTAMPTZ(3),
    "person" TEXT,
    "plan" TEXT,
    "record" JSONB,
    "renews" TIMESTAMPTZ(3),
    "rolled" INTEGER,
    "since" TIMESTAMPTZ(3),
    "used" INTEGER,
    "vault" BIGINT,
    "vaultUsedGb" INTEGER,
    "wishes" JSONB,
    "accountId" UUID,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_spec" (
    "id" UUID NOT NULL,
    "ask" JSONB,
    "heading" TEXT,
    "line" TEXT,
    "rule" TEXT,
    "title" TEXT,
    "type" JSONB,
    "why" TEXT,

    CONSTRAINT "chapter_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_wish" (
    "id" UUID NOT NULL,
    "client" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "from" TEXT,
    "hearts" JSONB,
    "key" TEXT,
    "kind" TEXT,
    "madeOwn" BOOLEAN,
    "no" TEXT,
    "occasion" TEXT,
    "openedAt" TIMESTAMPTZ(3),
    "reveal" JSONB,
    "sample" BOOLEAN,
    "sentAt" TIMESTAMPTZ(3),
    "set" "ClientWishSet",
    "shoot" TEXT,
    "wish" TEXT,
    "businessId" UUID,

    CONSTRAINT "client_wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concierge_order" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "businessId" UUID,
    "kind" "ConciergeOrderKind" NOT NULL,
    "count" INTEGER NOT NULL,
    "rush" BOOLEAN NOT NULL,
    "brief" TEXT NOT NULL,
    "namesFileId" TEXT,
    "quoteKobo" BIGINT,
    "makerId" TEXT,
    "status" "ConciergeOrderStatus" NOT NULL,
    "deliverBy" TIMESTAMPTZ(3),
    "reportFileId" TEXT,
    "invoiceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "concierge_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator" (
    "id" UUID NOT NULL,
    "counts" JSONB,
    "credits" INTEGER,
    "earned" BIGINT,
    "following" BOOLEAN,
    "handle" TEXT,
    "house" BOOLEAN,
    "href" TEXT,
    "img" TEXT,
    "line" TEXT,
    "name" TEXT,
    "own" BOOLEAN,
    "person" TEXT,
    "plan" TEXT,
    "signed" BOOLEAN,
    "styles" JSONB,
    "accountId" UUID,

    CONSTRAINT "creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_state" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "credits" INTEGER,
    "extraReviews" INTEGER,
    "on" BOOLEAN,
    "packs" INTEGER,
    "periodEndsAt" TIMESTAMPTZ(3),
    "plan" TEXT,
    "renews" TIMESTAMPTZ(3),
    "reviewsLeft" INTEGER,
    "signed" BOOLEAN,

    CONSTRAINT "creator_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_row" (
    "id" UUID NOT NULL,
    "count" INTEGER,
    "date" TIMESTAMPTZ(3),
    "days" INTEGER,
    "for" JSONB,
    "key" TEXT,
    "name" TEXT,
    "person" JSONB,
    "what" TEXT,
    "who" TEXT,
    "years" INTEGER,
    "accountId" UUID,

    CONSTRAINT "date_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_pick" (
    "id" UUID NOT NULL,
    "date" TIMESTAMPTZ(3),
    "pick" JSONB,
    "wish" TEXT,

    CONSTRAINT "day_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ending_purpose" (
    "id" UUID NOT NULL,
    "line" TEXT,
    "name" TEXT,

    CONSTRAINT "ending_purpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "tickets" JSONB NOT NULL,
    "keepsakeExtrasCeilingKobo" BIGINT NOT NULL,
    "passWishes" INTEGER NOT NULL,
    "passUpgrades" INTEGER NOT NULL,
    "conciergePassDiscountPercent" INTEGER NOT NULL,
    "vatRate" TEXT NOT NULL,
    "creator" JSONB NOT NULL,
    "pro" JSONB NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL,
    "name" "EventName" NOT NULL,
    "accountId" UUID,
    "wishId" UUID,
    "styleSlug" TEXT,
    "kind" TEXT,
    "amountKobo" BIGINT,
    "line" "EventLine",
    "at" TIMESTAMPTZ(3) NOT NULL,
    "props" JSONB,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "provider" "ExternalIdentityProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnTo" TEXT,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow" (
    "id" UUID NOT NULL,
    "handle" TEXT,
    "accountId" UUID,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "amount" BIGINT,
    "date" TIMESTAMPTZ(3),
    "key" TEXT,
    "lines" JSONB,
    "no" TEXT,
    "vat" BIGINT,
    "what" TEXT,
    "businessId" UUID,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "JobStatus" NOT NULL,
    "attempts" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_run" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "outcome" "JobRunOutcome" NOT NULL,
    "error" TEXT,
    "changed" JSONB,

    CONSTRAINT "job_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "journalId" TEXT NOT NULL,
    "account" "LedgerEntryAccount" NOT NULL,
    "direction" "LedgerEntryDirection" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" "LedgerEntryCurrency" NOT NULL,
    "paymentId" UUID,
    "refundId" UUID,
    "payoutId" UUID,
    "memo" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_config" (
    "id" UUID NOT NULL,
    "HOLD_DAYS" INTEGER,
    "KEEPS" BIGINT,
    "OFF" INTEGER,
    "OFF_LINE" JSONB,
    "RESTORE_DAYS" INTEGER,
    "TERM_DAYS" JSONB,
    "eraseWithin" TEXT,
    "friendMessagesMax" INTEGER,
    "keepsakeExtrasCeiling" BIGINT,
    "maxPhotos" INTEGER,
    "noticeBeforeTermEnds" TEXT,
    "restingHoldMonths" INTEGER,
    "restoreWindow" TEXT,
    "restoreWindowDays" INTEGER,
    "termRestWindow" TEXT,

    CONSTRAINT "lifecycle_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login" (
    "id" UUID NOT NULL,
    "contact" TEXT,
    "status" TEXT,
    "businessId" UUID,

    CONSTRAINT "login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_delivery" (
    "id" UUID NOT NULL,
    "templateKey" TEXT NOT NULL,
    "channel" "MessageDeliveryChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "purpose" "MessageDeliveryPurpose" NOT NULL,
    "status" "MessageDeliveryStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL,
    "costKobo" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" TEXT,
    "vars" JSONB,

    CONSTRAINT "message_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_template" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "approvedRef" TEXT,

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment" (
    "id" UUID NOT NULL,
    "dimension" TEXT,
    "fields" JSONB,
    "from" TEXT,
    "kind" TEXT,
    "kinds" JSONB,
    "level" TEXT,
    "line" TEXT,
    "name" TEXT,
    "occasions" JSONB,
    "quiet" BOOLEAN,
    "serves" JSONB,
    "slug" TEXT,
    "source" JSONB,
    "tags" JSONB,

    CONSTRAINT "moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice" (
    "id" UUID NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "accountId" UUID,
    "wishId" UUID,
    "dateRowId" UUID,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "NoticeStatus" NOT NULL,
    "deliveryId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT,
    "key" TEXT,
    "subject" TEXT,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_prefs" (
    "id" UUID NOT NULL,
    "channel" TEXT,
    "muted" JSONB,
    "accountId" UUID,

    CONSTRAINT "notice_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_def" (
    "id" UUID NOT NULL,
    "fields" JSONB,
    "line" TEXT,
    "lock" TEXT,
    "name" TEXT,

    CONSTRAINT "opening_def_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pass_membership" (
    "id" UUID NOT NULL,
    "amount" BIGINT,
    "since" TIMESTAMPTZ(3),
    "upgradesUsed" INTEGER,
    "validUntil" JSONB,
    "way" TEXT,
    "wishesUsed" INTEGER,
    "accountId" UUID,

    CONSTRAINT "pass_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "businessId" UUID,
    "payerContact" TEXT,
    "purpose" "PaymentPurpose" NOT NULL,
    "subjectId" TEXT,
    "lines" JSONB NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" "PaymentCurrency" NOT NULL,
    "priceBookVersion" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "channel" TEXT,
    "feeKobo" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "options" JSONB,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "providerReference" TEXT,
    "bankAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "birthday" TIMESTAMPTZ(3),
    "name" TEXT,
    "phone" TEXT,
    "rows" JSONB,
    "start" TIMESTAMPTZ(3),
    "team" TEXT,
    "businessId" UUID,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "listKobo" BIGINT NOT NULL,
    "promoKobo" BIGINT,
    "discountable" BOOLEAN NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "key" TEXT,
    "value" BIGINT,

    CONSTRAINT "price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_book_version" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prices" JSONB,

    CONSTRAINT "price_book_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "appliesTo" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "line" TEXT,
    "name" TEXT,
    "state" JSONB,
    "who" TEXT,

    CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_request" (
    "id" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "level" "PublishRequestLevel" NOT NULL,
    "publicChapters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentConfirmed" BOOLEAN NOT NULL,
    "screening" "PublishRequestScreening" NOT NULL,
    "receiverNotifiedAt" TIMESTAMPTZ(3),
    "receiverRefusedAt" TIMESTAMPTZ(3),
    "status" "PublishRequestStatus" NOT NULL,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consent" BOOLEAN,
    "decision" "PublishRequestDecision",

    CONSTRAINT "publish_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_wish" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3),
    "counts" JSONB,
    "creator" JSONB,
    "date" TIMESTAMPTZ(3),
    "decided" JSONB,
    "featured" BOOLEAN,
    "forName" TEXT,
    "from" TEXT,
    "href" TEXT,
    "img" TEXT,
    "kind" TEXT,
    "listedAt" TIMESTAMPTZ(3),
    "mine" JSONB,
    "name" TEXT,
    "no" TEXT,
    "occasion" TEXT,
    "occasionName" TEXT,
    "own" BOOLEAN,
    "pos" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "screen" JSONB,
    "style" TEXT,
    "styleName" TEXT,
    "title" TEXT,
    "wish" TEXT,

    CONSTRAINT "published_wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_card" (
    "id" UUID NOT NULL,
    "wishId" UUID,
    "eventId" UUID,
    "kind" "QrCardKind" NOT NULL,
    "fileId" TEXT,
    "status" "QrCardStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "names" JSONB,
    "wishIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "qr_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction" (
    "id" UUID NOT NULL,
    "reaction" "ReactionReaction",
    "wish" TEXT,
    "accountId" UUID,

    CONSTRAINT "reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "providerTotalKobo" BIGINT NOT NULL,
    "ledgerTotalKobo" BIGINT NOT NULL,
    "differenceKobo" BIGINT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "mismatches" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "providerReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_job" (
    "id" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "kind" "RenderJobKind" NOT NULL,
    "status" "RenderJobStatus" NOT NULL,
    "outputFileId" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "deliveredVia" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "render_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL,
    "wishId" UUID,
    "styleId" UUID,
    "accountId" UUID,
    "reason" "ReportReason" NOT NULL,
    "reporterContact" TEXT,
    "status" "ReportStatus" NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact" TEXT,
    "decision" "ReportDecision",
    "note" TEXT,
    "slug" TEXT,
    "personId" UUID,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reveal_link" (
    "id" UUID NOT NULL,
    "link" TEXT,
    "set" "RevealLinkSet",
    "businessId" UUID,

    CONSTRAINT "reveal_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_access" (
    "id" UUID NOT NULL,
    "role" JSONB,
    "sections" JSONB,

    CONSTRAINT "role_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_accrual" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "styleSlug" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "basis" "RoyaltyAccrualBasis" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "month" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_accrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reply" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "text" TEXT,

    CONSTRAINT "saved_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_wish" (
    "id" UUID NOT NULL,
    "wish" TEXT,
    "accountId" UUID,

    CONSTRAINT "saved_wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_result" (
    "id" UUID NOT NULL,
    "fileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verdict" "ScreeningResultVerdict" NOT NULL,
    "labels" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "finalVerdict" "ScreeningResultFinalVerdict",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "staffId" TEXT,
    "familyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "rotatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "choice" JSONB,
    "key" JSONB,
    "on" BOOLEAN,
    "providers" JSONB,
    "storage" JSONB,
    "switches" JSONB,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share" (
    "id" UUID NOT NULL,
    "style" TEXT,
    "wish" TEXT,
    "accountId" UUID,

    CONSTRAINT "share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shoot" (
    "id" UUID NOT NULL,
    "client" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMPTZ(3),
    "files" JSONB,
    "finals" JSONB,
    "finalsReveal" JSONB,
    "hearts" JSONB,
    "proofs" JSONB,
    "proofsReveal" JSONB,
    "set" JSONB,
    "shoot" TEXT,
    "title" TEXT,
    "businessId" UUID,

    CONSTRAINT "shoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_url" (
    "id" UUID NOT NULL,
    "fileId" TEXT,
    "variant" TEXT,

    CONSTRAINT "signed_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_account" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "StaffAccountRoles"[] DEFAULT ARRAY[]::"StaffAccountRoles"[],
    "status" "StaffAccountStatus" NOT NULL,
    "lastSignInAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_file" (
    "id" UUID NOT NULL,
    "ownerAccountId" TEXT,
    "businessId" UUID,
    "purpose" "StoredFilePurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "status" "StoredFileStatus" NOT NULL,
    "variants" JSONB NOT NULL,
    "driver" "StoredFileDriver" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "fileId" TEXT,
    "kind" JSONB,
    "styleId" UUID,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_prefs" (
    "id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "accountId" UUID,

    CONSTRAINT "studio_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_style" (
    "id" UUID NOT NULL,
    "liveAt" TIMESTAMPTZ(3),
    "status" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "document" JSONB NOT NULL,
    "accountId" UUID,

    CONSTRAINT "studio_style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style" (
    "id" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3),
    "by" TEXT,
    "creator" JSONB,
    "dimension" TEXT,
    "feel" TEXT,
    "get" TEXT,
    "house" BOOLEAN,
    "img" TEXT,
    "kinds" JSONB,
    "level" TEXT,
    "light" BOOLEAN,
    "line" TEXT,
    "look" TEXT,
    "mood" JSONB,
    "motion" TEXT,
    "moves" TEXT,
    "name" TEXT,
    "occasions" JSONB,
    "on" BOOLEAN,
    "orientation" TEXT,
    "pace" TEXT,
    "packaged" BOOLEAN,
    "paid" INTEGER,
    "pos" TEXT,
    "previews" INTEGER,
    "rate" INTEGER,
    "record" JSONB,
    "sample" JSONB,
    "say" TEXT,
    "slug" TEXT,
    "tier" TEXT,

    CONSTRAINT "style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_level" (
    "id" UUID NOT NULL,
    "styleSlug" TEXT NOT NULL,
    "level" "StyleLevelLevel" NOT NULL,
    "since" TIMESTAMPTZ(3) NOT NULL,
    "by" TEXT NOT NULL,
    "reason" TEXT,
    "slug" TEXT,

    CONSTRAINT "style_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_submission" (
    "id" UUID NOT NULL,
    "styleId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "status" "StyleSubmissionStatus" NOT NULL,
    "level" "StyleSubmissionLevel",
    "reviewedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "StyleSubmissionDecision",

    CONSTRAINT "style_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_message" (
    "id" UUID NOT NULL,
    "threadId" TEXT NOT NULL,
    "from" "SupportMessageFrom" NOT NULL,
    "body" TEXT NOT NULL,
    "fileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_thread" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "contact" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportThreadStatus" NOT NULL,
    "assigneeId" TEXT,
    "priority" "SupportThreadPriority" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "body" TEXT,
    "text" TEXT,

    CONSTRAINT "support_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" UUID NOT NULL,
    "base" TEXT,
    "dimension" TEXT,
    "handle" TEXT,
    "house" BOOLEAN,
    "kinds" JSONB,
    "line" TEXT,
    "mood" JSONB,
    "name" TEXT,
    "orientation" TEXT,
    "pace" TEXT,
    "theme" JSONB,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_ticket" (
    "id" UUID NOT NULL,
    "bytes" BIGINT,
    "contentType" TEXT,
    "purpose" TEXT,
    "subjectId" TEXT,

    CONSTRAINT "upload_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_note" (
    "id" UUID NOT NULL,
    "audio" JSONB,
    "data" TEXT,
    "seconds" INTEGER,
    "sound" JSONB,
    "voice" TEXT,
    "wishId" UUID,

    CONSTRAINT "voice_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" JSONB,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "businessId" UUID,
    "status" "WishStatus" NOT NULL,
    "ticket" "WishTicket",
    "kind" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "styleSlug" TEXT NOT NULL,
    "opensAt" TIMESTAMPTZ(3),
    "timeZone" TEXT NOT NULL,
    "weddingDate" DATE,
    "sealedAt" TIMESTAMPTZ(3),
    "openedAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "restingSince" TIMESTAMPTZ(3),
    "keptUntil" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),
    "eraseAfter" TIMESTAMPTZ(3),
    "erasedAt" TIMESTAMPTZ(3),
    "keptBy" "WishKeptBy",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "adds" JSONB,
    "blessing" JSONB,
    "call" TEXT,
    "captions" JSONB,
    "chapter" JSONB,
    "content" JSONB,
    "credits" JSONB,
    "details" JSONB,
    "effect" JSONB,
    "finale" JSONB,
    "keep" "WishKeep",
    "letter" TEXT,
    "links" JSONB,
    "makerNote" JSONB,
    "memory" JSONB,
    "name" TEXT,
    "no" TEXT,
    "note" TEXT,
    "off" BOOLEAN,
    "photos" JSONB,
    "reasons" JSONB,
    "step" INTEGER,
    "studio" TEXT,
    "timeline" JSONB,
    "type" JSONB,
    "voices" JSONB,

    CONSTRAINT "wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_link" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "wishId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_number_sequence" (
    "id" UUID NOT NULL,
    "next" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wish_number_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_open" (
    "id" UUID NOT NULL,
    "slug" TEXT,

    CONSTRAINT "wish_open_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_transition" (
    "id" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "jobRunId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_transition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_contact_key" ON "account"("contact");

-- CreateIndex
CREATE UNIQUE INDEX "account_handle_key" ON "account"("handle");

-- CreateIndex
CREATE INDEX "ai_request_accountId_id_idx" ON "ai_request"("accountId", "id");

-- CreateIndex
CREATE INDEX "ai_request_styleId_id_idx" ON "ai_request"("styleId", "id");

-- CreateIndex
CREATE INDEX "ai_request_wishId_id_idx" ON "ai_request"("wishId", "id");

-- CreateIndex
CREATE INDEX "ai_request_status_id_idx" ON "ai_request"("status", "id");

-- CreateIndex
CREATE INDEX "audit_entry_actorId_id_idx" ON "audit_entry"("actorId", "id");

-- CreateIndex
CREATE INDEX "audit_entry_subjectType_id_idx" ON "audit_entry"("subjectType", "id");

-- CreateIndex
CREATE INDEX "audit_entry_createdAt_id_idx" ON "audit_entry"("createdAt", "id");

-- CreateIndex
CREATE INDEX "ban_accountId_id_idx" ON "ban"("accountId", "id");

-- CreateIndex
CREATE INDEX "bank_account_creatorId_id_idx" ON "bank_account"("creatorId", "id");

-- CreateIndex
CREATE INDEX "business_accountId_id_idx" ON "business"("accountId", "id");

-- CreateIndex
CREATE INDEX "client_wish_businessId_id_idx" ON "client_wish"("businessId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_accountId_id_idx" ON "concierge_order"("accountId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_businessId_id_idx" ON "concierge_order"("businessId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_invoiceId_id_idx" ON "concierge_order"("invoiceId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_status_id_idx" ON "concierge_order"("status", "id");

-- CreateIndex
CREATE INDEX "creator_accountId_id_idx" ON "creator"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_handle_key" ON "creator"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "creator_accountId_key" ON "creator"("accountId");

-- CreateIndex
CREATE INDEX "creator_state_accountId_id_idx" ON "creator_state"("accountId", "id");

-- CreateIndex
CREATE INDEX "date_row_accountId_id_idx" ON "date_row"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "day_pick_date_key" ON "day_pick"("date");

-- CreateIndex
CREATE INDEX "event_accountId_id_idx" ON "event"("accountId", "id");

-- CreateIndex
CREATE INDEX "event_wishId_id_idx" ON "event"("wishId", "id");

-- CreateIndex
CREATE INDEX "external_identity_accountId_id_idx" ON "external_identity"("accountId", "id");

-- CreateIndex
CREATE INDEX "follow_accountId_id_idx" ON "follow"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_accountId_handle_key" ON "follow"("accountId", "handle");

-- CreateIndex
CREATE INDEX "invoice_businessId_id_idx" ON "invoice"("businessId", "id");

-- CreateIndex
CREATE INDEX "job_status_id_idx" ON "job"("status", "id");

-- CreateIndex
CREATE INDEX "job_type_id_idx" ON "job"("type", "id");

-- CreateIndex
CREATE INDEX "job_run_jobId_id_idx" ON "job_run"("jobId", "id");

-- CreateIndex
CREATE INDEX "ledger_entry_paymentId_id_idx" ON "ledger_entry"("paymentId", "id");

-- CreateIndex
CREATE INDEX "ledger_entry_payoutId_id_idx" ON "ledger_entry"("payoutId", "id");

-- CreateIndex
CREATE INDEX "ledger_entry_refundId_id_idx" ON "ledger_entry"("refundId", "id");

-- CreateIndex
CREATE INDEX "ledger_entry_account_id_idx" ON "ledger_entry"("account", "id");

-- CreateIndex
CREATE INDEX "ledger_entry_createdAt_id_idx" ON "ledger_entry"("createdAt", "id");

-- CreateIndex
CREATE INDEX "login_businessId_id_idx" ON "login"("businessId", "id");

-- CreateIndex
CREATE INDEX "message_delivery_status_id_idx" ON "message_delivery"("status", "id");

-- CreateIndex
CREATE INDEX "message_delivery_createdAt_id_idx" ON "message_delivery"("createdAt", "id");

-- CreateIndex
CREATE INDEX "notice_accountId_id_idx" ON "notice"("accountId", "id");

-- CreateIndex
CREATE INDEX "notice_dateRowId_id_idx" ON "notice"("dateRowId", "id");

-- CreateIndex
CREATE INDEX "notice_wishId_id_idx" ON "notice"("wishId", "id");

-- CreateIndex
CREATE INDEX "notice_status_id_idx" ON "notice"("status", "id");

-- CreateIndex
CREATE INDEX "notice_createdAt_id_idx" ON "notice"("createdAt", "id");

-- CreateIndex
CREATE INDEX "notice_prefs_accountId_id_idx" ON "notice_prefs"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_prefs_accountId_key" ON "notice_prefs"("accountId");

-- CreateIndex
CREATE INDEX "pass_membership_accountId_id_idx" ON "pass_membership"("accountId", "id");

-- CreateIndex
CREATE INDEX "payment_accountId_id_idx" ON "payment"("accountId", "id");

-- CreateIndex
CREATE INDEX "payment_businessId_id_idx" ON "payment"("businessId", "id");

-- CreateIndex
CREATE INDEX "payment_status_id_idx" ON "payment"("status", "id");

-- CreateIndex
CREATE INDEX "payment_createdAt_id_idx" ON "payment"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_providerReference_key" ON "payment"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotencyKey_key" ON "payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payout_bankAccountId_id_idx" ON "payout"("bankAccountId", "id");

-- CreateIndex
CREATE INDEX "payout_creatorId_id_idx" ON "payout"("creatorId", "id");

-- CreateIndex
CREATE INDEX "payout_status_id_idx" ON "payout"("status", "id");

-- CreateIndex
CREATE INDEX "person_businessId_id_idx" ON "person"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "price_sku_version_key" ON "price"("sku", "version");

-- CreateIndex
CREATE UNIQUE INDEX "price_book_version_version_key" ON "price_book_version"("version");

-- CreateIndex
CREATE INDEX "publish_request_wishId_id_idx" ON "publish_request"("wishId", "id");

-- CreateIndex
CREATE INDEX "publish_request_status_id_idx" ON "publish_request"("status", "id");

-- CreateIndex
CREATE INDEX "qr_card_eventId_id_idx" ON "qr_card"("eventId", "id");

-- CreateIndex
CREATE INDEX "qr_card_wishId_id_idx" ON "qr_card"("wishId", "id");

-- CreateIndex
CREATE INDEX "qr_card_status_id_idx" ON "qr_card"("status", "id");

-- CreateIndex
CREATE INDEX "reaction_accountId_id_idx" ON "reaction"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_accountId_wish_key" ON "reaction"("accountId", "wish");

-- CreateIndex
CREATE INDEX "reconciliation_status_id_idx" ON "reconciliation"("status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_day_key" ON "reconciliation"("day");

-- CreateIndex
CREATE INDEX "refund_paymentId_id_idx" ON "refund"("paymentId", "id");

-- CreateIndex
CREATE INDEX "refund_status_id_idx" ON "refund"("status", "id");

-- CreateIndex
CREATE INDEX "render_job_wishId_id_idx" ON "render_job"("wishId", "id");

-- CreateIndex
CREATE INDEX "render_job_status_id_idx" ON "render_job"("status", "id");

-- CreateIndex
CREATE INDEX "report_accountId_id_idx" ON "report"("accountId", "id");

-- CreateIndex
CREATE INDEX "report_personId_id_idx" ON "report"("personId", "id");

-- CreateIndex
CREATE INDEX "report_styleId_id_idx" ON "report"("styleId", "id");

-- CreateIndex
CREATE INDEX "report_wishId_id_idx" ON "report"("wishId", "id");

-- CreateIndex
CREATE INDEX "report_status_id_idx" ON "report"("status", "id");

-- CreateIndex
CREATE INDEX "reveal_link_businessId_id_idx" ON "reveal_link"("businessId", "id");

-- CreateIndex
CREATE INDEX "royalty_accrual_creatorId_id_idx" ON "royalty_accrual"("creatorId", "id");

-- CreateIndex
CREATE INDEX "royalty_accrual_paymentId_id_idx" ON "royalty_accrual"("paymentId", "id");

-- CreateIndex
CREATE INDEX "saved_wish_accountId_id_idx" ON "saved_wish"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_wish_accountId_wish_key" ON "saved_wish"("accountId", "wish");

-- CreateIndex
CREATE INDEX "session_accountId_id_idx" ON "session"("accountId", "id");

-- CreateIndex
CREATE INDEX "share_accountId_id_idx" ON "share"("accountId", "id");

-- CreateIndex
CREATE INDEX "shoot_businessId_id_idx" ON "shoot"("businessId", "id");

-- CreateIndex
CREATE INDEX "staff_account_status_id_idx" ON "staff_account"("status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_account_email_key" ON "staff_account"("email");

-- CreateIndex
CREATE INDEX "stored_file_businessId_id_idx" ON "stored_file"("businessId", "id");

-- CreateIndex
CREATE INDEX "stored_file_styleId_id_idx" ON "stored_file"("styleId", "id");

-- CreateIndex
CREATE INDEX "stored_file_status_id_idx" ON "stored_file"("status", "id");

-- CreateIndex
CREATE INDEX "studio_prefs_accountId_id_idx" ON "studio_prefs"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_prefs_accountId_key" ON "studio_prefs"("accountId");

-- CreateIndex
CREATE INDEX "studio_style_accountId_id_idx" ON "studio_style"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "style_slug_key" ON "style"("slug");

-- CreateIndex
CREATE INDEX "style_submission_creatorId_id_idx" ON "style_submission"("creatorId", "id");

-- CreateIndex
CREATE INDEX "style_submission_styleId_id_idx" ON "style_submission"("styleId", "id");

-- CreateIndex
CREATE INDEX "style_submission_status_id_idx" ON "style_submission"("status", "id");

-- CreateIndex
CREATE INDEX "support_thread_accountId_id_idx" ON "support_thread"("accountId", "id");

-- CreateIndex
CREATE INDEX "support_thread_status_id_idx" ON "support_thread"("status", "id");

-- CreateIndex
CREATE INDEX "voice_note_wishId_id_idx" ON "voice_note"("wishId", "id");

-- CreateIndex
CREATE INDEX "webhook_event_eventId_id_idx" ON "webhook_event"("eventId", "id");

-- CreateIndex
CREATE INDEX "webhook_event_createdAt_id_idx" ON "webhook_event"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_eventId_key" ON "webhook_event"("provider", "eventId");

-- CreateIndex
CREATE INDEX "wish_accountId_id_idx" ON "wish"("accountId", "id");

-- CreateIndex
CREATE INDEX "wish_businessId_id_idx" ON "wish"("businessId", "id");

-- CreateIndex
CREATE INDEX "wish_status_id_idx" ON "wish"("status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wish_no_key" ON "wish"("no");

-- CreateIndex
CREATE INDEX "wish_link_wishId_id_idx" ON "wish_link"("wishId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wish_link_slug_key" ON "wish_link"("slug");

-- CreateIndex
CREATE INDEX "wish_transition_jobRunId_id_idx" ON "wish_transition"("jobRunId", "id");

-- CreateIndex
CREATE INDEX "wish_transition_wishId_id_idx" ON "wish_transition"("wishId", "id");

-- CreateIndex
CREATE INDEX "wish_transition_createdAt_id_idx" ON "wish_transition"("createdAt", "id");

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ban" ADD CONSTRAINT "ban_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wish" ADD CONSTRAINT "client_wish_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator" ADD CONSTRAINT "creator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_row" ADD CONSTRAINT "date_row_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login" ADD CONSTRAINT "login_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_dateRowId_fkey" FOREIGN KEY ("dateRowId") REFERENCES "date_row"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_prefs" ADD CONSTRAINT "notice_prefs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_request" ADD CONSTRAINT "publish_request_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_card" ADD CONSTRAINT "qr_card_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_card" ADD CONSTRAINT "qr_card_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_job" ADD CONSTRAINT "render_job_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_link" ADD CONSTRAINT "reveal_link_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_accrual" ADD CONSTRAINT "royalty_accrual_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_accrual" ADD CONSTRAINT "royalty_accrual_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_wish" ADD CONSTRAINT "saved_wish_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share" ADD CONSTRAINT "share_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoot" ADD CONSTRAINT "shoot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prefs" ADD CONSTRAINT "studio_prefs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_style" ADD CONSTRAINT "studio_style_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_submission" ADD CONSTRAINT "style_submission_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_submission" ADD CONSTRAINT "style_submission_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "style"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_thread" ADD CONSTRAINT "support_thread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_note" ADD CONSTRAINT "voice_note_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish" ADD CONSTRAINT "wish_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish" ADD CONSTRAINT "wish_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_link" ADD CONSTRAINT "wish_link_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_transition" ADD CONSTRAINT "wish_transition_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "job_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_transition" ADD CONSTRAINT "wish_transition_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

