export function buildCompetitionResults({ competitions, teams, scoreSheets }) {
  const approvedSheets = scoreSheets.filter(sheet => sheet.approvedAt && !sheet.deletedAt);

  return competitions.filter(c => !c.deletedAt).map(competition => {
    const teamRows = teams.filter(t => !t.deletedAt).map(team => {
      const partScores = (competition.parts || []).map(part => {
        const sheet = approvedSheets.find(item =>
          item.teamId === team.id &&
          item.competitionId === competition.id &&
          item.competitionPartId === part.id
        );
        return {
          partId: part.id,
          code: part.code,
          score: sheet?.finalScore ?? null,
          weight: part.weight ?? 1
        };
      });

      const complete = partScores.every(part => part.score != null);
      const total = complete
        ? partScores.reduce((sum, part) => sum + part.score * part.weight, 0)
        : null;

      return { teamId: team.id, teamNumber: team.number, teamName: team.name, partScores, total, complete };
    });

    return {
      competitionId: competition.id,
      competitionName: competition.name,
      rows: teamRows.filter(row => row.complete).sort((a, b) => b.total - a.total)
    };
  });
}

export function buildGeneralRanking({ teams, scoreSheets, cardTemplates = [] }) {
  const templateById = new Map(cardTemplates.filter(template => !template.deletedAt).map(template => [template.id, template]));
  const approvedSheets = scoreSheets.filter(sheet =>
    sheet.status === "approved" &&
    sheet.approvedAt &&
    !sheet.deletedAt &&
    sheet.finalScore != null
  );

  const rows = teams.filter(team => !team.deletedAt).map(team => {
    const teamSheets = approvedSheets.filter(sheet => sheet.teamId === team.id);
    const total = teamSheets.reduce((sum, sheet) => sum + Number(sheet.finalScore || 0), 0);
    const maxPoints = teamSheets.reduce((sum, sheet) => sum + getScoreSheetMaxPoints(sheet, templateById), 0);
    return {
      teamId: team.id,
      teamNumber: team.number || "",
      teamName: team.name,
      total,
      maxPoints,
      percentage: maxPoints > 0 ? (total / maxPoints) * 100 : 0,
      approvedSheets: teamSheets.length
    };
  });

  const hasAnyResult = rows.some(row => row.approvedSheets > 0);
  if (!hasAnyResult) {
    return rows
      .map(row => ({ ...row, place: null }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName, "pl"));
  }

  let place = 0;
  return rows
    .sort((a, b) => {
      if (a.approvedSheets > 0 && b.approvedSheets === 0) return -1;
      if (a.approvedSheets === 0 && b.approvedSheets > 0) return 1;
      if (a.approvedSheets > 0 && b.approvedSheets > 0) return b.total - a.total || a.teamName.localeCompare(b.teamName, "pl");
      return a.teamName.localeCompare(b.teamName, "pl");
    })
    .map(row => ({
      ...row,
      place: row.approvedSheets > 0 ? ++place : null
    }));
}

function getScoreSheetMaxPoints(scoreSheet, templateById) {
  const snapshotMax = Number(scoreSheet.approvedSnapshot?.finalCardJson?.maxPoints ?? scoreSheet.finalCardJson?.maxPoints);
  if (Number.isFinite(snapshotMax) && snapshotMax > 0) return snapshotMax;
  const templateMax = Number(templateById.get(scoreSheet.cardTemplateId)?.maxPoints);
  return Number.isFinite(templateMax) && templateMax > 0 ? templateMax : 0;
}
