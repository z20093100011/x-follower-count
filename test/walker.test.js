const test = require('node:test');
const assert = require('node:assert/strict');
const { collectUsers, formatCount, badgeText, badgeTitle, ratioOf, formatRatio, relationTag, accountAge, detailRows } = require('../src/walker.js');

const user = (name, count, modern = true) => ({
  __typename: 'User', rest_id: '123',
  ...(modern ? { core: { screen_name: name, name: `${name} display name` } } : {}),
  legacy: { ...(modern ? {} : { screen_name: name }), followers_count: count }
});
const tweet = (author, extra = {}) => ({
  __typename: 'Tweet', rest_id: '456', core: { user_results: { result: author } }, ...extra
});
const entry = result => ({ entryId: 'tweet-456', content: {
  entryType: 'TimelineTimelineItem', itemContent: { tweet_results: { result } }
} });

test('realistic GraphQL operations, wrappers, quoted users and follower lists', () => {
  const payload = [
    { data: { user: { result: user('Profile', 12345) } } }, // UserByScreenName
    { data: { home: { home_timeline_urt: { instructions: [{
      type: 'TimelineAddEntries', entries: [
        entry(tweet(user('LegacyOnly', 9876, false))),
        entry(tweet(user('Modern', 12000))),
        entry({ __typename: 'TweetWithVisibilityResults', tweet: tweet(user('Wrapped', 8), {
          quoted_status_result: { result: tweet(user('Quoted', 90000)) }
        }) })
      ]
    }] } } } },
    { data: { user: { result: { __typename: 'User', rest_id: '789', timeline: {
      timeline: { instructions: [{ type: 'TimelineAddEntries', entries: [{
        content: { itemContent: { user_results: { result: user('Follower', 0) } } }
      }] }] }
    } } } } },
    { __typename: 'User', rest_id: '99', core: { screen_name: 'Relations' }, relationship_counts: { followers: 345 } },
    { __typename: 'User', rest_id: '98', core: { screen_name: 'Nested' }, public_metrics: { followers_count: 678 } },
    { screen_name: 'PlainV1', followers_count: 7 }
  ];
  const result = collectUsers(payload);
  assert.deepEqual(Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.followers])), {
    plainv1: 7, nested: 678, relations: 345, follower: 0, quoted: 90000,
    wrapped: 8, modern: 12000, legacyonly: 9876, profile: 12345
  });
  assert.equal(result.profile.screenName, 'Profile');
});

test('duplicates choose later valid values and preserve supplied output', () => {
  const out = {};
  assert.equal(collectUsers([user('Alice', 50), user('ALICE', 100), user('alice', 2)], out), out);
  assert.equal(out.alice.followers, 2);
  collectUsers(user('alice', 200), out);
  assert.equal(out.alice.followers, 200);
  assert.equal(collectUsers({ core: { screen_name: 'Both' }, legacy: { followers_count: 9 },
    relationship_counts: { followers: 12 } }).both.followers, 12);
});

test('cycles, depth limit and garbage are harmless', () => {
  const cyclic = { users: [user('Cycle', 3)] };
  cyclic.self = cyclic;
  cyclic.users.push(cyclic);
  assert.equal(collectUsers(cyclic).cycle.followers, 3);
  const garbage = [null, undefined, false, 42, 'text', {},
    ...['123', null, undefined, NaN, Infinity, -1, {}, true].map(n => user('Invalid', n)),
    { screen_name: '@bad', followers_count: 5 }, { followers_count: 7 }];
  assert.equal(Object.keys(collectUsers(garbage)).length, 0);
  let deep = user('TooDeep', 1);
  for (let i = 0; i < 65; i++) deep = { child: deep };
  assert.equal(Object.keys(collectUsers(deep)).length, 0);
});

test('nested users cannot supply the outer user count; special keys are safe', () => {
  const result = collectUsers({ core: { screen_name: 'Outer' }, child: user('Inner', 123) });
  assert.equal(result.outer, undefined);
  assert.equal(result.inner.followers, 123);
  const out = {};
  collectUsers({ screen_name: '__proto__', followers_count: 5 }, out);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(out.__proto__.followers, 5);
});

