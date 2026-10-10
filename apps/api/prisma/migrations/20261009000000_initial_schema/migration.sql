BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "Users" (
    "Id" UUID NOT NULL,
    "Name" VARCHAR(200) NOT NULL,
    "Email" VARCHAR(320) NOT NULL,
    "CreatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Subjects" (
    "Id" UUID NOT NULL,
    "Name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Subjects_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Topics" (
    "Id" UUID NOT NULL,
    "SubjectId" UUID NOT NULL,
    "Name" VARCHAR(200) NOT NULL,

    CONSTRAINT "Topics_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Questions" (
    "Id" UUID NOT NULL,
    "TopicId" UUID NOT NULL,
    "QuestionText" TEXT NOT NULL,
    "Explanation" TEXT NOT NULL,
    "Difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "CreatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Questions_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "QuestionOptions" (
    "Id" UUID NOT NULL,
    "QuestionId" UUID NOT NULL,
    "OptionText" TEXT NOT NULL,
    "IsCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOptions_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "UserQuestionAttempts" (
    "Id" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "QuestionId" UUID NOT NULL,
    "SelectedAnswer" UUID NOT NULL,
    "IsCorrect" BOOLEAN NOT NULL,
    "TimeTaken" INTEGER NOT NULL,
    "AttemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuestionAttempts_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Bookmarks" (
    "Id" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "QuestionId" UUID NOT NULL,
    "CreatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmarks_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_Email_key" ON "Users"("Email");

-- CreateIndex
CREATE INDEX "Topics_SubjectId_idx" ON "Topics"("SubjectId");

-- CreateIndex
CREATE INDEX "Questions_TopicId_Difficulty_idx" ON "Questions"("TopicId", "Difficulty");

-- CreateIndex
CREATE INDEX "Questions_CreatedDate_idx" ON "Questions"("CreatedDate");

-- CreateIndex
CREATE INDEX "QuestionOptions_QuestionId_idx" ON "QuestionOptions"("QuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOptions_Id_QuestionId_key" ON "QuestionOptions"("Id", "QuestionId");

-- CreateIndex
CREATE INDEX "UserQuestionAttempts_UserId_AttemptedAt_idx" ON "UserQuestionAttempts"("UserId", "AttemptedAt");

-- CreateIndex
CREATE INDEX "UserQuestionAttempts_UserId_QuestionId_AttemptedAt_idx" ON "UserQuestionAttempts"("UserId", "QuestionId", "AttemptedAt");

-- CreateIndex
CREATE INDEX "UserQuestionAttempts_QuestionId_idx" ON "UserQuestionAttempts"("QuestionId");

-- CreateIndex
CREATE INDEX "UserQuestionAttempts_SelectedAnswer_QuestionId_idx" ON "UserQuestionAttempts"("SelectedAnswer", "QuestionId");

-- CreateIndex
CREATE INDEX "Bookmarks_QuestionId_idx" ON "Bookmarks"("QuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmarks_UserId_QuestionId_key" ON "Bookmarks"("UserId", "QuestionId");

-- AddForeignKey
ALTER TABLE "Topics" ADD CONSTRAINT "Topics_SubjectId_fkey" FOREIGN KEY ("SubjectId") REFERENCES "Subjects"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Questions" ADD CONSTRAINT "Questions_TopicId_fkey" FOREIGN KEY ("TopicId") REFERENCES "Topics"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOptions" ADD CONSTRAINT "QuestionOptions_QuestionId_fkey" FOREIGN KEY ("QuestionId") REFERENCES "Questions"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestionAttempts" ADD CONSTRAINT "UserQuestionAttempts_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestionAttempts" ADD CONSTRAINT "UserQuestionAttempts_QuestionId_fkey" FOREIGN KEY ("QuestionId") REFERENCES "Questions"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestionAttempts" ADD CONSTRAINT "UserQuestionAttempts_SelectedAnswer_QuestionId_fkey" FOREIGN KEY ("SelectedAnswer", "QuestionId") REFERENCES "QuestionOptions"("Id", "QuestionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmarks" ADD CONSTRAINT "Bookmarks_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmarks" ADD CONSTRAINT "Bookmarks_QuestionId_fkey" FOREIGN KEY ("QuestionId") REFERENCES "Questions"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce nonnegative elapsed seconds, including writes outside the API.
ALTER TABLE "UserQuestionAttempts" ADD CONSTRAINT "UserQuestionAttempts_TimeTaken_check" CHECK ("TimeTaken" >= 0);

COMMIT;
