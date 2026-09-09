-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('queued', 'planning', 'researching', 'verifying', 'analysing', 'reporting', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "ResearchProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "sortOrder" INTEGER NOT NULL,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "content" TEXT,
    "contentHash" TEXT,
    "httpStatus" INTEGER,
    "toolName" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "outlineJson" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchProject_userId_createdAt_idx" ON "ResearchProject"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ResearchProject_status_idx" ON "ResearchProject"("status");

-- CreateIndex
CREATE INDEX "ResearchTask_projectId_sortOrder_idx" ON "ResearchTask"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Source_projectId_idx" ON "Source"("projectId");

-- CreateIndex
CREATE INDEX "Source_taskId_idx" ON "Source"("taskId");

-- CreateIndex
CREATE INDEX "Source_contentHash_idx" ON "Source"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Source_projectId_url_key" ON "Source"("projectId", "url");

-- CreateIndex
CREATE INDEX "Finding_projectId_idx" ON "Finding"("projectId");

-- CreateIndex
CREATE INDEX "Finding_sourceId_idx" ON "Finding"("sourceId");

-- CreateIndex
CREATE INDEX "Report_projectId_idx" ON "Report"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_projectId_version_key" ON "Report"("projectId", "version");

-- CreateIndex
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResearchProject" ADD CONSTRAINT "ResearchProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
