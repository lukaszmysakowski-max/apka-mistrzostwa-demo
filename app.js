import { ConfigRepository } from "./src/repositories/configRepository.js";
import { DomainRepository } from "./src/repositories/domainRepository.js";
import { SyncService, SyncStatus } from "./src/services/syncService.js";
import { AuditService } from "./src/services/auditService.js";
import { ScoringService } from "./src/services/scoringService.js";
import { RankingService } from "./src/services/rankingService.js";
import { CompetitionTimerService } from "./src/services/competitionTimerService.js";
import { calculateScore, validateCard } from "./src/models/cardModel.js";

const $ = selector => document.querySelector(selector);
const UI_STATE_KEY = "omrm-ui-state-v1";

const repository = new DomainRepository();
const syncService = new SyncService(repository);
const auditService = new AuditService(repository);
const scoringService = new ScoringService(repository, syncService, auditService);
const rankingService = new RankingService(repository);
const competitionTimerService = new CompetitionTimerService();

const ui = {
  state: null,
  selectedTeamId: null,
  selectedAssignmentKey: null,
  currentScoreSheetId: null
};

async function init() {
  const config = await new ConfigRepository().loadBootstrap();
  ui.state = await repository.bootstrap(config);
  restoreUiState();
  bindEvents();
  await renderAll();
  await restoreVisibleAssessment();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-view-target]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });

  $("#startAssessmentBtn").addEventListener("click", startAssessment);
  $("#finishAssessmentBtn").addEventListener("click", () => {
    renderFinishScreen();
    showView("finish-screen");
  });
  $("#approveBtn").addEventListener("click", approveAssessment);
  $("#syncNowBtn").addEventListener("click", trySync);
  $("#retrySyncBtn").addEventListener("click", trySync);
  $("#timerStartBtn").addEventListener("click", () => competitionTimerService.start());
  $("#timerPauseBtn").addEventListener("click", () => competitionTimerService.pause());
  $("#timerResumeBtn").addEventListener("click", () => competitionTimerService.resume());
  $("#timerResetBtn").addEventListener("click", () => competitionTimerService.reset());
  $("#timerSoundBtn").addEventListener("click", () => {
    const snapshot = competitionTimerService.getSnapshot();
    competitionTimerService.setSoundEnabled(!snapshot.soundEnabled);
  });
  competitionTimerService.subscribe(renderTimer);

  document.addEventListener("change", async event => {
    if (event.target.id === "assignmentSelect") {
      ui.selectedAssignmentKey = event.target.value;
      saveUiState();
    }
    if (event.target.matches("input[type='radio'][data-field-id]")) {
      await updateField(event.target.dataset.fieldId, event.target.value);
    }
  });
}

async function renderAll() {
  ui.state = await repository.getState();
  $("#deviceLabel").textContent = ui.state.device?.label || "Tablet";
  renderTeamList();
  renderSyncStatus();
  await renderRanking();
  await renderAudit();
  await renderSyncQueue();
}

