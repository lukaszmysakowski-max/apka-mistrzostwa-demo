export function createId(prefix = "id") {
  const random = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}
