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
const AUTH_SESSION_KEY = "omrm-demo-auth-session-v1";

const repository = new DomainRepository();
const syncService = new SyncService(repository);
const auditService = new AuditService(repository);
const scoringService = new ScoringService(repository, syncService, auditService);
const rankingService = new RankingService(repository);
const competitionTimerService = new CompetitionTimerService();

const ui = {
  state: null,
  authAccounts: [],
  authSession: null,
  selectedLoginMode: null,
  editingUserId: null,
  passwordUserId: null,
  userImportRows: [],
  userImportFileName: "",
  assignmentsView: "home",
  selectedAssignmentCompetitionId: null,
  selectedAssignmentJudgeId: null,
  checklistDraftCompetitionId: null,
  equipmentChecklistDraft: [],
  checklistImportRows: [],
  checklistImportFileName: "",
  selectedCompetitionIds: new Set(),
  competitionImportRows: [],
  competitionImportFileName: "",
  competitionImportVisible: false,
  teamsView: "list",
  editingTeamId: null,
  teamImportRows: [],
  teamImportFileName: "",
  selectedTeamIds: new Set(),
  teamNumberDrafts: {},
  invalidTeamNumberIds: new Set(),
  rankingLastUpdatedAt: null,
  rankingView: "general",
  rankingSortCompetitionId: null,
  messagesView: "all",
  auditView: "devices",
  messageComposerOpen: false,
  messageUnconfirmedId: null,
  editingChecklistItemId: null,
  syncConnectionExpanded: false,
  selectedUserIds: new Set(),
  pendingConfirmation: null,
  savingUser: false,
  savingPassword: false,
  appMode: "judge",
  judgeAssignment: null,
  selectedTeamId: null,
  selectedAssignmentKey: null,
  currentScoreSheetId: null,
  invalidFieldIds: new Set(),
  timerNoticeTimeoutId: null
};

async function init() {
  const config = await new ConfigRepository().loadBootstrap();
  resetDemoStartupState(config);
  ui.authAccounts = config.demoAuth?.accounts || [];
  ui.appMode = normalizeAppMode(config.appMode);
  ui.judgeAssignment = config.judgeAssignment || null;
  ui.state = await repository.bootstrap(config);
  restoreUiState();
  restoreAuthSession();
  bindEvents();
  await renderAll();
  if (ui.authSession) {
    applyAuthenticatedSession();
    await restoreVisibleAssessment();
  } else {
    applyLoggedOutState();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

function resetDemoStartupState(config) {
  if (!config.demoMode?.enabled || !config.demoMode?.cleanStart) return;
  localStorage.removeItem(UI_STATE_KEY);
  localStorage.removeItem("omrm-auth-session-v1");
  competitionTimerService.reset();
  ui.selectedTeamId = null;
  ui.selectedAssignmentKey = null;
  ui.currentScoreSheetId = null;
  ui.invalidFieldIds.clear();
}

function bindEvents() {
  document.querySelectorAll("[data-login-mode]").forEach(button => {
    button.addEventListener("click", () => selectLoginMode(button.dataset.loginMode));
  });
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#loginBackBtn").addEventListener("click", showLoginModeChoice);
  $("#adminHomeButton").addEventListener("click", openAdminHome);
  $("#contextSwitcher")?.addEventListener("click", handleContextSwitch);
  $("#eventEditBtn").addEventListener("click", openEventConfigDialog);
  $("#adminMenuToggle").addEventListener("click", toggleAdminMenu);
  $("#eventConfigCancelBtn").addEventListener("click", closeEventConfigDialog);
  $("#eventConfigForm").addEventListener("submit", saveEventConfigFromForm);
  document.querySelectorAll("[data-logout]").forEach(button => {
    button.addEventListener("click", logout);
  });
  $("#addUserBtn").addEventListener("click", openAddUserForm);
  $("#importUsersBtn").addEventListener("click", openImportUsersPanel);
  $("#cancelImportUsersBtn").addEventListener("click", closeImportUsersPanel);
  $("#importUsersFileInput").addEventListener("change", renderImportUsersFileInfo);
  $("#importUsersPanel").addEventListener("input", handleUserImportInput);
  $("#importUsersPanel").addEventListener("change", handleUserImportInput);
  $("#confirmImportUsersBtn").addEventListener("click", importValidUsers);
  $("#cancelUserFormBtn").addEventListener("click", closeUserForm);
  $("#userForm").addEventListener("submit", saveUserFromForm);
  $("#saveUserBtn").addEventListener("click", saveUserFromForm);
  $("#cancelPasswordBtn").addEventListener("click", closePasswordForm);
  $("#passwordForm").addEventListener("submit", savePasswordFromForm);
  $("#passwordForm").querySelector("button[type='submit']").addEventListener("click", savePasswordFromForm);
  $("#usersBody").addEventListener("click", handleUsersTableClick);
  $("#usersBody").addEventListener("change", handleUserSelectionChange);
  $("#userCards").addEventListener("click", handleUsersTableClick);
  $("#userCards").addEventListener("change", handleUserSelectionChange);
  $("#selectAllUsers").addEventListener("change", toggleAllVisibleUsers);
  $("#bulkActionsBar").addEventListener("click", handleBulkActionClick);
  $("#confirmCancelBtn").addEventListener("click", closeConfirmDialog);
  $("#confirmAcceptBtn").addEventListener("click", acceptConfirmDialog);
  $("#refreshRankingBtn").addEventListener("click", renderRanking);
  $("#rankingTabs").addEventListener("click", handleRankingClick);
  $("#rankingContent").addEventListener("click", handleRankingClick);
  $("#clearRankingSortBtn").addEventListener("click", clearRankingSort);
  $("#exportCompetitionPointsBtn").addEventListener("click", exportCompetitionPoints);
  $("#assignmentsContent").addEventListener("click", handleAssignmentsClick);
  $("#assignmentsContent").addEventListener("change", handleAssignmentsChange);
  $("#assignmentsContent").addEventListener("dragstart", handleAssignmentDragStart);
  $("#assignmentsContent").addEventListener("dragover", handleAssignmentDragOver);
  $("#assignmentsContent").addEventListener("dragleave", handleAssignmentDragLeave);
  $("#assignmentsContent").addEventListener("drop", handleAssignmentDrop);
  $("#assignmentsContent").addEventListener("dragend", clearAssignmentDragState);
  $("#teamsContent").addEventListener("click", handleTeamsClick);
  $("#teamsContent").addEventListener("submit", handleTeamsSubmit);
  $("#teamsContent").addEventListener("change", handleTeamsChange);
  $("#messagesContent").addEventListener("click", handleMessagesClick);
  $("#messagesContent").addEventListener("submit", handleMessagesSubmit);
  $("#messagesContent").addEventListener("change", handleMessagesChange);
  $("#auditContent").addEventListener("click", handleAuditClick);
  $("#syncDashboard").addEventListener("click", handleSyncDashboardClick);

  document.querySelectorAll(".tab[data-view]").forEach(button => {
    button.addEventListener("click", () => navigateToView(button.dataset.view));
  });

  document.querySelectorAll("[data-view-target]").forEach(button => {
    button.addEventListener("click", () => navigateToView(button.dataset.viewTarget));
  });

  $("#startAssessmentBtn").addEventListener("click", startAssessment);
  $("#finishAssessmentBtn").addEventListener("click", finishAssessment);
  $("#approveBtn").addEventListener("click", approveAssessment);
  $("#syncNowBtn").addEventListener("click", trySync);
  $("#retrySyncBtn").addEventListener("click", trySync);
  $("#timerStartBtn").addEventListener("click", () => {
    hideTimerStartNotice();
    competitionTimerService.start();
  });
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

  document.addEventListener("click", event => {
    const choice = event.target.closest?.(".choice");
    if (!choice || competitionTimerService.getSnapshot().startedAt) return;
    event.preventDefault();
    showTimerStartNotice();
  });
}

function selectLoginMode(mode) {
  ui.selectedLoginMode = normalizeAppMode(mode);
  document.querySelectorAll("[data-login-mode]").forEach(button => {
    const active = button.dataset.loginMode === ui.selectedLoginMode;
    button.classList.toggle("active", active);
  });
  $("#loginModeStep").hidden = true;
  $("#loginForm").hidden = false;
  $("#loginFormMode").textContent = getLoginModeLabel(ui.selectedLoginMode);
  $("#loginError").hidden = true;
  $("#loginInput").value = "";
  $("#passwordInput").value = "";
  $("#loginInput").focus();
}

function showLoginModeChoice() {
  ui.selectedLoginMode = null;
  $("#loginModeStep").hidden = false;
  $("#loginForm").hidden = true;
  $("#loginError").hidden = true;
  $("#loginInput").value = "";
  $("#passwordInput").value = "";
  document.querySelectorAll("[data-login-mode]").forEach(button => button.classList.remove("active"));
}

function openAdminHome() {
  if (!isAdminPanelMode()) return;
  resetAssignmentsHome();
  resetTeamsHome();
  resetUsersHome();
  closeAdminMenu();
  showView("users-screen");
}

function toggleAdminMenu() {
  const isOpen = !document.body.classList.contains("admin-menu-open");
  document.body.classList.toggle("admin-menu-open", isOpen);
  $("#adminMenuToggle")?.setAttribute("aria-expanded", String(isOpen));
}

function closeAdminMenu() {
  document.body.classList.remove("admin-menu-open");
  $("#adminMenuToggle")?.setAttribute("aria-expanded", "false");
}

function renderEventBranding() {
  const eventConfig = getEventConfig();
  const eventMeta = formatEventMeta(eventConfig);
  const loginLogo = $(".login-logo");
  const headerLogo = $("#headerLogo");
  if (loginLogo) loginLogo.src = eventConfig.logo;
  if (headerLogo) headerLogo.src = eventConfig.logo;
  const eventInfo = $(".event-info");
  if (eventInfo) eventInfo.textContent = eventMeta;
  const headerEventName = $("#headerEventName");
  if (headerEventName) headerEventName.textContent = eventConfig.eventName;
  const headerEventMeta = $("#headerEventMeta");
  if (headerEventMeta) headerEventMeta.textContent = eventMeta;
}

function openEventConfigDialog() {
  if (!requireAdminPermission()) return;
  const eventConfig = getEventConfig();
  $("#eventNameInput").value = eventConfig.eventName;
  $("#eventLocationInput").value = eventConfig.location;
  $("#eventDateFromInput").value = eventConfig.dateFrom;
  $("#eventDateToInput").value = eventConfig.dateTo;
  hideEventConfigError();
  const dialog = $("#eventConfigDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeEventConfigDialog() {
  const dialog = $("#eventConfigDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  hideEventConfigError();
}

async function saveEventConfigFromForm(event) {
  event.preventDefault();
  if (!requireAdminPermission()) return;
  const eventName = $("#eventNameInput").value.trim();
  const location = $("#eventLocationInput").value.trim();
  const dateFrom = $("#eventDateFromInput").value;
  const dateTo = $("#eventDateToInput").value;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    showEventConfigError("Data rozpoczęcia nie może być późniejsza niż data zakończenia.");
    return;
  }
  const previous = getEventConfig();
  await repository.updateEventConfig({
    ...previous,
    eventName,
    location,
    dateFrom,
    dateTo
  });
  ui.state = await repository.getState();
  renderEventBranding();
  closeEventConfigDialog();
  showAppNotice("Dane zawodów zapisane.");
}

function showEventConfigError(message) {
  const box = $("#eventConfigError");
  box.textContent = message;
  box.hidden = false;
}

function hideEventConfigError() {
  const box = $("#eventConfigError");
  box.textContent = "";
  box.hidden = true;
}

function showAppNotice(message) {
  const box = $("#appNotice");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  window.clearTimeout(showAppNotice.timeoutId);
  showAppNotice.timeoutId = window.setTimeout(() => {
    box.hidden = true;
    box.textContent = "";
  }, 3000);
}

function getLoginModeLabel(mode) {
  if (mode === "admin") return "Logowanie administratora";
  if (mode === "office") return "Logowanie biura zawodów";
  return "Logowanie sędziego";
}

function getCurrentModeBadge() {
  if (ui.appMode === "admin") return "ADMINISTRACJA";
  if (ui.appMode === "office") return "BIURO";
  return "SĘDZIA";
}

function getDefaultViewForCurrentMode() {
  return isAdminPanelMode() ? "users-screen" : "team-screen";
}

function getSessionRoles() {
  const sessionRoles = ui.authSession?.roles?.map(normalizeRole).filter(Boolean) || [];
  const accountRoles = getLoginAccounts()
    .find(account => account.id === ui.authSession?.id || account.login === ui.authSession?.login)
    ?.roles || [];
  return [...new Set([...sessionRoles, ...accountRoles].map(normalizeRole).filter(Boolean))];
}

function hasSessionRole(role) {
  const normalized = normalizeRole(role);
  return normalized ? getSessionRoles().includes(normalized) : false;
}

function userHasRole(user, role) {
  const normalized = normalizeRole(role);
  const roles = user?.roles?.map(normalizeRole).filter(Boolean) || [];
  return Boolean(normalized && roles.includes(normalized));
}

function isAdminPanelMode() {
  return ui.appMode === "admin" || ui.appMode === "office";
}

function canManageAdminData() {
  return hasSessionRole("admin");
}

function canSendMessages() {
  return hasSessionRole("admin") || hasSessionRole("office");
}

function canRunSync() {
  return hasSessionRole("admin") || hasSessionRole("office");
}

function requireAdminPermission() {
  if (canManageAdminData()) return true;
  showPermissionDenied();
  return false;
}

function requireMessagePermission() {
  if (canSendMessages()) return true;
  showPermissionDenied();
  return false;
}

function requireSyncPermission() {
  if (canRunSync()) return true;
  showPermissionDenied();
  return false;
}

function showPermissionDenied() {
  showAppNotice("Funkcja dostępna tylko dla administratora.");
}

function adminWriteAttributes() {
  return canManageAdminData()
    ? ""
    : ` disabled aria-disabled="true"`;
}

function applyAccessControl() {
  const locked = isAdminPanelMode() && !canManageAdminData();
  document.querySelectorAll("[data-admin-write]").forEach(element => {
    element.disabled = locked;
    element.setAttribute("aria-disabled", String(locked));
    if (locked) {
      if (element.hasAttribute("title")) element.dataset.originalTitle = element.getAttribute("title");
      element.setAttribute("title", "Funkcja dostępna tylko dla administratora.");
    } else if (element.dataset.originalTitle) {
      element.setAttribute("title", element.dataset.originalTitle);
      delete element.dataset.originalTitle;
    } else if (element.getAttribute("title") === "Funkcja dostępna tylko dla administratora.") {
      element.removeAttribute("title");
    }
  });
}

function renderContextSwitcher() {
  const switcher = $("#contextSwitcher");
  if (!switcher) return;
  const visible = Boolean(ui.authSession && hasSessionRole("admin"));
  switcher.hidden = !visible;
  if (!visible) return;
  switcher.querySelectorAll("[data-context-mode]").forEach(button => {
    const active = normalizeAppMode(button.dataset.contextMode) === ui.appMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function handleLogin(event) {
  event.preventDefault();
  if (!ui.selectedLoginMode) {
    showLoginModeChoice();
    return;
  }
  const login = $("#loginInput").value.trim();
  const password = $("#passwordInput").value;
  const account = getLoginAccounts().find(candidate =>
    candidate.status !== "inactive" &&
    candidate.login === login &&
    candidate.password === password &&
    userHasRole(candidate, ui.selectedLoginMode)
  );

  if (!account) {
    $("#loginError").hidden = false;
    return;
  }

  ui.authSession = {
    id: account.id,
    login: account.login,
    displayName: account.displayName || account.login,
    roles: account.roles,
    mode: ui.selectedLoginMode
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(ui.authSession));
  $("#loginError").hidden = true;
  $("#passwordInput").value = "";
  applyAuthenticatedSession();
  await renderAll();
  await restoreVisibleAssessment();
  showView(getDefaultViewForCurrentMode());
}

function getLoginAccounts() {
  const map = new Map();
  for (const account of ui.authAccounts || []) {
    map.set(account.id, {
      ...account,
      roles: account.roles?.map(normalizeRole).filter(Boolean) || [normalizeRole(account.mode)].filter(Boolean),
      status: account.status || "active"
    });
  }
  for (const user of getDisplayUsers()) {
    map.set(user.id, {
      id: user.id,
      login: user.login,
      password: user.password,
      roles: user.roles,
      status: user.status,
      displayName: getUserFullName(user)
    });
  }
  return [...map.values()];
}

function restoreAuthSession() {
  const saved = sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (!parsed?.mode || !parsed?.login) throw new Error("Invalid session");
    ui.authSession = {
      id: parsed.id || parsed.login,
      login: parsed.login,
      displayName: parsed.displayName || parsed.login,
      roles: parsed.roles?.map(normalizeRole).filter(Boolean) || [],
      mode: normalizeAppMode(parsed.mode)
    };
  } catch {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    ui.authSession = null;
  }
}

function applyAuthenticatedSession() {
  ui.appMode = normalizeAppMode(ui.authSession?.mode);
  document.body.classList.add("authenticated");
  document.body.classList.remove("logged-out");
  $("#modePill").textContent = `${getCurrentModeBadge()} · ${ui.authSession?.displayName || ""}`;
  renderContextSwitcher();
  applyAppMode();
}

function applyLoggedOutState() {
  ui.authSession = null;
  document.body.classList.add("logged-out");
  document.body.classList.remove("authenticated");
  $("#modePill").textContent = "Tryb";
  renderContextSwitcher();
  showLoginModeChoice();
}

function logout() {
  closeAdminMenu();
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  ui.authSession = null;
  ui.currentScoreSheetId = null;
  saveUiState();
  competitionTimerService.reset();
  applyLoggedOutState();
  showView("team-screen");
}

function handleContextSwitch(event) {
  const button = event.target.closest("[data-context-mode]");
  if (!button || !hasSessionRole("admin")) return;
  const nextMode = normalizeAppMode(button.dataset.contextMode);
  ui.authSession = {
    ...ui.authSession,
    mode: nextMode
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(ui.authSession));
  applyAuthenticatedSession();
  closeAdminMenu();
  showView(getDefaultViewForCurrentMode());
}

function showTimerStartNotice() {
  const notice = $("#timerStartNotice");
  notice.hidden = false;
  window.clearTimeout(ui.timerNoticeTimeoutId);
  ui.timerNoticeTimeoutId = window.setTimeout(hideTimerStartNotice, 3000);
}

function hideTimerStartNotice() {
  const notice = $("#timerStartNotice");
  if (notice) notice.hidden = true;
  window.clearTimeout(ui.timerNoticeTimeoutId);
  ui.timerNoticeTimeoutId = null;
}

async function renderAll() {
  ui.state = await repository.getState();
  const deviceLabel = $("#deviceLabel");
  if (deviceLabel) deviceLabel.textContent = ui.state.device?.label || "Tablet";
  renderEventBranding();
  applyAppMode();
  renderTeamList();
  renderUsers();
  renderAdminAssignments();
  renderAdminTeams();
  renderSyncStatus();
  await renderRanking();
  await renderAudit();
  await renderMessages();
  await renderSyncDashboard();
}

function showView(id) {
  if (!canShowView(id)) id = "team-screen";
  document.querySelectorAll(".view, .tab").forEach(el => el.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelectorAll(`[data-view="${id}"]`).forEach(el => el.classList.add("active"));
  if (id === "users-screen") renderUsers();
  if (id === "assignments-screen") renderAdminAssignments();
  if (id === "teams-screen") renderAdminTeams();
  if (id === "ranking-screen") renderRanking();
  if (id === "audit-screen") renderAudit();
  if (id === "messages-screen") renderMessages();
  if (id === "sync-screen") renderSyncDashboard();
  window.scrollTo(0, 0);
}

async function navigateToView(id) {
  const leavingActiveCard = document.getElementById("card-screen")?.classList.contains("active")
    && id !== "card-screen"
    && id !== "finish-screen"
    && ui.currentScoreSheetId;
  if (leavingActiveCard && !(await validateActiveCardBeforeClose())) return;
  if (id === "assignments-screen") resetAssignmentsHome();
  if (id === "teams-screen") resetTeamsHome();
  if (id === "users-screen") resetUsersHome();
  if (id === "messages-screen") resetMessagesHome();
  if (id === "audit-screen") resetAuditHome();
  if (id === "sync-screen") resetSyncHome();
  closeAdminMenu();
  showView(id);
}

function applyAppMode() {
  document.body.dataset.appMode = isAdminPanelMode() ? "admin" : "judge";
  document.body.dataset.workMode = ui.appMode;
  const adminOnlyViews = ["users-screen", "assignments-screen", "teams-screen", "ranking-screen", "messages-screen", "audit-screen", "sync-screen", "sync-error-screen"];
  for (const viewId of adminOnlyViews) {
    const view = document.getElementById(viewId);
    if (view) view.hidden = !isAdminPanelMode();
  }
  document.querySelectorAll("[data-view]").forEach(button => {
    const viewId = button.dataset.view;
    const adminOnly = adminOnlyViews.includes(viewId);
    button.hidden = !isAdminPanelMode() && adminOnly;
  });
  const nav = document.querySelector(".topbar nav");
  if (nav) nav.hidden = !isAdminPanelMode();
  const syncPill = $("#syncPill");
  if (syncPill) syncPill.hidden = !isAdminPanelMode();
  if (!isAdminPanelMode() && adminOnlyViews.includes(document.querySelector(".view.active")?.id)) {
    showView("team-screen");
  }
  applyAccessControl();
}

function canShowView(id) {
  if (isAdminPanelMode()) return true;
  return !["users-screen", "assignments-screen", "teams-screen", "ranking-screen", "messages-screen", "audit-screen", "sync-screen", "sync-error-screen"].includes(id);
}

function renderUsers() {
  const body = $("#usersBody");
  if (!body || !ui.state) return;
  const users = getDisplayUsers();
  pruneSelectedUsers(users);
  const usersCount = $("#usersCount");
  if (usersCount) usersCount.textContent = users.length;
  body.innerHTML = users.length
    ? users.map(user => `
      <tr data-user-id="${escapeHtml(user.id)}">
        <td class="select-column">
          <input type="checkbox" class="user-select" data-user-id="${escapeHtml(user.id)}" aria-label="Zaznacz użytkownika ${escapeHtml(getUserFullName(user))}" ${ui.selectedUserIds.has(user.id) ? "checked" : ""}${adminWriteAttributes()}>
        </td>
        <td><strong>${escapeHtml(getUserFullName(user))}</strong></td>
        <td>${escapeHtml(user.login)}</td>
        <td>${formatUserRoles(user.roles)}</td>
        <td>${escapeHtml(formatAssignments(user))}</td>
        <td><span class="badge ${user.status === "active" ? "ok" : "warn"}">${user.status === "active" ? "Aktywny" : "Nieaktywny"}</span></td>
        <td>
          <div class="table-actions">
            <button type="button" class="secondary compact-button" data-user-action="edit" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Edytuj</button>
            <button type="button" class="secondary compact-button" data-user-action="password" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Zmień hasło</button>
            <button type="button" class="secondary compact-button danger-button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Usuń</button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Brak użytkowników.</td></tr>`;
  renderUserCards(users);
  renderBulkActions(users);
  applyAccessControl();
}

function getDisplayUsers() {
  const map = new Map();
  const deletedUserIds = new Set((ui.state.users || []).filter(user => user.deletedAt).map(user => user.id));
  for (const account of ui.authAccounts || []) {
    if (deletedUserIds.has(account.id)) continue;
    map.set(account.id, normalizeUser({
      id: account.id,
      firstName: account.firstName,
      lastName: account.lastName,
      displayName: account.displayName,
      login: account.login,
      password: account.password,
      roles: account.roles || [account.mode],
      status: account.status || "active"
    }));
  }
  for (const user of ui.state.users || []) {
    if (user.deletedAt) {
      map.delete(user.id);
      continue;
    }
    map.set(user.id, normalizeUser(user));
  }
  return [...map.values()].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b), "pl"));
}

function renderUserCards(users) {
  const cards = $("#userCards");
  if (!cards) return;
  cards.innerHTML = users.length
    ? `
      <label class="card-select-all">
        <input type="checkbox" class="select-all-users" ${areAllVisibleUsersSelected(users) ? "checked" : ""}${adminWriteAttributes()}>
        Zaznacz wszystkich
      </label>
      ${users.map(user => `
        <article class="user-card" data-user-id="${escapeHtml(user.id)}">
        <label class="user-card-select">
          <input type="checkbox" class="user-select" data-user-id="${escapeHtml(user.id)}" aria-label="Zaznacz użytkownika ${escapeHtml(getUserFullName(user))}" ${ui.selectedUserIds.has(user.id) ? "checked" : ""}${adminWriteAttributes()}>
          <span>Zaznacz</span>
        </label>
        <h3>${escapeHtml(getUserFullName(user))}</h3>
        <dl>
          <div><dt>Login</dt><dd>${escapeHtml(user.login)}</dd></div>
          <div><dt>Uprawnienia</dt><dd>${formatUserRoles(user.roles)}</dd></div>
          <div><dt>Przydział</dt><dd>${escapeHtml(formatAssignments(user))}</dd></div>
          <div><dt>Status</dt><dd><span class="badge ${user.status === "active" ? "ok" : "warn"}">${user.status === "active" ? "Aktywny" : "Nieaktywny"}</span></dd></div>
        </dl>
        <div class="table-actions">
          <button type="button" class="secondary compact-button" data-user-action="edit" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Edytuj</button>
          <button type="button" class="secondary compact-button" data-user-action="password" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Zmień hasło</button>
          <button type="button" class="secondary compact-button danger-button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}"${adminWriteAttributes()}>Usuń</button>
        </div>
        </article>
      `).join("")}`
    : `<div class="empty-state">Brak użytkowników.</div>`;
}

function renderBulkActions(users = getDisplayUsers()) {
  const selectedCount = ui.selectedUserIds.size;
  $("#bulkActionsBar").hidden = selectedCount === 0;
  $("#selectedUsersCount").textContent = selectedCount;
  const selectAll = $("#selectAllUsers");
  const visibleIds = users.map(user => user.id);
  const selectedVisibleCount = visibleIds.filter(id => ui.selectedUserIds.has(id)).length;
  selectAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  document.querySelectorAll(".select-all-users").forEach(input => {
    input.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    input.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  });
  if (selectedCount === 0) closeBulkMenus();
}

function areAllVisibleUsersSelected(users) {
  return users.length > 0 && users.every(user => ui.selectedUserIds.has(user.id));
}

function pruneSelectedUsers(users = getDisplayUsers()) {
  const visibleIds = new Set(users.map(user => user.id));
  for (const id of [...ui.selectedUserIds]) {
    if (!visibleIds.has(id)) ui.selectedUserIds.delete(id);
  }
}

function normalizeUser(user) {
  const roles = Array.isArray(user.roles)
    ? user.roles
    : user.mode
      ? [user.mode]
      : [];
  const nameParts = splitDisplayName(user.displayName);
  return {
    id: user.id,
    firstName: user.firstName || nameParts.firstName || "",
    lastName: user.lastName || nameParts.lastName || "",
    displayName: user.displayName || "",
    login: user.login || "",
    password: user.password || "",
    roles: [...new Set(roles.map(normalizeRole).filter(Boolean))],
    status: user.status === "inactive" ? "inactive" : "active",
    deletedAt: user.deletedAt || null,
    deletedBy: user.deletedBy || null
  };
}

function splitDisplayName(displayName = "") {
  const parts = String(displayName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrator") return "admin";
  if (normalized === "office" || normalized === "biuro") return "office";
  if (normalized === "judge" || normalized === "sedzia" || normalized === "sędzia") return "judge";
  return null;
}

function isImportTruthy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "tak", "true", "yes", "x", "✓", "t", "y"].includes(normalized);
}

function normalizeImportStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return ["nieaktywny", "nieaktywna", "inactive", "0", "false"].includes(normalized) ? "inactive" : "active";
}

function transliterateLogin(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[łŁ]/g, character => character === "Ł" ? "L" : "l")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

function makeUniqueImportLogin(baseLogin, usedLogins, generatedCounts) {
  const base = transliterateLogin(baseLogin) || "User";
  const baseKey = base.toLowerCase();
  const nextNumber = (generatedCounts.get(baseKey) || 0) + 1;
  generatedCounts.set(baseKey, nextNumber);
  let candidate = nextNumber === 1 ? base : `${base}${nextNumber}`;
  let suffix = nextNumber;
  while (usedLogins.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  usedLogins.add(candidate.toLowerCase());
  return candidate;
}

function getUserFullName(user) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.displayName || user.login || "--";
}

function formatUserRoles(roles = []) {
  const labels = [];
  const normalizedRoles = roles.map(normalizeRole).filter(Boolean);
  if (normalizedRoles.includes("judge")) labels.push("Sędzia");
  if (normalizedRoles.includes("office")) labels.push("Biuro");
  if (normalizedRoles.includes("admin")) labels.push("Administrator");
  return labels.length ? labels.map(label => `<span class="role-chip">${label}</span>`).join(" ") : "—";
}

function formatAssignments(user) {
  if (!userHasRole(user, "judge")) return "—";
  const assignment = getActiveJudgeAssignment(user.id);
  return assignment ? getCompetitionName(assignment.competitionId) : "Brak";
}

function openAddUserForm() {
  if (!requireAdminPermission()) return;
  ui.editingUserId = null;
  $("#userFormTitle").textContent = "Dodaj użytkownika";
  $("#saveUserBtn").textContent = "Dodaj użytkownika";
  $("#userIdInput").value = "";
  $("#userFirstNameInput").value = "";
  $("#userLastNameInput").value = "";
  $("#userAccountInput").value = "";
  $("#userSecretInput").value = "";
  $("#userPasswordLabel").hidden = false;
  $("#roleJudgeInput").checked = false;
  $("#roleOfficeInput").checked = false;
  $("#roleAdminInput").checked = false;
  document.querySelector("input[name='userStatus'][value='active']").checked = true;
  hideUserFormError();
  hideBulkMessage();
  closePasswordForm();
  closeImportUsersPanel();
  $("#userFormPanel").hidden = false;
  $("#userFirstNameInput").focus();
}

function openEditUserForm(userId) {
  if (!requireAdminPermission()) return;
  const user = getDisplayUsers().find(item => item.id === userId);
  if (!user) return;
  ui.editingUserId = user.id;
  $("#userFormTitle").textContent = "Edytuj użytkownika";
  $("#saveUserBtn").textContent = "Zapisz zmiany";
  $("#userIdInput").value = user.id;
  $("#userFirstNameInput").value = user.firstName;
  $("#userLastNameInput").value = user.lastName;
  $("#userAccountInput").value = user.login;
  $("#userSecretInput").value = "";
  $("#userPasswordLabel").hidden = true;
  $("#roleJudgeInput").checked = userHasRole(user, "judge");
  $("#roleOfficeInput").checked = userHasRole(user, "office");
  $("#roleAdminInput").checked = userHasRole(user, "admin");
  document.querySelector(`input[name='userStatus'][value='${user.status}']`).checked = true;
  hideUserFormError();
  hideBulkMessage();
  closePasswordForm();
  closeImportUsersPanel();
  $("#userFormPanel").hidden = false;
  $("#userFirstNameInput").focus();
}

function closeUserForm() {
  ui.editingUserId = null;
  $("#userFormPanel").hidden = true;
  hideUserFormError();
}

function openImportUsersPanel() {
  if (!requireAdminPermission()) return;
  closeUserForm();
  closePasswordForm();
  hideBulkMessage();
  $("#importUsersPanel").hidden = false;
  $("#importUsersFileInput").focus();
}

function closeImportUsersPanel() {
  const panel = $("#importUsersPanel");
  if (!panel) return;
  panel.hidden = true;
  $("#importUsersFileInput").value = "";
  ui.userImportRows = [];
  ui.userImportFileName = "";
  const info = $("#importUsersFileInfo");
  info.textContent = "";
  info.hidden = true;
  $("#importUsersPreview").innerHTML = "";
  $("#confirmImportUsersBtn").hidden = true;
}

function resetUsersHome() {
  closeUserForm();
  closePasswordForm();
  closeImportUsersPanel();
  closeBulkMenus();
  hideBulkMessage();
}

function renderImportUsersFileInfo(event) {
  const file = event.target.files?.[0];
  const info = $("#importUsersFileInfo");
  ui.userImportRows = [];
  ui.userImportFileName = file?.name || "";
  $("#importUsersPreview").innerHTML = "";
  $("#confirmImportUsersBtn").hidden = true;
  if (!file) {
    info.textContent = "";
    info.hidden = true;
    return;
  }
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  info.textContent = `Wybrano plik: ${file.name} (${sizeKb} KB). Odczytuję dane...`;
  info.hidden = false;
  readUserImportFile(file);
}

function readUserImportFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const rows = /\.xlsx$/i.test(file.name)
        ? rowsToUserImportObjects(await parseXlsxRows(reader.result))
        : rowsToUserImportObjects(parseCsvRows(String(reader.result || "")));
      ui.userImportRows = buildUserImportPreview(rows);
      renderUserImportPreview();
    } catch (error) {
      ui.userImportRows = [{
        rowNumber: 1,
        firstName: "",
        lastName: "",
        login: "",
        password: "",
        roles: [],
        status: "active",
        valid: false,
        errors: [error.message]
      }];
      renderUserImportPreview();
    }
  };
  if (/\.xlsx$/i.test(file.name)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, "utf-8");
}

