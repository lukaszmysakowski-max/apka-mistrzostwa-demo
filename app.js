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
  $("#logoutBtn").addEventListener("click", logout);
  $("#addUserBtn").addEventListener("click", openAddUserForm);
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
  $("#loginFormMode").textContent = ui.selectedLoginMode === "admin"
    ? "Logowanie administratora"
    : "Logowanie sędziego";
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
    candidate.roles.includes(ui.selectedLoginMode)
  );

  if (!account) {
    $("#loginError").hidden = false;
    return;
  }

  ui.authSession = {
    id: account.id,
    login: account.login,
    displayName: account.displayName || account.login,
    mode: ui.selectedLoginMode
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(ui.authSession));
  $("#loginError").hidden = true;
  $("#passwordInput").value = "";
  applyAuthenticatedSession();
  await renderAll();
  await restoreVisibleAssessment();
  showView(ui.appMode === "admin" ? "users-screen" : "team-screen");
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
  $("#modePill").textContent = `${ui.appMode === "admin" ? "ADMIN" : "SĘDZIA"} · ${ui.authSession?.displayName || ""}`;
  applyAppMode();
}

function applyLoggedOutState() {
  ui.authSession = null;
  document.body.classList.add("logged-out");
  document.body.classList.remove("authenticated");
  $("#modePill").textContent = "Tryb";
  showLoginModeChoice();
}

function logout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  ui.authSession = null;
  ui.currentScoreSheetId = null;
  saveUiState();
  competitionTimerService.reset();
  applyLoggedOutState();
  showView("team-screen");
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
  $("#deviceLabel").textContent = ui.state.device?.label || "Tablet";
  applyAppMode();
  renderTeamList();
  renderUsers();
  renderSyncStatus();
  await renderRanking();
  await renderAudit();
  await renderSyncQueue();
}

