const STORAGE_KEY = "omrm-mvp-local-cache-v1";

const emptyStore = {
  meta: { schemaVersion: 1 },
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
      device: bootstrap.device,
      currentUser: bootstrap.currentUser,
      events: mergeById(current.events, bootstrap.events || []),
      teams: mergeById(current.teams, bootstrap.teams || []),
      users: mergeById(current.users, bootstrap.users || []),
      roles: mergeById(current.roles, bootstrap.roles || []),
      permissions: mergeById(current.permissions, bootstrap.permissions || []),
      competitions: mergeById(current.competitions, bootstrap.competitions || []),
      cardTemplates: mergeById(current.cardTemplates, bootstrap.cardTemplates || []),
      deviceAssignments: mergeById(current.deviceAssignments, bootstrap.deviceAssignments || []),
      scoreSheets: cleanDemoStart ? [] : mergeById(current.scoreSheets, bootstrap.scoreSheets || []),
      auditLog: mergeById(current.auditLog, bootstrap.auditLog || []),
      syncOperations: mergeById(current.syncOperations, bootstrap.syncOperations || []),
      appeals: mergeById(current.appeals, bootstrap.appeals || [])
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

function createBootstrapSignature(bootstrap) {
  return JSON.stringify({
    schemaVersion: bootstrap.schemaVersion || 1,
    demoMode: Boolean(bootstrap.demoMode?.enabled),
    teams: (bootstrap.teams || []).map(item => `${item.id}:${item.name}:${item.number || ""}`),
    competitions: (bootstrap.competitions || []).map(item => item.id),
    cardTemplates: (bootstrap.cardTemplates || []).map(item => item.id)
  });
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
