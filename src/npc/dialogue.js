'use strict';

const { STATES } = require('../quest/questState.js');

// 已创建的 QuestManager 注册表，用于仅有 NPC 入参的遗留调用方式。
const activeManagers = [];
function registerManager(manager) {
  const index = activeManagers.indexOf(manager);
  if (index !== -1) activeManagers.splice(index, 1);
  activeManagers.push(manager);
}
function unregisterManager(manager) {
  const index = activeManagers.indexOf(manager);
  if (index !== -1) activeManagers.splice(index, 1);
}

// 最近创建的 DialogueSystem，供仅有 NPC 入参的遗留调用方式定位。
let latestDialogueSystem = null;
function getDialogueSystem() {
  for (const manager of activeManagers) {
    if (manager.dialogueSystem) return manager.dialogueSystem;
  }
  return latestDialogueSystem;
}

class DialogueResult {
  constructor(npcId, text, questId, actions = []) {
    this.npcId = npcId;
    this.text = text;
    this.questId = questId || null;
    this.actions = actions;
  }
  toString() { return this.text; }
}

class DialogueSystem {
  constructor(questManager = null) {
    this.questManager = questManager;
    this.npcs = {};
    // npcQuestState[npcId][questId] = 'completed'
    this.npcQuestState = {};
    latestDialogueSystem = this;
  }

  addNPC(id, npc) {
    this.npcs[id] = npc;
    this.npcQuestState[id] = {};
  }

  _managerFor(questId) {
    if (this.questManager && this.questManager.quests[questId]) return this.questManager;
    // 多任务/多管理器隔离：取最近注册且确实持有该任务的管理器，避免命中残留的旧实例。
    for (let i = activeManagers.length - 1; i >= 0; i -= 1) {
      if (activeManagers[i].quests[questId]) return activeManagers[i];
    }
    return this.questManager;
  }

  _questIds(npc, npcId) {
    const ids = [];
    if (Array.isArray(npc.quests)) ids.push(...npc.quests);

    const touchesNpc = (record) =>
      record.npcId === npcId ||
      record.objectives.some((objective) => objective.npcId === npcId);

    const collectFrom = (manager) => {
      if (!manager) return;
      for (const [questId, record] of Object.entries(manager.quests)) {
        if (!ids.includes(questId) && touchesNpc(record)) ids.push(questId);
      }
    };

    // 与该 NPC 关联目标的任务（即使 NPC 未显式声明 quests）。
    for (const manager of activeManagers) collectFrom(manager);
    collectFrom(this.questManager);
    return ids;
  }

  _text(npc, questId, kind) {
    const map = npc.questDialogues && npc.questDialogues[questId];
    if (map && map[kind]) return map[kind];
    if (kind === 'completion') return '任务已完成';
    if (kind === 'turnin') return '你已经完成了我的要求，来交付任务吧';
    if (kind === 'progress') return '任务进行中';
    if (kind === 'available') return '我有个任务需要你帮忙';
    return npc.dialogue;
  }

  markQuestCompleted(npcId, questId) {
    if (!npcId) return;
    if (!this.npcQuestState[npcId]) this.npcQuestState[npcId] = {};
    this.npcQuestState[npcId][questId] = STATES.COMPLETED;
  }

  clearQuestState(npcId, questId) {
    if (!npcId || !this.npcQuestState[npcId]) return;
    delete this.npcQuestState[npcId][questId];
  }

  isQuestCompleted(npcId, questId) {
    return Boolean(this.npcQuestState[npcId] && this.npcQuestState[npcId][questId] === STATES.COMPLETED);
  }

  getNPCQuestState(npcId, questId) {
    return (this.npcQuestState[npcId] && this.npcQuestState[npcId][questId]) || null;
  }

  isQuestReady(npcId, questId) {
    const manager = this._managerFor(questId);
    const npc = this.npcs[npcId];
    const template = npc && npc.questTemplates && npc.questTemplates[questId];
    if (!manager || !template) return false;
    return manager.getQuestState(questId) === STATES.NOT_ACCEPTED && manager._meetsRequirements(template);
  }

  talk(npcId, player) {
    const npc = this.npcs[npcId];
    if (!npc) return new DialogueResult(npcId, '');

    const entries = this._questIds(npc, npcId).map((questId) => ({
      questId,
      manager: this._managerFor(questId),
    })).filter((entry) => entry.manager);

    // 选择本次对话的主任务：进行中优先（可推进 > 可交付），其次已完成，最后可接取。
    let primary = null;
    let primaryRank = -1;
    for (const entry of entries) {
      const { questId, manager } = entry;
      const state = manager.getQuestState(questId);
      let rank = 0;
      if (state === STATES.IN_PROGRESS) {
        rank = manager.allObjectivesDone(questId) ? 2 : 3;
      } else if (state === STATES.COMPLETED) {
        rank = 1;
      } else if (state === STATES.NOT_ACCEPTED && this.isQuestReady(npcId, questId)) {
        rank = 0;
      }
      if (rank > primaryRank) {
        primaryRank = rank;
        primary = entry;
      }
    }

    // 已完成的关联任务只更新 NPC 完成标记，不产生其他副作用。
    for (const entry of entries) {
      if (entry.manager.getQuestState(entry.questId) === STATES.COMPLETED) {
        this.markQuestCompleted(npcId, entry.questId);
      }
    }

    if (!primary) return new DialogueResult(npcId, npc.dialogue, null);
    const { questId, manager } = primary;
    const state = manager.getQuestState(questId);

    if (state === STATES.IN_PROGRESS) {
      if (manager.allObjectivesDone(questId)) {
        return new DialogueResult(
          npcId, this._text(npc, questId, 'turnin'), questId,
          [{ type: 'ready_to_turn_in' }]
        );
      }
      const record = manager.quests[questId];
      const objective = record.objectives.find(
        (candidate) =>
          (!candidate.npcId || candidate.npcId === npcId) &&
          (record.progress[candidate.id] || 0) < candidate.target
      );
      if (objective) manager.updateObjective(questId, objective.id, 1);
      return new DialogueResult(
        npcId, this._text(npc, questId, 'progress'), questId,
        objective ? [{ type: 'objective_advance', objectiveId: objective.id }] : []
      );
    }

    if (state === STATES.COMPLETED) {
      return new DialogueResult(
        npcId, this._text(npc, questId, 'completion'), questId,
        [{ type: 'quest_completed' }]
      );
    }

    return new DialogueResult(
      npcId, this._text(npc, questId, 'available'), questId,
      [{ type: 'quest_available' }]
    );
  }

  talkToNPC(npcId, player) {
    return this.talk(npcId, player);
  }
}

module.exports = {
  DialogueSystem,
  DialogueResult,
  registerManager,
  unregisterManager,
  getDialogueSystem,
};
