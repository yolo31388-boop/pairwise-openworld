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
    const ds = new DialogueSystem(qm);
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
    expect(qs.setState('completed')).toBe(false);
    expect(qs.state).toBe('not_accepted');
    qs.setState('in_progress');
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

describe('任务系统不变量', () => {
  test('状态机合法转换路径完整', () => {
    const qs = new QuestState();
    expect(qs.canTransition('completed')).toBe(false);
    expect(qs.canTransition('abandoned')).toBe(false);
    qs.setState('in_progress');
    expect(qs.canTransition('completed')).toBe(true);
    expect(qs.canTransition('abandoned')).toBe(true);
    qs.setState('abandoned');
    expect(qs.canTransition('in_progress')).toBe(true);
    expect(qs.canTransition('completed')).toBe(false);
  });

  test('接取后状态与进度正确初始化', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: [{id:'kill', target:3}, {id:'collect', target:2}]});
    expect(qm.quests.q1.state.state).toBe('in_progress');
    expect(qm.quests.q1.progress).toEqual({kill: 0, collect: 0});
  });

  test('对话根据进度显示不同内容并推进', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives: [{id:'o1', target:1, npcId:'npc1'}]});
    const ds = new DialogueSystem(qm);
    ds.addNPC('npc1', {dialogue:'默认', questDialogues: {q1: {inProgress:'进行中', readyToComplete:'可完成', completed:'已完成'}}});
    expect(ds.getDialogue('npc1')).toBe('进行中');
    ds.talk('npc1', {});
    expect(qm.quests.q1.progress.o1).toBe(1);
    expect(ds.getDialogue('npc1')).toBe('可完成');
    qm.completeQuest('q1');
    expect(ds.getDialogue('npc1')).toBe('已完成');
  });

  test('完成发放全部奖励并标记NPC', () => {
    const player = {gold:0, exp:0, items:[]};
    const ds = new DialogueSystem();
    const qm = new QuestManager(player, ds);
    ds.setQuestManager(qm);
    ds.addNPC('npc1', {quests:['q1']});
    qm.acceptQuest('q1', {rewards:{gold:100, exp:50, items:['medal']}, objectives:[{id:'o1', target:1}]});
    qm.updateProgress('q1', 'o1', 1);
    expect(qm.completeQuest('q1')).toBe(true);
    expect(player.gold).toBe(100);
    expect(player.exp).toBe(50);
    expect(player.items).toContain('medal');
    expect(ds.npcs.npc1.completedQuests).toContain('q1');
  });

  test('放弃清理NPC状态物品与进度标记', () => {
    const player = {items:[]};
    const ds = new DialogueSystem();
    const qm = new QuestManager(player, ds);
    ds.setQuestManager(qm);
    ds.addNPC('npc1', {quests:['q1']});
    qm.acceptQuest('q1', {itemToGive:'letter', objectives:[{id:'o1', target:2, npcId:'npc1'}]});
    qm.updateProgress('q1', 'o1', 1);
    expect(qm.abandonQuest('q1')).toBe(true);
    expect(player.items).not.toContain('letter');
    expect(qm.quests.q1.progress.o1).toBe(0);
    expect(ds.npcs.npc1.completedQuests).not.toContain('q1');
    expect(qm.quests.q1.state.state).toBe('abandoned');
  });

  test('任务物品完成时按配置保留或消耗', () => {
    const p1 = {items:[]};
    const qm1 = new QuestManager(p1);
    qm1.acceptQuest('q1', {itemToGive:'keep_sword', objectives:[{id:'o1', target:1, current:1}]});
    qm1.completeQuest('q1');
    expect(p1.items).toContain('keep_sword');
    const p2 = {items:[]};
    const qm2 = new QuestManager(p2);
    qm2.acceptQuest('q2', {itemToGive:'scroll', consumeItemOnComplete:true, objectives:[{id:'o1', target:1, current:1}]});
    qm2.completeQuest('q2');
    expect(p2.items).not.toContain('scroll');
  });

  test('任务日志实时反映当前状态', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives:[{id:'o1', target:1, current:1}]});
    qm.completeQuest('q1');
    qm.acceptQuest('q2', {objectives:[]});
    qm.abandonQuest('q2');
    const log = qm.getQuestLog();
    expect(log.find(e => e.questId === 'q1').state).toBe('completed');
    expect(log.find(e => e.questId === 'q2').state).toBe('abandoned');
    expect(log.filter(e => e.questId === 'q2' && e.state === 'completed').length).toBe(0);
  });

  test('多任务共享NPC上下文互不干扰', () => {
    const ds = new DialogueSystem();
    const qm = new QuestManager({}, ds);
    ds.setQuestManager(qm);
    ds.addNPC('npc1', {quests:['q1','q2'], questDialogues:{q1:{inProgress:'Q1进行中', completed:'Q1完成'}, q2:{inProgress:'Q2进行中'}}});
    qm.acceptQuest('q1', {objectives:[{id:'o1', target:2, npcId:'npc1'}]});
    qm.acceptQuest('q2', {objectives:[{id:'o1', target:2, npcId:'npc1'}]});
    expect(ds.getDialogue('npc1')).toBe('Q1进行中');
    ds.talk('npc1', {});
    expect(qm.quests.q1.progress.o1).toBe(1);
    expect(qm.quests.q2.progress.o1).toBe(1);
    qm.updateProgress('q1', 'o1', 1);
    qm.completeQuest('q1');
    expect(ds.getDialogue('npc1')).toBe('Q2进行中');
    expect(qm.quests.q2.state.state).toBe('in_progress');
  });

  test('触发条件不满足时原子失败', () => {
    const player = {level:1, items:[]};
    const qm = new QuestManager(player);
    const ok = qm.acceptQuest('q1', {requirements:{level:10, items:['key'], quests:['q0']}, itemToGive:'sword', objectives:[]});
    expect(ok).toBe(false);
    expect(qm.quests.q1).toBeUndefined();
    expect(player.items).not.toContain('sword');
    expect(qm.getQuestLog().length).toBe(0);
    player.level = 10;
    player.items.push('key');
    qm.acceptQuest('q0', {objectives:[]});
    qm.completeQuest('q0');
    expect(qm.acceptQuest('q1', {requirements:{level:10, items:['key'], quests:['q0']}, itemToGive:'sword', objectives:[]})).toBe(true);
    expect(player.items).toContain('sword');
  });

  test('多目标独立追踪与进度封顶', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives:[{id:'collect', target:3},{id:'kill', target:2},{id:'visit', target:1}]});
    qm.updateProgress('q1', 'collect', 2);
    qm.updateProgress('q1', 'kill', 1);
    expect(qm.quests.q1.progress).toEqual({collect:2, kill:1, visit:0});
    qm.updateProgress('q1', 'collect', 5);
    expect(qm.quests.q1.progress.collect).toBe(3);
    expect(qm.completeQuest('q1')).toBe(false);
    qm.updateProgress('q1', 'kill', 1);
    qm.updateProgress('q1', 'visit', 1);
    expect(qm.completeQuest('q1')).toBe(true);
  });

  test('非法状态转换与操作被拒绝', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives:[{id:'o1', target:2}]});
    expect(qm.completeQuest('q1')).toBe(false);
    expect(qm.quests.q1.state.state).toBe('in_progress');
    qm.updateProgress('q1', 'o1', 2);
    qm.completeQuest('q1');
    expect(qm.abandonQuest('q1')).toBe(false);
    expect(qm.completeQuest('q1')).toBe(false);
    expect(qm.acceptQuest('q1', {objectives:[]})).toBe(false);
    expect(qm.updateProgress('q1', 'o1', 1)).toBe(false);
  });

  test('放弃后重新接取状态完全重置', () => {
    const player = {items:[]};
    const qm = new QuestManager(player);
    qm.acceptQuest('q1', {itemToGive:'sword', objectives:[{id:'o1', target:2}]});
    qm.updateProgress('q1', 'o1', 1);
    qm.abandonQuest('q1');
    expect(player.items).not.toContain('sword');
    expect(qm.acceptQuest('q1', {itemToGive:'sword', objectives:[{id:'o1', target:2}]})).toBe(true);
    expect(qm.quests.q1.state.state).toBe('in_progress');
    expect(qm.quests.q1.progress.o1).toBe(0);
    expect(player.items).toContain('sword');
  });

  test('重复接取进行中的任务被拒绝', () => {
    const qm = new QuestManager({});
    qm.acceptQuest('q1', {objectives:[]});
    expect(qm.acceptQuest('q1', {objectives:[]})).toBe(false);
  });
});
