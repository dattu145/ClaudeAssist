import type { Logger } from "@claudeops/logging";
import type { CommandRouter } from "../command/router.js";
import type { BordioClient } from "./client.js";
import type { BordioLinkRepository } from "./link-repository.js";
import type { BordioPollCursorRepository } from "./poll-cursor-repository.js";

const CURSOR_NAME = "inbound-commands";

export interface BordioInboundPollerOptions {
  commandTagId: string;
}

/**
 * Bordio has no webhooks (research/bordio.md) — this is the bounded,
 * backed-off poller ADR-006 describes, same spirit as
 * ProcessDiscoveryService's startup cross-check. Only *linked* tasks
 * (ones pageB3's outbound sync already created for a session) can
 * trigger a command — see .claude/plans/pageB4.md's Design section for
 * why a brand-new, never-seen task can't safely target a session with
 * this project's current (custom-field-less) BordioTask shape.
 */
export class BordioInboundPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly client: BordioClient,
    private readonly linkRepository: BordioLinkRepository,
    private readonly pollCursorRepository: BordioPollCursorRepository,
    private readonly commandRouter: CommandRouter,
    private readonly logger: Logger,
    private readonly options: BordioInboundPollerOptions
  ) {}

  /** One tick, fully testable without timers — matches Reconciler's
   * separation of the algorithm from its own scheduling. */
  async pollOnce(): Promise<void> {
    const cursor = await this.pollCursorRepository.get(CURSOR_NAME);

    const result = await this.client.listTasks({
      tagIds: [this.options.commandTagId],
      ...(cursor?.etag ? { ifNoneMatch: cursor.etag } : {}),
    });

    if (result.notModified) {
      return;
    }

    for (const task of result.tasks) {
      const link = await this.linkRepository.findByBordioTaskId(task.id);
      if (!link) {
        this.logger.info("skipping command-tagged Bordio task with no linked session", {
          bordioTaskId: task.id,
        });
        continue;
      }

      await this.commandRouter.dispatch({
        type: "SEND_INSTRUCTION",
        sessionId: link.claudeopsEntityId,
        instruction: task.title,
      });

      // Untag immediately after a successful dispatch so this task
      // isn't redispatched next tick. A crash in the gap between the
      // dispatch above and this call is a documented, accepted risk
      // (.claude/plans/pageB4.md Risks) — not silently assumed safe.
      const remainingTags = task.tagIds.filter((id) => id !== this.options.commandTagId);
      await this.client.updateTask(task.id, { tagIds: remainingTags });
    }

    await this.pollCursorRepository.set(CURSOR_NAME, result.etag, new Date().toISOString());
  }

  start(intervalMs: number): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.pollOnce().catch((err: unknown) => {
        this.logger.error("Bordio inbound poll failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
