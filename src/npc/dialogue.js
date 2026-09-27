class DialogueSystem {
  constructor(questManager = null) {
    this.npcs = {};
    this.questManager = questManager;
  }

  setQuestManager(questManager) {
    this.questManager = questManager;
  }

  addNPC(id, npc) {
    this.npcs[id] = { id, completedQuests: [], ...npc };
  }

  // 多任务共享 NPC 时，按任务上下文区分：优先进行中且涉及该 NPC 的任务
  getQuestContext(npcId) {
    if (!this.questManager) return null;
    const npc = this.npcs[npcId];
    let fallback = null;
    for (const [questId, quest] of Object.entries(this.questManager.quests)) {
      const involvesNPC =
        (quest.objectives || []).some((o) => o.npcId === npcId) ||
        quest.npcId === npcId ||
        (npc && (npc.quests || []).includes(questId));
      if (!involvesNPC) continue;
      if (quest.state.state === 'in_progress') return { questId, quest };
      if (!fallback) fallback = { questId, quest };
    }
    return fallback;
  }

  getDialogue(npcId) {
    const npc = this.npcs[npcId];
    if (!npc) return null;
    const ctx = this.getQuestContext(npcId);
    if (!ctx) return npc.dialogue != null ? npc.dialogue : null;
    const { questId, quest } = ctx;
    const qd = (npc.questDialogues || {})[questId] || {};
    switch (quest.state.state) {
      case 'completed':
        return qd.completed || npc.dialogueCompleted || npc.dialogue || null;
      case 'abandoned':
        return qd.abandoned || npc.dialogue || null;
      case 'in_progress':
        if (this.questManager.isQuestReadyToComplete(quest)) {
          return qd.readyToComplete || npc.dialogueReady || npc.dialogue || null;
        }
        return qd.inProgress || npc.dialogueInProgress || npc.dialogue || null;
      default:
        return qd.notAccepted || npc.dialogue || null;
    }
  }

  talk(npcId, player) {
    const npc = this.npcs[npcId];
    if (!npc) return null;
    if (this.questManager) this.questManager.talkToNPC(npcId);
    return this.getDialogue(npcId);
  }

  markQuestCompleted(questId) {
    const quest = this.questManager && this.questManager.quests[questId];
    for (const npc of Object.values(this.npcs)) {
      const involved =
        (npc.quests || []).includes(questId) || (quest && quest.npcId === npc.id);
      if (involved && !npc.completedQuests.includes(questId)) {
        npc.completedQuests.push(questId);
      }
    }
  }

  clearQuestState(questId) {
    for (const npc of Object.values(this.npcs)) {
      npc.completedQuests = (npc.completedQuests || []).filter((qid) => qid !== questId);
    }
  }
}

module.exports = { DialogueSystem };
