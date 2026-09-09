import { prisma } from "@/lib/db";
import { createPrismaResearchStore } from "@/lib/db/research-store";
import type { ResearchStore } from "./store";

let storeOverride: ResearchStore | undefined;

export function getResearchStore(): ResearchStore {
  return storeOverride ?? createPrismaResearchStore(prisma);
}

export function setResearchStoreOverride(store: ResearchStore | undefined): void {
  storeOverride = store;
}