function rowsToUserImportObjects(rows) {
  const cleaned = rows
    .map(row => row.map(cell => String(cell ?? "").trim()))
    .filter(row => row.some(Boolean));
  if (cleaned.length < 2) throw new Error("Plik nie zawiera danych użytkowników.");
  const headers = cleaned[0].map(normalizeImportHeader);
  const firstNameIndex = findImportColumn(headers, ["imie", "imię", "first name", "firstname"]);
  const lastNameIndex = findImportColumn(headers, ["nazwisko", "last name", "lastname"]);
  if (firstNameIndex === -1 || lastNameIndex === -1) throw new Error("Brakuje wymaganych kolumn: Imię oraz Nazwisko.");
  return cleaned.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    firstName: row[firstNameIndex] || "",
    lastName: row[lastNameIndex] || "",
    login: "",
    password: "",
    roles: ["judge"],
    status: "active"
  }));
}

function buildUserImportPreview(rows) {
  const usedLogins = new Set(getDisplayUsers().map(user => user.login.toLowerCase()));
  const generatedCounts = new Map();
  return rows.map(row => {
    const firstName = String(row.firstName || "").trim();
    const lastName = String(row.lastName || "").trim();
    const baseLogin = transliterateLogin(`${firstName}${lastName}`);
    const login = makeUniqueImportLogin(baseLogin, usedLogins, generatedCounts);
    const next = {
      ...row,
      firstName,
      lastName,
      login,
      password: "",
      roles: ["judge"],
      status: "active"
    };
    return validateUserImportRow(next);
  });
}

function validateUserImportRow(row) {
  const errors = [];
  if (!row.firstName) errors.push("brak imienia");
  if (!row.lastName) errors.push("brak nazwiska");
  if (!row.login) errors.push("brak loginu");
  return { ...row, valid: errors.length === 0, errors };
}

