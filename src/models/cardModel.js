export function listCardItems(cardTemplate) {
  return cardTemplate.sections.flatMap(section =>
    section.items.map(item => ({ ...item, sectionId: section.id, sectionWeight: section.sectionWeight ?? 1 }))
  );
}

export function isVisible(definition, values) {
  const conditions = definition.visibilityConditions || [];
  return conditions.every(condition => {
    if (condition.operator === "equals") return values[condition.fieldId] === condition.value;
    if (condition.operator === "notEquals") return values[condition.fieldId] !== condition.value;
    if (condition.operator === "exists") return values[condition.fieldId] != null;
    return true;
  });
}

export function calculateScore(cardTemplate, values) {
  let total = 0;
  const sectionTotals = {};

  for (const section of cardTemplate.sections) {
    if (!isVisible(section, values)) continue;
    const sectionWeight = section.sectionWeight ?? 1;
    let sectionTotal = 0;

    for (const item of section.items) {
      if (!isVisible(item, values)) continue;
      if (item.captureTime?.scoreTiming === "deferredRanking") continue;
      if (item.type === "yes_no" && values[item.id] === "yes") {
        sectionTotal += Number(item.points || 0);
      }
    }

    sectionTotals[section.id] = sectionTotal * sectionWeight;
    total += sectionTotals[section.id];
  }

  return { total, sectionTotals, maxPoints: cardTemplate.maxPoints };
}

export function validateCard(cardTemplate, values) {
  const errors = [];

  for (const section of cardTemplate.sections) {
    if (!isVisible(section, values)) continue;
    for (const item of section.items) {
      if (!isVisible(item, values)) continue;
      const required = item.required
        || (cardTemplate.requireAllPointFields && item.type === "yes_no")
        || (item.validationRules || []).some(rule => rule.type === "required");
      if (required && (values[item.id] == null || values[item.id] === "")) {
        errors.push({ fieldId: item.id, message: item.validationRules?.find(rule => rule.type === "required")?.message || "Pole wymagane." });
      }
    }
  }

  const score = calculateScore(cardTemplate, values);
  for (const rule of cardTemplate.validationRules || []) {
    if (rule.type === "maxScore" && score.total > rule.value) {
      errors.push({ fieldId: null, message: rule.message || "Przekroczono maksymalną liczbę punktów." });
    }
  }

  return errors;
}

export function createApprovedSnapshot({ cardTemplate, scoreSheet, finalScore, approvedAt, approvedBy }) {
  return {
    finalScore,
    finalCardJson: clone(cardTemplate),
    approvedAt,
    approvedBy,
    values: { ...scoreSheet.values },
    comments: { ...(scoreSheet.comments || {}) },
    timeCaptures: { ...(scoreSheet.timeCaptures || {}) },
    cardTemplateId: cardTemplate.id,
    cardTemplateVersion: cardTemplate.version
  };
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
