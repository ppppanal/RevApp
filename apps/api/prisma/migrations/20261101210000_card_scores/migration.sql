-- CreateTable
CREATE TABLE "CardScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "incorrect" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardScore_userId_idx" ON "CardScore"("userId");

-- CreateIndex
CREATE INDEX "CardScore_flashcardId_idx" ON "CardScore"("flashcardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardScore_userId_flashcardId_key" ON "CardScore"("userId", "flashcardId");

-- AddForeignKey
ALTER TABLE "CardScore" ADD CONSTRAINT "CardScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardScore" ADD CONSTRAINT "CardScore_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