function showView(id) {
  if (!canShowView(id)) id = "team-screen";
  document.querySelectorAll(".view, .tab").forEach(el => el.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-view="${id}"]`)?.classList.add("active");
  window.scrollTo(0, 0);
}

async function navigateToView(id) {
  const leavingActiveCard = document.getElementById("card-screen")?.classList.contains("active")
    && id !== "card-screen"
    && id !== "finish-screen"
    && ui.currentScoreSheetId;
  if (leavingActiveCard && !(await validateActiveCardBeforeClose())) return;
  showView(id);
}

function applyAppMode() {
  document.body.dataset.appMode = ui.appMode;
  const adminOnlyViews = ["users-screen", "ranking-screen", "audit-screen", "sync-screen", "sync-error-screen"];
  for (const viewId of adminOnlyViews) {
    const view = document.getElementById(viewId);
    if (view) view.hidden = ui.appMode !== "admin";
  }
  document.querySelectorAll("[data-view]").forEach(button => {
    const viewId = button.dataset.view;
    const adminOnly = adminOnlyViews.includes(viewId);
    button.hidden = ui.appMode !== "admin" && adminOnly;
  });
  const nav = document.querySelector(".topbar nav");
  if (nav) nav.hidden = ui.appMode !== "admin";
  const syncPill = $("#syncPill");
  if (syncPill) syncPill.hidden = ui.appMode !== "admin";
  if (ui.appMode !== "admin" && adminOnlyViews.includes(document.querySelector(".view.active")?.id)) {
    showView("team-screen");
  }
}

function canShowView(id) {
  if (ui.appMode === "admin") return true;
  return !["users-screen", "ranking-screen", "audit-screen", "sync-screen", "sync-error-screen"].includes(id);
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
          <input type="checkbox" class="user-select" data-user-id="${escapeHtml(user.id)}" aria-label="Zaznacz użytkownika ${escapeHtml(getUserFullName(user))}" ${ui.selectedUserIds.has(user.id) ? "checked" : ""}>
        </td>
        <td><strong>${escapeHtml(getUserFullName(user))}</strong></td>
        <td>${escapeHtml(user.login)}</td>
        <td>${formatUserRoles(user.roles)}</td>
        <td>${escapeHtml(formatAssignments(user))}</td>
        <td><span class="badge ${user.status === "active" ? "ok" : "warn"}">${user.status === "active" ? "Aktywny" : "Nieaktywny"}</span></td>
        <td>
          <div class="table-actions">
            <button type="button" class="secondary compact-button" data-user-action="edit" data-user-id="${escapeHtml(user.id)}">Edytuj</button>
            <button type="button" class="secondary compact-button" data-user-action="password" data-user-id="${escapeHtml(user.id)}">Zmień hasło</button>
            <button type="button" class="secondary compact-button danger-button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}">Usuń</button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Brak użytkowników.</td></tr>`;
  renderUserCards(users);
  renderBulkActions(users);
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
        <input type="checkbox" class="select-all-users" ${areAllVisibleUsersSelected(users) ? "checked" : ""}>
        Zaznacz wszystkich
      </label>
      ${users.map(user => `
        <article class="user-card" data-user-id="${escapeHtml(user.id)}">
        <label class="user-card-select">
          <input type="checkbox" class="user-select" data-user-id="${escapeHtml(user.id)}" aria-label="Zaznacz użytkownika ${escapeHtml(getUserFullName(user))}" ${ui.selectedUserIds.has(user.id) ? "checked" : ""}>
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
          <button type="button" class="secondary compact-button" data-user-action="edit" data-user-id="${escapeHtml(user.id)}">Edytuj</button>
          <button type="button" class="secondary compact-button" data-user-action="password" data-user-id="${escapeHtml(user.id)}">Zmień hasło</button>
          <button type="button" class="secondary compact-button danger-button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}">Usuń</button>
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
  if (role === "admin" || role === "administrator") return "admin";
  if (role === "judge" || role === "sedzia" || role === "sędzia") return "judge";
  return null;
}

function getUserFullName(user) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.displayName || user.login || "--";
}

function formatUserRoles(roles = []) {
  const labels = [];
  if (roles.includes("judge")) labels.push("Sędzia");
  if (roles.includes("admin")) labels.push("Administrator");
  return labels.length ? labels.map(label => `<span class="role-chip">${label}</span>`).join(" ") : "—";
}

function formatAssignments(user) {
  if (!user.roles.includes("judge")) return "—";
  return "Brak";
}

function openAddUserForm() {
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
  $("#roleAdminInput").checked = false;
  document.querySelector("input[name='userStatus'][value='active']").checked = true;
  hideUserFormError();
  hideBulkMessage();
  closePasswordForm();
  $("#userFormPanel").hidden = false;
  $("#userFirstNameInput").focus();
}

function openEditUserForm(userId) {
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
  $("#roleJudgeInput").checked = user.roles.includes("judge");
  $("#roleAdminInput").checked = user.roles.includes("admin");
  document.querySelector(`input[name='userStatus'][value='${user.status}']`).checked = true;
  hideUserFormError();
  hideBulkMessage();
  closePasswordForm();
  $("#userFormPanel").hidden = false;
  $("#userFirstNameInput").focus();
}

function closeUserForm() {
  ui.editingUserId = null;
  $("#userFormPanel").hidden = true;
  hideUserFormError();
}

async function saveUserFromForm(event) {
  event.preventDefault();
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
  if (menuButton) {
    toggleBulkMenu(menuButton.dataset.bulkMenu);
    return;
  }
  const actionButton = event.target.closest("[data-bulk-action]");
  if (!actionButton) return;
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
  return user.status === "active" && user.roles.includes("admin") && !user.deletedAt;
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
  const user = getDisplayUsers().find(item => item.id === userId);
  if (!user) return;
  ui.passwordUserId = user.id;
  $("#passwordUserIdInput").value = user.id;
  $("#passwordFormTitle").textContent = `Zmień hasło: ${getUserFullName(user)}`;
  $("#newPasswordInput").value = "";
  hidePasswordFormError();
  closeUserForm();
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
    mode: user.roles.includes("admin") ? "admin" : "judge",
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
      <tr><td>${index + 1}</td><td>${escapeHtml(formatRankingTeamName(row))}</td><td>${row.completedCompetitions}</td><td><b>${row.total}</b></td></tr>
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
  if (ui.appMode === "admin") return true;
  const assigned = ui.judgeAssignment;
  if (!assigned) return true;
  return (!assigned.competitionId || assigned.competitionId === competition.id)
    && (!assigned.competitionPartId || assigned.competitionPartId === part.id)
    && (!assigned.cardTemplateId || assigned.cardTemplateId === template.id);
}

function getTaskInfo(assignment) {
  const assigned = ui.appMode === "judge" ? ui.judgeAssignment : null;
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

function normalizeAppMode(value) {
  return value === "admin" ? "admin" : "judge";
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