function renderUserImportPreview() {
  const rows = ui.userImportRows || [];
  const validRows = rows.filter(row => row.valid);
  $("#importUsersFileInfo").textContent = ui.userImportFileName
    ? `Plik: ${ui.userImportFileName}. Wykryto ${rows.length} ${pluralizeRows(rows.length)}.`
    : "";
  $("#importUsersPreview").innerHTML = rows.length ? `
    <div class="import-summary">
      <strong>Podgląd importu sędziów</strong>
      <span>Poprawne: ${validRows.length}</span>
      <span>Wymagają poprawy: ${rows.length - validRows.length}</span>
    </div>
    <div class="table-shell teams-table-shell">
      <table class="users-table users-import-table">
        <thead><tr><th>Imię</th><th>Nazwisko</th><th>Login</th><th>Stan</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.firstName)}</td>
              <td>${escapeHtml(row.lastName)}</td>
              <td><strong>${escapeHtml(row.login)}</strong></td>
              <td><span class="badge ${row.valid ? "ok" : "warn"}">${escapeHtml(row.valid ? "Gotowy" : row.errors.join(", "))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : "";
  const button = $("#confirmImportUsersBtn");
  button.hidden = rows.length === 0;
  button.disabled = validRows.length === 0;
  button.textContent = `Importuj ${validRows.length} ${pluralizeJudges(validRows.length)}`;
}

function handleUserImportInput(event) {
  const input = event.target.closest(".user-import-input");
  if (!input) return;
  const index = Number(input.dataset.userImportIndex);
  const field = input.dataset.userImportField;
  if (!ui.userImportRows[index] || !field) return;
  if (field === "role-judge" || field === "role-admin") {
    const role = field === "role-judge" ? "judge" : "admin";
    const roles = new Set(ui.userImportRows[index].roles || []);
    if (input.checked) roles.add(role);
    else roles.delete(role);
    ui.userImportRows[index].roles = [...roles];
  } else if (field === "status") {
    ui.userImportRows[index].status = input.value;
  } else {
    ui.userImportRows[index][field] = input.value.trim();
  }
  ui.userImportRows[index] = validateUserImportRow(ui.userImportRows[index]);
  renderUserImportPreview();
}

async function importValidUsers() {
  if (!requireAdminPermission()) return;
  const rows = (ui.userImportRows || []).filter(row => row.valid);
  if (!rows.length) return;
  const now = new Date().toISOString();
  for (const row of rows) {
    const user = {
      id: createLocalUserId(),
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: `${row.firstName} ${row.lastName}`,
      login: row.login,
      password: "",
      roles: ["judge"],
      status: "active",
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now
    };
    await repository.upsertUser(user);
    upsertAuthAccountFromUser(user);
  }
  ui.state = await repository.getState();
  renderUsers();
  closeImportUsersPanel();
}

async function saveUserFromForm(event) {
  event.preventDefault();
  if (!requireAdminPermission()) return;
  if (ui.savingUser) return;
  ui.savingUser = true;
  const existingUsers = getDisplayUsers();
  const userId = $("#userIdInput").value || createLocalUserId();
  const isEdit = Boolean(ui.editingUserId);
  const previous = existingUsers.find(user => user.id === userId);
  const firstName = $("#userFirstNameInput").value.trim();
  const lastName = $("#userLastNameInput").value.trim();
  const login = $("#userAccountInput").value.trim();
  const password = $("#userSecretInput").value;
  const roles = [
    $("#roleJudgeInput").checked ? "judge" : null,
    $("#roleOfficeInput").checked ? "office" : null,
    $("#roleAdminInput").checked ? "admin" : null
  ].filter(Boolean);
  const status = document.querySelector("input[name='userStatus']:checked")?.value || "active";

  const error = validateUserForm({ userId, isEdit, firstName, lastName, login, password, roles, users: existingUsers });
  if (error) {
    showUserFormError(error);
    ui.savingUser = false;
    return;
  }

  const user = {
    id: userId,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    login,
    password: isEdit ? previous?.password || "" : password,
    roles,
    status,
    deletedAt: null,
    deletedBy: null,
    updatedAt: new Date().toISOString(),
    createdAt: previous?.createdAt || new Date().toISOString()
  };

  try {
    await repository.upsertUser(user);
    upsertAuthAccountFromUser(user);
    ui.state = await repository.getState();
    renderUsers();
    closeUserForm();
  } catch (error) {
    showUserFormError(`Nie udało się zapisać użytkownika: ${error.message}`);
  } finally {
    ui.savingUser = false;
  }
}

function validateUserForm({ userId, isEdit, firstName, lastName, login, password, roles, users }) {
  if (!firstName) return "Imię jest wymagane.";
  if (!lastName) return "Nazwisko jest wymagane.";
  if (!login) return "Login jest wymagany.";
  if (!isEdit && !password) return "Hasło jest wymagane.";
  if (!roles.length) return "Zaznacz przynajmniej jedno uprawnienie.";
  const duplicate = users.find(user => user.login.toLowerCase() === login.toLowerCase() && user.id !== userId);
  if (duplicate) return "Ten login jest już używany.";
  return null;
}

function showUserFormError(message) {
  const box = $("#userFormError");
  box.textContent = message;
  box.hidden = false;
}

function hideUserFormError() {
  const box = $("#userFormError");
  box.textContent = "";
  box.hidden = true;
}

function handleUsersTableClick(event) {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;
  if (!requireAdminPermission()) return;
  const userId = button.dataset.userId;
  if (button.dataset.userAction === "edit") openEditUserForm(userId);
  if (button.dataset.userAction === "password") openPasswordForm(userId);
  if (button.dataset.userAction === "delete") requestDeleteUser(userId);
}

function handleUserSelectionChange(event) {
  if (event.target.matches(".select-all-users")) {
    toggleAllVisibleUsers(event);
    return;
  }
  if (!event.target.matches(".user-select")) return;
  hideBulkMessage();
  const userId = event.target.dataset.userId;
  if (event.target.checked) ui.selectedUserIds.add(userId);
  else ui.selectedUserIds.delete(userId);
  renderUsers();
}

function toggleAllVisibleUsers(event) {
  hideBulkMessage();
  const users = getDisplayUsers();
  if (event.target.checked) {
    users.forEach(user => ui.selectedUserIds.add(user.id));
  } else {
    users.forEach(user => ui.selectedUserIds.delete(user.id));
  }
  renderUsers();
}

function handleBulkActionClick(event) {
  const menuButton = event.target.closest("[data-bulk-menu]");
  if (menuButton && !requireAdminPermission()) return;
  if (menuButton) {
    toggleBulkMenu(menuButton.dataset.bulkMenu);
    return;
  }
  const actionButton = event.target.closest("[data-bulk-action]");
  if (!actionButton) return;
  if (!requireAdminPermission()) return;
  const action = actionButton.dataset.bulkAction;
  if (action === "add-role" || action === "remove-role") {
    applyBulkRoleOperation(action, actionButton.dataset.role);
  }
  if (action === "set-status") {
    applyBulkStatusOperation(actionButton.dataset.status);
  }
  if (action === "delete") {
    requestBulkDeleteUsers();
  }
}

function toggleBulkMenu(menu) {
  const rolesMenu = $("#bulkRolesMenu");
  const statusMenu = $("#bulkStatusMenu");
  rolesMenu.hidden = menu !== "roles" || !rolesMenu.hidden;
  statusMenu.hidden = menu !== "status" || !statusMenu.hidden;
  if (menu === "roles") statusMenu.hidden = true;
  if (menu === "status") rolesMenu.hidden = true;
}

function closeBulkMenus() {
  $("#bulkRolesMenu").hidden = true;
  $("#bulkStatusMenu").hidden = true;
}

function getSelectedUsers() {
  const usersById = new Map(getDisplayUsers().map(user => [user.id, user]));
  return [...ui.selectedUserIds].map(id => usersById.get(id)).filter(Boolean);
}

function requestDeleteUser(userId) {
  if (!requireAdminPermission()) return;
  hideBulkMessage();
  const user = getDisplayUsers().find(item => item.id === userId);
  if (!user) return;
  const error = validateUsersDeletion([user]);
  if (error) {
    showBulkMessage(error);
    return;
  }
  showConfirmDialog({
    title: "Usuń użytkownika",
    message: `Czy na pewno chcesz usunąć użytkownika ${getUserFullName(user)}?`,
    confirmLabel: "Usuń użytkownika",
    onConfirm: () => softDeleteUsers([user])
  });
}

function requestBulkDeleteUsers() {
  hideBulkMessage();
  closeBulkMenus();
  const users = getSelectedUsers();
  if (!users.length) return;
  const error = validateUsersDeletion(users);
  if (error) {
    showBulkMessage(error);
    return;
  }
  showConfirmDialog({
    title: "Usuń użytkowników",
    message: `Zaznaczono ${users.length} ${pluralizeUsers(users.length)}.\nCzy na pewno chcesz ich usunąć?`,
    confirmLabel: `Usuń ${users.length} ${pluralizeUsers(users.length)}`,
    onConfirm: () => softDeleteUsers(users)
  });
}

async function softDeleteUsers(users) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  for (const user of users) {
    await repository.upsertUser({
      ...user,
      deletedAt: now,
      deletedBy: getUserId(),
      updatedAt: now
    });
    removeAuthAccount(user.id);
    ui.selectedUserIds.delete(user.id);
  }
  ui.state = await repository.getState();
  renderUsers();
  showBulkMessage(users.length === 1 ? "Użytkownik został usunięty." : `Usunięto ${users.length} ${pluralizeUsers(users.length)}.`, "ok");
}

async function applyBulkRoleOperation(action, role) {
  if (!requireAdminPermission()) return;
  hideBulkMessage();
  closeBulkMenus();
  const users = getSelectedUsers();
  if (!users.length) return;
  const nextUsers = users.map(user => {
    const roles = new Set(user.roles);
    if (action === "add-role") roles.add(role);
    if (action === "remove-role") roles.delete(role);
    return { ...user, roles: [...roles] };
  });
  const error = validateUsersMutation(nextUsers, { roleOperation: { action, role } });
  if (error) {
    showBulkMessage(error);
    return;
  }
  await saveBulkUsers(nextUsers);
  showBulkMessage("Uprawnienia zostały zaktualizowane.", "ok");
}

async function applyBulkStatusOperation(status) {
  if (!requireAdminPermission()) return;
  hideBulkMessage();
  closeBulkMenus();
  const users = getSelectedUsers();
  if (!users.length) return;
  const nextUsers = users.map(user => ({ ...user, status }));
  const error = validateUsersMutation(nextUsers, { statusOperation: status });
  if (error) {
    showBulkMessage(error);
    return;
  }
  await saveBulkUsers(nextUsers);
  showBulkMessage("Status użytkowników został zaktualizowany.", "ok");
}

async function saveBulkUsers(users) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  for (const user of users) {
    const next = { ...user, updatedAt: now };
    await repository.upsertUser(next);
    upsertAuthAccountFromUser(next);
  }
  ui.state = await repository.getState();
  renderUsers();
}

function validateUsersDeletion(users) {
  if (users.some(user => isCurrentUser(user))) {
    return "Nie możesz usunąć aktualnie zalogowanego administratora.";
  }
  return validateUsersMutation(users.map(user => ({ ...user, deletedAt: new Date().toISOString() })), { deletion: true });
}

function validateUsersMutation(changedUsers, options = {}) {
  const usersById = new Map(getDisplayUsers().map(user => [user.id, user]));
  for (const user of changedUsers) usersById.set(user.id, user);
  const resultingUsers = [...usersById.values()].filter(user => !user.deletedAt);
  const activeAdmins = resultingUsers.filter(isActiveAdmin);
  if (!activeAdmins.length) {
    if (options.deletion) return "Nie można usunąć ostatniego aktywnego administratora.";
    if (options.roleOperation?.action === "remove-role" && options.roleOperation.role === "admin") {
      return "Nie można odebrać roli Administrator ostatniemu aktywnemu administratorowi.";
    }
    if (options.statusOperation === "inactive") {
      return "Nie można ustawić ostatniego aktywnego administratora jako nieaktywnego.";
    }
    return "Operacja pozostawiłaby system bez aktywnego administratora.";
  }
  return null;
}

function isActiveAdmin(user) {
  return user.status === "active" && userHasRole(user, "admin") && !user.deletedAt;
}

function isCurrentUser(user) {
  return user.id === ui.authSession?.id || user.login === ui.authSession?.login;
}

function removeAuthAccount(userId) {
  ui.authAccounts = ui.authAccounts.filter(account => account.id !== userId);
}

function pluralizeUsers(count) {
  if (count === 1) return "użytkownika";
  if (count >= 2 && count <= 4) return "użytkowników";
  return "użytkowników";
}

function pluralizeJudges(count) {
  if (count === 1) return "sędziego";
  return "sędziów";
}

function showBulkMessage(message, type = "error") {
  const box = $("#bulkMessage");
  box.textContent = message;
  box.dataset.type = type;
  box.hidden = false;
}

function hideBulkMessage() {
  const box = $("#bulkMessage");
  if (!box) return;
  box.textContent = "";
  box.hidden = true;
  box.dataset.type = "";
}

function showConfirmDialog({ title, message, confirmLabel, onConfirm }) {
  ui.pendingConfirmation = onConfirm;
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmAcceptBtn").textContent = confirmLabel;
  const dialog = $("#confirmDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeConfirmDialog() {
  ui.pendingConfirmation = null;
  const dialog = $("#confirmDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function acceptConfirmDialog() {
  const onConfirm = ui.pendingConfirmation;
  closeConfirmDialog();
  if (onConfirm) await onConfirm();
}

function openPasswordForm(userId) {
  if (!requireAdminPermission()) return;
  const user = getDisplayUsers().find(item => item.id === userId);
  if (!user) return;
  ui.passwordUserId = user.id;
  $("#passwordUserIdInput").value = user.id;
  $("#passwordFormTitle").textContent = `Zmień hasło: ${getUserFullName(user)}`;
  $("#newPasswordInput").value = "";
  hidePasswordFormError();
  closeUserForm();
  closeImportUsersPanel();
  $("#passwordPanel").hidden = false;
  $("#newPasswordInput").focus();
}

function closePasswordForm() {
  ui.passwordUserId = null;
  $("#passwordPanel").hidden = true;
  hidePasswordFormError();
}

async function savePasswordFromForm(event) {
  event.preventDefault();
  if (!requireAdminPermission()) return;
  if (ui.savingPassword) return;
  ui.savingPassword = true;
  const userId = $("#passwordUserIdInput").value;
  const password = $("#newPasswordInput").value;
  if (!password) {
    showPasswordFormError("Nowe hasło jest wymagane.");
    ui.savingPassword = false;
    return;
  }
  const user = getDisplayUsers().find(item => item.id === userId);
  if (!user) {
    ui.savingPassword = false;
    return;
  }
  const next = { ...user, password, updatedAt: new Date().toISOString() };
  try {
    await repository.upsertUser(next);
    upsertAuthAccountFromUser(next);
    ui.state = await repository.getState();
    renderUsers();
    closePasswordForm();
  } catch (error) {
    showPasswordFormError(`Nie udało się zapisać hasła: ${error.message}`);
  } finally {
    ui.savingPassword = false;
  }
}

function showPasswordFormError(message) {
  const box = $("#passwordFormError");
  box.textContent = message;
  box.hidden = false;
}

function hidePasswordFormError() {
  const box = $("#passwordFormError");
  box.textContent = "";
  box.hidden = true;
}

function upsertAuthAccountFromUser(user) {
  const account = {
    id: user.id,
    login: user.login,
    password: user.password,
    mode: userHasRole(user, "admin") ? "admin" : userHasRole(user, "office") ? "office" : "judge",
    roles: user.roles,
    status: user.status,
    displayName: getUserFullName(user),
    firstName: user.firstName,
    lastName: user.lastName
  };
  const index = ui.authAccounts.findIndex(item => item.id === account.id);
  if (index === -1) ui.authAccounts.push(account);
  else ui.authAccounts[index] = account;
}

function createLocalUserId() {
  return `user-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderAdminAssignments() {
  const container = $("#assignmentsContent");
  if (!container || !ui.state) return;
  if (ui.assignmentsView === "competitions") {
    renderAssignmentsCompetitions(container);
    return;
  }
  if (ui.assignmentsView === "competition-detail") {
    renderCompetitionAssignmentDetail(container);
    return;
  }
  if (ui.assignmentsView === "competition-settings") {
    renderCompetitionSettings(container);
    return;
  }
  if (ui.assignmentsView === "judges") {
    renderAssignmentsJudges(container);
    return;
  }
  if (ui.assignmentsView === "judge-detail") {
    renderJudgeAssignmentDetail(container);
    return;
  }
  renderAssignmentsHome(container);
}

function resetAssignmentsHome() {
  ui.assignmentsView = "home";
  ui.selectedAssignmentCompetitionId = null;
  ui.selectedAssignmentJudgeId = null;
  ui.checklistDraftCompetitionId = null;
  ui.equipmentChecklistDraft = [];
  resetCompetitionImport();
  ui.selectedCompetitionIds.clear();
}

function renderAssignmentsHome(container) {
  container.innerHTML = `
    <div class="admin-section-header assignments-header">
      <div>
        <h2>Przydziały</h2>
        <p class="muted">Zarządzaj przypisaniem sędziów do konkurencji.</p>
      </div>
    </div>
    <div class="assignment-tiles">
      <button type="button" class="assignment-tile" data-assignments-view="competitions">
        <strong>KONKURENCJE</strong>
        <span>Wybierz konkurencję i przypisz do niej sędziów.</span>
      </button>
      <button type="button" class="assignment-tile" data-assignments-view="judges">
        <strong>SĘDZIOWIE</strong>
        <span>Wybierz sędziego i przypisz go do konkurencji.</span>
      </button>
    </div>
  `;
}

function renderAssignmentsCompetitions(container) {
  const competitions = getAssignableCompetitions();
  pruneSelectedCompetitions(competitions);
  container.innerHTML = `
    ${renderAssignmentsBreadcrumb("Przydziały > Konkurencje")}
    <div class="admin-section-header assignments-header">
      <div>
        <h2>Konkurencje</h2>
        <p class="muted">Wybierz konkurencję, aby zarządzać przypisanymi sędziami.</p>
      </div>
      <div class="admin-header-actions">
        <label class="secondary compact-button file-button">
          Importuj konkurencje
          <input id="competitionImportInput" type="file" accept=".xlsx,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"${adminWriteAttributes()}>
        </label>
      </div>
    </div>
    <div id="assignmentMessage" class="bulk-message" role="alert" hidden></div>
    ${renderCompetitionImportPreview()}
    ${renderCompetitionBulkActions()}
    <div class="table-shell assignments-table-shell">
      <table class="users-table assignments-table">
        <thead>
          <tr>
            <th class="select-column">
              <label class="select-all-label">
                <input type="checkbox" id="selectAllCompetitions" ${areAllVisibleCompetitionsSelected(competitions) ? "checked" : ""}${adminWriteAttributes()}>
                <span>Zaznacz wszystkie</span>
              </label>
            </th>
            <th>Nr</th>
            <th>Nazwa konkurencji</th>
            <th>Sędziowie obecnie / min.</th>
            <th>Zarządzaj sędziami</th>
            <th>Zarządzaj konkurencją</th>
          </tr>
        </thead>
        <tbody>
          ${competitions.length ? competitions.map(competition => {
            const minJudges = getCompetitionMinJudges(competition);
            const assignedJudges = getJudgesForCompetition(competition.id);
            const currentJudges = assignedJudges.length;
            return `
              <tr data-competition-drop-id="${escapeHtml(competition.id)}">
                <td class="select-column"><input type="checkbox" class="competition-select" data-competition-id="${escapeHtml(competition.id)}" aria-label="Zaznacz konkurencję ${escapeHtml(competition.name)}" ${ui.selectedCompetitionIds.has(competition.id) ? "checked" : ""}${adminWriteAttributes()}></td>
                <td><strong>${escapeHtml(getCompetitionNumber(competition))}</strong></td>
                <td>
                  <strong>${escapeHtml(competition.name)}</strong>
                  ${renderAssignedJudgeList(competition.id, assignedJudges)}
                </td>
                <td>${formatJudgeStaffing(minJudges, currentJudges)}</td>
                <td><button type="button" class="secondary compact-button" data-assignment-action="competition-detail" data-competition-id="${escapeHtml(competition.id)}">Zarządzaj sędziami</button></td>
                <td><button type="button" class="secondary compact-button" data-assignment-action="competition-settings" data-competition-id="${escapeHtml(competition.id)}">Zarządzaj konkurencją</button></td>
              </tr>
            `;
          }).join("") : `<tr><td colspan="6">Brak konkurencji.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAssignedJudgeList(competitionId, judges) {
  return `
    <div class="assigned-judge-list" data-competition-drop-id="${escapeHtml(competitionId)}">
      ${judges.length ? judges.map(judge => `
        <span class="assigned-judge-chip" draggable="${canManageAdminData() ? "true" : "false"}" data-drag-judge-id="${escapeHtml(judge.id)}" data-current-competition-id="${escapeHtml(competitionId)}" title="${canManageAdminData() ? "Przeciągnij do innej konkurencji" : "Funkcja dostępna tylko dla administratora."}">
          ${escapeHtml(getUserFullName(judge))}
        </span>
      `).join("") : `<span class="assigned-judge-empty">Brak przypisanych sędziów</span>`}
    </div>
  `;
}

function renderCompetitionBulkActions() {
  const count = ui.selectedCompetitionIds.size;
  if (!count) return "";
  return `
    <div class="bulk-actions-bar">
      <strong>Zaznaczono: ${count}</strong>
      <div class="bulk-actions">
          <button type="button" class="secondary compact-button danger-button" data-assignment-action="delete-competitions"${adminWriteAttributes()}>Usuń</button>
      </div>
    </div>
  `;
}

function renderCompetitionImportPreview() {
  if (!ui.competitionImportVisible) return "";
  const rows = ui.competitionImportRows || [];
  const validRows = rows.filter(row => row.valid);
  return `
    <div class="user-form-panel import-users-panel">
      <h3>Podgląd importu konkurencji</h3>
      <p class="muted">${ui.competitionImportFileName ? `Plik: ${escapeHtml(ui.competitionImportFileName)}.` : "Wybierz plik XLSX, CSV albo JSON z listą konkurencji."}</p>
      ${rows.length ? `
        <div class="table-shell assignments-table-shell">
          <table class="users-table competition-import-table">
            <thead><tr><th>Nr</th><th>Nazwa</th><th>Minimalna liczba sędziów</th><th>Stan importu</th></tr></thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <td>${escapeHtml(row.competitionNumber)}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${escapeHtml(row.minJudges || "")}</td>
                  <td><span class="badge ${row.valid ? "ok" : "warn"}">${escapeHtml(row.status)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="action-row">
          <button type="button" class="secondary" data-assignment-action="cancel-competition-import">Anuluj</button>
          <button type="button" data-assignment-action="confirm-competition-import" ${validRows.length ? "" : "disabled"}${adminWriteAttributes()}>Importuj ${validRows.length} ${pluralizeCompetitions(validRows.length)}</button>
        </div>
      ` : `
        <div class="import-columns">
          <strong>Rozpoznawane nagłówki:</strong>
          <span>Nr</span>
          <span>Nazwa</span>
          <span>Minimalna liczba sędziów</span>
          <span>Numer konkurencji</span>
          <span>Nazwa konkurencji</span>
          <span>MinJudges</span>
        </div>
      `}
    </div>
  `;
}

function renderCompetitionAssignmentDetail(container) {
  const competition = getCompetitionById(ui.selectedAssignmentCompetitionId);
  if (!competition) {
    ui.assignmentsView = "competitions";
    renderAdminAssignments();
    return;
  }
  const judges = getAssignableJudges();
  const assignedJudgeIds = new Set(getJudgesForCompetition(competition.id).map(user => user.id));
  container.innerHTML = `
    ${renderAssignmentsBreadcrumb("Przydziały > Konkurencje")}
    <div class="assignments-detail-header">
      <div>
        <h2>Konkurencja: ${escapeHtml(competition.name)}</h2>
        <p class="muted">Zaznacz aktywnych sędziów przypisanych do tej konkurencji.</p>
      </div>
      <div class="admin-header-actions">
        <button type="button" class="secondary compact-button" data-assignments-view="competitions">Wróć do listy</button>
        <button type="button" class="compact-button" data-assignment-action="save-competition" data-competition-id="${escapeHtml(competition.id)}"${adminWriteAttributes()}>Zapisz</button>
      </div>
    </div>
    <div id="assignmentMessage" class="bulk-message" role="alert" hidden></div>
    <div class="assignment-check-list">
      ${judges.length ? judges.map(judge => `
        <label class="assignment-check-row">
          <input type="checkbox" name="competitionJudge" value="${escapeHtml(judge.id)}" ${assignedJudgeIds.has(judge.id) ? "checked" : ""}${adminWriteAttributes()}>
          <span>
            <strong>${escapeHtml(getUserFullName(judge))}</strong>
            <small>${escapeHtml(judge.login)}</small>
          </span>
        </label>
      `).join("") : `<div class="empty-state">Brak aktywnych użytkowników z rolą Sędzia.</div>`}
    </div>
    <div class="action-row">
      <button type="button" data-assignment-action="save-competition" data-competition-id="${escapeHtml(competition.id)}"${adminWriteAttributes()}>Zapisz przydziały</button>
    </div>
  `;
}

function renderCompetitionSettings(container) {
  const competition = getCompetitionById(ui.selectedAssignmentCompetitionId);
  if (!competition) {
    ui.assignmentsView = "competitions";
    renderAdminAssignments();
    return;
  }
  ensureChecklistDraft(competition);
  const minJudges = getCompetitionMinJudges(competition);
  const assignedJudges = getJudgesForCompetition(competition.id);
  container.innerHTML = `
    ${renderAssignmentsBreadcrumb("Przydziały > Konkurencje > Zarządzaj konkurencją")}
    <div class="assignments-detail-header">
      <div>
        <h2>Zarządzaj konkurencją: ${escapeHtml(competition.name)}</h2>
        <p class="muted">Ustawienia organizacyjne konkurencji są zapisywane w centralnym modelu danych konkurencji.</p>
      </div>
      <button type="button" class="secondary compact-button" data-assignments-view="competitions">Wróć do listy konkurencji</button>
    </div>
    <div id="assignmentMessage" class="bulk-message" role="alert" hidden></div>
    <section class="competition-settings-block">
      <div>
        <h3>Dane konkurencji i obsada sędziowska</h3>
        <p class="muted">Aktualnie przypisani sędziowie: ${getJudgesForCompetition(competition.id).length}</p>
      </div>
      <div id="competitionSettingsError" class="login-error" role="alert" hidden></div>
      <div class="form-grid">
        <label>
          Nr konkurencji
          <input id="competitionNumberInput" value="${escapeHtml(getCompetitionNumber(competition))}" autocomplete="off"${adminWriteAttributes()}>
        </label>
        <label>
          Nazwa konkurencji
          <input id="competitionNameInput" value="${escapeHtml(competition.name)}" autocomplete="off"${adminWriteAttributes()}>
        </label>
        <label>
          Minimalna liczba sędziów
          <input id="minJudgesInput" type="number" min="1" step="1" value="${escapeHtml(minJudges)}"${adminWriteAttributes()}>
        </label>
        <label>
          Sędziowie
          <output class="assigned-judges-output">${assignedJudges.map(judge => escapeHtml(getUserFullName(judge))).join("<br>")}</output>
        </label>
      </div>
      <div class="action-row">
        <button type="button" data-assignment-action="save-competition-settings" data-competition-id="${escapeHtml(competition.id)}"${adminWriteAttributes()}>Zapisz</button>
      </div>
    </section>
    <section class="competition-settings-block">
      <div class="assignments-detail-header checklist-header">
        <div>
          <h3>Checklista sprzętu</h3>
          <p class="muted">Pozycje są powiązane wyłącznie z tą konkurencją. Zapis nastąpi dopiero po kliknięciu „Zapisz checklistę”.</p>
        </div>
        <label class="secondary compact-button file-button">
          Importuj checklistę
          <input id="checklistImportInput" type="file" accept=".xlsx,.csv,.json,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json,text/plain"${adminWriteAttributes()}>
        </label>
      </div>
      ${renderChecklistWorkbookImportPreview()}
      <div id="checklistPreview" class="checklist-preview">
        ${renderChecklistDraftItems()}
      </div>
      <div class="action-row">
        <button type="button" class="secondary" data-assignment-action="add-checklist-item"${adminWriteAttributes()}>Dodaj pozycję</button>
        <button type="button" data-assignment-action="save-checklist" data-competition-id="${escapeHtml(competition.id)}"${adminWriteAttributes()}>Zapisz checklistę</button>
      </div>
    </section>
  `;
}

function renderChecklistDraftItems() {
  const items = ui.equipmentChecklistDraft || [];
  if (!items.length) {
    return `<div class="empty-state">Brak pozycji checklisty. Zaimportuj plik albo dodaj pozycję ręcznie.</div>`;
  }
  return items.map((item, index) => `
    <div class="checklist-item-row" data-checklist-index="${index}">
      <label class="checklist-item-check">
        <input type="checkbox" class="checklist-item-checked" data-checklist-index="${index}" ${item.checked ? "checked" : ""}${adminWriteAttributes()}>
        <span class="sr-only">Pozycja sprawdzona</span>
      </label>
      ${ui.editingChecklistItemId === item.id ? `
        <input class="checklist-item-input" value="${escapeHtml(item.label || "")}" aria-label="Treść pozycji checklisty"${adminWriteAttributes()}>
        <div class="table-actions">
          <button type="button" class="secondary compact-button" data-assignment-action="save-checklist-item" data-checklist-index="${index}"${adminWriteAttributes()}>Zapisz</button>
          <button type="button" class="secondary compact-button" data-assignment-action="cancel-checklist-item-edit">Anuluj</button>
        </div>
      ` : `
        <span class="checklist-item-label">${escapeHtml(item.label || "")}</span>
        <div class="table-actions">
          <button type="button" class="secondary compact-button" data-assignment-action="edit-checklist-item" data-checklist-index="${index}"${adminWriteAttributes()}>Edytuj</button>
          <button type="button" class="secondary compact-button danger-button" data-assignment-action="remove-checklist-item" data-checklist-index="${index}"${adminWriteAttributes()}>Usuń</button>
        </div>
      `}
    </div>
  `).join("");
}

function renderChecklistWorkbookImportPreview() {
  const rows = ui.checklistImportRows || [];
  if (!rows.length) return "";
  const validRows = rows.filter(row => row.valid && row.competitionId);
  const competitions = getAssignableCompetitions();
  return `
    <div class="user-form-panel import-users-panel checklist-workbook-preview">
      <h3>Podgląd importu checklist</h3>
      <p class="muted">${ui.checklistImportFileName ? `Plik: ${escapeHtml(ui.checklistImportFileName)}.` : ""} Sprawdź dopasowanie arkuszy do konkurencji przed zapisem.</p>
      <div class="table-shell assignments-table-shell">
        <table class="users-table">
          <thead><tr><th>Arkusz</th><th>Dopasowana konkurencja</th><th>Liczba pozycji</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td><strong>${escapeHtml(row.sheetName)}</strong></td>
                <td>
                  <select class="checklist-import-competition" data-checklist-import-id="${escapeHtml(row.id)}"${adminWriteAttributes()}>
                    <option value="">Brak dopasowania konkurencji</option>
                    ${competitions.map(competition => `
                      <option value="${escapeHtml(competition.id)}" ${row.competitionId === competition.id ? "selected" : ""}>${escapeHtml(competition.name)}</option>
                    `).join("")}
                  </select>
                </td>
                <td>${row.items.length}</td>
                <td><span class="badge ${row.valid && row.competitionId ? "ok" : "warn"}">${escapeHtml(row.status)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="action-row">
        <button type="button" class="secondary" data-assignment-action="cancel-checklist-import">Anuluj import</button>
          <button type="button" data-assignment-action="confirm-checklist-import" ${validRows.length ? "" : "disabled"}${adminWriteAttributes()}>Importuj checklisty</button>
      </div>
    </div>
  `;
}

function renderAssignmentsJudges(container) {
  const judges = getAssignableJudges();
  container.innerHTML = `
    ${renderAssignmentsBreadcrumb("Przydziały > Sędziowie")}
    <div class="admin-section-header assignments-header">
      <div>
        <h2>Sędziowie</h2>
        <p class="muted">Wybierz sędziego, aby zarządzać jego przypisaniem.</p>
      </div>
    </div>
    <div id="assignmentMessage" class="bulk-message" role="alert" hidden></div>
    <div class="table-shell assignments-table-shell">
      <table class="users-table assignments-table">
        <thead>
          <tr><th>Imię i nazwisko</th><th>Login</th><th>Przypisana konkurencja</th><th>Status</th><th>Akcje</th></tr>
        </thead>
        <tbody>
          ${judges.length ? judges.map(judge => {
            const assignment = getActiveJudgeAssignment(judge.id);
            return `
              <tr>
                <td><strong>${escapeHtml(getUserFullName(judge))}</strong></td>
                <td>${escapeHtml(judge.login)}</td>
                <td>${escapeHtml(assignment ? getCompetitionName(assignment.competitionId) : "Brak")}</td>
                <td><span class="badge ${judge.status === "active" ? "ok" : "warn"}">${judge.status === "active" ? "Aktywny" : "Nieaktywny"}</span></td>
                <td><button type="button" class="secondary compact-button" data-assignment-action="judge-detail" data-judge-id="${escapeHtml(judge.id)}">Zarządzaj</button></td>
              </tr>
            `;
          }).join("") : `<tr><td colspan="5">Brak aktywnych użytkowników z rolą Sędzia.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderJudgeAssignmentDetail(container) {
  const judge = getAssignableJudges().find(user => user.id === ui.selectedAssignmentJudgeId);
  if (!judge) {
    ui.assignmentsView = "judges";
    renderAdminAssignments();
    return;
  }
  const competitions = getAssignableCompetitions();
  const assignment = getActiveJudgeAssignment(judge.id);
  container.innerHTML = `
    ${renderAssignmentsBreadcrumb("Przydziały > Sędziowie")}
    <div class="assignments-detail-header">
      <div>
        <h2>Sędzia: ${escapeHtml(getUserFullName(judge))}</h2>
        <p class="muted">Sędzia może mieć w danym momencie tylko jedną aktywną konkurencję.</p>
      </div>
      <div class="admin-header-actions">
        <button type="button" class="secondary compact-button" data-assignments-view="judges">Wróć do listy</button>
        <button type="button" class="compact-button" data-assignment-action="save-judge" data-judge-id="${escapeHtml(judge.id)}"${adminWriteAttributes()}>Zapisz</button>
      </div>
    </div>
    <div id="assignmentMessage" class="bulk-message" role="alert" hidden></div>
    <div class="assignment-check-list">
      <label class="assignment-check-row">
          <input type="radio" name="judgeCompetition" value="" ${assignment ? "" : "checked"}${adminWriteAttributes()}>
        <span><strong>Brak przydziału</strong></span>
      </label>
      ${competitions.map(competition => `
        <label class="assignment-check-row">
          <input type="radio" name="judgeCompetition" value="${escapeHtml(competition.id)}" ${assignment?.competitionId === competition.id ? "checked" : ""}${adminWriteAttributes()}>
          <span><strong>${escapeHtml(competition.name)}</strong></span>
        </label>
      `).join("")}
    </div>
    <div class="action-row">
      <button type="button" data-assignment-action="save-judge" data-judge-id="${escapeHtml(judge.id)}"${adminWriteAttributes()}>Zapisz przydział</button>
    </div>
  `;
}

function renderAssignmentsBreadcrumb(label) {
  return `
    <div class="assignments-breadcrumb">
      <button type="button" class="secondary compact-button" data-assignments-view="home">Przydziały</button>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function handleAssignmentsClick(event) {
  const viewButton = event.target.closest("[data-assignments-view]");
  if (viewButton) {
    ui.assignmentsView = viewButton.dataset.assignmentsView;
    if (ui.assignmentsView === "home") {
      ui.selectedAssignmentCompetitionId = null;
      ui.selectedAssignmentJudgeId = null;
      resetCompetitionImport();
      ui.selectedCompetitionIds.clear();
    }
    renderAdminAssignments();
    return;
  }
  const actionButton = event.target.closest("[data-assignment-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.assignmentAction;
  const writeActions = new Set([
    "save-competition",
    "save-judge",
    "save-competition-settings",
    "add-checklist-item",
    "save-checklist-item",
    "remove-checklist-item",
    "save-checklist",
    "confirm-checklist-import",
    "confirm-competition-import",
    "delete-competitions"
  ]);
  if (writeActions.has(action) && !requireAdminPermission()) return;
  if (action === "competition-detail") {
    ui.selectedAssignmentCompetitionId = actionButton.dataset.competitionId;
    ui.assignmentsView = "competition-detail";
    renderAdminAssignments();
  }
  if (action === "competition-settings") {
    ui.selectedAssignmentCompetitionId = actionButton.dataset.competitionId;
    ui.assignmentsView = "competition-settings";
    resetChecklistImport();
    resetChecklistDraft(getCompetitionById(ui.selectedAssignmentCompetitionId));
    renderAdminAssignments();
  }
  if (action === "judge-detail") {
    ui.selectedAssignmentJudgeId = actionButton.dataset.judgeId;
    ui.assignmentsView = "judge-detail";
    renderAdminAssignments();
  }
  if (action === "save-competition") {
    saveCompetitionAssignments(actionButton.dataset.competitionId);
  }
  if (action === "save-judge") {
    saveJudgeAssignment(actionButton.dataset.judgeId);
  }
  if (action === "save-competition-settings") {
    saveCompetitionSettings(actionButton.dataset.competitionId);
  }
  if (action === "add-checklist-item") {
    syncChecklistDraftFromInputs();
    const item = createChecklistItem("");
    ui.equipmentChecklistDraft.push(item);
    ui.editingChecklistItemId = item.id;
    renderAdminAssignments();
  }
  if (action === "edit-checklist-item") {
    syncChecklistDraftFromInputs();
    const item = ui.equipmentChecklistDraft[Number(actionButton.dataset.checklistIndex)];
    ui.editingChecklistItemId = item?.id || null;
    renderAdminAssignments();
  }
  if (action === "save-checklist-item") {
    syncChecklistDraftFromInputs();
    ui.editingChecklistItemId = null;
    renderAdminAssignments();
  }
  if (action === "cancel-checklist-item-edit") {
    ui.editingChecklistItemId = null;
    renderAdminAssignments();
  }
  if (action === "remove-checklist-item") {
    syncChecklistDraftFromInputs();
    ui.equipmentChecklistDraft.splice(Number(actionButton.dataset.checklistIndex), 1);
    ui.editingChecklistItemId = null;
    renderAdminAssignments();
  }
  if (action === "save-checklist") {
    saveCompetitionChecklist(actionButton.dataset.competitionId);
  }
  if (action === "confirm-checklist-import") {
    importChecklistWorkbook();
  }
  if (action === "cancel-checklist-import") {
    resetChecklistImport();
    renderAdminAssignments();
  }
  if (action === "cancel-competition-import") {
    resetCompetitionImport();
    renderAdminAssignments();
  }
  if (action === "confirm-competition-import") {
    importValidCompetitions();
  }
  if (action === "delete-competitions") {
    requestBulkDeleteCompetitions();
  }
}

function handleAssignmentsChange(event) {
  if (event.target.id === "checklistImportInput") {
    if (!requireAdminPermission()) return;
    readChecklistImportFile(event.target.files?.[0]);
  }
  if (event.target.matches(".checklist-import-competition")) {
    if (!requireAdminPermission()) return;
    updateChecklistImportCompetition(event.target.dataset.checklistImportId, event.target.value);
  }
  if (event.target.matches(".checklist-item-checked")) {
    if (!requireAdminPermission()) return;
    updateChecklistItemChecked(Number(event.target.dataset.checklistIndex), event.target.checked);
  }
  if (event.target.id === "competitionImportInput") {
    if (!requireAdminPermission()) return;
    readCompetitionImportFile(event.target.files?.[0]);
  }
  if (event.target.id === "selectAllCompetitions") {
    if (!requireAdminPermission()) return;
    toggleAllVisibleCompetitions(event.target.checked);
  }
  if (event.target.matches(".competition-select")) {
    if (!requireAdminPermission()) return;
    toggleCompetitionSelection(event.target.dataset.competitionId, event.target.checked);
  }
}

async function saveCompetitionSettings(competitionId) {
  if (!requireAdminPermission()) return;
  const competition = getCompetitionById(competitionId);
  if (!competition) return;
  const competitionNumber = $("#competitionNumberInput")?.value.trim() || "";
  const name = $("#competitionNameInput")?.value.trim() || "";
  const value = Number.parseInt($("#minJudgesInput")?.value, 10);
  if (!competitionNumber) {
    showCompetitionSettingsError("Nr konkurencji jest wymagany.");
    return;
  }
  if (!name) {
    showCompetitionSettingsError("Nazwa konkurencji jest wymagana.");
    return;
  }
  if (!Number.isInteger(value) || value < 1) {
    showCompetitionSettingsError("Minimalna liczba sędziów musi być liczbą całkowitą większą lub równą 1.");
    return;
  }
  const duplicate = getAssignableCompetitions().find(item =>
    item.id !== competition.id &&
    String(getCompetitionNumber(item)).toLowerCase() === competitionNumber.toLowerCase()
  );
  if (duplicate) {
    showCompetitionSettingsError("Ten numer konkurencji jest już używany.");
    return;
  }
  await saveCompetition({
    ...competition,
    competitionNumber,
    name,
    minJudges: value
  });
  renderAdminAssignments();
  showAssignmentMessage("Dane konkurencji zostały zapisane.", "ok");
}

async function saveCompetitionChecklist(competitionId) {
  if (!requireAdminPermission()) return;
  const competition = getCompetitionById(competitionId);
  if (!competition) return;
  syncChecklistDraftFromInputs();
  const checklist = ui.equipmentChecklistDraft
    .map((item, index) => ({
      id: item.id || createChecklistItemId(index),
      label: String(item.label || "").trim(),
      checked: Boolean(item.checked)
    }))
    .filter(item => item.label);
  await saveCompetition({
    ...competition,
    equipmentChecklist: checklist
  });
  resetChecklistDraft(getCompetitionById(competitionId));
  renderAdminAssignments();
  showAssignmentMessage("Checklista sprzętu została zapisana.", "ok");
}

async function saveCompetition(competition) {
  await repository.upsertCompetition({
    ...competition,
    minJudges: getCompetitionMinJudges(competition),
    equipmentChecklist: normalizeEquipmentChecklist(competition.equipmentChecklist),
    updatedAt: new Date().toISOString()
  });
  ui.state = await repository.getState();
  renderUsers();
}

function readChecklistImportFile(file) {
  if (!requireAdminPermission()) return;
  resetChecklistImport();
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      if (/\.xlsx$/i.test(file.name)) {
        ui.checklistImportFileName = file.name;
        ui.checklistImportRows = await parseChecklistWorkbook(reader.result);
        renderAdminAssignments();
        showAssignmentMessage(`Odczytano ${ui.checklistImportRows.length} ${pluralizeSheets(ui.checklistImportRows.length)} z pliku XLSX. Sprawdź podgląd i kliknij „Importuj checklisty”.`, "ok");
        return;
      }
      ui.equipmentChecklistDraft = parseChecklistImport(String(reader.result || ""), file.name);
      renderAdminAssignments();
      showAssignmentMessage(`Zaimportowano ${ui.equipmentChecklistDraft.length} ${pluralizeChecklistItems(ui.equipmentChecklistDraft.length)} do podglądu. Kliknij „Zapisz checklistę”, aby zatwierdzić.`, "ok");
    } catch (error) {
      showAssignmentMessage(error.message);
    }
  };
  if (/\.xlsx$/i.test(file.name)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, "utf-8");
}

function parseChecklistImport(text, fileName = "") {
  if (/\.json$/i.test(fileName)) return parseChecklistJson(text);
  return parseChecklistText(text);
}

function parseChecklistJson(text) {
  const parsed = JSON.parse(text);
  const source = Array.isArray(parsed) ? parsed : parsed.equipmentChecklist || parsed.items;
  if (!Array.isArray(source)) throw new Error("Plik JSON powinien zawierać tablicę pozycji albo pole equipmentChecklist.");
  return normalizeEquipmentChecklist(source);
}

function parseChecklistText(text) {
  const rows = parseCsvRows(text)
    .map(row => row.map(cell => String(cell || "").trim()))
    .filter(row => row.some(Boolean));
  if (!rows.length) throw new Error("Plik nie zawiera pozycji checklisty.");
  const firstRow = rows[0].map(normalizeImportHeader);
  const checklistHeaders = ["label", "nazwa", "pozycja", "sprzet"];
  const hasHeader = firstRow.some(header => checklistHeaders.includes(header));
  const labelIndex = hasHeader ? Math.max(0, firstRow.findIndex(header => checklistHeaders.includes(header))) : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const items = dataRows
    .map((row, index) => createChecklistItem(row[labelIndex] || row.find(Boolean) || "", index))
    .filter(item => item.label);
  if (!items.length) throw new Error("Nie znaleziono poprawnych pozycji checklisty.");
  return items;
}

async function parseChecklistWorkbook(arrayBuffer) {
  const sheets = await parseXlsxWorkbookSheets(arrayBuffer);
  if (!sheets.length) throw new Error("Plik XLSX nie zawiera arkuszy.");
  return sheets.map((sheet, index) => {
    const items = extractChecklistItemsFromRows(sheet.rows);
    const match = findCompetitionByNormalizedName(sheet.name);
    return {
      id: `checklist-sheet-${index}-${Date.now().toString(36)}`,
      sheetName: sheet.name,
      competitionId: match?.id || "",
      items,
      valid: items.length > 0,
      status: buildChecklistImportStatus({ items, competition: match })
    };
  });
}

function extractChecklistItemsFromRows(rows) {
  const labels = [];
  for (const row of rows || []) {
    for (const cell of row || []) {
      const label = String(cell || "").trim();
      if (label) labels.push(label);
    }
  }
  return labels.map((label, index) => createChecklistItem(label, index));
}

function findCompetitionByNormalizedName(name) {
  const normalized = normalizeChecklistMatchName(name);
  const matches = getAssignableCompetitions().filter(competition => normalizeChecklistMatchName(competition.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function normalizeChecklistMatchName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildChecklistImportStatus({ items, competition }) {
  if (!items.length && !competition) return "Brak pozycji i brak dopasowania";
  if (!items.length) return "Brak pozycji";
  if (!competition) return "Brak dopasowania";
  return "Znaleziono konkurencję";
}

function updateChecklistImportCompetition(rowId, competitionId) {
  ui.checklistImportRows = (ui.checklistImportRows || []).map(row => {
    if (row.id !== rowId) return row;
    const competition = getCompetitionById(competitionId);
    return {
      ...row,
      competitionId: competition?.id || "",
      status: buildChecklistImportStatus({ items: row.items, competition })
    };
  });
  renderAdminAssignments();
}

async function importChecklistWorkbook() {
  if (!requireAdminPermission()) return;
  const rows = (ui.checklistImportRows || []).filter(row => row.valid && row.competitionId);
  if (!rows.length) {
    showAssignmentMessage("Brak poprawnie dopasowanych checklist do importu.");
    return;
  }
  for (const row of rows) {
    const competition = getCompetitionById(row.competitionId);
    if (!competition) continue;
    await saveCompetition({
      ...competition,
      equipmentChecklist: row.items
    });
  }
  ui.state = await repository.getState();
  resetChecklistImport();
  resetChecklistDraft(getCompetitionById(ui.selectedAssignmentCompetitionId));
  renderAdminAssignments();
  showAssignmentMessage(`Zaimportowano ${rows.length} ${pluralizeSheets(rows.length)} checklist.`, "ok");
}

function resetChecklistImport() {
  ui.checklistImportRows = [];
  ui.checklistImportFileName = "";
}

function syncChecklistDraftFromInputs() {
  document.querySelectorAll(".checklist-item-row").forEach(row => {
    const index = Number(row.dataset.checklistIndex);
    const item = ui.equipmentChecklistDraft[index];
    if (!item) return;
    const input = row.querySelector(".checklist-item-input");
    const checked = row.querySelector(".checklist-item-checked");
    if (input) item.label = input.value.trim();
    if (checked) item.checked = checked.checked;
  });
}

function updateChecklistItemChecked(index, checked) {
  if (!requireAdminPermission()) return;
  const item = ui.equipmentChecklistDraft[index];
  if (!item) return;
  item.checked = checked;
}

function showCompetitionSettingsError(message) {
  const box = $("#competitionSettingsError");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function readCompetitionImportFile(file) {
  if (!requireAdminPermission()) return;
  ui.competitionImportRows = [];
  ui.competitionImportFileName = file?.name || "";
  ui.competitionImportVisible = true;
  if (!file) {
    renderAdminAssignments();
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const rows = /\.xlsx$/i.test(file.name)
        ? await parseCompetitionXlsx(reader.result)
        : parseCompetitionImportText(String(reader.result || ""), file.name);
      ui.competitionImportRows = buildCompetitionImportPreview(rows);
    } catch (error) {
      ui.competitionImportRows = [{
        competitionNumber: "",
        name: "",
        minJudges: "",
        valid: false,
        status: `Błąd – ${error.message}`
      }];
    }
    renderAdminAssignments();
  };
  if (/\.xlsx$/i.test(file.name)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, "utf-8");
}

function parseCompetitionImportText(text, fileName = "") {
  if (/\.json$/i.test(fileName)) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.competitions || parsed.items;
    if (!Array.isArray(rows)) throw new Error("plik JSON powinien zawierać tablicę konkurencji");
    return rows.map(row => ({
      competitionNumber: row.competitionNumber ?? row.number ?? row.nr ?? row.Nr ?? "",
      name: row.name ?? row.nazwa ?? row.Nazwa ?? "",
      minJudges: row.minJudges ?? row["Minimalna liczba sędziów"] ?? row.minimalJudges ?? ""
    }));
  }
  return rowsToCompetitionObjects(parseCsvRows(text));
}

function rowsToCompetitionObjects(rows) {
  const cleaned = rows
    .map(row => row.map(cell => String(cell ?? "").trim()))
    .filter(row => row.some(Boolean));
  if (cleaned.length < 2) throw new Error("plik nie zawiera danych konkurencji");
  const headers = cleaned[0].map(normalizeImportHeader);
  const numberIndex = findImportColumn(headers, ["nr", "numer konkurencji", "competitionnumber", "competition number"]);
  const nameIndex = findImportColumn(headers, ["nazwa", "nazwa konkurencji", "name"]);
  const minIndex = findImportColumn(headers, ["minimalna liczba sedziow", "minjudges", "min judges"]);
  if (numberIndex === -1 || nameIndex === -1) {
    throw new Error("brakuje wymaganych kolumn Nr/Nazwa");
  }
  return cleaned.slice(1).map(row => ({
    competitionNumber: row[numberIndex] || "",
    name: row[nameIndex] || "",
    minJudges: minIndex === -1 ? "" : row[minIndex] || ""
  }));
}

function buildCompetitionImportPreview(rows) {
  const existingNumbers = new Set(getAssignableCompetitions().map(item => String(getCompetitionNumber(item)).trim().toLowerCase()).filter(Boolean));
  const counts = new Map();
  for (const row of rows) {
    const key = String(row.competitionNumber || "").trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return rows.map(row => {
    const competitionNumber = String(row.competitionNumber || "").trim();
    const name = String(row.name || "").trim();
    const minJudgesValue = Number.parseInt(row.minJudges, 10);
    const minJudges = Number.isInteger(minJudgesValue) && minJudgesValue >= 1 ? minJudgesValue : 1;
    const key = competitionNumber.toLowerCase();
    let status = "Gotowy";
    if (!competitionNumber) status = "Błąd – brak numeru";
    else if (!name) status = "Błąd – brak nazwy";
    else if (existingNumbers.has(key)) status = "Błąd – numer już istnieje";
    else if (counts.get(key) > 1) status = "Błąd – duplikat w pliku";
    return {
      competitionNumber,
      name,
      minJudges,
      valid: status === "Gotowy",
      status
    };
  });
}

async function parseCompetitionXlsx(arrayBuffer) {
  return rowsToCompetitionObjects(await parseXlsxRows(arrayBuffer));
}

async function parseXlsxRows(arrayBuffer) {
  const entries = await readXlsxZipEntries(arrayBuffer);
  const workbookXml = entries.get("xl/workbook.xml");
  const workbookRelsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRelsXml) throw new Error("nie można odczytać skoroszytu XLSX");
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
  const sheetPath = getFirstWorksheetPath(workbookXml, workbookRelsXml);
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new Error("nie można odczytać pierwszego arkusza XLSX");
  return parseWorksheetRows(sheetXml, sharedStrings);
}

async function parseXlsxWorkbookSheets(arrayBuffer) {
  const entries = await readXlsxZipEntries(arrayBuffer);
  const workbookXml = entries.get("xl/workbook.xml");
  const workbookRelsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRelsXml) throw new Error("nie można odczytać skoroszytu XLSX");
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
  const sheetRefs = getWorkbookWorksheetRefs(workbookXml, workbookRelsXml);
  return sheetRefs.map(sheet => {
    const sheetXml = entries.get(sheet.path) || entries.get(`xl/${sheet.path}`);
    if (!sheetXml) return { name: sheet.name, rows: [] };
    return { name: sheet.name, rows: parseWorksheetRows(sheetXml, sharedStrings) };
  });
}

async function readXlsxZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const entries = new Map();
  let offset = findEndOfCentralDirectory(bytes);
  if (offset === -1) throw new Error("nieprawidłowy plik XLSX");
  const centralDirectoryOffset = readUint32(bytes, offset + 16);
  let entryOffset = centralDirectoryOffset;
  while (entryOffset < bytes.length - 4 && readUint32(bytes, entryOffset) === 0x02014b50) {
    const compression = readUint16(bytes, entryOffset + 10);
    const compressedSize = readUint32(bytes, entryOffset + 20);
    const fileNameLength = readUint16(bytes, entryOffset + 28);
    const extraLength = readUint16(bytes, entryOffset + 30);
    const commentLength = readUint16(bytes, entryOffset + 32);
    const localHeaderOffset = readUint32(bytes, entryOffset + 42);
    const nameStart = entryOffset + 46;
    const fileName = decodeUtf8(bytes.slice(nameStart, nameStart + fileNameLength));
    const localFileNameLength = readUint16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    if (!fileName.endsWith("/")) {
      const content = compression === 0
        ? decodeUtf8(data)
        : compression === 8
          ? await inflateRawToText(data)
          : null;
      if (content != null) entries.set(fileName.replace(/\\/g, "/"), content);
    }
    entryOffset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRawToText(data) {
  if (!("DecompressionStream" in window)) {
    throw new Error("przeglądarka nie obsługuje lokalnego odczytu XLSX");
  }
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
    return await new Response(stream).text();
  }
}

function getFirstWorksheetPath(workbookXml, relsXml) {
  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  const firstSheet = workbook.querySelector("sheet");
  const relId = firstSheet?.getAttribute("r:id") || firstSheet?.getAttribute("id");
  const rel = [...rels.querySelectorAll("Relationship")].find(item => item.getAttribute("Id") === relId)
    || [...rels.querySelectorAll("Relationship")].find(item => item.getAttribute("Type")?.includes("/worksheet"));
  const target = rel?.getAttribute("Target");
  if (!target) throw new Error("brak arkusza w pliku XLSX");
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\/?xl\//, "")}`.replace(/\/\.\//g, "/");
}

function getWorkbookWorksheetRefs(workbookXml, relsXml) {
  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  const relById = new Map([...rels.querySelectorAll("Relationship")].map(rel => [rel.getAttribute("Id"), rel]));
  return [...workbook.querySelectorAll("sheet")]
    .map((sheet, index) => {
      const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
      const rel = relById.get(relId);
      const target = rel?.getAttribute("Target");
      return {
        name: sheet.getAttribute("name") || `Arkusz ${index + 1}`,
        path: target ? resolveWorksheetPath(target) : ""
      };
    })
    .filter(sheet => sheet.path);
}

function resolveWorksheetPath(target) {
  const rawPath = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("xl/")
      ? target
      : `xl/${target.replace(/^\/?xl\//, "")}`;
  const parts = [];
  for (const part of rawPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("si")].map(si => [...si.querySelectorAll("t")].map(t => t.textContent || "").join(""));
}

function parseWorksheetRows(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("sheetData row")].map(row => {
    const cells = [];
    for (const cell of [...row.querySelectorAll("c")]) {
      const ref = cell.getAttribute("r") || "";
      const columnIndex = columnNameToIndex(ref.replace(/[0-9]/g, ""));
      cells[columnIndex] = getWorksheetCellValue(cell, sharedStrings);
    }
    return cells.map(value => value || "");
  });
}

function getWorksheetCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  const value = cell.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  if (type === "inlineStr") return [...cell.querySelectorAll("t")].map(node => node.textContent || "").join("");
  if (type === "str") return value || cell.querySelector("f")?.textContent || "";
  if (type === "b") return value === "1" ? "TAK" : "";
  return value;
}

function columnNameToIndex(name) {
  let index = 0;
  for (const char of name) index = index * 26 + (char.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

async function importValidCompetitions() {
  if (!requireAdminPermission()) return;
  const rows = (ui.competitionImportRows || []).filter(row => row.valid);
  if (!rows.length) return;
  const now = new Date().toISOString();
  for (const row of rows) {
    await repository.upsertCompetition({
      id: createLocalCompetitionId(row),
      eventId: getDefaultEventId(),
      competitionNumber: row.competitionNumber,
      name: row.name,
      code: createCompetitionCode(row.name, row.competitionNumber),
      minJudges: row.minJudges,
      equipmentChecklist: [],
      parts: [],
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now
    });
  }
  ui.state = await repository.getState();
  resetCompetitionImport();
  renderAdminAssignments();
}

function requestBulkDeleteCompetitions() {
  if (!requireAdminPermission()) return;
  const competitions = getSelectedCompetitions();
  if (!competitions.length) return;
  const assigned = competitions.filter(competition => getJudgesForCompetition(competition.id).length > 0);
  const warning = assigned.length
    ? `\n\nUwaga: ${assigned.length} ${pluralizeCompetitions(assigned.length)} ma aktywnie przypisanych sędziów. Po potwierdzeniu konkurencje oraz ich aktywne przydziały zostaną oznaczone jako usunięte.`
    : "";
  showConfirmDialog({
    title: "Usuń konkurencje",
    message: `Czy na pewno chcesz usunąć ${competitions.length} ${pluralizeCompetitions(competitions.length)}?${warning}`,
    confirmLabel: `Usuń ${competitions.length} ${pluralizeCompetitions(competitions.length)}`,
    onConfirm: () => softDeleteCompetitions(competitions)
  });
}

async function softDeleteCompetitions(competitions) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  const ids = new Set(competitions.map(competition => competition.id));
  for (const competition of competitions) {
    await repository.upsertCompetition({
      ...competition,
      deletedAt: now,
      deletedBy: getUserId(),
      updatedAt: now
    });
  }
  for (const assignment of getActiveJudgeAssignments().filter(item => ids.has(item.competitionId))) {
    await repository.upsertDeviceAssignment({
      ...assignment,
      deletedAt: now,
      deletedBy: getUserId(),
      updatedAt: now
    });
  }
  for (const id of ids) ui.selectedCompetitionIds.delete(id);
  ui.state = await repository.getState();
  renderAdminAssignments();
  renderUsers();
}

async function saveCompetitionAssignments(competitionId) {
  if (!requireAdminPermission()) return;
  const competition = getCompetitionById(competitionId);
  if (!competition) return;
  const selectedJudgeIds = [...document.querySelectorAll("input[name='competitionJudge']:checked")].map(input => input.value);
  const judges = getAssignableJudges();
  const selectedSet = new Set(selectedJudgeIds);
  const currentCompetitionJudgeIds = new Set(getJudgesForCompetition(competitionId).map(user => user.id));
  const conflicts = judges.filter(judge => {
    const assignment = getActiveJudgeAssignment(judge.id);
    return selectedSet.has(judge.id) && assignment && assignment.competitionId !== competitionId;
  });
  const apply = async () => {
    try {
      for (const judge of judges) {
        const isSelected = selectedSet.has(judge.id);
        const isCurrentlyHere = currentCompetitionJudgeIds.has(judge.id);
        if (isSelected) await assignJudgeToCompetition(judge.id, competitionId);
        if (!isSelected && isCurrentlyHere) await clearJudgeAssignment(judge.id);
      }
      ui.state = await repository.getState();
      ui.assignmentsView = "competitions";
      ui.selectedAssignmentCompetitionId = null;
      renderAdminAssignments();
      renderUsers();
      showAssignmentMessage("Przydział zapisany", "ok");
    } catch (error) {
      showAssignmentMessage(`Nie udało się zapisać przydziału: ${error.message}`);
    }
  };
  if (conflicts.length) {
    showConfirmDialog({
      title: "Zmień przydział",
      message: buildAssignmentConflictMessage(conflicts, competition.name),
      confirmLabel: "Zmień przydział",
      onConfirm: apply
    });
    return;
  }
  await apply();
}

async function saveJudgeAssignment(judgeId) {
  if (!requireAdminPermission()) return;
  const judge = getAssignableJudges().find(user => user.id === judgeId);
  if (!judge) return;
  const selectedCompetitionId = document.querySelector("input[name='judgeCompetition']:checked")?.value || "";
  const currentAssignment = getActiveJudgeAssignment(judge.id);
  const apply = async () => {
    try {
      if (selectedCompetitionId) await assignJudgeToCompetition(judge.id, selectedCompetitionId);
      else await clearJudgeAssignment(judge.id);
      ui.state = await repository.getState();
      ui.assignmentsView = "judges";
      ui.selectedAssignmentJudgeId = null;
      renderAdminAssignments();
      renderUsers();
      showAssignmentMessage("Przydział zapisany", "ok");
    } catch (error) {
      showAssignmentMessage(`Nie udało się zapisać przydziału: ${error.message}`);
    }
  };
  if (selectedCompetitionId && currentAssignment && currentAssignment.competitionId !== selectedCompetitionId) {
    showConfirmDialog({
      title: "Zmień przydział",
      message: `${getUserFullName(judge)} jest obecnie przypisany do konkurencji ${getCompetitionName(currentAssignment.competitionId)}.\nCzy chcesz zmienić jego przydział na ${getCompetitionName(selectedCompetitionId)}?`,
      confirmLabel: "Zmień przydział",
      onConfirm: apply
    });
    return;
  }
  await apply();
}

async function assignJudgeToCompetition(judgeId, competitionId) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  const existingAssignments = getActiveAssignmentsForJudge(judgeId);
  for (const assignment of existingAssignments) {
    if (assignment.competitionId !== competitionId) {
      await repository.upsertDeviceAssignment({ ...assignment, deletedAt: now, deletedBy: getUserId(), updatedAt: now });
    }
  }
  const current = existingAssignments.find(assignment => assignment.competitionId === competitionId);
  await repository.upsertDeviceAssignment({
    ...(current || {}),
    id: current?.id || createJudgeAssignmentId(judgeId, competitionId),
    deviceId: current?.deviceId || null,
    judgeUserId: judgeId,
    competitionId,
    competitionPartId: null,
    deletedAt: null,
    deletedBy: null,
    updatedAt: now,
    createdAt: current?.createdAt || now
  });
}

function handleAssignmentDragStart(event) {
  if (!requireAdminPermission()) return;
  const chip = event.target.closest("[data-drag-judge-id]");
  if (!chip) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify({
    judgeId: chip.dataset.dragJudgeId,
    fromCompetitionId: chip.dataset.currentCompetitionId
  }));
  chip.classList.add("dragging");
}

function handleAssignmentDragOver(event) {
  const target = event.target.closest("[data-competition-drop-id]");
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".assignment-drop-over").forEach(item => item.classList.remove("assignment-drop-over"));
  target.classList.add("assignment-drop-over");
}

function handleAssignmentDragLeave(event) {
  const target = event.target.closest("[data-competition-drop-id]");
  if (!target) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget && target.contains(nextTarget)) return;
  target.classList.remove("assignment-drop-over");
}

