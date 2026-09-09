import { describe, expect, it } from "vitest";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { createQueuedProject } from "@/lib/research/service";

describe("research store domain", () => {
  it("creates a project owned by the requesting user", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    expect(project.userId).toBe("user-1");
    expect(project.status).toBe("queued");
    expect(project.title).toContain("Stripe");

    const owned = await store.getProjectOwnedBy(project.id, "user-1");
    const other = await store.getProjectOwnedBy(project.id, "user-2");

    expect(owned?.id).toBe(project.id);
    expect(other).toBeNull();
  });

  it("lists only the current user's projects", async () => {
    const store = createMemoryResearchStore();
    await createQueuedProject("user-1", "Research Stripe competitors", store);
    await createQueuedProject("user-2", "Research Adyen competitors", store);

    const user1Projects = await store.listProjectsByUser("user-1");
    const user2Projects = await store.listProjectsByUser("user-2");

    expect(user1Projects).toHaveLength(1);
    expect(user2Projects).toHaveLength(1);
    expect(user1Projects[0]?.question).toContain("Stripe");
    expect(user2Projects[0]?.question).toContain("Adyen");
  });

  it("keeps tasks related to their project", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Stripe",
      question: "Research the top competitors of Stripe",
    });

    const task = await store.createTask({
      projectId: project.id,
      title: "Identify competitors",
      query: "Stripe competitors",
      sortOrder: 1,
    });

    const tasks = await store.listTasks(project.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe(task.id);
    expect(tasks[0]?.projectId).toBe(project.id);
  });
});
