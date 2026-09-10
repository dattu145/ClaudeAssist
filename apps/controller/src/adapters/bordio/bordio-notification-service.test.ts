import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { describe, expect, it, vi } from "vitest";
import type { BordioLink, BordioLinkedEntityType } from "../../domain/bordio/link.js";
import type { BordioLinkRepository } from "../../domain/bordio/link-repository.js";
import { FakeBordioClient } from "./fake-bordio-client.js";
import { BordioNotificationService } from "./bordio-notification-service.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function inMemoryLinkRepository(): BordioLinkRepository {
  const links = new Map<string, BordioLink>();
  const key = (type: BordioLinkedEntityType, id: string) => `${type}:${id}`;
  return {
    upsert: async (link) => {
      links.set(key(link.claudeopsEntityType, link.claudeopsEntityId), link);
    },
    findByClaudeOpsEntity: async (type, id) => links.get(key(type, id)) ?? null,
    findByBordioTaskId: async (bordioTaskId) =>
      [...links.values()].find((l) => l.bordioTaskId === bordioTaskId) ?? null,
  };
}

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_COMPLETED",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    payload: {},
    source: "controller",
    ...overrides,
  };
}

describe("BordioNotificationService", () => {
  it("creates a Bordio task on the first notify-worthy event for a session", async () => {
    const client = new FakeBordioClient();
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger());

    await service.notify({ title: "Session completed", body: "Session session_1", event: sampleEvent() });

    const result = await client.listTasks();
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("Session completed");
    expect(result.tasks[0]?.statusId).toBe("status_done"); // FakeBordioClient's default closed status

    const link = await links.findByClaudeOpsEntity("session", "session_1");
    expect(link?.bordioTaskId).toBe(result.tasks[0]?.id);
  });

  it("updates the same task on a subsequent event for the same session, never creates a second one", async () => {
    const client = new FakeBordioClient();
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger());

    await service.notify({ title: "Session needs input", body: "b", event: sampleEvent({ type: "SESSION_WAITING_FOR_INPUT" }) });
    await service.notify({ title: "Session completed", body: "b", event: sampleEvent({ type: "SESSION_COMPLETED" }) });

    const result = await client.listTasks();
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("Session completed");
    expect(result.tasks[0]?.statusId).toBe("status_done");
  });

  it("creates the task with an idempotency key derived from the session id", async () => {
    const client = new FakeBordioClient();
    const createSpy = vi.spyOn(client, "createTask");
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger());

    await service.notify({ title: "Session completed", body: "b", event: sampleEvent({ sessionId: "session_xyz" }) });

    expect(createSpy).toHaveBeenCalledWith(expect.anything(), "bordio-create-task-session-session_xyz");
  });

  it("uses explicit status ids when configured, without calling listTaskStatusDefinitions", async () => {
    const client = new FakeBordioClient();
    const definitionsSpy = vi.spyOn(client, "listTaskStatusDefinitions");
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger(), {
      openStatusId: "status_custom_open",
      closedStatusId: "status_custom_closed",
    });

    await service.notify({ title: "Session completed", body: "b", event: sampleEvent() });

    const result = await client.listTasks();
    expect(result.tasks[0]?.statusId).toBe("status_custom_closed");
    expect(definitionsSpy).not.toHaveBeenCalled();
  });

  it("auto-discovers and caches status definitions when not explicitly configured", async () => {
    const client = new FakeBordioClient();
    const definitionsSpy = vi.spyOn(client, "listTaskStatusDefinitions");
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger());

    await service.notify({ title: "a", body: "b", event: sampleEvent({ sessionId: "session_a" }) });
    await service.notify({ title: "c", body: "d", event: sampleEvent({ sessionId: "session_b" }) });

    expect(definitionsSpy).toHaveBeenCalledTimes(1);
  });

  it("skips syncing (without throwing) an event with no sessionId", async () => {
    const client = new FakeBordioClient();
    const links = inMemoryLinkRepository();
    const service = new BordioNotificationService(client, links, silentLogger());

    await expect(
      service.notify({ title: "x", body: "y", event: sampleEvent({ sessionId: undefined }) })
    ).resolves.toBeUndefined();

    const result = await client.listTasks();
    expect(result.tasks).toHaveLength(0);
  });
});