async function handleAssignmentDrop(event) {
  if (!requireAdminPermission()) return;
  const target = event.target.closest("[data-competition-drop-id]");
  if (!target) return;
  event.preventDefault();
  clearAssignmentDragState();
  let payload = null;
  try {
    payload = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
  } catch {
    payload = null;
  }
  const judgeId = payload?.judgeId;
  const fromCompetitionId = payload?.fromCompetitionId;
  const toCompetitionId = target.dataset.competitionDropId;
  if (!judgeId || !toCompetitionId || fromCompetitionId === toCompetitionId) return;
  const judge = getAssignableJudges().find(user => user.id === judgeId);
  const fromName = getCompetitionName(fromCompetitionId);
  const toName = getCompetitionName(toCompetitionId);
  await assignJudgeToCompetition(judgeId, toCompetitionId);
  ui.state = await repository.getState();
  renderAdminAssignments();
  renderUsers();
  showAssignmentMessage(`${getUserFullName(judge)} przeniesiony:\n${fromName} → ${toName}`, "ok");
}

function clearAssignmentDragState() {
  document.querySelectorAll(".assignment-drop-over").forEach(item => item.classList.remove("assignment-drop-over"));
  document.querySelectorAll(".assigned-judge-chip.dragging").forEach(item => item.classList.remove("dragging"));
}

