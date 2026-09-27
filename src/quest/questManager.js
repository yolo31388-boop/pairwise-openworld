'use strict';

const { QuestState, STATES } = require('./questState.js');
const { getDialogueSystem, registerManager } = require('../npc/dialogue.js');

function clone(object) {
  return JSON.parse(JSON.stringify(object));
}

class QuestManager {
  constructor(player = {}) {
    this.player = player;
    if (!Array.isArray(this.player.items)) this.player.items = [];
    this.quests = {};
    // log 为实时快照：只包含当前处于活动状态（in_progress / completed）的任务。
    this.log = [];
    this.events = [];
    this.dialogueSystem = null;
    registerManager(this);
  }

  setDialogueSystem(dialogueSystem) {
    this.dialogueSystem = dialogueSystem;
  }

  getDialogueSystem() {
    return this.dialogueSystem || getDialogueSystem();
  }

  _playerHasItem(itemId) {
    return this.player.items.includes(itemId);
  }

  _giveItem(itemId) {
    if (itemId && !this._playerHasItem(itemId)) this.player.items.push(itemId);
  }

  _removeItem(itemId) {
    if (!itemId) return;
    this.player.items = this.player.items.filter((item) => item !== itemId);
  }

  // 接取前原子验证：等级、物品、前置任务任一不满足即整体失败（不产生任何副作用）。
  _meetsRequirements(quest) {
    const requirements = quest.requirements || {};
    if (requirements.level && (this.player.level || 0) < requirements.level) return false;
    if (Array.isArray(requirements.items)) {
      for (const itemId of requirements.items) {
        if (!this._playerHasItem(itemId)) return false;
      }
    }
    if (Array.isArray(requirements.quests)) {
      for (const prerequisite of requirements.quests) {
        if (this.getQuestState(prerequisite) !== STATES.COMPLETED) return false;
      }
    }
    return true;
  }

  _initObjectives(quest) {
    const objectives = Array.isArray(quest.objectives) ? clone(quest.objectives) : [];
    const progress = {};
    for (const objective of objectives) {
      progress[objective.id] = Math.min(objective.current || 0, objective.target || 0);
      delete objective.current;
    }
    return { objectives, progress };
  }

  _refreshLogEntry(questRecord) {
    this.log = this.log.filter((entry) => entry.questId !== questRecord.id);
    if ([STATES.IN_PROGRESS, STATES.COMPLETED].includes(questRecord.state.get())) {
      this.log.push({
        questId: questRecord.id,
        state: questRecord.state.get(),
        progress: { ...questRecord.progress },
        objectives: clone(questRecord.objectives),
      });
    }
  }

  acceptQuest(questId, questTemplate) {
    const template = questTemplate || {};
    const existing = this.quests[questId];
    if (existing && existing.state.get() !== STATES.ABANDONED) return false;
    if (!this._meetsRequirements(template)) return false;

    const { objectives, progress } = this._initObjectives(template);
    const record = {
      ...clone(template),
      id: questId,
      objectives,
      progress,
      state: new QuestState(existing ? STATES.ABANDONED : STATES.NOT_ACCEPTED),
    };
    if (!record.state.transition(STATES.IN_PROGRESS)) return false;
    this.quests[questId] = record;

    // 接取时给予任务物品。
    this._giveItem(template.itemToGive);

    this._refreshLogEntry(record);
    this.events.push({ type: 'accept', questId });
    return true;
  }

  allObjectivesDone(questId) {
    const record = this.quests[questId];
    if (!record) return false;
    return record.objectives.every(
      (objective) => (record.progress[objective.id] || 0) >= objective.target
    );
  }

  // 通用目标推进（collect/kill/visit 等类型共用，按目标 id 独立计数）。
  updateObjective(questId, objectiveId, amount = 1) {
    const record = this.quests[questId];
    if (!record || record.state.get() !== STATES.IN_PROGRESS) return false;
    const objective = record.objectives.find((entry) => entry.id === objectiveId);
    if (!objective) return false;
    record.progress[objectiveId] = Math.min(
      objective.target,
      (record.progress[objectiveId] || 0) + amount
    );
    this._refreshLogEntry(record);
    return record.progress[objectiveId] >= objective.target;
  }

  completeQuest(questId) {
    const record = this.quests[questId];
    if (!record || record.state.get() !== STATES.IN_PROGRESS) return false;
    if (!this.allObjectivesDone(questId)) return false;

    // 状态机先行：只有合法转换才发放奖励（原子性）。
    if (!record.state.transition(STATES.COMPLETED)) return false;

    const rewards = record.rewards || {};
    if (typeof rewards.gold === 'number') this.player.gold = (this.player.gold || 0) + rewards.gold;
    if (typeof rewards.exp === 'number') this.player.exp = (this.player.exp || 0) + rewards.exp;
    if (Array.isArray(rewards.items)) rewards.items.forEach((itemId) => this._giveItem(itemId));
    if (Array.isArray(record.consumeItems)) {
      record.consumeItems.forEach((itemId) => this._removeItem(itemId));
    }

    // 完成时任务物品按配置保留（默认）或消耗。
    if (record.itemToGive && record.consumeOnComplete) this._removeItem(record.itemToGive);

    this.getDialogueSystem()?.markQuestCompleted?.(record.npcId, questId);
    this._refreshLogEntry(record);
    this.events.push({ type: 'complete', questId });
    return true;
  }

  abandonQuest(questId) {
    const record = this.quests[questId];
    if (!record || record.state.get() !== STATES.IN_PROGRESS) return false;
    if (!record.state.transition(STATES.ABANDONED)) return false;

    // 收回接取时给予的任务物品及配置要求移除的物品。
    this._removeItem(record.itemToGive);
    if (Array.isArray(record.removeItemsOnAbandon)) {
      record.removeItemsOnAbandon.forEach((itemId) => this._removeItem(itemId));
    }
    if (record.itemToRemove) this._removeItem(record.itemToRemove);

    // 清理关联 NPC 的对话/进度标记。
    const npcIds = new Set(
      [record.npcId].concat(record.objectives.map((objective) => objective.npcId)).filter(Boolean)
    );
    const dialogueSystem = this.getDialogueSystem();
    npcIds.forEach((npcId) => dialogueSystem?.clearQuestState?.(npcId, questId));

    // 实时日志移除该任务，不残留已完成标记。
    this.log = this.log.filter((entry) => entry.questId !== questId);
    this.events.push({ type: 'abandon', questId });
    return true;
  }

  getQuestLog() {
    return this.log;
  }

  getQuestState(questId) {
    return this.quests[questId] ? this.quests[questId].state.get() : STATES.NOT_ACCEPTED;
  }
}

module.exports = { QuestManager };
