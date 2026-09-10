import type { Logger } from "@claudeops/logging";
import type { BordioClient } from "../../domain/bordio/client.js";
import { createBordioLink } from "../../domain/bordio/link.js";
import type { BordioLinkRepository } from "../../domain/bordio/link-repository.js";
import { sessionEventToBordioState } from "../../domain/bordio/session-to-bordio-state.js";
import type { Notification, NotificationService } from "../../domain/notification/service.js";

export interface BordioNotificationServiceOptions {
  openStatusId?: string;
  closedStatusId?: string;
}

/**
 * Mirrors notify-worthy session events (page19's shouldNotify already
 * filters to exactly the set this cares about) onto one Bordio task per
 * session (pageB2's mapping granularity decision). The first
 * notify-worthy event for a session creates the task, idempotency-keyed
 * off the session id (research/bordio.md); every subsequent one updates
 * the same task's title and status rather than creating a new one.
 */
export class BordioNotificationService implements NotificationService {
  private cachedOpenStatusId: string | null = null;
  private cachedClosedStatusId: string | null = null;
  private definitionsLoaded = false;

  constructor(
    private readonly client: BordioClient,
    private readonly linkRepository: BordioLinkRepository,
    private readonly logger: Logger,
    private readonly options: BordioNotificationServiceOptions = {}
  ) {}

  async notify(notification: Notification): Promise<void> {
    const sessionId = notification.event.sessionId;
    if (!sessionId) {
      this.logger.warn("skipping Bordio sync for an event with no sessionId", {
        eventType: notification.event.type,
      });
      return;
    }

    const state = sessionEventToBordioState(notification.event.type);
    if (!state) {
      this.logger.warn("no Bordio state mapping for event type", { eventType: notification.event.type });
      return;
    }

    const statusId = await this.resolveStatusId(state);
    const existingLink = await this.linkRepository.findByClaudeOpsEntity("session", sessionId);

    if (existingLink) {
      await this.client.updateTask(existingLink.bordioTaskId, { title: notification.title, statusId });
      return;
    }

    const task = await this.client.createTask(
      { title: notification.title, statusId },
      `bordio-create-task-session-${sessionId}`
    );
    await this.linkRepository.upsert(createBordioLink("session", sessionId, task.id));
  }

  /** Explicit config wins; otherwise the first definition matching the
   * requested state is discovered once and cached for the life of this
   * instance (research/bordio.md: definitions are workspace-level and
   * don't change mid-run). */
  private async resolveStatusId(state: "open" | "closed"): Promise<string> {
    if (state === "open" && this.options.openStatusId) {
      return this.options.openStatusId;
    }
    if (state === "closed" && this.options.closedStatusId) {
      return this.options.closedStatusId;
    }

    if (!this.definitionsLoaded) {
      const definitions = await this.client.listTaskStatusDefinitions();
      this.cachedOpenStatusId = definitions.find((d) => d.state === "open")?.id ?? null;
      this.cachedClosedStatusId = definitions.find((d) => d.state === "closed")?.id ?? null;
      this.definitionsLoaded = true;
    }

    const resolved = state === "open" ? this.cachedOpenStatusId : this.cachedClosedStatusId;
    if (!resolved) {
      throw new Error(`No Bordio task status definition found for state "${state}"`);
    }
    return resolved;
  }
}