async function clearJudgeAssignment(judgeId) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  for (const assignment of getActiveAssignmentsForJudge(judgeId)) {
    await repository.upsertDeviceAssignment({ ...assignment, deletedAt: now, deletedBy: getUserId(), updatedAt: now });
  }
}

function getCompetitionMinJudges(competition) {
  const value = Number.parseInt(competition?.minJudges, 10);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function formatJudgeStaffing(minJudges, currentJudges) {
  if (currentJudges < minJudges) {
    return `<span class="badge staffing-badge shortage">${currentJudges} / ${minJudges} · brakuje ${minJudges - currentJudges}</span>`;
  }
  if (currentJudges > minJudges) {
    return `<span class="badge staffing-badge overstaffed"><span aria-hidden="true">⚠ !</span> ${currentJudges} / ${minJudges} · +${currentJudges - minJudges}</span>`;
  }
  return `<span class="badge staffing-badge ok">${currentJudges} / ${minJudges} · obsada kompletna</span>`;
}

function ensureChecklistDraft(competition) {
  if (ui.checklistDraftCompetitionId === competition.id) return;
  resetChecklistDraft(competition);
}

function resetChecklistDraft(competition) {
  ui.checklistDraftCompetitionId = competition?.id || null;
  ui.equipmentChecklistDraft = normalizeEquipmentChecklist(competition?.equipmentChecklist || []);
}

function normalizeEquipmentChecklist(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => createChecklistItem(typeof item === "string" ? item : item?.label, index, item?.id, Boolean(item?.checked)))
    .filter(item => item.label);
}

function createChecklistItem(label = "", index = 0, id = null, checked = false) {
  return {
    id: id || createChecklistItemId(index),
    label: String(label || "").trim(),
    checked
  };
}

