import { createId, nowIso } from "../utils/id.js";

export class AuditService {
  constructor(repository) {
    this.repository = repository;
  }

  async record({ userId, roleId, deviceId, action, entity, entityId, fieldId = null, previousValue = null, newValue = null, reason = null, entityVersion = null }) {
    return this.repository.appendAudit({
      id: createId("audit"),
      userId,
      roleId,
      deviceId,
      occurredAt: nowIso(),
      action,
      entity,
      entityId,
      fieldId,
      previousValue,
      newValue,
      reason,
      entityVersion
    });
  }
}
