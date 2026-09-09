import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const createQueuedProjectMock = vi.fn();
const getResearchProjectForUserMock = vi.fn();
const runQueuedResearchPipelineMock = vi.fn();
const afterMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionUserId: () => authMock(),
}));

vi.mock("@/lib/research/service", () => ({
  createQueuedProject: (...args: unknown[]) => createQueuedProjectMock(...args),
  getResearchProjectForUser: (...args: unknown[]) =>
    getResearchProjectForUserMock(...args),
  runQueuedResearchPipeline: (...args: unknown[]) =>
    runQueuedResearchPipelineMock(...args),
}));

vi.mock("next/server", () => ({
  after: (task: () => unknown) => afterMock(task),
}));

describe("research API", () => {
  beforeEach(() => {
    authMock.mockReset();
    createQueuedProjectMock.mockReset();
    getResearchProjectForUserMock.mockReset();
    runQueuedResearchPipelineMock.mockReset();
    afterMock.mockReset();
  });

  it("rejects unauthenticated create requests", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/research/route");
    const response = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        body: JSON.stringify({
          question: "Research the top competitors of Stripe",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated get requests", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/research/[id]/route");
    const response = await GET(new Request("http://localhost/api/research/proj_1"), {
      params: Promise.resolve({ id: "proj_1" }),
    });

    expect(response.status).toBe(401);
  });

  it("creates a project for an authenticated user", async () => {
    authMock.mockResolvedValue("user-1");
    createQueuedProjectMock.mockResolvedValue({
      id: "proj_1",
      status: "queued",
    });

    const { POST } = await import("@/app/api/research/route");
    const response = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Research the top competitors of Stripe",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ id: "proj_1", status: "queued" });
    expect(createQueuedProjectMock).toHaveBeenCalledWith(
      "user-1",
      "Research the top competitors of Stripe",
    );
    expect(afterMock).toHaveBeenCalledOnce();
  });

  it("returns the caller's project", async () => {
    authMock.mockResolvedValue("user-1");
    getResearchProjectForUserMock.mockResolvedValue({
      project: { id: "proj_1", userId: "user-1" },
      status: "completed",
      tasks: [],
      sources: [],
      findings: [],
      report: null,
    });

    const { GET } = await import("@/app/api/research/[id]/route");
    const response = await GET(new Request("http://localhost/api/research/proj_1"), {
      params: Promise.resolve({ id: "proj_1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.project.id).toBe("proj_1");
    expect(getResearchProjectForUserMock).toHaveBeenCalledWith("proj_1", "user-1");
  });

  it("does not return another user's project", async () => {
    authMock.mockResolvedValue("user-1");
    getResearchProjectForUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/research/[id]/route");
    const response = await GET(new Request("http://localhost/api/research/proj_2"), {
      params: Promise.resolve({ id: "proj_2" }),
    });

    expect(response.status).toBe(404);
  });
});
