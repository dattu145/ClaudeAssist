import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { describe, expect, it } from "vitest";
import { ConsoleNotificationService } from "./console-notification-service.js";

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_FAILED",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    projectId: "project_1",
    payload: {},
    source: "controller",
    ...overrides,
  };
}

describe("ConsoleNotificationService", () => {
  it("logs the notification, tagged notification:true, through the structured logger", async () => {
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const service = new ConsoleNotificationService(logger);
    const event = sampleEvent();

    await service.notify({ title: "Session failed", body: "Session session_1", event });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.message).toBe("Session failed");
    expect(parsed.notification).toBe(true);
    expect(parsed.body).toBe("Session session_1");
    expect(parsed.eventId).toBe(event.id);
    expect(parsed.eventType).toBe("SESSION_FAILED");
    expect(parsed.sessionId).toBe("session_1");
    expect(parsed.projectId).toBe("project_1");
  });

  it("resolves without throwing", async () => {
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const service = new ConsoleNotificationService(logger);
    await expect(
      service.notify({ title: "t", body: "b", event: sampleEvent() })
    ).resolves.toBeUndefined();
  });
});
