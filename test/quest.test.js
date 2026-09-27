
const { QuestManager } = require('../src/quest/questManager.js');
const { QuestState } = require('../src/quest/questState.js');
const { DialogueSystem } = require('../src/npc/dialogue.js');

describe('开放世界任务系统', () => {
  test('状态机合法转换', () => {
    const qs = new QuestState();
    expect(qs.canTransition('in_progress')).toBe(true);
    qs.setState('in_progress');
    expect(qs.canTransition('not_accepted')).toBe(false);
  });
  test('接取初始化进度', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: [{id:'o1', target:3, current:0}]});
    expect(qm.quests.q1.progress.o1).toBe(0);
  });
  test('对话推进进度', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: [{id:'o1', target:1, current:0, npcId:'npc1'}]});
    const ds = new DialogueSystem();
    ds.addNPC('npc1', {dialogue:'完成了'});
    ds.talk('npc1', {});
    expect(qm.quests.q1.progress.o1).toBe(1);
  });
  test('完成发放奖励', () => {
    const player = {gold: 0, exp: 0};
    const qm = new QuestManager(player);
    qm.acceptQuest('q1', {rewards: {gold: 100, exp: 50}, objectives: [{id:'o1', target:1, current:1}]});
    qm.completeQuest('q1');
    expect(player.gold).toBe(100);
  });
  test('放弃清理状态', () => {
    const player = {items: ['quest_item']};
    const qm = new QuestManager(player);
    qm.acceptQuest('q1', {itemToRemove: 'quest_item', objectives: []});
    qm.abandonQuest('q1');
    expect(player.items).not.toContain('quest_item');
  });
  test('任务物品给予收回', () => {
    const player = {items: []};
    const qm = new QuestManager(player);
    qm.acceptQuest('q1', {itemToGive: 'sword', objectives: []});
    expect(player.items).toContain('sword');
    qm.abandonQuest('q1');
    expect(player.items).not.toContain('sword');
  });
  test('任务日志实时更新', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: []});
    expect(qm.getQuestLog().length).toBe(1);
  });
  test('多任务共享NPC', () => {
    const ds = new DialogueSystem();
    ds.addNPC('npc1', {quests: ['q1','q2']});
    expect(ds.npcs.npc1.quests.length).toBe(2);
  });
  test('触发条件验证', () => {
    const player = {level: 1};
    const qm = new QuestManager(player);
    expect(qm.acceptQuest('q1', {requirements: {level: 10}, objectives: []})).toBe(false);
  });
  test('多目标独立追踪', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: [{id:'o1',target:3},{id:'o2',target:5}]});
    expect(qm.quests.q1.progress.o1).toBe(0);
    expect(qm.quests.q1.progress.o2).toBe(0);
  });
  test('非法状态转换被拒', () => {
    const qs = new QuestState();
    qs.setState('completed');
    expect(qs.canTransition('in_progress')).toBe(false);
  });
  test('放弃后重新接取', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: []});
    qm.abandonQuest('q1');
    expect(qm.acceptQuest('q1', {objectives: []})).toBe(true);
  });
});
