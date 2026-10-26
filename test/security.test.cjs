const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Module } = require('node:module');
const { readdir } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

// Import the handlers without loading .env, logging in, or registering commands.
const entryPath = require.resolve('../dist/Silver.js');
const entry = new Module(entryPath);
entry.loaded = true;
entry.exports = {
  safe: async promise => promise,
  fileIfExists: buffer => buffer ? [{ attachment: buffer }] : [],
  pets: require('../data/Pets.json'),
  foods: require('../data/Foods.json'),
};
require.cache[entryPath] = entry;
const { handleCommands } = require('../dist/HandleCommands.js');
const { Game } = require('../dist/Game.js');
const { Lobby } = require('../dist/Lobby.js');
const { SELF_ASSIGNABLE_ROLE_IDS } = require('../dist/Roles.js');

function interaction(userId, customId) {
  const replies = [];
  return {
    user: { id: userId }, customId, replies,
    inGuild: () => true, inCachedGuild: () => true,
    isButton: () => true, isStringSelectMenu: () => false,
    isChatInputCommand: () => false,
    member: { roles: { cache: new Map() } },
    reply: async value => { replies.push(value); },
    deferReply: async () => {}, editReply: async () => {},
  };
}

function collector() {
  const handlers = new Map();
  return {
    options: null, stops: 0,
    on(event, handler) { handlers.set(event, handler); return this; },
    async emit(event, ...args) { return handlers.get(event)?.(...args); },
    stop() { this.stops++; },
  };
}

async function roleButton(roleId, { cached = true, existing = false, managed = false } = {}) {
  let handler;
  handleCommands({ on: (_event, callback) => { handler = callback; } });
  const button = interaction('member', roleId);
  const changes = [];
  button.inCachedGuild = () => cached;
  button.guild = { roles: { cache: new Map([[roleId, { id: roleId, name: 'Role', managed }]]) } };
  button.member.roles = {
    cache: new Map(existing ? [[roleId, {}]] : []),
    add: async role => { changes.push(['add', role.id]); },
    remove: async role => { changes.push(['remove', role.id]); },
  };
  await handler(button);
  return changes;
}

test('role buttons refuse unlisted and managed roles and uncached members', async () => {
  const allowed = [...SELF_ASSIGNABLE_ROLE_IDS][0];
  assert.deepEqual(await roleButton('unlisted-privileged-role'), []);
  assert.deepEqual(await roleButton(allowed, { managed: true }), []);
  assert.deepEqual(await roleButton(allowed, { cached: false }), []);
});

test('approved self-service roles can be added and removed', async () => {
  for (const roleId of SELF_ASSIGNABLE_ROLE_IDS) {
    assert.deepEqual(await roleButton(roleId), [['add', roleId]]);
    assert.deepEqual(await roleButton(roleId, { existing: true }), [['remove', roleId]]);
  }
});

test('closing games permits players and moderators and rejects outsiders', async () => {
  const controls = collector();
  const game = Object.assign(Object.create(Game.prototype), {
    players: [{ user: { id: 'player' } }],
    channel: { send: async () => ({ createMessageComponentCollector: options => {
      controls.options = options;
      return controls;
    } }) },
  });
  let deletions = 0;
  game.deleteGame = async () => { deletions++; };
  await game.endGame();
  assert.equal(controls.options.filter(interaction('player', 'unrelated')), false);
  const outsider = interaction('outsider', 'close_game_button');
  await controls.emit('collect', outsider);
  assert.equal(deletions, 0);
  assert.equal(outsider.replies[0].ephemeral, true);
  await controls.emit('collect', interaction('player', 'close_game_button'));
  assert.equal(deletions, 1);
  const moderator = interaction('moderator', 'close_game_button');
  moderator.member.roles.cache.set('1321368228236230666', {});
  await controls.emit('collect', moderator);
  assert.equal(deletions, 2);
});

