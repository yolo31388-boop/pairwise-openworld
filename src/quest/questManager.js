const { QuestState } = require('./questState.js');

class QuestManager {
  constructor(player, dialogueSystem = null) {
    this.player = player;
    this.quests = {};
    this.log = [];
    this.dialogueSystem = dialogueSystem;
  }

  setDialogueSystem(dialogueSystem) {
    this.dialogueSystem = dialogueSystem;
  }

  checkRequirements(quest) {
    const req = quest.requirements || {};
    if (req.level != null && (this.player.level || 0) < req.level) return false;
    if (Array.isArray(req.items)) {
      const owned = this.player.items || [];
      if (req.items.some((item) => !owned.includes(item))) return false;
    }
    if (Array.isArray(req.quests)) {
      const done = req.quests.every(
        (qid) => this.quests[qid] && this.quests[qid].state.state === 'completed'
      );
      if (!done) return false;
    }
    return true;
  }

  acceptQuest(questId, quest) {
    const existing = this.quests[questId];
    if (existing && existing.state.state !== 'abandoned') return false;
    // 触发条件必须先验证，不满足时原子失败：不产生任何副作用
    if (!this.checkRequirements(quest)) return false;
    const state = existing ? existing.state : new QuestState();
    if (!state.setState('in_progress')) return false;
    const progress = {};
    for (const obj of quest.objectives || []) {
      progress[obj.id] = obj.current || 0;
    }
    this.quests[questId] = { ...quest, state, progress };
    if (quest.itemToGive) {
      if (!Array.isArray(this.player.items)) this.player.items = [];
      this.player.items.push(quest.itemToGive);
    }
    this.log.push({ type: 'accept', questId });
    return true;
  }

  isObjectiveComplete(quest, objective) {
    return (quest.progress[objective.id] || 0) >= objective.target;
  }

  isQuestReadyToComplete(quest) {
    return (quest.objectives || []).every((obj) => this.isObjectiveComplete(quest, obj));
  }

  updateProgress(questId, objectiveId, amount = 1) {
    const quest = this.quests[questId];
    if (!quest || quest.state.state !== 'in_progress') return false;
    if (!(objectiveId in quest.progress)) return false;
    const objective = (quest.objectives || []).find((o) => o.id === objectiveId);
    const cap = objective ? objective.target : Infinity;
    quest.progress[objectiveId] = Math.min(cap, quest.progress[objectiveId] + amount);
    return true;
  }

  talkToNPC(npcId) {
    for (const [questId, quest] of Object.entries(this.quests)) {
      if (quest.state.state !== 'in_progress') continue;
      for (const obj of quest.objectives || []) {
        if (obj.npcId === npcId && !this.isObjectiveComplete(quest, obj)) {
          this.updateProgress(questId, obj.id, 1);
        }
      }
    }
    if (this.dialogueSystem) return this.dialogueSystem.getDialogue(npcId);
    return null;
  }

  completeQuest(questId) {
    const quest = this.quests[questId];
    if (!quest || quest.state.state !== 'in_progress') return false;
    if (!this.isQuestReadyToComplete(quest)) return false;
    if (!quest.state.setState('completed')) return false;
    const rewards = quest.rewards || {};
    if (rewards.gold) this.player.gold = (this.player.gold || 0) + rewards.gold;
    if (rewards.exp) this.player.exp = (this.player.exp || 0) + rewards.exp;
    if (Array.isArray(rewards.items)) {
      if (!Array.isArray(this.player.items)) this.player.items = [];
      this.player.items.push(...rewards.items);
    }
    // 任务物品：完成时按配置保留或消耗
    if (quest.itemToGive && quest.consumeItemOnComplete && Array.isArray(this.player.items)) {
      const idx = this.player.items.indexOf(quest.itemToGive);
      if (idx >= 0) this.player.items.splice(idx, 1);
    }
    if (this.dialogueSystem) this.dialogueSystem.markQuestCompleted(questId);
    this.log.push({ type: 'complete', questId });
    return true;
  }

  abandonQuest(questId) {
    const quest = this.quests[questId];
    if (!quest || quest.state.state !== 'in_progress') return false;
    if (!quest.state.setState('abandoned')) return false;
    // 收回任务物品
    if (Array.isArray(this.player.items)) {
      for (const item of [quest.itemToGive, quest.itemToRemove].filter(Boolean)) {
        const idx = this.player.items.indexOf(item);
        if (idx >= 0) this.player.items.splice(idx, 1);
      }
    }
    // 重置进度标记
    for (const key of Object.keys(quest.progress)) quest.progress[key] = 0;
    // 清理关联 NPC 状态
    if (this.dialogueSystem) this.dialogueSystem.clearQuestState(questId);
    this.log.push({ type: 'abandon', questId });
    return true;
  }

  getQuestLog() {
    // 实时反映每个任务的当前状态，不残留过期标记
    return Object.entries(this.quests).map(([questId, quest]) => ({
      questId,
      state: quest.state.state,
      progress: { ...quest.progress },
    }));
  }
}

module.exports = { QuestManager };
