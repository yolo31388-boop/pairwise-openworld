const TRANSITIONS = {
  not_accepted: ['in_progress'],
  in_progress: ['completed', 'abandoned'],
  completed: [],
  abandoned: ['in_progress'],
};

class QuestState {
  constructor() {
    this.state = 'not_accepted';
    this.progress = {};
  }

  canTransition(to) {
    return (TRANSITIONS[this.state] || []).includes(to);
  }

  setState(to) {
    if (!this.canTransition(to)) return false;
    this.state = to;
    return true;
  }
}

module.exports = { QuestState, TRANSITIONS };
