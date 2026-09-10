import type { BordioPollCursor } from "./poll-cursor.js";

export interface BordioPollCursorRepository {
  get(name: string): Promise<BordioPollCursor | null>;
  set(name: string, etag: string | null, polledAt: string): Promise<void>;
}
