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

export function buildGeneralRanking({ competitions, teams, scoreSheets }) {
  const competitionResults = buildCompetitionResults({ competitions, teams, scoreSheets });
  const rows = teams.filter(t => !t.deletedAt).map(team => {
    const competitionScores = competitionResults.map(result => {
      const row = result.rows.find(item => item.teamId === team.id);
      return { competitionId: result.competitionId, competitionName: result.competitionName, score: row?.total ?? null };
    });
    const completeScores = competitionScores.filter(item => item.score != null);
    return {
      teamId: team.id,
      teamNumber: team.number,
      teamName: team.name,
      competitionScores,
      total: completeScores.reduce((sum, item) => sum + item.score, 0),
      completedCompetitions: completeScores.length
    };
  });

  return rows
    .filter(row => row.completedCompetitions > 0)
    .sort((a, b) => b.total - a.total);
}