function showView(id) {
  document.querySelectorAll(".view, .tab").forEach(el => el.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-view="${id}"]`)?.classList.add("active");
  window.scrollTo(0, 0);
}

function renderTeamList() {
  const teams = ui.state.teams.filter(team => !team.deletedAt);
  if (!teams.length) {
    $("#teamList").innerHTML = `
      <div class="empty-state">
        <strong>Brak zespołów w lokalnym cache</strong>
        <span>Dodaj zespoły w konfiguracji lub pobierz je z API po wdrożeniu backendu.</span>
      </div>`;
    return;
  }

  $("#teamList").innerHTML = teams.map(team => `
    <button class="team-button" data-team-id="${team.id}">
      <span>${escapeHtml(team.number)}</span>
      <strong>${escapeHtml(team.name)}</strong>
    </button>
  `).join("");

  document.querySelectorAll("[data-team-id]").forEach(button => {
    button.addEventListener("click", () => selectTeam(button.dataset.teamId));
  });
}

function selectTeam(teamId) {
  ui.selectedTeamId = teamId;
  saveUiState();
  const team = getSelectedTeam();
  $("#startTeamNumber").textContent = team?.number || "--";
  $("#startTeamName").textContent = team?.name || "Zespół";
  renderAssignments();
  showView("start-screen");
}

function renderAssignments() {
  const options = [];
  for (const competition of ui.state.competitions.filter(item => !item.deletedAt)) {
    for (const part of competition.parts || []) {
      const template = ui.state.cardTemplates.find(item => item.id === part.cardTemplateId && !item.deletedAt);
      if (!template) continue;
      options.push({
        key: `${competition.id}:${part.id}:${template.id}`,
      label: `${competition.name} / ${part.name}`
      });
    }
  }

  $("#assignmentSelect").innerHTML = options.length
    ? options.map(option => `<option value="${option.key}">${escapeHtml(option.label)}</option>`).join("")
    : `<option value="">Brak przypisanych kart</option>`;
  ui.selectedAssignmentKey = options.some(option => option.key === ui.selectedAssignmentKey)
    ? ui.selectedAssignmentKey
    : options[0]?.key || null;
  if (ui.selectedAssignmentKey) $("#assignmentSelect").value = ui.selectedAssignmentKey;
  $("#startAssessmentBtn").disabled = !ui.selectedTeamId || !ui.selectedAssignmentKey;
}

async function startAssessment() {
  const assignment = getSelectedAssignment();
  if (!assignment) return;

  const scoreSheet = await scoringService.createDraft({
    teamId: ui.selectedTeamId,
    competitionId: assignment.competition.id,
    competitionPartId: assignment.part.id,
    cardTemplateId: assignment.template.id,
    deviceId: getDeviceId(),
    userId: getUserId()
  });

  ui.currentScoreSheetId = scoreSheet.id;
  configureTimerForAssignment(assignment);
  competitionTimerService.reset();
  saveUiState();
  await renderCard();
  showView("card-screen");
}

async function renderCard() {
  ui.state = await repository.getState();
  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  const team = getSelectedTeam();
  if (!scoreSheet || !assignment || !team) return;

  const score = calculateScore(assignment.template, scoreSheet.values);
  $("#cardTitle").textContent = assignment.template.name;
  $("#teamNumber").value = `${team.number} - ${team.name}`;
  $("#cardTeamNumber").textContent = team.number;
  $("#totalScore").textContent = score.total;
  $("#maxScore").textContent = assignment.template.maxPoints;

  $("#columnsHead").innerHTML = (assignment.template.layout.columns || []).map(column => `<b>${escapeHtml(column.label)}</b>`).join("");
  $("#sections").innerHTML = assignment.template.sections.map(section => renderSection(section, scoreSheet)).join("");
  $("#paperNotes").innerHTML = (assignment.template.layout.notes || []).map(note => `<p>${escapeHtml(note)}</p>`).join("");
  renderSyncStatus();
}

async function restoreVisibleAssessment() {
  if (!ui.currentScoreSheetId) return;
  const scoreSheet = await getCurrentScoreSheet();
  if (!scoreSheet || scoreSheet.approvedAt) return;
  ui.selectedTeamId = scoreSheet.teamId;
  await renderCard();
  showView("card-screen");
}

function renderSection(section, scoreSheet) {
  return `
    <section class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <div>
        ${section.items.map(item => renderItem(item, scoreSheet)).join("")}
      </div>
    </section>`;
}

function renderItem(item, scoreSheet) {
  const value = scoreSheet.values[item.id];
  const capturedTime = scoreSheet.timeCaptures?.[item.id];
  return `
    <div class="row">
      <div class="criterion">
        <span>${escapeHtml(item.label)}${item.required ? '<span class="required">*</span>' : ""}</span>
        ${capturedTime ? `<small class="captured-time">${escapeHtml(capturedTime.elapsedDisplay)} od startu / ${escapeHtml(capturedTime.systemTimeDisplay)}</small>` : ""}
      </div>
      <label class="choice" aria-label="${escapeHtml(item.label)} tak">
        <input type="radio" name="${item.id}" value="yes" data-field-id="${item.id}" ${value === "yes" ? "checked" : ""}>
      </label>
      <label class="choice" aria-label="${escapeHtml(item.label)} nie">
        <input type="radio" name="${item.id}" value="no" data-field-id="${item.id}" ${value === "no" ? "checked" : ""}>
      </label>
      <div class="points">${item.captureTime?.scoreTiming === "deferredRanking" ? (value === "yes" ? "*" : 0) : (value === "yes" ? Number(item.points || 0) : 0)}</div>
    </div>`;
}

async function updateField(fieldId, value) {
  const scoreSheet = await getCurrentScoreSheet();
  if (!scoreSheet || scoreSheet.approvedAt) return;
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  const field = findCardItem(assignment?.template, fieldId);
  const existingCapture = scoreSheet.timeCaptures?.[fieldId];
  let timeCapture = null;
  let removeTimeCapture = false;
  let reason = null;

  if (field?.captureTime?.enabled && field.captureTime.mode === "onYes" && value === "yes") {
    timeCapture = buildTimeCapture({ fieldId, scoreSheet, assignment });
  }

  if (field?.captureTime?.enabled && value === "no" && existingCapture) {
    removeTimeCapture = window.confirm("To pole ma zapisany czas. Czy usunąć zapisany czas?");
    reason = removeTimeCapture
      ? "Sędzia wybrał NIE i usunął zapisany czas."
      : "Sędzia wybrał NIE i pozostawił zapisany czas.";
  }

  await scoringService.updateField({
    scoreSheet,
    fieldId,
    value,
    timeCapture,
    removeTimeCapture,
    reason,
    deviceId: getDeviceId(),
    userId: getUserId()
  });
  await renderCard();
  await renderAudit();
  await renderSyncQueue();
}

async function renderFinishScreen() {
  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  const team = getSelectedTeam();
  if (!scoreSheet || !assignment || !team) return;

  const score = calculateScore(assignment.template, scoreSheet.values);
  const validation = validateCard(assignment.template, scoreSheet.values);
  $("#finishTeamNumber").textContent = team.number;
  $("#finishSummary").textContent = `Suma punktów: ${score.total} / ${assignment.template.maxPoints}`;
  $("#validationBox").innerHTML = validation.length
    ? validation.map(error => `<div class="validation-error">${escapeHtml(error.message)}</div>`).join("")
    : `<div class="validation-ok">Karta gotowa do zatwierdzenia.</div>`;
  $("#approveBtn").disabled = validation.length > 0;
}

async function approveAssessment() {
  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  if (!scoreSheet || !assignment) return;

  const result = await scoringService.approve({
    scoreSheet,
    cardTemplate: assignment.template,
    deviceId: getDeviceId(),
    userId: getUserId()
  });

  if (!result.ok) {
    await renderFinishScreen();
    return;
  }

  const team = getSelectedTeam();
  $("#confirmTeam").textContent = team ? `${team.number} - ${team.name}` : "--";
  $("#confirmScore").textContent = `${result.scoreSheet.finalScore} / ${assignment.template.maxPoints}`;
  $("#confirmStatus").textContent = SyncStatus.QUEUED;
  ui.currentScoreSheetId = null;
  saveUiState();
  await renderAll();
  showView("confirm-screen");
}

async function trySync() {
  const results = await syncService.flush();
  await renderAll();
  const failed = results.find(item => item.status === SyncStatus.FAILED || item.status === SyncStatus.CONFLICT);
  if (failed) {
    $("#syncErrorText").textContent = failed.error || "Wykryto konflikt synchronizacji.";
    showView("sync-error-screen");
  }
}

async function renderRanking() {
  const rows = await rankingService.getGeneralRanking();
  $("#rankingBody").innerHTML = rows.length
    ? rows.map((row, index) => `
      <tr><td>${index + 1}</td><td>${escapeHtml(row.teamNumber)} - ${escapeHtml(row.teamName)}</td><td>${row.completedCompetitions}</td><td><b>${row.total}</b></td></tr>
    `).join("")
    : `<tr><td colspan="4">Brak zatwierdzonych wyników.</td></tr>`;
}

async function renderAudit() {
  const audit = await repository.listAudit();
  $("#auditBody").innerHTML = audit.length
    ? audit.map(entry => `
      <tr>
        <td>${formatDate(entry.occurredAt)}</td>
        <td>${escapeHtml(entry.action)}</td>
        <td>${escapeHtml(entry.entity)}<br><small>${escapeHtml(entry.entityId)}</small></td>
        <td>${escapeHtml(entry.fieldId || "")}</td>
        <td>${escapeHtml(formatValue(entry.previousValue))}</td>
        <td>${escapeHtml(formatValue(entry.newValue))}</td>
        <td>${entry.entityVersion ?? ""}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Brak wpisów audytu.</td></tr>`;
}

async function renderSyncQueue() {
  const operations = await repository.listSyncOperations();
  $("#syncBody").innerHTML = operations.length
    ? operations.map(operation => `
      <tr>
        <td><span class="badge ${operation.status === SyncStatus.SENT ? "ok" : "warn"}">${operation.status}</span></td>
        <td>${escapeHtml(operation.type)}</td>
        <td>${escapeHtml(operation.entity)}<br><small>${escapeHtml(operation.entity_id)}</small></td>
        <td>${operation.entity_version}</td>
        <td>${operation.retry_count}/${operation.max_retries}</td>
        <td><small>${escapeHtml(operation.client_operation_id)}</small></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Kolejka jest pusta.</td></tr>`;
  renderSyncStatus();
}

function renderSyncStatus() {
  const operations = ui.state?.syncOperations || [];
  const failed = operations.filter(item => item.status === SyncStatus.FAILED || item.status === SyncStatus.CONFLICT).length;
  const queued = operations.filter(item => item.status !== SyncStatus.SENT).length;
  if (failed) $("#syncPill").textContent = `Błąd sync: ${failed}`;
  else if (queued) $("#syncPill").textContent = `W kolejce: ${queued}`;
  else $("#syncPill").textContent = "Cache lokalny";
}

function renderTimer(timer) {
  $("#timerDisplay").textContent = timer.display;
  $("#timerMessage").textContent = timer.isFinished
    ? "Koniec czasu"
    : timer.soundActivationMessage;
  $("#competitionTimer").classList.toggle("timer-warning", timer.isWarning);
  $("#competitionTimer").classList.toggle("timer-finished", timer.isFinished);
  $("#timerStartBtn").disabled = timer.running;
  $("#timerPauseBtn").disabled = !timer.running || timer.isFinished;
  $("#timerResumeBtn").disabled = timer.running || timer.isFinished || timer.remainingSeconds === timer.durationSeconds;
  $("#timerResetBtn").textContent = timer.resetLabel;
  $("#timerSoundBtn").textContent = timer.soundEnabled ? "Dźwięk: włączony" : "Dźwięk: wyłączony";
}

function configureTimerForAssignment(assignment) {
  const timer = assignment?.part?.timer || assignment?.template?.timer || assignment?.competition?.timer || {};
  competitionTimerService.configure({
    durationSeconds: timer.durationSeconds || 600,
    warningThresholdSeconds: timer.warningThresholdSeconds || 120
  });
}

function getSelectedTeam() {
  return ui.state.teams.find(team => team.id === ui.selectedTeamId && !team.deletedAt) || null;
}

function getSelectedAssignment() {
  if (!ui.selectedAssignmentKey) return null;
  const [competitionId, partId, templateId] = ui.selectedAssignmentKey.split(":");
  const competition = ui.state.competitions.find(item => item.id === competitionId && !item.deletedAt);
  const part = competition?.parts?.find(item => item.id === partId);
  const template = ui.state.cardTemplates.find(item => item.id === templateId && !item.deletedAt);
  return competition && part && template ? { competition, part, template } : null;
}

function getAssignmentForScoreSheet(scoreSheet) {
  if (!scoreSheet) return null;
  const competition = ui.state.competitions.find(item => item.id === scoreSheet.competitionId && !item.deletedAt);
  const part = competition?.parts?.find(item => item.id === scoreSheet.competitionPartId);
  const template = ui.state.cardTemplates.find(item => item.id === scoreSheet.cardTemplateId && !item.deletedAt);
  return competition && part && template ? { competition, part, template } : null;
}

function findCardItem(cardTemplate, fieldId) {
  if (!cardTemplate) return null;
  for (const section of cardTemplate.sections || []) {
    const item = (section.items || []).find(candidate => candidate.id === fieldId);
    if (item) return item;
  }
  return null;
}

function buildTimeCapture({ fieldId, scoreSheet, assignment }) {
  const timer = competitionTimerService.getSnapshot();
  const capturedAt = new Date();
  return {
    fieldId,
    mode: "onYes",
    timerRemainingSeconds: timer.remainingSeconds,
    timerRemainingDisplay: timer.display,
    elapsedSeconds: timer.elapsedSeconds,
    elapsedDisplay: timer.elapsedDisplay,
    capturedAt: capturedAt.toISOString(),
    systemTimeDisplay: capturedAt.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    userId: getUserId(),
    deviceId: getDeviceId(),
    teamId: scoreSheet.teamId,
    competitionId: assignment?.competition?.id || scoreSheet.competitionId,
    competitionPartId: assignment?.part?.id || scoreSheet.competitionPartId,
    cardTemplateId: scoreSheet.cardTemplateId
  };
}

async function getCurrentScoreSheet() {
  return ui.currentScoreSheetId ? repository.getScoreSheet(ui.currentScoreSheetId) : null;
}

function getDeviceId() {
  return ui.state.device?.deviceId || "device-unassigned";
}

function getUserId() {
  return ui.state.currentUser?.id || null;
}

function restoreUiState() {
  const saved = localStorage.getItem(UI_STATE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    ui.selectedTeamId = parsed.selectedTeamId || null;
    ui.selectedAssignmentKey = parsed.selectedAssignmentKey || null;
    ui.currentScoreSheetId = parsed.currentScoreSheetId || null;
  } catch {
    localStorage.removeItem(UI_STATE_KEY);
  }
}

function saveUiState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({
    selectedTeamId: ui.selectedTeamId,
    selectedAssignmentKey: ui.selectedAssignmentKey,
    currentScoreSheetId: ui.currentScoreSheetId
  }));
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
}

function formatValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch(error => {
  document.body.innerHTML = `<main class="touch-screen"><div class="workflow-panel sync-error"><h1>Nie można uruchomić aplikacji</h1><p>${escapeHtml(error.message)}</p></div></main>`;
});
