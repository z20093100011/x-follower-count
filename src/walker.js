(() => {
  'use strict';
  const validCount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const handleOf = obj => obj?.core?.screen_name || obj?.screen_name || obj?.legacy?.screen_name;

  const countOrNull = n => validCount(n) ? n : null;
  const boolOrNull = b => b == null ? null : b === true;
  const dateOrNull = s => typeof s === 'string' && s.length <= 64 ? s : null;
  const differentUser = (node, user) => node !== user && (node.__typename === 'User' || node.rest_id ||
    (handleOf(node) && handleOf(node) !== handleOf(user)));

  function recordOf(user, screenName) {
    const own = node => node && typeof node === 'object' && !differentUser(node, user) ? node : {};
    const rc = own(user.relationship_counts), legacy = own(user.legacy), core = own(user.core);
    const tweets = own(user.tweet_counts), relation = own(user.relationship_perspectives);
    let followers = countOrNull(rc.followers ?? legacy.followers_count ?? user.followers_count);
    // Retain support for metadata wrappers, without crossing a user boundary.
    if (followers === null) {
      const stack = [[user, 0]], seen = new WeakSet();
      while (stack.length) {
        const [node, depth] = stack.pop();
        if (!node || typeof node !== 'object' || depth > 60 || seen.has(node) || differentUser(node, user)) continue;
        seen.add(node);
        const count = own(node.relationship_counts).followers ?? own(node.legacy).followers_count ?? node.followers_count;
        if (validCount(count)) { followers = count; break; }
        for (const value of Object.values(node).reverse()) {
          if (value && typeof value === 'object') stack.push([value, depth + 1]);
        }
      }
    }
    return {
      screenName, followers,
      following: countOrNull(rc.following ?? legacy.friends_count ?? user.friends_count),
      tweets: countOrNull(tweets.tweets ?? legacy.statuses_count ?? user.statuses_count),
      createdAt: dateOrNull(core.created_at ?? legacy.created_at ?? user.created_at),
      followedBy: boolOrNull(relation.followed_by ?? legacy.followed_by),
      iFollow: boolOrNull(relation.following ?? legacy.following)
    };
  }

  function collectUsers(obj, out = Object.create(null)) {
    const stack = [[obj, 0, false]], seen = new WeakSet(), records = new Map();
    while (stack.length) {
      const [node, depth, metadata] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 60 || seen.has(node)) continue;
      seen.add(node);
      const screenName = handleOf(node);
      if (!metadata && typeof screenName === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(screenName)) {
        const record = recordOf(node, screenName), key = screenName.toLowerCase();
        const previous = records.get(key) || (Object.hasOwn(out, key) ? out[key] : undefined);
        for (const field of ['followers', 'following', 'tweets', 'createdAt', 'followedBy', 'iFollow']) {
          if (record[field] === null && previous?.[field] != null) record[field] = previous[field];
        }
        record.followedBy ??= false;
        record.iFollow ??= false;
        records.set(key, record);
        if (validCount(record.followers)) Object.defineProperty(out, key, {
          value: record, enumerable: true, writable: true, configurable: true
        });
      }
      for (const [key, value] of Object.entries(node).reverse()) {
        if (value && typeof value === 'object') {
          stack.push([value, depth + 1, ['core', 'legacy'].includes(key) && !differentUser(value, node)]);
        }
      }
    }
    return out;
  }

  function formatCount(n) {
    if (!validCount(n)) return '';
    if (n < 10000) return n.toLocaleString('en-US');
    // 99,999,999 rounds to 10000.0万; promote to 亿 instead.
    const unit = n >= 1e8 || Math.round(n / 1000) >= 1e5 ? 1e8 : 10000;
    return (n / unit).toFixed(1).replace(/\.0$/, '') + (unit === 1e8 ? '亿' : '万');
  }

  function tierOf(followers) {
    if (!validCount(followers)) return 0;
    return followers >= 1e6 ? 4 : followers >= 1e5 ? 3 : followers >= 1e4 ? 2 : followers >= 1e3 ? 1 : 0;
  }

  function badgeText(n) {
    return validCount(n) ? `粉丝 ${formatCount(n)}` : '';
  }

  function badgeTitle(n) {
    return validCount(n) ? `粉丝 ${n.toLocaleString('en-US')}` : '';
  }

  function ratioOf(rec) {
    if (!validCount(rec?.followers) || !validCount(rec?.following) || rec.following <= 0) return null;
    const ratio = rec.followers / rec.following;
    return Number.isFinite(ratio) ? ratio : null;
  }

  function formatRatio(r) {
    return validCount(r) ? r.toFixed(r >= 10 ? 0 : 1) : '';
  }

  function relationTag(rec) {
    return rec?.followedBy === true ? (rec.iFollow === true ? '互关' : '关注了你') : '';
  }

  function accountAge(createdAt, now = Date.now()) {
    if (typeof createdAt !== 'string' || !createdAt.trim()) return '';
    const date = new Date(createdAt), today = new Date(now);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(today.getTime()) || date > today) return '';
    const months = (today.getUTCFullYear() - date.getUTCFullYear()) * 12 + today.getUTCMonth() - date.getUTCMonth() -
      (today.getUTCDate() < date.getUTCDate() ? 1 : 0);
    const years = Math.floor(months / 12), rest = months % 12;
    const age = years ? `${years} 年${rest ? ` ${rest} 个月` : ''}` : `${months} 个月`;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')} · ${age}`;
  }

  function detailRows(rec, now = Date.now()) {
    const rows = [], exact = n => n.toLocaleString('en-US');
    if (validCount(rec?.followers)) rows.push(['粉丝', exact(rec.followers)]);
    if (validCount(rec?.following)) rows.push(['关注', exact(rec.following)]);
    const ratio = ratioOf(rec);
    if (ratio !== null) rows.push(['粉丝/关注比', formatRatio(ratio)]);
    if (validCount(rec?.tweets)) rows.push(['推文数', exact(rec.tweets)]);
    const age = accountAge(rec?.createdAt, now);
    if (age) rows.push(['注册', age]);
    const relation = rec?.followedBy === true ? (rec.iFollow === true ? '互相关注' : 'TA 关注了你') :
      rec?.iFollow === true ? '你关注了 TA' : '';
    if (relation) rows.push(['关系', relation]);
    return rows;
  }

  const api = { collectUsers, formatCount, tierOf, badgeText, badgeTitle, ratioOf, formatRatio, relationTag, accountAge, detailRows };
  globalThis.XFCWalker = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