function createChecklistItemId(index = 0) {
  return `item-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

function pluralizeChecklistItems(count) {
  if (count === 1) return "pozycję";
  if (count >= 2 && count <= 4) return "pozycje";
  return "pozycji";
}

function pluralizeSheets(count) {
  if (count === 1) return "arkusz";
  if (count >= 2 && count <= 4) return "arkusze";
  return "arkuszy";
}

function getCompetitionNumber(competition) {
  return competition?.competitionNumber ?? competition?.number ?? competition?.rankingOrder ?? "";
}

function toggleCompetitionSelection(competitionId, checked) {
  if (!requireAdminPermission()) return;
  if (checked) ui.selectedCompetitionIds.add(competitionId);
  else ui.selectedCompetitionIds.delete(competitionId);
  renderAdminAssignments();
}

function toggleAllVisibleCompetitions(checked) {
  if (!requireAdminPermission()) return;
  const competitions = getAssignableCompetitions();
  if (checked) competitions.forEach(competition => ui.selectedCompetitionIds.add(competition.id));
  else competitions.forEach(competition => ui.selectedCompetitionIds.delete(competition.id));
  renderAdminAssignments();
}

function areAllVisibleCompetitionsSelected(competitions) {
  return competitions.length > 0 && competitions.every(competition => ui.selectedCompetitionIds.has(competition.id));
}

function pruneSelectedCompetitions(competitions) {
  const visibleIds = new Set(competitions.map(competition => competition.id));
  for (const id of [...ui.selectedCompetitionIds]) {
    if (!visibleIds.has(id)) ui.selectedCompetitionIds.delete(id);
  }
}

function getSelectedCompetitions() {
  const competitionsById = new Map(getAssignableCompetitions().map(competition => [competition.id, competition]));
  return [...ui.selectedCompetitionIds].map(id => competitionsById.get(id)).filter(Boolean);
}

function resetCompetitionImport() {
  ui.competitionImportRows = [];
  ui.competitionImportFileName = "";
  ui.competitionImportVisible = false;
}

function pluralizeCompetitions(count) {
  if (count === 1) return "konkurencję";
  if (count >= 2 && count <= 4) return "konkurencje";
  return "konkurencji";
}

function createLocalCompetitionId(row) {
  return `competition-local-${String(row.competitionNumber || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`;
}

function createCompetitionCode(name, number) {
  return `${number || ""}-${name || ""}`
    .normalize("NFD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getAssignableCompetitions() {
  return (ui.state.competitions || [])
    .filter(competition => !competition.deletedAt)
    .sort((a, b) => compareCompetitionNumbers(getCompetitionNumber(a), getCompetitionNumber(b)) || a.name.localeCompare(b.name, "pl"));
}

function compareCompetitionNumbers(left, right) {
  const leftValue = String(left || "").trim();
  const rightValue = String(right || "").trim();
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return leftValue.localeCompare(rightValue, "pl", { numeric: true });
}

function getAssignableJudges() {
  return getDisplayUsers()
    .filter(user => user.status === "active" && userHasRole(user, "judge"))
    .sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b), "pl"));
}

function getActiveJudgeAssignments() {
  return (ui.state.deviceAssignments || []).filter(assignment => !assignment.deletedAt && assignment.judgeUserId && assignment.competitionId);
}

function getActiveAssignmentsForJudge(judgeId) {
  return getActiveJudgeAssignments().filter(assignment => assignment.judgeUserId === judgeId);
}

function getActiveJudgeAssignment(judgeId) {
  return getActiveAssignmentsForJudge(judgeId)[0] || null;
}

function getJudgesForCompetition(competitionId) {
  const judgeIds = new Set(getActiveJudgeAssignments()
    .filter(assignment => assignment.competitionId === competitionId)
    .map(assignment => assignment.judgeUserId));
  return getAssignableJudges().filter(judge => judgeIds.has(judge.id));
}

function getCompetitionById(competitionId) {
  return getAssignableCompetitions().find(competition => competition.id === competitionId) || null;
}

function getCompetitionName(competitionId) {
  return getCompetitionById(competitionId)?.name || "Brak";
}

function createJudgeAssignmentId(judgeId, competitionId) {
  return `judge-assignment-${judgeId}-${competitionId}`;
}

function buildAssignmentConflictMessage(conflicts, targetCompetitionName) {
  if (conflicts.length === 1) {
    const judge = conflicts[0];
    const assignment = getActiveJudgeAssignment(judge.id);
    return `${getUserFullName(judge)} jest obecnie przypisany do konkurencji ${getCompetitionName(assignment?.competitionId)}.\nCzy chcesz zmienić jego przydział na ${targetCompetitionName}?`;
  }
  return `${conflicts.length} sędziów ma już aktywne przydziały do innych konkurencji.\nCzy chcesz zmienić ich przydział na ${targetCompetitionName}?`;
}

function showAssignmentMessage(message, type = "error") {
  const box = $("#assignmentMessage");
  if (!box) return;
  box.textContent = message;
  box.dataset.type = type;
  box.hidden = false;
}

function renderAdminTeams() {
  const container = $("#teamsContent");
  if (!container || !ui.state) return;
  if (ui.teamsView === "add") {
    renderTeamForm(container, null);
    return;
  }
  if (ui.teamsView === "edit") {
    const team = getAdminTeams().find(item => item.id === ui.editingTeamId);
    if (!team) {
      resetTeamsHome();
      renderAdminTeams();
      return;
    }
    renderTeamForm(container, team);
    return;
  }
  if (ui.teamsView === "import") {
    renderTeamsImport(container);
    return;
  }
  renderTeamsList(container);
}

function resetTeamsHome() {
  ui.teamsView = "list";
  ui.editingTeamId = null;
  ui.teamImportRows = [];
  ui.teamImportFileName = "";
  ui.selectedTeamIds.clear();
  ui.invalidTeamNumberIds.clear();
}

function renderTeamsList(container) {
  const teams = getAdminTeams();
  pruneSelectedTeams(teams);
  ensureTeamNumberDrafts(teams);
  container.innerHTML = `
    <div class="admin-section-header assignments-header">
      <div>
        <h2>Zespoły</h2>
        <p class="muted">Zarządzaj zespołami biorącymi udział w mistrzostwach.</p>
      </div>
      <div class="admin-header-actions">
        <button type="button" class="secondary" data-teams-view="import"${adminWriteAttributes()}>Importuj zespoły</button>
        <button type="button" class="secondary" data-team-action="save-numbers"${adminWriteAttributes()}>Zapisz numery</button>
        <button type="button" id="addTeamBtn" data-teams-view="add"${adminWriteAttributes()}>+ Dodaj zespół</button>
      </div>
    </div>
    <div id="teamsMessage" class="bulk-message" role="alert" hidden></div>
    ${renderTeamBulkActions()}
    <div class="table-shell teams-table-shell">
      <table class="users-table teams-table">
        <thead>
          <tr>
            <th class="select-column">
              <label class="select-all-label">
            <input type="checkbox" id="selectAllTeams" ${areAllVisibleTeamsSelected(teams) ? "checked" : ""}${adminWriteAttributes()}>
                <span>Zaznacz wszystkich</span>
              </label>
            </th>
            <th>Nr</th><th>Nazwa zespołu</th><th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${teams.length ? teams.map(team => `
            <tr>
              <td class="select-column"><input type="checkbox" class="team-admin-select" data-team-id="${escapeHtml(team.id)}" aria-label="Zaznacz zespół ${escapeHtml(team.name)}" ${ui.selectedTeamIds.has(team.id) ? "checked" : ""}${adminWriteAttributes()}></td>
              <td>
                <input class="team-number-input${ui.invalidTeamNumberIds.has(team.id) ? " invalid" : ""}" data-team-number-id="${escapeHtml(team.id)}" inputmode="numeric" value="${escapeHtml(ui.teamNumberDrafts[team.id] ?? "")}" aria-label="Numer startowy zespołu ${escapeHtml(team.name)}"${adminWriteAttributes()}>
              </td>
              <td>${escapeHtml(team.name)}</td>
              <td>
                <div class="table-actions icon-actions">
                  <button type="button" class="secondary compact-button icon-button" data-team-action="edit" data-team-id="${escapeHtml(team.id)}" title="Edytuj" aria-label="Edytuj zespół ${escapeHtml(formatAdminTeamLabel(team))}"${adminWriteAttributes()}>✎</button>
                  <button type="button" class="secondary compact-button danger-button icon-button" data-team-action="delete" data-team-id="${escapeHtml(team.id)}" title="Usuń" aria-label="Usuń zespół ${escapeHtml(formatAdminTeamLabel(team))}"${adminWriteAttributes()}>🗑</button>
                </div>
              </td>
            </tr>
          `).join("") : `<tr><td colspan="4">Brak zespołów.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="team-admin-cards">
      ${teams.length ? teams.map(team => `
        <article class="user-card team-admin-card">
          <label class="user-card-select">
            <input type="checkbox" class="team-admin-select" data-team-id="${escapeHtml(team.id)}" aria-label="Zaznacz zespół ${escapeHtml(team.name)}" ${ui.selectedTeamIds.has(team.id) ? "checked" : ""}${adminWriteAttributes()}>
            <span>Zaznacz</span>
          </label>
          <h3>${escapeHtml(team.name)}</h3>
          <dl>
            <div><dt>Nr</dt><dd><input class="team-number-input${ui.invalidTeamNumberIds.has(team.id) ? " invalid" : ""}" data-team-number-id="${escapeHtml(team.id)}" inputmode="numeric" value="${escapeHtml(ui.teamNumberDrafts[team.id] ?? "")}" aria-label="Numer startowy zespołu ${escapeHtml(team.name)}"${adminWriteAttributes()}></dd></div>
          </dl>
          <div class="table-actions">
            <button type="button" class="secondary compact-button" data-team-action="edit" data-team-id="${escapeHtml(team.id)}"${adminWriteAttributes()}>Edytuj</button>
            <button type="button" class="secondary compact-button danger-button" data-team-action="delete" data-team-id="${escapeHtml(team.id)}"${adminWriteAttributes()}>Usuń</button>
          </div>
        </article>
      `).join("") : `<div class="empty-state">Brak zespołów.</div>`}
    </div>
    <div class="table-footer">
      <strong>Łącznie: <span id="teamsCount">${teams.length}</span> ${pluralizeTeams(teams.length)}</strong>
    </div>
  `;
}

function renderTeamBulkActions() {
  const count = ui.selectedTeamIds.size;
  if (!count) return "";
  return `
    <div class="bulk-actions-bar">
      <strong>Zaznaczono: ${count}</strong>
      <div class="bulk-actions">
        <button type="button" class="secondary compact-button" data-team-action="clear-numbers"${adminWriteAttributes()}>Usuń numer</button>
        <button type="button" class="secondary compact-button danger-button" data-team-action="bulk-delete"${adminWriteAttributes()}>Usuń</button>
      </div>
    </div>
  `;
}

function renderTeamForm(container, team) {
  const isEdit = Boolean(team);
  container.innerHTML = `
    <div class="assignments-detail-header">
      <div>
        <h2>${isEdit ? "Edytuj zespół" : "Dodaj zespół"}</h2>
        <p class="muted">${isEdit ? "Zmień dane zespołu w lokalnym modelu demonstracyjnym." : "Dodaj zespół do listy uczestników mistrzostw."}</p>
      </div>
      <button type="button" class="secondary compact-button" data-teams-view="list">Wróć do listy</button>
    </div>
    <div class="user-form-panel">
      <form id="teamForm" class="user-form">
        <div id="teamFormError" class="login-error" role="alert" hidden></div>
        <input type="hidden" id="teamIdInput" value="${escapeHtml(team?.id || "")}">
        <div class="form-grid">
          <label>
            Nr zespołu
            <input id="teamAdminNumberInput" value="${escapeHtml(team?.number || "")}" autocomplete="off">
          </label>
          <label>
            Nazwa zespołu
            <input id="teamAdminNameInput" value="${escapeHtml(team?.name || "")}" autocomplete="off">
          </label>
        </div>
        <div class="action-row">
          <button type="button" class="secondary" data-teams-view="list">Anuluj</button>
          <button type="submit"${adminWriteAttributes()}>${isEdit ? "Zapisz zmiany" : "Dodaj zespół"}</button>
        </div>
      </form>
    </div>
  `;
  $("#teamAdminNumberInput").focus();
}

function renderTeamsImport(container) {
  const rows = ui.teamImportRows || [];
  const validRows = rows.filter(row => row.valid);
  container.innerHTML = `
    <div class="assignments-detail-header">
      <div>
        <h2>Importuj zespoły</h2>
        <p class="muted">Wybierz plik XLSX lub CSV z kolumną Nazwa zespołu. Numer startowy może pozostać pusty do czasu losowania.</p>
      </div>
      <button type="button" class="secondary compact-button" data-teams-view="list">Wróć do listy</button>
    </div>
    <div class="user-form-panel import-users-panel">
      <label>
        Plik CSV / Excel
        <input id="teamImportFileInput" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </label>
      <div id="teamImportMessage" class="bulk-message" role="alert" ${ui.teamImportFileName ? "" : "hidden"}>${escapeHtml(ui.teamImportFileName ? `Plik: ${ui.teamImportFileName}. Wykryto ${rows.length} ${pluralizeRows(rows.length)}.` : "")}</div>
      ${rows.length ? `
        <div class="import-summary">
          <strong>Podgląd przed importem</strong>
          <span>Poprawne: ${validRows.length}</span>
          <span>Wymagają poprawy: ${rows.length - validRows.length}</span>
        </div>
        <div class="table-shell teams-table-shell">
          <table class="users-table teams-import-table">
            <thead><tr><th>Nr zespołu</th><th>Nazwa zespołu</th><th>Status</th></tr></thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <td>${escapeHtml(row.number)}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td><span class="badge ${row.valid ? "ok" : "warn"}">${escapeHtml(row.valid ? "Poprawny" : row.errors.join(", "))}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="action-row">
          <button type="button" class="secondary" data-teams-view="list">Anuluj</button>
          <button type="button" data-team-action="import-confirm" ${validRows.length ? "" : "disabled"}${adminWriteAttributes()}>Importuj ${validRows.length} ${pluralizeTeams(validRows.length)}</button>
        </div>
      ` : `
        <div class="import-columns">
          <strong>Oczekiwane kolumny:</strong>
          <span>Nr zespołu</span>
          <span>Nazwa zespołu</span>
        </div>
      `}
    </div>
  `;
}

function handleTeamsClick(event) {
  const viewButton = event.target.closest("[data-teams-view]");
  if (viewButton) {
    if (viewButton.dataset.teamsView !== "list" && !requireAdminPermission()) return;
    ui.teamsView = viewButton.dataset.teamsView;
    if (ui.teamsView === "list") {
      resetTeamsHome();
    }
    renderAdminTeams();
    return;
  }
  const actionButton = event.target.closest("[data-team-action]");
  if (!actionButton) return;
  if (!requireAdminPermission()) return;
  const action = actionButton.dataset.teamAction;
  if (action === "edit") {
    ui.editingTeamId = actionButton.dataset.teamId;
    ui.teamsView = "edit";
    renderAdminTeams();
  }
  if (action === "delete") {
    requestDeleteTeam(actionButton.dataset.teamId);
  }
  if (action === "import-confirm") {
    importValidTeams();
  }
  if (action === "save-numbers") {
    saveTeamNumbers();
  }
  if (action === "clear-numbers") {
    requestClearTeamNumbers();
  }
  if (action === "bulk-delete") {
    requestBulkDeleteTeams();
  }
}

function handleTeamsSubmit(event) {
  if (!event.target.matches("#teamForm")) return;
  event.preventDefault();
  if (!requireAdminPermission()) return;
  saveTeamFromForm();
}

function handleTeamsChange(event) {
  if (event.target.id === "teamImportFileInput") {
    if (!requireAdminPermission()) return;
    readTeamImportFile(event.target.files?.[0]);
  }
  if (event.target.id === "selectAllTeams") {
    if (!requireAdminPermission()) return;
    syncTeamNumberDraftsFromInputs();
    toggleAllVisibleTeams(event.target.checked);
  }
  if (event.target.matches(".team-admin-select")) {
    if (!requireAdminPermission()) return;
    syncTeamNumberDraftsFromInputs();
    toggleTeamSelection(event.target.dataset.teamId, event.target.checked);
  }
  if (event.target.matches(".team-number-input")) {
    if (!requireAdminPermission()) return;
    ui.teamNumberDrafts[event.target.dataset.teamNumberId] = event.target.value.trim();
    ui.invalidTeamNumberIds.delete(event.target.dataset.teamNumberId);
    event.target.classList.remove("invalid");
  }
}

async function saveTeamFromForm() {
  if (!requireAdminPermission()) return;
  const teamId = $("#teamIdInput").value || createLocalTeamId();
  const isEdit = Boolean(ui.editingTeamId);
  const previous = getAdminTeams().find(team => team.id === teamId);
  const number = $("#teamAdminNumberInput").value.trim();
  const name = $("#teamAdminNameInput").value.trim();
  const error = validateTeamForm({ teamId, number, name });
  if (error) {
    showTeamFormError(error);
    return;
  }
  const now = new Date().toISOString();
  await repository.upsertTeam({
    ...(previous || {}),
    id: teamId,
    eventId: previous?.eventId || getDefaultEventId(),
    number,
    name,
    institution: previous?.institution || "",
    deletedAt: null,
    deletedBy: null,
    updatedAt: now,
    createdAt: previous?.createdAt || now
  });
  ui.state = await repository.getState();
  if (!isEdit) ui.selectedTeamId = teamId;
  resetTeamsHome();
  renderAdminTeams();
  renderTeamList();
}

function validateTeamForm({ teamId, number, name }) {
  if (!name) return "Nazwa zespołu jest wymagana.";
  const duplicate = number
    ? getAdminTeams().find(team => team.id !== teamId && String(team.number || "").trim().toLowerCase() === number.toLowerCase())
    : null;
  if (duplicate) return "Ten numer zespołu jest już używany.";
  return null;
}

function showTeamFormError(message) {
  const box = $("#teamFormError");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function requestDeleteTeam(teamId) {
  if (!requireAdminPermission()) return;
  const team = getAdminTeams().find(item => item.id === teamId);
  if (!team) return;
  showConfirmDialog({
    title: "Usuń zespół",
    message: `Czy na pewno chcesz usunąć zespół ${formatAdminTeamLabel(team)}?`,
    confirmLabel: "Usuń zespół",
    onConfirm: () => softDeleteTeam(team)
  });
}

async function softDeleteTeam(team) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  await repository.upsertTeam({
    ...team,
    deletedAt: now,
    deletedBy: getUserId(),
    updatedAt: now
  });
  if (ui.selectedTeamId === team.id) ui.selectedTeamId = null;
  ui.selectedTeamIds.delete(team.id);
  ui.state = await repository.getState();
  renderAdminTeams();
  renderTeamList();
}

function requestBulkDeleteTeams() {
  if (!requireAdminPermission()) return;
  const teams = getSelectedTeams();
  if (!teams.length) return;
  showConfirmDialog({
    title: "Usuń zespoły",
    message: `Czy na pewno chcesz usunąć ${teams.length} ${pluralizeTeams(teams.length)}?`,
    confirmLabel: `Usuń ${teams.length} ${pluralizeTeams(teams.length)}`,
    onConfirm: () => softDeleteTeams(teams)
  });
}

async function softDeleteTeams(teams) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  for (const team of teams) {
    await repository.upsertTeam({
      ...team,
      deletedAt: now,
      deletedBy: getUserId(),
      updatedAt: now
    });
    ui.selectedTeamIds.delete(team.id);
    if (ui.selectedTeamId === team.id) ui.selectedTeamId = null;
  }
  ui.state = await repository.getState();
  renderAdminTeams();
  renderTeamList();
}

function requestClearTeamNumbers() {
  if (!requireAdminPermission()) return;
  syncTeamNumberDraftsFromInputs();
  const teams = getSelectedTeams();
  if (!teams.length) return;
  showConfirmDialog({
    title: "Usuń numery startowe",
    message: `Usunąć numery startowe z ${teams.length} zaznaczonych ${pluralizeTeams(teams.length)}?`,
    confirmLabel: "Usuń numery",
    onConfirm: () => clearTeamNumbers(teams)
  });
}

async function clearTeamNumbers(teams) {
  if (!requireAdminPermission()) return;
  const now = new Date().toISOString();
  for (const team of teams) {
    await repository.upsertTeam({
      ...team,
      number: "",
      updatedAt: now
    });
    ui.teamNumberDrafts[team.id] = "";
    ui.invalidTeamNumberIds.delete(team.id);
  }
  ui.state = await repository.getState();
  renderAdminTeams();
  renderTeamList();
  showTeamMessage("Numery startowe usunięte.", "ok");
}

function ensureTeamNumberDrafts(teams) {
  const visibleIds = new Set(teams.map(team => team.id));
  for (const team of teams) {
    if (!(team.id in ui.teamNumberDrafts)) {
      ui.teamNumberDrafts[team.id] = String(team.number || "");
    }
  }
  for (const id of Object.keys(ui.teamNumberDrafts)) {
    if (!visibleIds.has(id)) delete ui.teamNumberDrafts[id];
  }
}

function syncTeamNumberDraftsFromInputs() {
  document.querySelectorAll(".team-number-input").forEach(input => {
    if (input.offsetParent === null) return;
    ui.teamNumberDrafts[input.dataset.teamNumberId] = input.value.trim();
  });
}

async function saveTeamNumbers() {
  if (!requireAdminPermission()) return;
  syncTeamNumberDraftsFromInputs();
  const teams = getAdminTeams();
  const validation = validateTeamNumberDrafts(teams);
  ui.invalidTeamNumberIds = validation.invalidIds;
  if (validation.error) {
    renderAdminTeams();
    showTeamMessage(validation.error);
    return;
  }
  const now = new Date().toISOString();
  for (const team of teams) {
    const nextNumber = String(ui.teamNumberDrafts[team.id] ?? "").trim();
    if (String(team.number || "") === nextNumber) continue;
    await repository.upsertTeam({
      ...team,
      number: nextNumber,
      updatedAt: now
    });
  }
  ui.state = await repository.getState();
  ui.invalidTeamNumberIds.clear();
  ui.teamNumberDrafts = {};
  renderAdminTeams();
  renderTeamList();
  showTeamMessage("Numery startowe zapisane", "ok");
}

function validateTeamNumberDrafts(teams) {
  const byNumber = new Map();
  for (const team of teams) {
    const number = String(ui.teamNumberDrafts[team.id] ?? "").trim();
    if (!number) continue;
    const key = number.toLowerCase();
    if (!byNumber.has(key)) byNumber.set(key, []);
    byNumber.get(key).push(team.id);
  }
  for (const [number, ids] of byNumber.entries()) {
    if (ids.length > 1) {
      return {
        invalidIds: new Set(ids),
        error: `Numer startowy ${number} jest przypisany do więcej niż jednego zespołu.`
      };
    }
  }
  return { invalidIds: new Set(), error: "" };
}

function showTeamMessage(message, type = "error") {
  const box = $("#teamsMessage");
  if (!box) return;
  box.textContent = message;
  box.dataset.type = type;
  box.hidden = false;
}

function readTeamImportFile(file) {
  if (!requireAdminPermission()) return;
  ui.teamImportRows = [];
  ui.teamImportFileName = file?.name || "";
  if (!file) {
    renderAdminTeams();
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const rows = /\.xlsx$/i.test(file.name)
        ? await parseXlsxRows(reader.result)
        : parseCsvRows(String(reader.result || ""));
      ui.teamImportRows = buildTeamImportPreview(rows);
    } catch (error) {
      ui.teamImportRows = [{
        rowNumber: 1,
        number: "",
        name: "",
        institution: "",
        valid: false,
        errors: [error.message]
      }];
    }
    renderAdminTeams();
  };
  if (/\.xlsx$/i.test(file.name)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, "utf-8");
}

function buildTeamImportPreview(rows) {
  const parsedRows = rows.filter(row => row.some(cell => String(cell).trim()));
  if (parsedRows.length < 2) throw new Error("Plik nie zawiera danych do importu.");
  const headers = parsedRows[0].map(normalizeImportHeader);
  const numberIndex = findImportColumn(headers, ["nr zespolu", "nr", "numer", "numer zespolu"]);
  const nameIndex = findImportColumn(headers, ["nazwa zespolu", "nazwa", "zespol"]);
  const institutionIndex = findImportColumn(headers, ["instytucja", "jednostka"]);
  if (nameIndex === -1) {
    throw new Error("Brakuje wymaganej kolumny: Nazwa zespołu.");
  }
  const existingNumbers = new Set(getAdminTeams().map(team => String(team.number || "").trim().toLowerCase()).filter(Boolean));
  const importedCounts = new Map();
  const rawRows = parsedRows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    number: numberIndex === -1 ? "" : String(cells[numberIndex] || "").trim(),
    name: String(cells[nameIndex] || "").trim(),
    institution: institutionIndex === -1 ? "" : String(cells[institutionIndex] || "").trim()
  }));
  for (const row of rawRows) {
    const key = row.number.toLowerCase();
    if (key) importedCounts.set(key, (importedCounts.get(key) || 0) + 1);
  }
  return rawRows.map(row => {
    const errors = [];
    const key = row.number.toLowerCase();
    if (!row.name) errors.push("brak nazwy");
    if (key && existingNumbers.has(key)) errors.push("numer już istnieje");
    if (key && importedCounts.get(key) > 1) errors.push("powtórzony numer w pliku");
    return { ...row, valid: errors.length === 0, errors };
  });
}

async function importValidTeams() {
  if (!requireAdminPermission()) return;
  const rows = (ui.teamImportRows || []).filter(row => row.valid);
  if (!rows.length) return;
  const now = new Date().toISOString();
  for (const row of rows) {
    await repository.upsertTeam({
      id: createLocalTeamId(),
      eventId: getDefaultEventId(),
      number: row.number,
      name: row.name,
      institution: row.institution,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now
    });
  }
  ui.state = await repository.getState();
  resetTeamsHome();
  renderAdminTeams();
  renderTeamList();
}

function getAdminTeams() {
  return (ui.state.teams || [])
    .filter(team => !team.deletedAt)
    .map(team => ({ ...team, institution: team.institution || "" }))
    .sort((a, b) => compareTeamNumbers(a.number, b.number) || a.name.localeCompare(b.name, "pl"));
}

function toggleTeamSelection(teamId, checked) {
  if (checked) ui.selectedTeamIds.add(teamId);
  else ui.selectedTeamIds.delete(teamId);
  renderAdminTeams();
}

function toggleAllVisibleTeams(checked) {
  const teams = getAdminTeams();
  if (checked) teams.forEach(team => ui.selectedTeamIds.add(team.id));
  else teams.forEach(team => ui.selectedTeamIds.delete(team.id));
  renderAdminTeams();
}

function areAllVisibleTeamsSelected(teams) {
  return teams.length > 0 && teams.every(team => ui.selectedTeamIds.has(team.id));
}

function pruneSelectedTeams(teams) {
  const visibleIds = new Set(teams.map(team => team.id));
  for (const id of [...ui.selectedTeamIds]) {
    if (!visibleIds.has(id)) ui.selectedTeamIds.delete(id);
  }
}

function getSelectedTeams() {
  const teamsById = new Map(getAdminTeams().map(team => [team.id, team]));
  return [...ui.selectedTeamIds].map(id => teamsById.get(id)).filter(Boolean);
}

function compareTeamNumbers(left, right) {
  const leftValue = String(left || "").trim();
  const rightValue = String(right || "").trim();
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return leftValue.localeCompare(rightValue, "pl", { numeric: true });
}

function parseCsvRows(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  return (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "");
}

function findImportColumn(headers, candidates) {
  return headers.findIndex(header => candidates.includes(header));
}

function formatAdminTeamLabel(team) {
  return `nr ${team.number || "—"} – ${team.name}`;
}

function pluralizeTeams(count) {
  if (count === 1) return "zespół";
  if (count >= 2 && count <= 4) return "zespoły";
  return "zespołów";
}

function pluralizeRows(count) {
  if (count === 1) return "wiersz";
  if (count >= 2 && count <= 4) return "wiersze";
  return "wierszy";
}

