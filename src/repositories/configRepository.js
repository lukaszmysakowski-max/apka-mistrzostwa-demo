export class ConfigRepository {
  constructor(baseUrl = "./data") {
    this.baseUrl = baseUrl;
  }

  async loadBootstrap() {
    const config = await this.getJson(`${this.baseUrl}/app-config.json`);
    const demo = config.demoMode?.enabled && config.demoMode?.source
      ? await this.getJson(`${this.baseUrl}/${config.demoMode.source}`)
      : {};
    const merged = mergeConfig(config, demo);
    const templateFiles = unique([...(config.cardTemplates || []), ...(demo.cardTemplates || [])]);
    const templates = await Promise.all(templateFiles.map(file => this.getJson(`${this.baseUrl}/${file}`)));
    return { ...merged, cardTemplates: templates };
  }

  async getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Nie można pobrać konfiguracji: ${url}`);
    return response.json();
  }
}

function mergeConfig(base, extra) {
  return {
    ...base,
    ...extra,
    demoMode: base.demoMode || { enabled: false },
    events: mergeById(base.events || [], extra.events || []),
    teams: mergeById(base.teams || [], extra.teams || []),
    users: mergeById(base.users || [], extra.users || []),
    roles: mergeById(base.roles || [], extra.roles || []),
    permissions: mergeById(base.permissions || [], extra.permissions || []),
    competitions: mergeById(base.competitions || [], extra.competitions || []),
    deviceAssignments: mergeById(base.deviceAssignments || [], extra.deviceAssignments || []),
    scoreSheets: mergeById(base.scoreSheets || [], extra.scoreSheets || []),
    auditLog: mergeById(base.auditLog || [], extra.auditLog || []),
    syncOperations: mergeById(base.syncOperations || [], extra.syncOperations || []),
    appeals: mergeById(base.appeals || [], extra.appeals || [])
  };
}

function mergeById(baseItems, extraItems) {
  const map = new Map(baseItems.map(item => [item.id, item]));
  for (const item of extraItems) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()];
}

function unique(values) {
  return [...new Set(values)];
}