test('Chinese short count formatting', () => {
  for (const [number, expected] of [
    [0, '0'], [999, '999'], [1000, '1,000'], [9876, '9,876'], [9999, '9,999'],
    [10000, '1万'], [12000, '1.2万'], [12500, '1.3万'], [99999999, '1亿'], [99940000, '9994万'], [100000000, '1亿'], [340000000, '3.4亿']
  ]) assert.equal(formatCount(number), expected);
  for (const value of [NaN, Infinity, -1, '12000', null]) assert.equal(formatCount(value), '');
  assert.equal(globalThis.XFCWalker.collectUsers, collectUsers);
});

test('badge text puts the label before the abbreviated count', () => {
  for (const [number, expected] of [
    [174000, '粉丝 17.4万'], [1574, '粉丝 1,574'], [423, '粉丝 423'],
    [11000, '粉丝 1.1万'], [340000000, '粉丝 3.4亿'], [0, '粉丝 0'],
    [10000, '粉丝 1万'], [99999999, '粉丝 1亿']
  ]) assert.equal(badgeText(number), expected);
  assert.equal(globalThis.XFCWalker.badgeText, badgeText);
});

test('badge title preserves the exact count and both helpers reject invalid values', () => {
  assert.equal(badgeTitle(174000), '粉丝 174,000');
  assert.equal(badgeTitle(0), '粉丝 0');
  for (const value of [NaN, Infinity, -Infinity, -1, '12000', null, undefined, {}, true]) {
    assert.equal(badgeText(value), '');
    assert.equal(badgeTitle(value), '');
  }
  assert.equal(globalThis.XFCWalker.badgeTitle, badgeTitle);
});


test('field priority, modern and legacy metadata, and strict booleans', () => {
  const result = collectUsers({ core: { screen_name: 'Rich', created_at: '2009-03-10' },
    relationship_counts: { followers: 100, following: 5 }, tweet_counts: { tweets: 42 },
    relationship_perspectives: { followed_by: false, following: true },
    legacy: { screen_name: 'Rich', followers_count: 999, friends_count: 99, statuses_count: 99,
      created_at: '2010-01-01', followed_by: true, following: false } });
  assert.deepEqual(result.rich, { screenName: 'Rich', followers: 100, following: 5, tweets: 42,
    createdAt: '2009-03-10', followedBy: false, iFollow: true });
  const legacy = collectUsers({ legacy: { screen_name: 'Old', followers_count: 8, friends_count: 3,
    statuses_count: 4, created_at: '2011-02-03', followed_by: true, following: true } }).old;
  assert.deepEqual(legacy, { screenName: 'Old', followers: 8, following: 3, tweets: 4,
    createdAt: '2011-02-03', followedBy: true, iFollow: true });
  const plain = collectUsers({ screen_name: 'Plain', followers_count: 2, friends_count: 0,
    statuses_count: 0, created_at: '2026-01-01', legacy: { followed_by: 'true', following: 1 } }).plain;
  assert.equal(plain.following, 0);
  assert.equal(plain.tweets, 0);
  assert.equal(plain.createdAt, '2026-01-01');
  assert.equal(plain.followedBy, false);
  assert.equal(plain.iFollow, false);
});

test('duplicate partial records merge without erasing known values', () => {
  const result = collectUsers([
    { screen_name: 'Alice', friends_count: 10, statuses_count: 12 },
    { screen_name: 'ALICE', followers_count: 100, created_at: '2020-01-01', legacy: { followed_by: true } },
    { screen_name: 'alice', followers_count: 50, friends_count: 0 },
    { screen_name: 'alice', followers_count: null, statuses_count: 15 }
  ]).alice;
  assert.deepEqual(result, { screenName: 'alice', followers: 50, following: 0, tweets: 15,
    createdAt: '2020-01-01', followedBy: true, iFollow: false });
  assert.equal(collectUsers([{ screen_name: 'Bool', followers_count: 1, legacy: { following: true } },
    { screen_name: 'Bool', legacy: { following: false } }]).bool.iFollow, false);
});

