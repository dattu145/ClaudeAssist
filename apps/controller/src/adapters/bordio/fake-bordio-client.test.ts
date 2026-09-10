import { describe, expect, it } from "vitest";
import { BordioApiError } from "./errors.js";
import { FakeBordioClient } from "./fake-bordio-client.js";

describe("FakeBordioClient", () => {
  it("creates and lists a task", async () => {
    const client = new FakeBordioClient();
    const task = await client.createTask({ title: "Do the thing", tagIds: ["tag_claudeops"] }, "key-1");

    expect(task.id).toMatch(/^task_fake_/);
    expect(task.title).toBe("Do the thing");

    const result = await client.listTasks();
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.id).toBe(task.id);
  });

  it("updates a task", async () => {
    const client = new FakeBordioClient();
    const task = await client.createTask({ title: "Original" }, "key-1");

    const updated = await client.updateTask(task.id, { title: "Renamed", statusId: "status_done" });
    expect(updated.title).toBe("Renamed");
    expect(updated.statusId).toBe("status_done");
  });

  it("updating an unknown task throws a 404 BordioApiError", async () => {
    const client = new FakeBordioClient();
    await expect(client.updateTask("task_nonexistent", { title: "x" })).rejects.toMatchObject({
      status: 404,
      code: "resource_not_found",
    });
  });

  it("replays the same result for the same idempotency key + body", async () => {
    const client = new FakeBordioClient();
    const first = await client.createTask({ title: "Idempotent" }, "same-key");
    const second = await client.createTask({ title: "Idempotent" }, "same-key");

    expect(second).toEqual(first);
    const result = await client.listTasks();
    expect(result.tasks).toHaveLength(1);
  });

  it("rejects the same idempotency key reused with a different body", async () => {
    const client = new FakeBordioClient();
    await client.createTask({ title: "First body" }, "same-key");

    await expect(client.createTask({ title: "Different body" }, "same-key")).rejects.toBeInstanceOf(
      BordioApiError
    );
    await expect(client.createTask({ title: "Different body" }, "same-key")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("filters listTasks by tagIds", async () => {
    const client = new FakeBordioClient();
    await client.createTask({ title: "Tagged", tagIds: ["tag_claudeops"] }, "key-1");
    await client.createTask({ title: "Untagged" }, "key-2");

    const result = await client.listTasks({ tagIds: ["tag_claudeops"] });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("Tagged");
  });

  it("conditional GET: returns notModified when ifNoneMatch matches the current etag", async () => {
    const client = new FakeBordioClient();
    const first = await client.listTasks();
    expect(first.notModified).toBe(false);
    expect(first.etag).toBeTruthy();

    const second = await client.listTasks(first.etag ? { ifNoneMatch: first.etag } : {});
    expect(second.notModified).toBe(true);
    expect(second.tasks).toHaveLength(0);
  });

  it("conditional GET: returns fresh data once the etag changes", async () => {
    const client = new FakeBordioClient();
    const first = await client.listTasks();
    await client.createTask({ title: "New task" }, "key-1");

    const second = await client.listTasks(first.etag ? { ifNoneMatch: first.etag } : {});
    expect(second.notModified).toBe(false);
    expect(second.tasks).toHaveLength(1);
  });

  it("lists status definitions with open/closed state", async () => {
    const client = new FakeBordioClient();
    const definitions = await client.listTaskStatusDefinitions();
    expect(definitions.some((d) => d.state === "open")).toBe(true);
    expect(definitions.some((d) => d.state === "closed")).toBe(true);
  });
});
