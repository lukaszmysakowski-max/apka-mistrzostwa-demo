import { createId, nowIso } from "../utils/id.js";

export const SyncStatus = Object.freeze({
  LOCAL: "local_saved",
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  CONFLICT: "conflict",
  FAILED: "failed"
});

export class SyncService {
  constructor(repository, apiClient = new OfflineApiClient()) {
    this.repository = repository;
    this.apiClient = apiClient;
  }

  async enqueue({ type, entity, entityId, entityVersion, payload, deviceId }) {
    return this.repository.enqueueOperation({
      id: createId("sync-operation"),
      client_operation_id: createId("client-operation"),
      device_id: deviceId,
      type,
      entity,
      entity_id: entityId,
      entity_version: entityVersion,
      payload,
      status: SyncStatus.QUEUED,
      retry_count: 0,
      max_retries: 5,
      next_retry_at: nowIso(),
      created_at: nowIso(),
      sent_at: null,
      conflict: null,
      error: null
    });
  }

  async flush() {
    const operations = await this.repository.listSyncOperations();
    const pending = operations.filter(operation =>
      [SyncStatus.QUEUED, SyncStatus.FAILED].includes(operation.status) &&
      operation.retry_count < operation.max_retries &&
      new Date(operation.next_retry_at).getTime() <= Date.now()
    );

    const results = [];
    for (const operation of pending) {
      results.push(await this.sendOperation(operation));
    }
    return results;
  }

  async sendOperation(operation) {
    const sending = { ...operation, status: SyncStatus.SENDING, error: null };
    await this.repository.updateOperation(sending);

    try {
      const response = await this.apiClient.pushOperation(sending);
      if (response.conflict) {
        return this.repository.updateOperation({
          ...sending,
          status: SyncStatus.CONFLICT,
          conflict: response.conflict,
          error: "Wykryto konflikt wersji encji."
        });
      }
      return this.repository.updateOperation({
        ...sending,
        status: SyncStatus.SENT,
        sent_at: nowIso(),
        server_ack: response
      });
    } catch (error) {
      const retryCount = sending.retry_count + 1;
      return this.repository.updateOperation({
        ...sending,
        status: SyncStatus.FAILED,
        retry_count: retryCount,
        next_retry_at: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
        error: error.message
      });
    }
  }
}

function retryDelayMs(retryCount) {
  return Math.min(30000, 1000 * 2 ** retryCount);
}

class OfflineApiClient {
  async pushOperation() {
    throw new Error("Backend API nie jest jeszcze skonfigurowane.");
  }
}
