
class DialogueSystem {
  constructor() { this.npcs = {}; }
  addNPC(id, npc) { this.npcs[id] = npc; }
  talk(npcId, player) {
    // BUG: 不根据任务进度显示不同对话
    return this.npcs[npcId].dialogue;
  }
}

module.exports = { DialogueSystem };
