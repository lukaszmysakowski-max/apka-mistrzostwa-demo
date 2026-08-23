import { LocalStore } from "./localStore.js";

export class DomainRepository {
  constructor(store = new LocalStore()) {
    this.store = store;
  }

  async getState() {
    return this.store.load();
  }

  async bootstrap(config) {
    return this.store.replaceFromBootstrap(config);
  }

  async listTeams() {
    return (await this.store.load()).teams.filter(item => !item.deletedAt);
  }

  async listCompetitions() {
    return (await this.store.load()).competitions.filter(item => !item.deletedAt);
  }

  async listCardTemplates() {
    return (await this.store.load()).cardTemplates.filter(item => !item.deletedAt);
  }

  async listUsers() {
    return (await this.store.load()).users.filter(item => !item.deletedAt);
  }

  async upsertUser(user) {
    const state = await this.store.load();
    state.users = upsertById(state.users, user);
    await this.store.save(state);
    return user;
  }

  async upsertTeam(team) {
    const state = await this.store.load();
    state.teams = upsertById(state.teams, team);
    await this.store.save(state);
    return team;
  }

  async upsertCompetition(competition) {
    const state = await this.store.load();
    state.competitions = upsertById(state.competitions, competition);
    await this.store.save(state);
    return competition;
  }

  async upsertDeviceAssignment(assignment) {
    const state = await this.store.load();
    state.deviceAssignments = upsertById(state.deviceAssignments, assignment);
    await this.store.save(state);
    return assignment;
  }

  async updateEventConfig(eventConfig) {
    const state = await this.store.load();
    state.eventConfig = { ...(state.eventConfig || {}), ...eventConfig };
    await this.store.save(state);
    return state.eventConfig;
  }

  async listScoreSheets() {
    return (await this.store.load()).scoreSheets.filter(item => !item.deletedAt);
  }

  async getScoreSheet(id) {
    return (await this.store.load()).scoreSheets.find(item => item.id === id && !item.deletedAt) || null;
  }

  async upsertScoreSheet(scoreSheet) {
    const state = await this.store.load();
    state.scoreSheets = upsertById(state.scoreSheets, scoreSheet);
    await this.store.save(state);
    return scoreSheet;
  }

  async appendAudit(entry) {
    const state = await this.store.load();
    state.auditLog = [entry, ...state.auditLog];
    await this.store.save(state);
    return entry;
  }

  async listAudit() {
    return (await this.store.load()).auditLog;
  }

  async enqueueOperation(operation) {
    const state = await this.store.load();
    state.syncOperations = upsertById(state.syncOperations, operation);
    await this.store.save(state);
    return operation;
  }

  async updateOperation(operation) {
    const state = await this.store.load();
    state.syncOperations = upsertById(state.syncOperations, operation);
    await this.store.save(state);
    return operation;
  }

  async listSyncOperations() {
    return (await this.store.load()).syncOperations;
  }

  async listMessages() {
    return ((await this.store.load()).messages || []).filter(item => !item.deletedAt);
  }

  async upsertMessage(message) {
    const state = await this.store.load();
    state.messages = upsertById(state.messages || [], message);
    await this.store.save(state);
    return message;
  }

  async listAppeals() {
    return (await this.store.load()).appeals.filter(item => !item.deletedAt);
  }
}

function upsertById(items, nextItem) {
  const index = items.findIndex(item => item.id === nextItem.id);
  if (index === -1) return [...items, nextItem];
  return items.map(item => item.id === nextItem.id ? nextItem : item);
}
