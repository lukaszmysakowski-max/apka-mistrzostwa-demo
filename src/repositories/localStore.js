const STORAGE_KEY = "omrm-mvp-local-cache-v1";

const emptyStore = {
  meta: { schemaVersion: 1 },
  eventConfig: null,
  device: null,
  currentUser: null,
  events: [],
  teams: [],
  users: [],
  roles: [],
  permissions: [],
  competitions: [],
  cardTemplates: [],
  deviceAssignments: [],
  scoreSheets: [],
  auditLog: [],
  syncOperations: [],
  messages: [],
  appeals: []
};

export class LocalStore {
  async load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(emptyStore);
    return { ...clone(emptyStore), ...JSON.parse(saved) };
  }

  async save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  async replaceFromBootstrap(bootstrap) {
    const existing = await this.load();
    const bootstrapSignature = createBootstrapSignature(bootstrap);
    const cleanDemoStart = Boolean(bootstrap.demoMode?.enabled && bootstrap.demoMode?.cleanStart);
    const current = existing.meta?.demoMode === Boolean(bootstrap.demoMode?.enabled)
      && existing.meta?.bootstrapSignature === bootstrapSignature
      ? existing
      : clone(emptyStore);
    const next = {
      ...current,
      meta: { ...current.meta, schemaVersion: 1, demoMode: Boolean(bootstrap.demoMode?.enabled), bootstrapSignature },
      eventConfig: cleanDemoStart ? clone(bootstrap.eventConfig || null) : { ...(bootstrap.eventConfig || {}), ...(current.eventConfig || {}) },
      device: bootstrap.device,
      currentUser: bootstrap.currentUser,
      events: cleanDemoStart ? clone(bootstrap.events || []) : mergeById(current.events, bootstrap.events || []),
      teams: cleanDemoStart ? clone(bootstrap.teams || []) : mergeById(current.teams, bootstrap.teams || []),
      users: cleanDemoStart ? clone(bootstrap.users || []) : mergeUsers(current.users, bootstrap.users || []),
      roles: cleanDemoStart ? clone(bootstrap.roles || []) : mergeById(current.roles, bootstrap.roles || []),
      permissions: cleanDemoStart ? clone(bootstrap.permissions || []) : mergeById(current.permissions, bootstrap.permissions || []),
      competitions: cleanDemoStart ? clone(bootstrap.competitions || []) : mergeById(current.competitions, bootstrap.competitions || []),
      cardTemplates: cleanDemoStart ? clone(bootstrap.cardTemplates || []) : mergeById(current.cardTemplates, bootstrap.cardTemplates || []),
      deviceAssignments: cleanDemoStart ? clone(bootstrap.deviceAssignments || []) : mergeById(current.deviceAssignments, bootstrap.deviceAssignments || []),
      scoreSheets: cleanDemoStart ? clone(bootstrap.scoreSheets || []) : mergeById(current.scoreSheets, bootstrap.scoreSheets || []),
      auditLog: cleanDemoStart ? clone(bootstrap.auditLog || []) : mergeById(current.auditLog, bootstrap.auditLog || []),
      syncOperations: cleanDemoStart ? clone(bootstrap.syncOperations || []) : mergeById(current.syncOperations, bootstrap.syncOperations || []),
      messages: cleanDemoStart ? clone(bootstrap.messages || []) : mergeById(current.messages, bootstrap.messages || []),
      appeals: cleanDemoStart ? clone(bootstrap.appeals || []) : mergeById(current.appeals, bootstrap.appeals || [])
    };
    await this.save(next);
    return next;
  }
}

function mergeById(existing, incoming) {
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()];
}

function mergeUsers(existing, incoming) {
  const map = new Map();
  const incomingNameKeys = new Set((incoming || []).map(getUserNameKey).filter(Boolean));
  for (const user of existing || []) {
    const key = getUserMergeKey(user, incomingNameKeys);
    if (key) map.set(key, user);
  }
  for (const user of incoming || []) {
    const key = getUserMergeKey(user, incomingNameKeys);
    if (key) {
      const previous = map.get(key);
      map.set(key, { ...previous, ...user, id: user.id || previous?.id });
    }
  }
  return [...map.values()];
}

function getUserMergeKey(user, incomingNameKeys = new Set()) {
  const nameKey = getUserNameKey(user);
  if (nameKey && incomingNameKeys.has(nameKey)) return `name:${nameKey}`;
  return user?.login ? `login:${String(user.login).trim().toLowerCase()}` : user?.id ? `id:${user.id}` : "";
}

function getUserNameKey(user) {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = firstName || lastName
    ? `${firstName} ${lastName}`
    : String(user?.displayName || "").trim();
  return fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createBootstrapSignature(bootstrap) {
  return JSON.stringify({
    schemaVersion: bootstrap.schemaVersion || 1,
    demoMode: Boolean(bootstrap.demoMode?.enabled),
    eventConfig: bootstrap.eventConfig || null,
    teams: (bootstrap.teams || []).map(item => `${item.id}:${item.name}:${item.number || ""}`),
    users: (bootstrap.users || []).map(item => `${item.id}:${item.login}:${item.roles?.join(",") || ""}:${item.status || ""}`),
    competitions: (bootstrap.competitions || []).map(item => ({
      id: item.id,
      competitionNumber: item.competitionNumber || item.number || "",
      name: item.name || "",
      minJudges: item.minJudges || "",
      equipmentChecklist: item.equipmentChecklist || []
    })),
    cardTemplates: (bootstrap.cardTemplates || []).map(item => `${item.id}:${item.version || ""}`),
    deviceAssignments: (bootstrap.deviceAssignments || []).map(item => `${item.id}:${item.judgeUserId || ""}:${item.competitionId || ""}:${item.deletedAt || ""}`)
  });
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
