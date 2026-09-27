'use strict';

const STATES = Object.freeze({
  NOT_ACCEPTED: 'not_accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
});

// 合法状态转换表：未接取 -> 进行中；进行中 -> 已完成 / 已放弃；已放弃 -> 进行中（重新接取）。
const LEGAL_TRANSITIONS = Object.freeze({
  [STATES.NOT_ACCEPTED]: [STATES.IN_PROGRESS],
  [STATES.IN_PROGRESS]: [STATES.COMPLETED, STATES.ABANDONED],
  [STATES.COMPLETED]: [],
  [STATES.ABANDONED]: [STATES.IN_PROGRESS],
});

class QuestState {
  constructor(initialState = STATES.NOT_ACCEPTED) {
    this.state = initialState;
  }

  get() {
    return this.state;
  }

  is(state) {
    return this.state === state;
  }

  canTransition(to) {
    return Boolean(LEGAL_TRANSITIONS[this.state]) && LEGAL_TRANSITIONS[this.state].includes(to);
  }

  // 带状态机校验的转换，非法路径返回 false 且不改状态。
  transition(to) {
    if (!this.canTransition(to)) return false;
    this.state = to;
    return true;
  }

  // 低层赋值接口（仅供初始构造等受控场景使用，不做校验）。
  setState(state) {
    this.state = state;
  }
}

module.exports = { QuestState, STATES, LEGAL_TRANSITIONS };