function mockLobby() {
  const controls = collector();
  let ready;
  const readyPromise = new Promise(resolve => { ready = resolve; });
  const createCollector = options => { controls.options = options; ready(); return controls; };
  const message = { edit: async () => {}, delete: async () => {}, createMessageComponentCollector: createCollector };
  const player = { user: { id: 'player', displayName: 'Player' } };
  const lobby = Object.assign(Object.create(Lobby.prototype), {
    players: [player], numberOfBans: 0,
    deck: { groups: [[{ pets: [], foods: [] }, { pets: [], foods: [] }]] },
    channel: { send: async () => message, createMessageComponentCollector: createCollector },
    getGroups: async () => Buffer.from('image'),
    pickOption: async () => {}, assignGroups: async () => new Map(),
  });
  let teamsViewed = 0;
  lobby.sendTeam = async () => { teamsViewed++; return { content: 'private team' }; };
  return { lobby, player, controls, ready: readyPromise, teamsViewed: () => teamsViewed };
}

test('draft team buttons do not reveal the active player team to other members', async () => {
  const mock = mockLobby();
  const pending = mock.lobby.selectGroup(mock.player, 0, 60000, false, []);
  await mock.ready;
  try {
    const outsider = interaction('outsider', 'team_button');
    await mock.controls.emit('collect', outsider);
    assert.equal(mock.teamsViewed(), 0);
    assert.equal(outsider.replies[0].ephemeral, true);
    await mock.controls.emit('collect', interaction('player', 'team_button'));
    assert.equal(mock.teamsViewed(), 1);
  } finally {
    await mock.controls.emit('end', [], 'test');
    await pending;
  }
});

test('nonparticipants cannot submit bids or request team images', async () => {
  const mock = mockLobby();
  const pending = mock.lobby.biddingDraft(0, 60000);
  await mock.ready;
  try {
    for (const buttonId of ['submit', 'team_button']) {
      const outsider = interaction('outsider', buttonId);
      await mock.controls.emit('collect', outsider);
      assert.equal(outsider.replies[0].content, 'You are not a participant!');
      assert.equal(mock.controls.stops, 0);
      assert.equal(mock.teamsViewed(), 0);
    }
    await mock.controls.emit('collect', interaction('player', 'submit'));
    assert.equal(mock.controls.stops, 1);
  } finally {
    await mock.controls.emit('end');
    await pending;
  }
});

test('bidding assignments use the active group count and numeric preference order', async () => {
  const lobby = Object.assign(Object.create(Lobby.prototype), {
    numberOfBans: 0, deck: { groups: Array.from({ length: 6 }, () => []) },
  });
  const players = ['one', 'two', 'three'].map(id => ({ user: { id } }));
  const selections = new Map([
    ['one', new Map([['Pick 1', 'I']])],
    ['two', new Map([['Pick 10', 'B'], ['Pick 2', 'C']])],
  ]);
  const assigned = await lobby.assignGroups(players, selections, 9);
  assert.equal(assigned.get('one'), 8);
  assert.equal(assigned.get('two'), 2);
  assert.equal(new Set(assigned.values()).size, 3);
  const small = await lobby.assignGroups(players, new Map(), 2);
  assert.equal(small.size, 2);
  assert.ok([...small.values()].every(group => group < 2));
});

test('all bundled sprites decode with the patched image library', async () => {
  const root = path.join(__dirname, '../data/sprites');
  const files = await readdir(root, { recursive: true });
  for (const file of files.filter(file => file.endsWith('.png'))) {
    const result = await sharp(path.join(root, file)).raw().toBuffer({ resolveWithObject: true });
    assert.ok(result.info.width > 0 && result.info.height > 0, file);
  }
});

test('team and group image composition still works after dependency upgrades', async () => {
  const game = Object.create(Game.prototype);
  const tiers = Array.from({ length: 6 }, (_, i) => ({
    pets: entry.exports.pets.filter(pet => pet.tier === i + 1).slice(0, 10),
    foods: entry.exports.foods.filter(food => food.tier === i + 1).slice(0, 2),
  }));
  const team = await sharp(await game.getTeam(tiers)).metadata();
  assert.equal(team.width, 800);
  const groups = await sharp(await game.getGroups(tiers, [0])).metadata();
  assert.equal(groups.width, 800);
  assert.ok(groups.height < team.height);
});