function createLocalTeamId() {
  return `team-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultEventId() {
  return ui.state.events?.find(event => !event.deletedAt)?.id || "event-demo-2026";
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

  const activeTeamId = teams.some(team => team.id === ui.selectedTeamId) ? ui.selectedTeamId : teams[0].id;
  ui.selectedTeamId = activeTeamId;
  saveUiState();

  $("#teamList").innerHTML = `
    <label class="team-select-panel">
      Zespół
      <select id="teamSelect">
        ${teams.map(team => `<option value="${team.id}" ${team.id === activeTeamId ? "selected" : ""}>${escapeHtml(formatTeamName(team))}</option>`).join("")}
      </select>
    </label>
    <div class="action-row">
      <button id="selectTeamBtn">Dalej</button>
    </div>
  `;

  $("#teamSelect").addEventListener("change", event => {
    ui.selectedTeamId = event.target.value;
    saveUiState();
  });
  $("#selectTeamBtn").addEventListener("click", () => selectTeam($("#teamSelect").value));
}

function selectTeam(teamId) {
  ui.selectedTeamId = teamId;
  saveUiState();
  const team = getSelectedTeam();
  $("#startTeamNumber").textContent = team?.number || "";
  $("#startTeamNumber").hidden = !team?.number;
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
      if (!isVisibleForJudge(competition, part, template)) continue;
      const locked = isAssignmentFilled({
        teamId: ui.selectedTeamId,
        competitionId: competition.id,
        competitionPartId: part.id,
        cardTemplateId: template.id
      });
      options.push({
        key: `${competition.id}:${part.id}:${template.id}`,
        label: `${competition.name} / ${part.name}`,
        locked
      });
    }
  }

  $("#assignmentSelect").innerHTML = options.length
    ? options.map(option => `<option value="${option.key}" ${option.locked ? "disabled" : ""}>${escapeHtml(option.label)}${option.locked ? " - wypełniona" : ""}</option>`).join("")
    : `<option value="">Brak przypisanych kart</option>`;
  const availableOptions = options.filter(option => !option.locked);
  ui.selectedAssignmentKey = availableOptions.some(option => option.key === ui.selectedAssignmentKey)
    ? ui.selectedAssignmentKey
    : availableOptions[0]?.key || null;
  if (ui.selectedAssignmentKey) $("#assignmentSelect").value = ui.selectedAssignmentKey;
  $("#assignmentSelect").disabled = ui.appMode === "judge" && options.length <= 1;
  $("#startAssessmentBtn").disabled = !ui.selectedTeamId || !ui.selectedAssignmentKey;
  const existingMessage = document.querySelector("#assignmentLockMessage");
  existingMessage?.remove();
  if (options.length && !availableOptions.length) {
    $("#assignmentSelect").insertAdjacentHTML("afterend", `<div id="assignmentLockMessage" class="validation-error">Ten zespół ma już wypełnione wszystkie dostępne karty.</div>`);
  }
}

async function startAssessment() {
  const assignment = getSelectedAssignment();
  if (!assignment) return;
  if (isAssignmentFilled({
    teamId: ui.selectedTeamId,
    competitionId: assignment.competition.id,
    competitionPartId: assignment.part.id,
    cardTemplateId: assignment.template.id
  })) {
    renderAssignments();
    return;
  }

  const scoreSheet = await scoringService.createDraft({
    teamId: ui.selectedTeamId,
    competitionId: assignment.competition.id,
    competitionPartId: assignment.part.id,
    cardTemplateId: assignment.template.id,
    deviceId: getDeviceId(),
    userId: getUserId()
  });

  ui.currentScoreSheetId = scoreSheet.id;
  ui.invalidFieldIds.clear();
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
  const taskInfo = getTaskInfo(assignment);
  $("#cardTitle").textContent = assignment.template.name;
  $("#teamNumber").value = formatTeamName(team);
  $("#cardTaskLabel").textContent = taskInfo.label;
  $("#cardTaskName").textContent = taskInfo.name;
  $("#totalScore").textContent = score.total;
  $("#maxScore").textContent = assignment.template.maxPoints;
  renderCardValidationMessage();

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
  const timerStarted = Boolean(competitionTimerService.getSnapshot().startedAt);
  const isInvalid = ui.invalidFieldIds.has(item.id);
  const disabled = !timerStarted ? "disabled" : "";
  return `
    <div class="row${isInvalid ? " field-invalid" : ""}${!timerStarted ? " scoring-locked" : ""}" data-score-field="${item.id}">
      <div class="criterion">
        <span>${escapeHtml(item.label)}${item.required ? '<span class="required">*</span>' : ""}</span>
        ${capturedTime ? `<small class="captured-time">${escapeHtml(capturedTime.elapsedDisplay)} od startu / ${escapeHtml(capturedTime.systemTimeDisplay)}</small>` : ""}
      </div>
      <label class="choice" aria-label="${escapeHtml(item.label)} tak">
        <input type="radio" name="${item.id}" value="yes" data-field-id="${item.id}" ${value === "yes" ? "checked" : ""} ${disabled}>
      </label>
      <label class="choice" aria-label="${escapeHtml(item.label)} nie">
        <input type="radio" name="${item.id}" value="no" data-field-id="${item.id}" ${value === "no" ? "checked" : ""} ${disabled}>
      </label>
      <div class="points">${item.captureTime?.scoreTiming === "deferredRanking" ? (value === "yes" ? "*" : 0) : (value === "yes" ? Number(item.points || 0) : 0)}</div>
    </div>`;
}

async function updateField(fieldId, value) {
  const scoreSheet = await getCurrentScoreSheet();
  if (!scoreSheet || scoreSheet.approvedAt || !competitionTimerService.getSnapshot().startedAt) return;
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
  ui.invalidFieldIds.delete(fieldId);
  await renderCard();
  await renderAudit();
  await renderSyncQueue();
}

async function finishAssessment() {
  if (!(await validateActiveCardBeforeClose())) return;

  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  if (!scoreSheet || !assignment) return;

  await renderFinishScreen();
  showView("finish-screen");
}

async function validateActiveCardBeforeClose() {
  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  if (!scoreSheet || !assignment) return true;

  const validation = validateCard(assignment.template, scoreSheet.values);
  const missingFieldIds = validation.filter(error => error.fieldId).map(error => error.fieldId);
  ui.invalidFieldIds = new Set(missingFieldIds);

  if (missingFieldIds.length) {
    await renderCard();
    focusFirstInvalidField(missingFieldIds[0]);
    return false;
  }

  ui.invalidFieldIds.clear();
  renderCardValidationMessage();
  return true;
}

async function renderFinishScreen() {
  const scoreSheet = await getCurrentScoreSheet();
  const assignment = getAssignmentForScoreSheet(scoreSheet);
  const team = getSelectedTeam();
  if (!scoreSheet || !assignment || !team) return;

  const score = calculateScore(assignment.template, scoreSheet.values);
  const validation = validateCard(assignment.template, scoreSheet.values);
  $("#finishTeamNumber").textContent = team.number || "";
  $("#finishTeamNumber").hidden = !team.number;
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
    ui.invalidFieldIds = new Set(result.validationErrors.filter(error => error.fieldId).map(error => error.fieldId));
    showView("card-screen");
    await renderCard();
    focusFirstInvalidField(result.validationErrors.find(error => error.fieldId)?.fieldId);
    return;
  }

  const team = getSelectedTeam();
  $("#confirmTeam").textContent = team ? formatTeamName(team) : "--";
  $("#confirmScore").textContent = `${result.scoreSheet.finalScore} / ${assignment.template.maxPoints}`;
  $("#confirmStatus").textContent = SyncStatus.QUEUED;
  ui.currentScoreSheetId = null;
  saveUiState();
  await renderAll();
  showView("confirm-screen");
}

async function trySync() {
  if (!requireSyncPermission()) return;
  const results = await syncService.flush();
  await renderAll();
  const failed = results.find(item => item.status === SyncStatus.FAILED || item.status === SyncStatus.CONFLICT);
  if (failed) {
    $("#syncErrorText").textContent = failed.error || "Wykryto konflikt synchronizacji.";
    showView("sync-error-screen");
  }
}

async function renderRanking() {
  ui.state = await repository.getState();
  const generalRows = await rankingService.getGeneralRanking();
  ui.rankingLastUpdatedAt = new Date();
  $("#rankingUpdatedAt").textContent = `Ostatnia aktualizacja: ${formatDate(ui.rankingLastUpdatedAt.toISOString())}`;
  document.querySelectorAll("[data-ranking-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.rankingView === ui.rankingView);
  });
  $("#exportCompetitionPointsBtn").hidden = ui.rankingView !== "competition-points";
  if (ui.rankingView === "competition-points") {
    renderCompetitionPointsRanking(generalRows);
    return;
  }
  $("#rankingSortBar").hidden = true;
  $("#rankingContent").innerHTML = `
    <div class="table-shell ranking-table-shell">
      <table class="users-table ranking-table">
        <thead><tr><th>Miejsce</th><th>Nr zespołu</th><th>Nazwa zespołu</th><th>Suma punktów</th><th>Procent</th></tr></thead>
        <tbody>
          ${generalRows.length ? generalRows.map(row => `
            <tr>
              <td><strong>${row.place || "—"}</strong></td>
              <td>${escapeHtml(row.teamNumber || "")}</td>
              <td>${escapeHtml(row.teamName)}</td>
              <td><b>${formatNumber(row.total)}</b></td>
              <td>${formatPercentage(row.percentage)}</td>
            </tr>
          `).join("") : `<tr><td colspan="5">Brak zatwierdzonych wyników.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function handleRankingClick(event) {
  const viewButton = event.target.closest("[data-ranking-view]");
  if (viewButton) {
    ui.rankingView = viewButton.dataset.rankingView;
    if (ui.rankingView !== "competition-points") ui.rankingSortCompetitionId = null;
    renderRanking();
    return;
  }
  const sortButton = event.target.closest("[data-ranking-sort-competition]");
  if (sortButton) {
    ui.rankingSortCompetitionId = sortButton.dataset.rankingSortCompetition;
    renderRanking();
  }
}

function renderCompetitionPointsRanking(generalRows) {
  const matrix = buildCompetitionPointsMatrix(generalRows);
  const sortedRows = getSortedCompetitionPointRows(matrix);
  const sortedCompetition = matrix.competitions.find(competition => competition.id === ui.rankingSortCompetitionId);
  $("#rankingSortBar").hidden = !sortedCompetition;
  $("#rankingSortLabel").textContent = sortedCompetition
    ? `Konkurencja ${getCompetitionNumber(sortedCompetition)}`
    : "—";
  $("#rankingContent").innerHTML = `
    <div class="table-shell competition-points-shell">
      <table class="users-table competition-points-table">
        <thead>
          <tr>
            <th class="sticky-col sticky-place" rowspan="2">Miejsce</th>
            <th class="sticky-col sticky-number" rowspan="2">Nr zespołu</th>
            <th class="sticky-col sticky-team" rowspan="2">Nazwa zespołu</th>
            ${matrix.competitions.map(competition => renderCompetitionPointsCompetitionHeader(competition)).join("")}
          </tr>
          <tr>
            ${matrix.competitions.map(renderCompetitionPointsPartsHeader).join("")}
          </tr>
        </thead>
        <tbody>
          ${sortedRows.length ? sortedRows.map((row, index) => renderCompetitionPointsRow(row, index, matrix.competitions)).join("") : `<tr><td colspan="3">Brak zespołów.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function buildCompetitionPointsMatrix(generalRows) {
  const competitions = getAssignableCompetitions().map(competition => ({
    ...competition,
    parts: (competition.parts || []).map((part, index) => ({
      ...part,
      displayLabel: getCompetitionPartLabel(part, index)
    }))
  }));
  const approvedSheets = (ui.state.scoreSheets || []).filter(sheet =>
    !sheet.deletedAt &&
    sheet.status === "approved" &&
    sheet.approvedAt &&
    sheet.finalScore != null
  );
  const scoreByKey = new Map(approvedSheets.map(sheet => [
    createScoreKey(sheet.teamId, sheet.competitionId, sheet.competitionPartId),
    Number(sheet.finalScore || 0)
  ]));
  const generalOrder = new Map(generalRows.map((row, index) => [row.teamId, index]));
  const rows = getAdminTeams().map(team => {
    const competitionTotals = new Map();
    const partScores = new Map();
    for (const competition of competitions) {
      let total = 0;
      let hasAnyScore = false;
      for (const part of competition.parts || []) {
        const score = scoreByKey.get(createScoreKey(team.id, competition.id, part.id));
        partScores.set(createScoreKey(team.id, competition.id, part.id), score ?? null);
        if (score != null) {
          total += Number(score);
          hasAnyScore = true;
        }
      }
      competitionTotals.set(competition.id, hasAnyScore ? total : null);
    }
    return {
      team,
      generalOrder: generalOrder.get(team.id) ?? Number.MAX_SAFE_INTEGER,
      partScores,
      competitionTotals
    };
  });
  return { competitions, rows };
}

function getSortedCompetitionPointRows(matrix) {
  const rows = [...matrix.rows];
  if (!ui.rankingSortCompetitionId) {
    return rows.sort((a, b) => a.generalOrder - b.generalOrder || a.team.name.localeCompare(b.team.name, "pl"));
  }
  return rows.sort((a, b) => {
    const left = a.competitionTotals.get(ui.rankingSortCompetitionId);
    const right = b.competitionTotals.get(ui.rankingSortCompetitionId);
    if (left != null && right == null) return -1;
    if (left == null && right != null) return 1;
    if (left != null && right != null) return right - left || a.generalOrder - b.generalOrder;
    return a.generalOrder - b.generalOrder || a.team.name.localeCompare(b.team.name, "pl");
  });
}

function renderCompetitionPointsCompetitionHeader(competition) {
  const number = getCompetitionNumber(competition) || "—";
  const active = ui.rankingSortCompetitionId === competition.id;
  const colspan = Math.max((competition.parts || []).length, 1);
  const rowspan = colspan === 1 ? ` rowspan="2"` : "";
  return `
    <th class="competition-points-competition-head${active ? " active-sort" : ""}" colspan="${colspan}"${rowspan}>
      <button type="button" data-ranking-sort-competition="${escapeHtml(competition.id)}" title="Sortuj po konkurencji ${escapeHtml(number)}">
        ${escapeHtml(number)}${active ? " ↓" : ""}
      </button>
    </th>
  `;
}

function renderCompetitionPointsPartsHeader(competition) {
  const parts = competition.parts || [];
  if (parts.length <= 1) return "";
  return parts.map(part => `<th class="competition-points-part-head">${escapeHtml(part.displayLabel)}</th>`).join("");
}

function renderCompetitionPointsRow(row, index, competitions) {
  return `
    <tr>
      <td class="sticky-col sticky-place"><strong>${index + 1}</strong></td>
      <td class="sticky-col sticky-number">${escapeHtml(row.team.number || "")}</td>
      <td class="sticky-col sticky-team"><strong>${escapeHtml(row.team.name)}</strong></td>
      ${competitions.map(competition => renderCompetitionPointsCells(row, competition)).join("")}
    </tr>
  `;
}

function renderCompetitionPointsCells(row, competition) {
  const parts = competition.parts || [];
  if (parts.length <= 1) {
    const part = parts[0];
    const score = part ? row.partScores.get(createScoreKey(row.team.id, competition.id, part.id)) : null;
    return `<td class="score-cell">${formatScoreCell(score)}</td>`;
  }
  return parts.map(part => {
    const score = row.partScores.get(createScoreKey(row.team.id, competition.id, part.id));
    return `<td class="score-cell">${formatScoreCell(score)}</td>`;
  }).join("");
}

function clearRankingSort() {
  ui.rankingSortCompetitionId = null;
  renderRanking();
}

function exportCompetitionPoints() {
  const matrix = buildCompetitionPointsMatrixForExport();
  const html = buildCompetitionPointsExportHtml(matrix);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `punkty-konkurencji-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildCompetitionPointsMatrixForExport() {
  const generalRows = buildGeneralRankingForCurrentState();
  const matrix = buildCompetitionPointsMatrix(generalRows);
  return { ...matrix, rows: getSortedCompetitionPointRows(matrix) };
}

function buildGeneralRankingForCurrentState() {
  const approvedSheets = (ui.state.scoreSheets || []).filter(sheet => sheet.status === "approved" && sheet.approvedAt && !sheet.deletedAt && sheet.finalScore != null);
  const rows = getAdminTeams().map(team => {
    const total = approvedSheets
      .filter(sheet => sheet.teamId === team.id)
      .reduce((sum, sheet) => sum + Number(sheet.finalScore || 0), 0);
    const approvedCount = approvedSheets.filter(sheet => sheet.teamId === team.id).length;
    return { teamId: team.id, teamName: team.name, total, approvedSheets: approvedCount };
  });
  return rows.sort((a, b) => {
    if (a.approvedSheets > 0 && b.approvedSheets === 0) return -1;
    if (a.approvedSheets === 0 && b.approvedSheets > 0) return 1;
    if (a.approvedSheets > 0 && b.approvedSheets > 0) return b.total - a.total || a.teamName.localeCompare(b.teamName, "pl");
    return a.teamName.localeCompare(b.teamName, "pl");
  });
}

function buildCompetitionPointsExportHtml(matrix) {
  const headerTop = `
    <tr>
      <th rowspan="2">Miejsce</th><th rowspan="2">Nr zespołu</th><th rowspan="2">Nazwa zespołu</th>
      ${matrix.competitions.map(competition => `<th colspan="${Math.max((competition.parts || []).length, 1)}">Konkurencja ${escapeHtml(getCompetitionNumber(competition) || "—")}</th>`).join("")}
    </tr>`;
  const headerBottom = `
    <tr>
      ${matrix.competitions.map(competition => {
        const parts = competition.parts || [];
        if (parts.length <= 1) return `<th></th>`;
        return parts.map(part => `<th>${escapeHtml(part.displayLabel)}</th>`).join("");
      }).join("")}
    </tr>`;
  const body = matrix.rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td><td>${escapeHtml(row.team.number || "")}</td><td>${escapeHtml(row.team.name)}</td>
      ${matrix.competitions.map(competition => renderCompetitionPointsExportCells(row, competition)).join("")}
    </tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${headerTop}${headerBottom}${body}</table></body></html>`;
}

function renderCompetitionPointsExportCells(row, competition) {
  const parts = competition.parts || [];
  if (parts.length <= 1) {
    const part = parts[0];
    const score = part ? row.partScores.get(createScoreKey(row.team.id, competition.id, part.id)) : null;
    return `<td>${score ?? ""}</td>`;
  }
  return parts.map(part => `<td>${row.partScores.get(createScoreKey(row.team.id, competition.id, part.id)) ?? ""}</td>`).join("");
}

function getCompetitionPartLabel(part, index) {
  const source = `${part?.name || ""} ${part?.code || ""}`.trim();
  const match = source.match(/(?:^|\s|[-_])([A-Z])(?:\s*)$/i);
  return (match?.[1] || String.fromCharCode(65 + index)).toUpperCase();
}

function createScoreKey(teamId, competitionId, partId) {
  return `${teamId}:${competitionId}:${partId}`;
}

function formatScoreCell(score) {
  return score == null ? "—" : formatNumber(score);
}

async function renderAudit() {
  const container = $("#auditContent");
  if (!container) return;
  ui.state = await repository.getState();
  container.innerHTML = `
    <div class="admin-section-header assignments-header audit-header">
      <div>
        <h2>Audyt</h2>
        <p class="muted">Centrum kontroli przebiegu zawodów. Dane pochodzą z centralnego modelu aplikacji.</p>
      </div>
    </div>
    <div class="message-tabs audit-tabs" role="tablist" aria-label="Zakładki audytu">
      ${renderAuditTab("devices", "Tablety")}
      ${renderAuditTab("competitions", "Konkurencje")}
    </div>
    ${ui.auditView === "competitions" ? renderAuditCompetitionsView() : renderAuditDevicesView()}
  `;
}

function renderAuditTab(view, label) {
  return `<button type="button" class="secondary compact-button ${ui.auditView === view ? "active" : ""}" data-audit-view="${view}">${label}</button>`;
}

function handleAuditClick(event) {
  const tab = event.target.closest("[data-audit-view]");
  if (!tab) return;
  ui.auditView = tab.dataset.auditView;
  renderAudit();
}

function resetAuditHome() {
  ui.auditView = "devices";
}

function renderAuditDevicesView() {
  const devices = getAuditDevices();
  const online = devices.filter(device => device.status === "online").length;
  const offline = devices.filter(device => device.status === "offline").length;
  const synced = devices.filter(device => device.syncStatus === "synced").length;
  const hasDeviceStatus = devices.some(device => device.status === "online" || device.status === "offline");
  const hasSyncStatus = devices.some(device => device.syncStatus);
  return `
    <div class="audit-summary-grid">
      ${renderAuditMetricCard("Tablety online", hasDeviceStatus ? online : "—", hasDeviceStatus ? "ok" : "neutral")}
      ${renderAuditMetricCard("Tablety offline", hasDeviceStatus ? offline : "—", hasDeviceStatus && offline ? "danger" : "neutral")}
      ${renderAuditMetricCard("Zsynchronizowane", hasSyncStatus ? `${synced} / ${devices.length}` : "—", hasSyncStatus && synced === devices.length ? "ok" : "neutral")}
    </div>
    ${devices.length ? `
      <div class="audit-table-layout">
        <div class="table-shell audit-table-shell">
          <table class="users-table audit-table">
            <thead>
              <tr><th>Tablet</th><th>Konkurencja</th><th>Status</th><th>Ostatnio widziany</th><th>Synchronizacja</th></tr>
            </thead>
            <tbody>${devices.map(renderAuditDeviceRow).join("")}</tbody>
          </table>
        </div>
        ${renderAuditLegend("device")}
      </div>
      <div class="audit-card-list">${devices.map(renderAuditDeviceCard).join("")}</div>
    ` : `
      <div class="audit-table-layout">
        <div class="empty-state audit-empty-state">
          <strong>Brak danych o urządzeniach</strong>
          <span>Dane pojawią się po podłączeniu urządzeń.</span>
        </div>
        ${renderAuditLegend("device")}
      </div>
    `}
  `;
}

function renderAuditCompetitionsView() {
  const rows = getAuditCompetitionRows();
  const knownScheduleStatuses = rows.filter(row => row.scheduleStatus.key !== "unknown");
  const onTime = knownScheduleStatuses.filter(row => row.scheduleStatus.key === "on-time").length;
  const delayed = knownScheduleStatuses.filter(row => row.scheduleStatus.key === "delayed").length;
  const unknown = rows.filter(row => row.scheduleStatus.key === "unknown").length;
  return `
    <div class="audit-summary-grid">
      ${renderAuditMetricCard("Zgodnie z planem", knownScheduleStatuses.length ? onTime : "—", knownScheduleStatuses.length ? "ok" : "neutral")}
      ${renderAuditMetricCard("Opóźnione", knownScheduleStatuses.length ? delayed : "—", delayed ? "danger" : "neutral")}
      ${renderAuditMetricCard("Brak danych", unknown, "neutral")}
    </div>
    <div class="audit-table-layout">
      <div class="table-shell audit-table-shell">
        <table class="users-table audit-table">
          <thead>
            <tr><th>Nr konkurencji</th><th>Nazwa konkurencji</th><th>Ekipy obsłużone</th><th>Ekipy pozostałe</th><th>Status czasu</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(renderAuditCompetitionRow).join("") : `<tr><td colspan="5">Brak konkurencji w centralnym modelu.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${renderAuditLegend("competition")}
    </div>
    <div class="audit-card-list">
      ${rows.length ? rows.map(renderAuditCompetitionCard).join("") : `<div class="empty-state"><strong>Brak konkurencji.</strong><span>Lista jest pusta w centralnym modelu.</span></div>`}
    </div>
  `;
}

function renderAuditMetricCard(label, value, status = "neutral") {
  return `
    <section class="sync-dashboard-card audit-metric-card" data-status="${escapeHtml(status)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderAuditLegend(type) {
  if (type === "competition") {
    return `
      <aside class="audit-legend" aria-label="Legenda statusu czasu">
        <h3>Legenda statusu czasu</h3>
        ${renderAuditLegendItem("ok", "Zielony", "Zgodnie z planem")}
        ${renderAuditLegendItem("warn", "Pomarańczowy", "Przed czasem")}
        ${renderAuditLegendItem("danger", "Czerwony", "Opóźnienie")}
        ${renderAuditLegendItem("neutral", "Szary", "Brak danych")}
      </aside>
    `;
  }
  return `
    <aside class="audit-legend" aria-label="Legenda statusu tabletów">
      <h3>Legenda statusu</h3>
      ${renderAuditLegendItem("ok", "Zielony", "Online / poprawnie zsynchronizowany")}
      ${renderAuditLegendItem("warn", "Pomarańczowy", "Online / wymaga synchronizacji")}
      ${renderAuditLegendItem("danger", "Czerwony", "Offline / problem")}
      ${renderAuditLegendItem("neutral", "Szary", "Brak danych")}
    </aside>
  `;
}

function renderAuditLegendItem(status, label, description) {
  return `
    <div class="audit-legend-item">
      <span class="audit-legend-swatch ${escapeHtml(status)}" aria-hidden="true"></span>
      <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div>
    </div>
  `;
}

function getAuditDevices() {
  const byId = new Map();
  const addDevice = device => {
    const id = device?.deviceId || device?.id;
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...device, deviceId: id });
  };
  for (const assignment of ui.state?.deviceAssignments || []) {
    const hasTelemetry = assignment.status || assignment.deviceStatus || assignment.lastSeen || assignment.lastSeenAt || assignment.syncStatus || assignment.lastSyncAt;
    if (!assignment.deletedAt && assignment.deviceId && hasTelemetry) {
      addDevice({
        deviceId: assignment.deviceId,
        label: assignment.deviceLabel || assignment.label || assignment.deviceId,
        competitionId: assignment.competitionId,
        status: assignment.status || assignment.deviceStatus || null,
        lastSeen: assignment.lastSeen || assignment.lastSeenAt || null,
        syncStatus: assignment.syncStatus || null,
        lastSyncAt: assignment.lastSyncAt || null
      });
    }
  }
  for (const operation of ui.state?.syncOperations || []) {
    const deviceId = operation.device_id || operation.deviceId;
    if (!deviceId) continue;
    addDevice({
      deviceId,
      syncStatus: operation.status === SyncStatus.SENT ? "synced" : "pending",
      lastSyncAt: operation.sent_at || operation.sentAt || operation.updatedAt || operation.createdAt || null
    });
  }
  return [...byId.values()].sort((a, b) => String(a.label || a.deviceId).localeCompare(String(b.label || b.deviceId), "pl", { numeric: true }));
}

function renderAuditDeviceRow(device) {
  const rowStatus = getDeviceAuditRowStatus(device);
  return `
    <tr class="audit-status-row ${escapeHtml(rowStatus)}">
      <td><strong>${escapeHtml(device.label || device.deviceId)}</strong><br><small>${escapeHtml(device.deviceId)}</small></td>
      <td>${escapeHtml(formatAuditCompetitionName(device.competitionId))}</td>
      <td>${renderAuditStatusBadge(formatDeviceStatus(device.status), getDeviceStatusClass(device.status))}</td>
      <td>${escapeHtml(formatAuditDate(device.lastSeen))}</td>
      <td>${renderAuditStatusBadge(formatDeviceSyncStatus(device.syncStatus), getDeviceSyncStatusClass(device.syncStatus))}${device.lastSyncAt ? `<br><small>${escapeHtml(formatAuditDate(device.lastSyncAt))}</small>` : ""}</td>
    </tr>
  `;
}

function renderAuditDeviceCard(device) {
  const rowStatus = getDeviceAuditRowStatus(device);
  return `
    <article class="audit-mobile-card audit-status-card ${escapeHtml(rowStatus)}">
      <h3>${escapeHtml(device.label || device.deviceId)}</h3>
      <dl>
        <div><dt>Tablet</dt><dd>${escapeHtml(device.deviceId)}</dd></div>
        <div><dt>Konkurencja</dt><dd>${escapeHtml(formatAuditCompetitionName(device.competitionId))}</dd></div>
        <div><dt>Status</dt><dd>${renderAuditStatusBadge(formatDeviceStatus(device.status), getDeviceStatusClass(device.status))}</dd></div>
        <div><dt>Ostatnio widziany</dt><dd>${escapeHtml(formatAuditDate(device.lastSeen))}</dd></div>
        <div><dt>Synchronizacja</dt><dd>${renderAuditStatusBadge(formatDeviceSyncStatus(device.syncStatus), getDeviceSyncStatusClass(device.syncStatus))}</dd></div>
      </dl>
    </article>
  `;
}

function getAuditCompetitionRows() {
  const totalTeams = getAdminTeams().length;
  return getAssignableCompetitions().map(competition => {
    const completed = countCompletedTeamsForCompetition(competition.id);
    return {
      competition,
      completed,
      remaining: Math.max(totalTeams - completed, 0),
      scheduleStatus: getCompetitionScheduleStatus(competition)
    };
  });
}

function countCompletedTeamsForCompetition(competitionId) {
  const teamIds = new Set();
  for (const scoreSheet of ui.state.scoreSheets || []) {
    if (scoreSheet.deletedAt || scoreSheet.competitionId !== competitionId) continue;
    if (scoreSheet.approvedAt || scoreSheet.status === "approved" || scoreSheet.finalScore != null) {
      teamIds.add(scoreSheet.teamId);
    }
  }
  return teamIds.size;
}

function getCompetitionScheduleStatus(competition) {
  const status = competition?.scheduleStatus || competition?.timeStatus || null;
  if (status === "on-time") return { key: "on-time", label: "Zgodnie z planem", className: "ok" };
  if (status === "delayed") return { key: "delayed", label: "Opóźnienie", className: "danger" };
  if (status === "ahead") return { key: "ahead", label: "Przed czasem", className: "warn" };
  return { key: "unknown", label: "Brak danych", className: "neutral" };
}

function renderAuditCompetitionRow(row) {
  return `
    <tr class="audit-status-row ${escapeHtml(row.scheduleStatus.className)}">
      <td><strong>${escapeHtml(getCompetitionNumber(row.competition) || "—")}</strong></td>
      <td>${escapeHtml(row.competition.name || "—")}</td>
      <td>${row.completed}</td>
      <td>${row.remaining}</td>
      <td>${renderAuditStatusBadge(row.scheduleStatus.label, row.scheduleStatus.className)}</td>
    </tr>
  `;
}

function renderAuditCompetitionCard(row) {
  return `
    <article class="audit-mobile-card audit-status-card ${escapeHtml(row.scheduleStatus.className)}">
      <h3>${escapeHtml(getCompetitionNumber(row.competition) || "—")} ${escapeHtml(row.competition.name || "—")}</h3>
      <dl>
        <div><dt>Obsłużone</dt><dd>${row.completed}</dd></div>
        <div><dt>Pozostałe</dt><dd>${row.remaining}</dd></div>
        <div><dt>Status czasu</dt><dd>${renderAuditStatusBadge(row.scheduleStatus.label, row.scheduleStatus.className)}</dd></div>
      </dl>
    </article>
  `;
}

function renderAuditStatusBadge(label, className = "neutral") {
  return `<span class="audit-status-badge ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

function formatAuditCompetitionName(competitionId) {
  if (!competitionId) return "—";
  const competition = getCompetitionById(competitionId);
  if (!competition) return "—";
  const number = getCompetitionNumber(competition);
  return `${number ? `${number} ` : ""}${competition.name || ""}`.trim() || "—";
}

function formatDeviceStatus(status) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Brak danych";
}

function getDeviceStatusClass(status) {
  if (status === "online") return "ok";
  if (status === "offline") return "danger";
  return "neutral";
}

function formatDeviceSyncStatus(status) {
  if (status === "synced" || status === SyncStatus.SENT) return "Zsynchronizowany";
  if (status === "pending" || status === SyncStatus.QUEUED) return "Oczekuje";
  if (status === SyncStatus.FAILED || status === SyncStatus.CONFLICT) return "Wymaga uwagi";
  return "Brak danych";
}

function getDeviceSyncStatusClass(status) {
  if (status === "synced" || status === SyncStatus.SENT) return "ok";
  if (status === "pending" || status === SyncStatus.QUEUED) return "warn";
  if (status === SyncStatus.FAILED || status === SyncStatus.CONFLICT) return "danger";
  return "neutral";
}

function getDeviceAuditRowStatus(device) {
  const status = device?.status;
  const syncStatus = device?.syncStatus;
  if (status === "offline") return "danger";
  if (syncStatus === SyncStatus.FAILED || syncStatus === SyncStatus.CONFLICT || syncStatus === "failed" || syncStatus === "conflict") return "danger";
  if (status === "online" && (syncStatus === "pending" || syncStatus === SyncStatus.QUEUED)) return "warn";
  if (!status && (syncStatus === "pending" || syncStatus === SyncStatus.QUEUED)) return "warn";
  if (status === "online" && (syncStatus === "synced" || syncStatus === SyncStatus.SENT)) return "ok";
  return "neutral";
}

function formatAuditDate(value) {
  return value ? formatDate(value) : "—";
}

async function renderMessages() {
  const container = $("#messagesContent");
  if (!container) return;
  const messages = await repository.listMessages();
  ui.state.messages = messages;
  const filteredMessages = filterMessages(messages);
  container.innerHTML = `
    <div class="admin-section-header assignments-header">
      <div>
        <h2>Komunikaty</h2>
        <p class="muted">Komunikaty organizacyjne dla sędziów. Potwierdzenia odbioru będą wykorzystywane w kolejnych etapach.</p>
      </div>
      <button type="button" data-message-action="new">+ Nowy komunikat</button>
    </div>
    <div id="messageFeedback" class="bulk-message" role="alert" hidden></div>
    ${ui.messageComposerOpen ? renderMessageComposer() : ""}
    <div class="message-tabs" role="tablist" aria-label="Filtr komunikatów">
      ${renderMessageTab("all", "Wszystkie")}
      ${renderMessageTab("sent", "Wysłane")}
      ${renderMessageTab("scheduled", "Zaplanowane")}
    </div>
    <div class="table-shell messages-table-shell">
      <table class="users-table messages-table">
        <thead>
          <tr>
            <th>Tytuł</th>
            <th>Treść / podgląd</th>
            <th>Status</th>
            <th>Odbiorcy</th>
            <th>Potwierdzenie odbioru</th>
          </tr>
        </thead>
        <tbody>
          ${filteredMessages.length ? filteredMessages.map(renderMessageRow).join("") : `<tr><td colspan="5">Brak komunikatów.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderMessageTab(view, label) {
  return `<button type="button" class="secondary compact-button ${ui.messagesView === view ? "active" : ""}" data-message-filter="${view}">${label}</button>`;
}

function renderMessageComposer() {
  const competitions = getAssignableCompetitions();
  return `
    <form id="messageForm" class="user-form-panel message-form">
      <div class="message-form-header">
        <h3>Nowy komunikat</h3>
        <button type="submit">Wyślij</button>
      </div>
      <div class="form-grid">
        <label>
          Tytuł
          <input id="messageTitleInput" name="title" required autocomplete="off">
        </label>
        <label>
          Ważność
          <select id="messagePriorityInput" name="priority">
            <option value="info">Informacja</option>
            <option value="important">Ważne</option>
            <option value="urgent">Pilne</option>
          </select>
        </label>
        <label>
          Status
          <select id="messageStatusInput" name="status">
            <option value="sent">Wysłany</option>
            <option value="scheduled">Zaplanowany</option>
          </select>
        </label>
      </div>
      <label>
        Treść komunikatu
        <textarea id="messageBodyInput" name="body" rows="4" required></textarea>
      </label>
      <fieldset class="message-targets">
        <legend>Wyślij do</legend>
        <label><input type="radio" name="messageAudience" value="all_competitions"> Wszystkie konkurencje</label>
        <label><input type="radio" name="messageAudience" value="selected_competitions"> Wybrane konkurencje</label>
      </fieldset>
      <div id="messageCompetitionPicker" class="assignment-check-list message-competition-picker">
        ${competitions.length ? competitions.map(competition => `
          <label class="assignment-check-row">
            <input type="checkbox" name="messageCompetition" value="${escapeHtml(competition.id)}">
            <span><strong>${escapeHtml(competition.name)}</strong></span>
          </label>
        `).join("") : `<div class="empty-state">Brak konkurencji.</div>`}
      </div>
      <div id="messageFormError" class="login-error" role="alert" hidden></div>
      <div class="action-row">
        <button type="button" class="secondary" data-message-action="cancel-new">Anuluj</button>
        <button type="submit">Wyślij</button>
      </div>
    </form>
  `;
}

function renderMessageRow(message) {
  const recipients = getMessageRecipients(message);
  const confirmedCount = recipients.filter(user => message.confirmations?.[user.id]).length;
  const unconfirmed = getUnconfirmedMessageRecipients(message);
  return `
    <tr>
      <td><strong>${escapeHtml(message.title)}</strong><br><small>${escapeHtml(formatMessagePriority(message.priority))}</small></td>
      <td>${escapeHtml(shortenText(message.body, 120))}</td>
      <td><span class="badge ${message.status === "sent" ? "ok" : "warn"}">${escapeHtml(formatMessageStatus(message.status))}</span></td>
      <td>${escapeHtml(formatMessageAudience(message))}</td>
      <td>
        <div class="message-confirmation-cell">
          <span>${confirmedCount} z ${recipients.length}</span>
          <button type="button" class="secondary compact-button" data-message-action="toggle-unconfirmed" data-message-id="${escapeHtml(message.id)}" title="Pokaż osoby bez potwierdzenia">👁</button>
        </div>
        ${ui.messageUnconfirmedId === message.id ? `
          <div class="message-unconfirmed-panel">
            <strong>Nie potwierdzili:</strong>
            ${unconfirmed.length ? `<ul>${unconfirmed.map(user => `<li>${escapeHtml(getUserFullName(user))}</li>`).join("")}</ul>` : `<p>Wszyscy odbiorcy potwierdzili odbiór.</p>`}
          </div>
        ` : ""}
      </td>
    </tr>
  `;
}

function filterMessages(messages) {
  const active = (messages || []).filter(message => !message.deletedAt);
  if (ui.messagesView === "sent") return active.filter(message => message.status === "sent");
  if (ui.messagesView === "scheduled") return active.filter(message => message.status === "scheduled");
  return active;
}

function handleMessagesClick(event) {
  const filterButton = event.target.closest("[data-message-filter]");
  if (filterButton) {
    ui.messagesView = filterButton.dataset.messageFilter;
    ui.messageUnconfirmedId = null;
    renderMessages();
    return;
  }
  const actionButton = event.target.closest("[data-message-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.messageAction;
  if (action === "new") {
    if (!requireMessagePermission()) return;
    ui.messageComposerOpen = true;
    ui.messageUnconfirmedId = null;
    renderMessages();
  }
  if (action === "cancel-new") {
    ui.messageComposerOpen = false;
    renderMessages();
  }
  if (action === "toggle-unconfirmed") {
    ui.messageUnconfirmedId = ui.messageUnconfirmedId === actionButton.dataset.messageId ? null : actionButton.dataset.messageId;
    renderMessages();
  }
}

function handleMessagesChange(event) {
  if (event.target.name !== "messageAudience") return;
  setMessageCompetitionPickerMode(event.target.value);
}

function setMessageCompetitionPickerMode(audienceType) {
  const allCompetitions = audienceType === "all_competitions";
  document.querySelectorAll("input[name='messageCompetition']").forEach(input => {
    input.checked = allCompetitions;
    input.disabled = false;
  });
}

async function handleMessagesSubmit(event) {
  if (event.target.id !== "messageForm") return;
  event.preventDefault();
  if (!requireMessagePermission()) return;
  const title = $("#messageTitleInput").value.trim();
  const body = $("#messageBodyInput").value.trim();
  const priority = $("#messagePriorityInput").value;
  const status = $("#messageStatusInput").value;
  const audienceType = document.querySelector("input[name='messageAudience']:checked")?.value || "";
  const competitionIds = [...document.querySelectorAll("input[name='messageCompetition']:checked")].map(input => input.value);
  const error = validateMessageForm({ title, body, audienceType, competitionIds });
  if (error) {
    showMessageFormError(error);
    return;
  }
  const now = new Date().toISOString();
  await repository.upsertMessage({
    id: createLocalMessageId(),
    title,
    body,
    priority,
    status,
    audience: {
      type: "competitions",
      mode: audienceType === "all_competitions" ? "all" : "selected",
      competitionIds
    },
    confirmations: {},
    createdAt: now,
    updatedAt: now,
    createdBy: getUserId(),
    deletedAt: null,
    deletedBy: null
  });
  ui.messageComposerOpen = false;
  ui.messagesView = "all";
  ui.messageUnconfirmedId = null;
  await renderMessages();
  showMessageFeedback("Komunikat został zapisany.", "ok");
}

function validateMessageForm({ title, body, audienceType, competitionIds }) {
  if (!title) return "Tytuł jest wymagany.";
  if (!body) return "Treść komunikatu jest wymagana.";
  if (!audienceType) return "Wskaż odbiorców komunikatu.";
  if (!competitionIds.length) return "Wybierz co najmniej jedną konkurencję.";
  return null;
}

function showMessageFormError(message) {
  const box = $("#messageFormError");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function showMessageFeedback(message, type = "error") {
  const box = $("#messageFeedback");
  if (!box) return;
  box.textContent = message;
  box.dataset.type = type;
  box.hidden = false;
}

function resetMessagesHome() {
  ui.messagesView = "all";
  ui.messageComposerOpen = false;
  ui.messageUnconfirmedId = null;
}

function getMessageRecipients(message) {
  if (message.audience?.type === "competitions") {
    const ids = new Set(message.audience.competitionIds || []);
    const recipients = new Map();
    for (const assignment of getActiveJudgeAssignments().filter(item => ids.has(item.competitionId))) {
      const judge = getAssignableJudges().find(user => user.id === assignment.judgeUserId);
      if (judge) recipients.set(judge.id, judge);
    }
    return [...recipients.values()].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b), "pl"));
  }
  return [];
}

function getUnconfirmedMessageRecipients(message) {
  return getMessageRecipients(message).filter(user => !message.confirmations?.[user.id]);
}

function formatMessageAudience(message) {
  if (message.audience?.type === "competitions") {
    const names = (message.audience.competitionIds || []).map(getCompetitionName);
    if (message.audience.mode === "all") return "Wszystkie konkurencje";
    return names.length ? names.join(", ") : "Wybrane konkurencje";
  }
  return "—";
}

function formatMessagePriority(priority) {
  if (priority === "urgent") return "Pilne";
  if (priority === "important") return "Ważne";
  return "Informacja";
}

function formatMessageStatus(status) {
  return status === "scheduled" ? "Zaplanowany" : "Wysłany";
}

function shortenText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function createLocalMessageId() {
  return `message-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function renderSyncQueue() {
  const operations = await repository.listSyncOperations();
  const body = $("#syncBody");
  if (!body) {
    renderSyncStatus();
    return;
  }
  body.innerHTML = operations.length
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

async function renderSyncDashboard() {
  const container = $("#syncDashboard");
  if (!container) return;
  ui.state = await repository.getState();
  const operations = await repository.listSyncOperations();
  const users = getDisplayUsers();
  const judges = getAssignableJudges();
  const teams = getAdminTeams();
  const devices = getKnownDevices(operations);
  const queued = operations.filter(operation => operation.status !== SyncStatus.SENT);
  const failed = operations.filter(operation => operation.status === SyncStatus.FAILED || operation.status === SyncStatus.CONFLICT);
  container.innerHTML = `
    <div class="sync-dashboard-grid">
      <button type="button" class="sync-dashboard-card sync-dashboard-button" data-sync-action="toggle-connection" aria-expanded="${ui.syncConnectionExpanded ? "true" : "false"}">
        <span>Stan połączenia</span>
        <strong>${failed.length ? "Wymaga uwagi" : "Lokalny cache gotowy"}</strong>
        <small>${queued.length} operacji w kolejce</small>
      </button>
      <section class="sync-dashboard-card">
        <span>Dane sędziów</span>
        <strong>${judges.length}</strong>
        <small>${users.length} użytkowników w lokalnym modelu</small>
      </section>
      <section class="sync-dashboard-card">
        <span>Dane zespołów</span>
        <strong>${teams.length}</strong>
        <small>aktywnych zespołów w lokalnym cache</small>
      </section>
    </div>
    ${ui.syncConnectionExpanded ? `
      <section class="sync-details-panel">
        <h3>Połączone tablety: ${devices.length}</h3>
        ${devices.length ? `<ul>${devices.map(device => `<li>${escapeHtml(device)}</li>`).join("")}</ul>` : `<p class="muted">Brak danych o połączonych urządzeniach.</p>`}
      </section>
    ` : ""}
    <section class="sync-history-panel">
      <h3>Historia synchronizacji</h3>
      <div class="table-shell">
        <table class="users-table">
          <thead><tr><th>Status</th><th>Typ</th><th>Encja</th><th>Wersja</th><th>Próby</th><th>Operacja</th></tr></thead>
          <tbody>
            ${operations.length ? operations.map(operation => `
              <tr>
                <td><span class="badge ${operation.status === SyncStatus.SENT ? "ok" : "warn"}">${escapeHtml(operation.status)}</span></td>
                <td>${escapeHtml(operation.type)}</td>
                <td>${escapeHtml(operation.entity)}<br><small>${escapeHtml(operation.entity_id || operation.entityId || "")}</small></td>
                <td>${operation.entity_version ?? operation.entityVersion ?? ""}</td>
                <td>${operation.retry_count ?? operation.retryCount ?? 0}/${operation.max_retries ?? operation.maxRetries ?? 0}</td>
                <td><small>${escapeHtml(operation.client_operation_id || operation.clientOperationId || operation.id || "")}</small></td>
              </tr>
            `).join("") : `<tr><td colspan="6">Brak wpisów historii synchronizacji.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  renderSyncStatus();
}

function handleSyncDashboardClick(event) {
  const button = event.target.closest("[data-sync-action]");
  if (!button) return;
  if (button.dataset.syncAction === "toggle-connection") {
    ui.syncConnectionExpanded = !ui.syncConnectionExpanded;
    renderSyncDashboard();
  }
}

function resetSyncHome() {
  ui.syncConnectionExpanded = false;
}

function getKnownDevices(operations = []) {
  const devices = new Set();
  if (ui.state?.device?.deviceId) devices.add(ui.state.device.deviceId);
  for (const assignment of ui.state?.deviceAssignments || []) {
    if (!assignment.deletedAt && assignment.deviceId) devices.add(assignment.deviceId);
  }
  for (const operation of operations) {
    const deviceId = operation.device_id || operation.deviceId;
    if (deviceId) devices.add(deviceId);
  }
  return [...devices].sort((a, b) => a.localeCompare(b, "pl", { numeric: true }));
}

function renderSyncStatus() {
  const syncPill = $("#syncPill");
  if (!syncPill) return;
  const operations = ui.state?.syncOperations || [];
  const failed = operations.filter(item => item.status === SyncStatus.FAILED || item.status === SyncStatus.CONFLICT).length;
  const queued = operations.filter(item => item.status !== SyncStatus.SENT).length;
  if (failed) syncPill.textContent = `Błąd sync: ${failed}`;
  else if (queued) syncPill.textContent = `W kolejce: ${queued}`;
  else syncPill.textContent = "Cache lokalny";
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
  const scoringLocked = !timer.startedAt;
  document.querySelectorAll("#scoreCard input[data-field-id]").forEach(input => {
    input.disabled = scoringLocked;
    input.closest(".row")?.classList.toggle("scoring-locked", scoringLocked);
  });
}

function renderCardValidationMessage() {
  const message = $("#cardValidationMessage");
  if (!message) return;
  message.hidden = ui.invalidFieldIds.size === 0;
}

function focusFirstInvalidField(fieldId) {
  if (!fieldId) return;
  const firstInvalidInput = document.querySelector(`[data-score-field="${cssEscape(fieldId)}"] input`);
  firstInvalidInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  firstInvalidInput?.focus({ preventScroll: true });
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
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
  return ui.authSession?.id || ui.state.currentUser?.id || null;
}

function isAssignmentFilled({ teamId, competitionId, competitionPartId, cardTemplateId }) {
  return (ui.state.scoreSheets || []).some(scoreSheet => {
    if (scoreSheet.deletedAt) return false;
    if (scoreSheet.teamId !== teamId) return false;
    if (scoreSheet.competitionId !== competitionId) return false;
    if (scoreSheet.competitionPartId !== competitionPartId) return false;
    if (scoreSheet.cardTemplateId !== cardTemplateId) return false;
    return Boolean(
      scoreSheet.approvedAt ||
      scoreSheet.finalScore != null ||
      Object.keys(scoreSheet.values || {}).length ||
      Object.keys(scoreSheet.timeCaptures || {}).length
    );
  });
}

function isVisibleForJudge(competition, part, template) {
  if (hasSessionRole("admin")) return true;
  const assigned = ui.judgeAssignment;
  if (!assigned) return true;
  return (!assigned.competitionId || assigned.competitionId === competition.id)
    && (!assigned.competitionPartId || assigned.competitionPartId === part.id)
    && (!assigned.cardTemplateId || assigned.cardTemplateId === template.id);
}

function getTaskInfo(assignment) {
  const assigned = ui.appMode === "judge" && !hasSessionRole("admin") ? ui.judgeAssignment : null;
  const number = assigned?.taskNumber || assignment?.part?.code || assignment?.competition?.code || "";
  const name = assigned?.taskName || assignment?.competition?.name || assignment?.template?.name || "--";
  return {
    label: number ? `Zadanie ${number}` : "Zadanie",
    name
  };
}

function formatTeamName(team) {
  if (!team) return "--";
  return team.number ? `${team.number} - ${team.name}` : team.name;
}

function formatRankingTeamName(row) {
  return row.teamNumber ? `${row.teamNumber} - ${row.teamName}` : row.teamName;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatPercentage(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function getEventConfig() {
  return {
    eventName: ui.state?.eventConfig?.eventName || "MISTRZOSTWA POLSKI W KPP",
    location: ui.state?.eventConfig?.location || "Barczewo",
    dateFrom: ui.state?.eventConfig?.dateFrom || "2026-06-19",
    dateTo: ui.state?.eventConfig?.dateTo || "2026-06-22",
    logo: ui.state?.eventConfig?.logo || "assets/images/logo.jpg"
  };
}

function formatEventMeta(eventConfig) {
  return `${eventConfig.location} | ${formatEventDateRange(eventConfig.dateFrom, eventConfig.dateTo)}`;
}

function formatEventDateRange(dateFrom, dateTo) {
  const from = formatEventDatePart(dateFrom);
  const to = formatEventDatePart(dateTo);
  if (!from && !to) return "";
  if (!to || from === to) return from;
  if (!from) return to;
  const [fromDay, fromMonth, fromYear] = from.split(".");
  const [toDay, toMonth, toYear] = to.split(".");
  if (fromMonth === toMonth && fromYear === toYear) return `${fromDay}–${toDay}.${toMonth}.${toYear}`;
  return `${from}–${to}`;
}

function formatEventDatePart(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : String(value);
}

function normalizeAppMode(value) {
  const normalized = normalizeRole(value);
  if (normalized === "admin") return "admin";
  if (normalized === "office") return "office";
  return "judge";
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
