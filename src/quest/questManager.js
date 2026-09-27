

class QuestManager {
  constructor(player) { this.player = player; this.quests = {}; this.log = []; }
  acceptQuest(questId, quest) {
    // BUG: 不验证触发条件，不初始化进度
    this.quests[questId] = { ...quest, state: new QuestState() };
    this.quests[questId].state.setState('in_progress');
    this.log.push({type: 'accept', questId});
    return true;
  }
  completeQuest(questId) {
    // BUG: 不验证进度，直接完成
    this.quests[questId].state.setState('completed');
    this.log.push({type: 'complete', questId});
    return true;
  }
  abandonQuest(questId) {
    // BUG: 不清理NPC状态和物品
    this.quests[questId].state.setState('abandoned');
    this.log.push({type: 'abandon', questId});
  }
  getQuestLog() { return this.log; }
}

module.exports = { QuestManager };
