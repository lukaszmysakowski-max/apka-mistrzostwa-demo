import { buildCompetitionResults, buildGeneralRanking } from "../models/rankingModel.js";

export class RankingService {
  constructor(repository) {
    this.repository = repository;
  }

  async getGeneralRanking() {
    const state = await this.repository.getState();
    return buildGeneralRanking({
      competitions: state.competitions,
      teams: state.teams,
      scoreSheets: state.scoreSheets,
      cardTemplates: state.cardTemplates
    });
  }

  async getCompetitionResults() {
    const state = await this.repository.getState();
    return buildCompetitionResults({
      competitions: state.competitions,
      teams: state.teams,
      scoreSheets: state.scoreSheets
    });
  }
}