test('invalid optional fields and nested different users do not leak', () => {
  for (const value of [-1, Infinity, NaN, '12', {}, true]) {
    const rec = collectUsers({ screen_name: 'Invalid', followers_count: 2, friends_count: value,
      statuses_count: value, created_at: value }).invalid;
    assert.equal(rec.following, null);
    assert.equal(rec.tweets, null);
    assert.equal(rec.createdAt, typeof value === 'string' ? value : null);
  }
  assert.equal(collectUsers({ screen_name: 'Long', followers_count: 1, created_at: 'x'.repeat(65) }).long.createdAt, null);
  const rec = collectUsers({ core: { screen_name: 'Outer' }, followers_count: 1,
    legacy: { screen_name: 'Inner', followers_count: 999, friends_count: 99, followed_by: true } }).outer;
  assert.equal(rec.followers, 1);
  assert.equal(rec.following, null);
  assert.equal(rec.followedBy, false);
});

test('ratios and relationship tags', () => {
  assert.equal(ratioOf({ followers: 100, following: 4 }), 25);
  for (const following of [0, null, -1, Infinity, '4']) assert.equal(ratioOf({ followers: 100, following }), null);
  assert.equal(ratioOf({ followers: NaN, following: 4 }), null);
  for (const [value, expected] of [[100.4, '100'], [17.8, '18'], [1.25, '1.3'], [0, '0.0'], [null, ''], [Infinity, '']]) {
    assert.equal(formatRatio(value), expected);
  }
  assert.equal(relationTag({ followedBy: true, iFollow: true }), '互关');
  assert.equal(relationTag({ followedBy: true, iFollow: false }), '关注了你');
  assert.equal(relationTag({ followedBy: false, iFollow: true }), '');
  assert.equal(relationTag({}), '');
});

const now = Date.UTC(2026, 9, 9);
test('account age uses complete UTC months and rejects invalid dates', () => {
  assert.equal(accountAge('Tue Mar 10 12:00:00 +0000 2009', now), '2009-03 · 17 年 6 个月');
  assert.equal(accountAge('2026-05-09', now), '2026-05 · 5 个月');
  assert.equal(accountAge('2025-10-09', now), '2025-10 · 1 年');
  for (const value of [null, undefined, 42, '', 'nonsense', '2027-01-01']) assert.equal(accountAge(value, now), '');
  assert.equal(accountAge('2020-01-01', NaN), '');
});

test('detail rows contain exact counts and optional account information', () => {
  const rec = { followers: 174000, following: 1000, tweets: 12345,
    createdAt: 'Tue Mar 10 12:00:00 +0000 2009', followedBy: true, iFollow: true };
  assert.deepEqual(detailRows(rec, now), [ ['粉丝', '174,000'], ['关注', '1,000'],
    ['粉丝/关注比', '174'], ['推文数', '12,345'], ['注册', '2009-03 · 17 年 6 个月'], ['关系', '互相关注'] ]);
  assert.deepEqual(detailRows({ followers: 0, following: 0, tweets: 0 }, now),
    [['粉丝', '0'], ['关注', '0'], ['推文数', '0']]);
  assert.deepEqual(detailRows({ followedBy: true }, now), [['关系', 'TA 关注了你']]);
  assert.deepEqual(detailRows({ iFollow: true }, now), [['关系', '你关注了 TA']]);
  assert.deepEqual(detailRows({}, now), []);
});

test('follower tiers include every threshold and reject invalid counts', () => {
  const { tierOf } = require('../src/walker.js');
  for (const [followers, tier] of [
    [0, 0], [999, 0], [1000, 1], [9999, 1], [10000, 2], [99999, 2],
    [100000, 3], [999999, 3], [1000000, 4], [1e9, 4]
  ]) assert.equal(tierOf(followers), tier);
  for (const value of [NaN, Infinity, -Infinity, -1, '1000', null, undefined, {}, [], true]) {
    assert.equal(tierOf(value), 0);
  }
  assert.equal(globalThis.XFCWalker.tierOf, tierOf);
});
