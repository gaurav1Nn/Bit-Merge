-- CreateEnum
CREATE TYPE "LinkPrecedence" AS ENUM ('primary', 'secondary');

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "linkedId" INTEGER,
    "linkPrecedence" "LinkPrecedence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_phoneNumber_idx" ON "Contact"("phoneNumber");

-- CreateIndex
CREATE INDEX "Contact_linkedId_idx" ON "Contact"("linkedId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_linkedId_fkey" FOREIGN KEY ("linkedId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
