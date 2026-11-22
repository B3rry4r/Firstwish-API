-- API-BASE-11A (DEC-278): the Idempotency-Key of a contact-page start. One row per key (as a hash), with a hash of what was sent and the thread it made.
CREATE TABLE "support_contact_key" (
    "keyHash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "threadId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_contact_key_pkey" PRIMARY KEY ("keyHash")
);

-- AddForeignKey
ALTER TABLE "support_contact_key" ADD CONSTRAINT "support_contact_key_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "support_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
