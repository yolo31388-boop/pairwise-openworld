
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

describe('开放世界任务系统 - 引擎不变量', () => {
  function makeWorld(player = {}) {
    const qm = new QuestManager(player);
    const ds = new DialogueSystem(qm);
    qm.setDialogueSystem(ds);
    return { qm, ds };
  }

  test('状态机完整合法路径与终态', () => {
    const qs = new QuestState();
    expect(qs.get()).toBe('not_accepted');
    expect(qs.transition('in_progress')).toBe(true);
    expect(qs.transition('completed')).toBe(true);
    expect(qs.transition('in_progress')).toBe(false); // 已完成为终态
    expect(qs.get()).toBe('completed');
    const qs2 = new QuestState();
    expect(qs2.transition('completed')).toBe(false); // 未接取不能直接完成
  });

  test('接取初始化全部多目标进度为0', () => {
    const { qm } = makeWorld();
    const ok = qm.acceptQuest('q', {
      npcId: 'n',
      objectives: [
        { id: 'collect', type: 'collect', target: 3, npcId: 'n' },
        { id: 'kill', type: 'kill', target: 2 },
      ],
    });
    expect(ok).toBe(true);
    expect(qm.quests.q.progress).toEqual({ collect: 0, kill: 0 });
    expect(qm.getQuestState('q')).toBe('in_progress');
  });

  test('对话按进度分支并推进目标，再次对话不重复推进', () => {
    const { qm, ds } = makeWorld();
    qm.acceptQuest('q', {
      npcId: 'n',
      objectives: [{ id: 'visit', type: 'talk', target: 1, npcId: 'n' }],
    });
    ds.addNPC('n', { dialogue: '默认', questDialogues: { q: { progress: '进行中对话', turnin: '去交付吧' } } });
    const first = ds.talkToNPC('n');
    expect(first.text).toBe('进行中对话');
    expect(qm.quests.q.progress.visit).toBe(1);
    const second = ds.talkToNPC('n');
    expect(second.text).toBe('去交付吧');
    expect(qm.quests.q.progress.visit).toBe(1);
  });

  test('完成发放金币经验奖励物品且标记NPC完成，未满足目标不能完成', () => {
    const player = { gold: 10, exp: 0, items: [] };
    const { qm, ds } = makeWorld(player);
    qm.acceptQuest('q', {
      npcId: 'n',
      objectives: [{ id: 'o', target: 1 }],
      rewards: { gold: 100, exp: 50, items: ['badge'] },
    });
    ds.addNPC('n', { dialogue: 'd' });
    qm.updateObjective('q', 'o', 1);
    expect(qm.completeQuest('q')).toBe(true);
    expect(player.gold).toBe(110);
    expect(player.exp).toBe(50);
    expect(player.items).toContain('badge');
    expect(ds.isQuestCompleted('n', 'q')).toBe(true);
  });

  test('放弃清理NPC完成标记与进度标记，日志不残留', () => {
    const { qm, ds } = makeWorld({ items: [] });
    qm.acceptQuest('q', {
      npcId: 'n',
      itemToGive: 'letter',
      objectives: [{ id: 'o', target: 1, npcId: 'n' }],
    });
    ds.addNPC('n', { dialogue: 'd' });
    ds.talkToNPC('n');
    expect(qm.quests.q.progress.o).toBe(1);
    expect(qm.abandonQuest('q')).toBe(true);
    expect(ds.getNPCQuestState('n', 'q')).toBeNull();
    expect(qm.getQuestLog().some((entry) => entry.questId === 'q')).toBe(false);
    expect(qm.getQuestState('q')).toBe('abandoned');
  });

  test('任务物品接取给予、放弃收回、完成默认保留', () => {
    const player = { items: [] };
    const { qm } = makeWorld(player);
    qm.acceptQuest('keep', { npcId: 'n', itemToGive: 'keep_item', objectives: [] });
    qm.completeQuest('keep');
    expect(player.items).toContain('keep_item'); // 完成后保留

    const player2 = { items: [] };
    const world2 = makeWorld(player2);
    world2.qm.acceptQuest('take', { npcId: 'n2', itemToGive: 'take_item', objectives: [] });
    expect(player2.items).toContain('take_item');
    world2.qm.abandonQuest('take');
    expect(player2.items).not.toContain('take_item'); // 放弃收回

    const player3 = { items: [] };
    const world3 = makeWorld(player3);
    world3.qm.acceptQuest('burn', { npcId: 'n3', itemToGive: 'burn_item', consumeOnComplete: true, objectives: [] });
    world3.qm.completeQuest('burn');
    expect(player3.items).not.toContain('burn_item'); // 配置为完成时消耗
  });

  test('任务日志实时反映状态变化', () => {
    const { qm } = makeWorld();
    qm.acceptQuest('q', { npcId: 'n', objectives: [{ id: 'o', target: 2 }] });
    expect(qm.getQuestLog()).toHaveLength(1);
    qm.updateObjective('q', 'o', 1);
    expect(qm.getQuestLog()[0].progress.o).toBe(1);
    expect(qm.getQuestLog()[0].state).toBe('in_progress');
    qm.updateObjective('q', 'o', 1);
    qm.completeQuest('q');
    const entry = qm.getQuestLog().find((item) => item.questId === 'q');
    expect(entry.state).toBe('completed');
  });

  test('多任务共享同一NPC时上下文互不干扰', () => {
    const { qm, ds } = makeWorld();
    qm.acceptQuest('q1', { npcId: 'n', objectives: [{ id: 'a', target: 1, npcId: 'n' }] });
    qm.acceptQuest('q2', { npcId: 'n', objectives: [{ id: 'b', target: 1, npcId: 'n' }] });
    ds.addNPC('n', {
      quests: ['q1', 'q2'],
      dialogue: 'd',
      questDialogues: { q1: { progress: 'Q1进行' }, q2: { progress: 'Q2进行' } },
    });
    const result = ds.talkToNPC('n');
    expect(['Q1进行', 'Q2进行']).toContain(result.text);
    const progressed = result.questId;
    const other = progressed === 'q1' ? 'q2' : 'q1';
    expect(qm.quests[progressed].objectives[0].id).toBeDefined();
    expect(qm.quests[other].progress[qm.quests[other].objectives[0].id]).toBe(0);
    expect(qm.allObjectivesDone(progressed)).toBe(true);
    expect(qm.allObjectivesDone(other)).toBe(false);
  });

  test('触发条件：等级/物品/前置任务不满足时原子失败', () => {
    const { qm } = makeWorld({ level: 1, items: ['key'] });
    expect(qm.acceptQuest('level', { requirements: { level: 10 }, objectives: [] })).toBe(false);
    expect(qm.getQuestState('level')).toBe('not_accepted');
    expect(qm.getQuestLog()).toHaveLength(0); // 原子失败，无日志残留
    expect(qm.acceptQuest('item', { requirements: { items: ['missing'] }, objectives: [] })).toBe(false);

    expect(qm.acceptQuest('pre', { requirements: { quests: ['req'] }, objectives: [] })).toBe(false);
    qm.acceptQuest('req', { objectives: [] });
    qm.completeQuest('req');
    expect(qm.acceptQuest('pre', { requirements: { quests: ['req'] }, objectives: [] })).toBe(true);
  });

  test('多目标独立追踪且互不封顶', () => {
    const { qm } = makeWorld();
    qm.acceptQuest('q', { objectives: [{ id: 'collect', target: 5 }, { id: 'kill', target: 2 }] });
    qm.updateObjective('q', 'collect', 5);
    expect(qm.quests.q.progress.collect).toBe(5);
    expect(qm.quests.q.progress.kill).toBe(0);
    expect(qm.allObjectivesDone('q')).toBe(false); // 还有击杀目标未完成
    qm.updateObjective('q', 'kill', 1);
    expect(qm.allObjectivesDone('q')).toBe(false);
    qm.updateObjective('q', 'kill', 1);
    expect(qm.allObjectivesDone('q')).toBe(true);
    expect(qm.completeQuest('q')).toBe(true);
  });

  test('管理器层拒绝非法状态转换', () => {
    const { qm } = makeWorld();
    expect(qm.completeQuest('ghost')).toBe(false); // 不存在的任务不能完成
    qm.acceptQuest('q', { objectives: [{ id: 'o', target: 3 }] });
    expect(qm.completeQuest('q')).toBe(false); // 目标未完成不能完成
    expect(qm.getQuestState('q')).toBe('in_progress');
    qm.updateObjective('q', 'o', 3);
    qm.completeQuest('q');
    expect(qm.abandonQuest('q')).toBe(false); // 已完成不能放弃
    expect(qm.acceptQuest('q', { objectives: [] })).toBe(false); // 已完成不能重复接取
  });

  test('放弃后可重新接取且状态全新初始化', () => {
    const player = { items: [] };
    const { qm } = makeWorld(player);
    qm.acceptQuest('q', {
      npcId: 'n',
      itemToGive: 'item',
      objectives: [{ id: 'o', target: 2 }],
    });
    qm.updateObjective('q', 'o', 2);
    qm.abandonQuest('q');
    expect(player.items).not.toContain('item');
    expect(qm.acceptQuest('q', {
      npcId: 'n',
      itemToGive: 'item',
      objectives: [{ id: 'o', target: 2 }],
    })).toBe(true);
    expect(qm.quests.q.progress.o).toBe(0); // 旧进度已清空
    expect(player.items).toContain('item'); // 物品重新发放
    expect(qm.getQuestState('q')).toBe('in_progress');
  });

  test('重复接取进行中任务与重复完成被幂等拒绝', () => {
    const { qm } = makeWorld();
    qm.acceptQuest('q', { objectives: [] });
    expect(qm.acceptQuest('q', { objectives: [] })).toBe(false);
    expect(qm.completeQuest('q')).toBe(true);
    expect(qm.completeQuest('q')).toBe(false);
    expect(qm.getQuestLog().filter((entry) => entry.questId === 'q')).toHaveLength(1);
  });

  test('放弃清理接取物品以外配置的关联任务物品', () => {
    const player = { items: ['lore_page'] };
    const { qm } = makeWorld(player);
    qm.acceptQuest('q', {
      npcId: 'n',
      itemToGive: 'tool',
      removeItemsOnAbandon: ['lore_page'],
      objectives: [],
    });
    qm.abandonQuest('q');
    expect(player.items).not.toContain('tool');
    expect(player.items).not.toContain('lore_page');
  });
});
