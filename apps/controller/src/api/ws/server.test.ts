import { createServer, type Server } from "node:http";
import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { InProcessEventBus } from "../../domain/events/bus.js";
import { attachWebSocketServer } from "./server.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    payload: { output: "hi" },
    source: "controller",
    ...overrides,
  };
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.once("open", () => resolve()));
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data: Buffer) => resolve(JSON.parse(data.toString("utf-8"))));
  });
}

describe("attachWebSocketServer", () => {
  let httpServer: Server;
  let bus: InProcessEventBus;
  let port: number;
  let clients: WebSocket[];

  beforeEach(async () => {
    httpServer = createServer();
    bus = new InProcessEventBus(silentLogger());
    attachWebSocketServer(httpServer, bus, silentLogger(), { heartbeatIntervalMs: 50_000 });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    clients.push(ws);
    return ws;
  }

  it("broadcasts a published event to a connected client by default", async () => {
    const ws = connect();
    await waitForOpen(ws);

    const messagePromise = waitForMessage(ws);
    bus.publish(sampleEvent());
    const message = await messagePromise;

    expect(message).toMatchObject({ version: 1, type: "session.output", sessionId: "session_1" });
  });

  it("broadcasts to multiple connected clients", async () => {
    const a = connect();
    const b = connect();
    await Promise.all([waitForOpen(a), waitForOpen(b)]);

    const [msgA, msgB] = await Promise.all([
      waitForMessage(a),
      waitForMessage(b),
      Promise.resolve().then(() => bus.publish(sampleEvent())),
    ]);

    expect(msgA).toMatchObject({ type: "session.output" });
    expect(msgB).toMatchObject({ type: "session.output" });
  });

  it("subscribe narrows delivery to one session", async () => {
    const ws = connect();
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: "subscribe", sessionId: "session_A" }));
    await new Promise((r) => setTimeout(r, 20)); // let the server process the control message

    const received: unknown[] = [];
    ws.on("message", (data: Buffer) => received.push(JSON.parse(data.toString("utf-8"))));

    bus.publish(sampleEvent({ sessionId: "session_B" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toHaveLength(0);

    bus.publish(sampleEvent({ sessionId: "session_A" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toHaveLength(1);
  });

  it("unsubscribe reverts to receiving every event", async () => {
    const ws = connect();
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: "subscribe", sessionId: "session_A" }));
    await new Promise((r) => setTimeout(r, 20));
    ws.send(JSON.stringify({ type: "unsubscribe" }));
    await new Promise((r) => setTimeout(r, 20));

    const messagePromise = waitForMessage(ws);
    bus.publish(sampleEvent({ sessionId: "session_unrelated" }));
    const message = await messagePromise;

    expect(message).toMatchObject({ sessionId: "session_unrelated" });
  });

  it("ignores malformed control messages instead of crashing the connection", async () => {
    const ws = connect();
    await waitForOpen(ws);
    ws.send("not json");
    await new Promise((r) => setTimeout(r, 20));

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  // A truly "dead" client (ping sent, no pong ever received) is difficult
  // to simulate deterministically with a real ws client, since the
  // library auto-responds to pings at the protocol level. The mechanism
  // (isAlive flag flipped false before each ping, terminated if still
  // false on the next tick) is the standard documented `ws` heartbeat
  // idiom; this test instead confirms a *healthy*, normally-responding
  // client survives multiple heartbeat cycles without being terminated.
  it("does not terminate a healthy client across multiple heartbeat intervals", async () => {
    const heartbeatServer = createServer();
    attachWebSocketServer(heartbeatServer, bus, silentLogger(), { heartbeatIntervalMs: 30 });
    await new Promise<void>((resolve) => heartbeatServer.listen(0, resolve));
    const heartbeatPort = (heartbeatServer.address() as { port: number }).port;

    const ws = new WebSocket(`ws://127.0.0.1:${heartbeatPort}/ws`);
    clients.push(ws);
    await waitForOpen(ws);

    await new Promise((r) => setTimeout(r, 150)); // several heartbeat ticks

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.terminate();
    await new Promise<void>((resolve) => heartbeatServer.close(() => resolve()));
  });
});
