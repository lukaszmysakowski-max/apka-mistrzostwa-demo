import { calculateScore, createApprovedSnapshot, validateCard } from "../models/cardModel.js";
import { createId, nowIso } from "../utils/id.js";

export class ScoringService {
  constructor(repository, syncService, auditService) {
    this.repository = repository;
    this.syncService = syncService;
    this.auditService = auditService;
  }

  async createDraft({ teamId, competitionId, competitionPartId, cardTemplateId, deviceId, userId }) {
    const draft = {
      id: createId("score-sheet"),
      teamId,
      competitionId,
      competitionPartId,
      cardTemplateId,
      values: {},
      comments: {},
      timeCaptures: {},
      status: "draft",
      entityVersion: 1,
      finalScore: null,
      finalCardJson: null,
      approvedAt: null,
      approvedBy: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await this.repository.upsertScoreSheet(draft);
    await this.queue("score_sheet.create", draft, deviceId);
    await this.auditService.record({ userId, roleId: null, deviceId, action: "score_sheet.create", entity: "score_sheet", entityId: draft.id, newValue: draft, entityVersion: draft.entityVersion });
    return draft;
  }

  async updateField({ scoreSheet, fieldId, value, reason = null, deviceId, userId, timeCapture = null, removeTimeCapture = false }) {
    const previousValue = scoreSheet.values[fieldId] ?? null;
    const previousCapture = scoreSheet.timeCaptures?.[fieldId] ?? null;
    const timeCaptures = { ...(scoreSheet.timeCaptures || {}) };
    if (timeCapture) timeCaptures[fieldId] = timeCapture;
    if (removeTimeCapture) delete timeCaptures[fieldId];
    const next = {
      ...scoreSheet,
      values: { ...scoreSheet.values, [fieldId]: value },
      timeCaptures,
      entityVersion: scoreSheet.entityVersion + 1,
      updatedAt: nowIso()
    };
    await this.repository.upsertScoreSheet(next);
    await this.queue("score_sheet.update_field", next, deviceId);
    await this.auditService.record({
      userId,
      roleId: null,
      deviceId,
      action: "score_sheet.update_field",
      entity: "score_sheet",
      entityId: next.id,
      fieldId,
      previousValue,
      newValue: { value, timeCapture: timeCaptures[fieldId] ?? null },
      reason,
      entityVersion: next.entityVersion
    });
    if (timeCapture || removeTimeCapture) {
      await this.auditService.record({
        userId,
        roleId: null,
        deviceId,
        action: timeCapture ? "score_sheet.capture_time" : "score_sheet.remove_captured_time",
        entity: "score_sheet",
        entityId: next.id,
        fieldId,
        previousValue: previousCapture,
        newValue: timeCapture ?? null,
        reason,
        entityVersion: next.entityVersion
      });
    }
    return next;
  }

  async approve({ scoreSheet, cardTemplate, deviceId, userId }) {
    const validationErrors = validateCard(cardTemplate, scoreSheet.values);
    if (validationErrors.length) return { ok: false, validationErrors };

    const finalScore = calculateScore(cardTemplate, scoreSheet.values).total;
    const approvedAt = nowIso();
    const snapshot = createApprovedSnapshot({ cardTemplate, scoreSheet, finalScore, approvedAt, approvedBy: userId });
    const next = {
      ...scoreSheet,
      status: "approved",
      entityVersion: scoreSheet.entityVersion + 1,
      finalScore,
      finalCardJson: snapshot.finalCardJson,
      approvedAt,
      approvedBy: userId,
      approvedSnapshot: snapshot,
      updatedAt: approvedAt
    };
    await this.repository.upsertScoreSheet(next);
    await this.queue("score_sheet.approve", next, deviceId);
    await this.auditService.record({
      userId,
      roleId: null,
      deviceId,
      action: "score_sheet.approve",
      entity: "score_sheet",
      entityId: next.id,
      previousValue: scoreSheet.status,
      newValue: { status: next.status, finalScore },
      reason: null,
      entityVersion: next.entityVersion
    });
    return { ok: true, scoreSheet: next };
  }

  async queue(type, scoreSheet, deviceId) {
    return this.syncService.enqueue({
      type,
      entity: "score_sheet",
      entityId: scoreSheet.id,
      entityVersion: scoreSheet.entityVersion,
      payload: scoreSheet,
      deviceId
    });
  }
}
