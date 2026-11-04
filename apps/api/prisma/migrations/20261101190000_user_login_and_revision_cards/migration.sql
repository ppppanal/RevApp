ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "Flashcard" ADD COLUMN "personal" BOOLEAN NOT NULL DEFAULT false;
