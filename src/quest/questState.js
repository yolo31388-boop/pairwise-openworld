
class QuestState {
  constructor() { this.state = 'not_accepted'; this.progress = {}; }
  // BUG: 没有状态机验证
  setState(state) { this.state = state; }
  canTransition(to) { return true; }
}

module.exports = { QuestState };
