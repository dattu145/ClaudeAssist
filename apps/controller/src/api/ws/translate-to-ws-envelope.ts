import {
  DOMAIN_EVENT_TO_WS_TYPE,
  WS_PROTOCOL_VERSION,
  WsEnvelopeSchema,
  type DomainEvent,
  type WsEnvelope,
} from "@claudeops/protocol";

/**
 * DOMAIN_EVENT_TO_WS_TYPE is exhaustive over DomainEventType (compile-time
 * checked in packages/protocol/src/ws-protocol.ts), so this never fails to
 * find a mapping.
 */
export function translateToWsEnvelope(event: DomainEvent): WsEnvelope {
  return WsEnvelopeSchema.parse({
    version: WS_PROTOCOL_VERSION,
    type: DOMAIN_EVENT_TO_WS_TYPE[event.type],
    timestamp: event.timestamp,
    ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
    ...(event.projectId !== undefined ? { projectId: event.projectId } : {}),
    data: event.payload,
  });
}
