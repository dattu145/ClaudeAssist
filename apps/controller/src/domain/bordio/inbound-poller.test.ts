import { createLogger } from "@claudeops/logging";
import type { Task } from "@claudeops/protocol";
import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../command/router.js";
import type { SessionRegistry } from "../session/registry.js";
import type { TaskRegistry } from "../task/registry.js";
import { FakeBordioClient } from "../../adapters/bordio/fake-bordio-client.js";
import { createBordioLink, type BordioLink, type BordioLinkedEntityType } from "./link.js";
import type { BordioLinkRepository } from "./link-repository.js";
import type { BordioPollCursor } from "./poll-cursor.js";
import type { BordioPollCursorRepository } from "./poll-cursor-repository.js";
import { BordioInboundPoller } from "./inbound-poller.js";

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

function inMemoryPollCursorRepository(): BordioPollCursorRepository {
  const cursors = new Map<string, BordioPollCursor>();
  return {
    get: async (name) => cursors.get(name) ?? null,
    set: async (name, etag, polledAt) => {
      cursors.set(name, { name, etag, polledAt });
    },
  };
}

function fakeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    projectId: "project_1",
    sessionId: "session_1",
    instruction: "do it",
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function commandRouterWithSpy(): { router: CommandRouter; dispatchInstruction: ReturnType<typeof vi.fn> } {
  const dispatchInstruction = vi.fn().mockResolvedValue(fakeTask());
  const taskRegistry = { dispatchInstruction } as unknown as TaskRegistry;
  const router = new CommandRouter({} as SessionRegistry, taskRegistry);
  return { router, dispatchInstruction };
}

describe("BordioInboundPoller", () => {
  it("dispatches SEND_INSTRUCTION for a linked, command-tagged task and untags it", async () => {
    const client = new FakeBordioClient();
    const task = await client.createTask({ title: "reply text", tagIds: ["tag_command"] }, "key-1");
    const links = inMemoryLinkRepository();
    await links.upsert(createBordioLink("session", "session_1", task.id));
    const cursors = inMemoryPollCursorRepository();
    const { router, dispatchInstruction } = commandRouterWithSpy();
    const poller = new BordioInboundPoller(client, links, cursors, router, silentLogger(), {
      commandTagId: "tag_command",
    });

    await poller.pollOnce();

    expect(dispatchInstruction).toHaveBeenCalledWith("session_1", "reply text");

    const refetched = await client.listTasks();
    expect(refetched.tasks[0]?.tagIds).not.toContain("tag_command");
  });

  it("skips a command-tagged task with no linked session", async () => {
    const client = new FakeBordioClient();
    await client.createTask({ title: "orphan", tagIds: ["tag_command"] }, "key-1");
    const links = inMemoryLinkRepository();
    const cursors = inMemoryPollCursorRepository();
    const { router, dispatchInstruction } = commandRouterWithSpy();
    const poller = new BordioInboundPoller(client, links, cursors, router, silentLogger(), {
      commandTagId: "tag_command",
    });

    await poller.pollOnce();

    expect(dispatchInstruction).not.toHaveBeenCalled();
  });

  it("ignores tasks not carrying the command tag", async () => {
    const client = new FakeBordioClient();
    const task = await client.createTask({ title: "unrelated" }, "key-1");
    const links = inMemoryLinkRepository();
    await links.upsert(createBordioLink("session", "session_1", task.id));
    const cursors = inMemoryPollCursorRepository();
    const { router, dispatchInstruction } = commandRouterWithSpy();
    const poller = new BordioInboundPoller(client, links, cursors, router, silentLogger(), {
      commandTagId: "tag_command",
    });

    await poller.pollOnce();

    expect(dispatchInstruction).not.toHaveBeenCalled();
  });

  it("does nothing on an unchanged (304) poll", async () => {
    const client = new FakeBordioClient();
    const links = inMemoryLinkRepository();
    const cursors = inMemoryPollCursorRepository();
    const { router, dispatchInstruction } = commandRouterWithSpy();
    const poller = new BordioInboundPoller(client, links, cursors, router, silentLogger(), {
      commandTagId: "tag_command",
    });

    await poller.pollOnce(); // first poll establishes the cursor
    await poller.pollOnce(); // second poll: nothing changed -> notModified

    expect(dispatchInstruction).not.toHaveBeenCalled();
  });

  it("start()/stop() run pollOnce on an interval and stop cleanly", async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeBordioClient();
      const task = await client.createTask({ title: "reply", tagIds: ["tag_command"] }, "key-1");
      const links = inMemoryLinkRepository();
      await links.upsert(createBordioLink("session", "session_1", task.id));
      const cursors = inMemoryPollCursorRepository();
      const { router, dispatchInstruction } = commandRouterWithSpy();
      const poller = new BordioInboundPoller(client, links, cursors, router, silentLogger(), {
        commandTagId: "tag_command",
      });

      poller.start(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(dispatchInstruction).toHaveBeenCalledTimes(1);

      poller.stop();
      await vi.advanceTimersByTimeAsync(5000);

      expect(dispatchInstruction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs, but does not throw, when pollOnce fails during the interval loop", async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeBordioClient();
      vi.spyOn(client, "listTasks").mockRejectedValue(new Error("network down"));
      const links = inMemoryLinkRepository();
      const cursors = inMemoryPollCursorRepository();
      const { router } = commandRouterWithSpy();
      const logger = silentLogger();
      const errorSpy = vi.spyOn(logger, "error");
      const poller = new BordioInboundPoller(client, links, cursors, router, logger, {
        commandTagId: "tag_command",
      });

      poller.start(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(errorSpy).toHaveBeenCalled();
      poller.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
