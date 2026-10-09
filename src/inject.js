(() => {
  'use strict';
  try {
    const { collectUsers } = globalThis.XFCWalker;
    const cache = new Map(), pending = new Map();
    let timer, parsed = 0, sentParsed = 0;
    const relevant = url => typeof url === 'string' && (url.includes('/graphql/') || url.includes('/i/api/'));
    function schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        try {
          const data = Object.fromEntries(pending);
          pending.clear();
          if (Object.keys(data).length || parsed !== sentParsed) {
            window.postMessage({ source: 'xfc-main', type: 'counts', data, parsed }, location.origin);
            sentParsed = parsed;
          }
        } catch { /* Instrumentation must never affect the page. */ }
      }, 50);
    }
    function consume(body, decoded = false) {
      try {
        if (!decoded) body = JSON.parse(body);
        parsed++;
        schedule();
        if (!body || typeof body !== 'object') return;
        // Forward complete walker records; the isolated script validates each field.
        for (const [key, value] of Object.entries(collectUsers(body))) {
          cache.delete(key);
          cache.set(key, value);
          pending.set(key, value);
          if (cache.size > 5000) cache.delete(cache.keys().next().value);
          if (pending.size > 5000) pending.delete(pending.keys().next().value);
        }
        schedule();
      } catch { /* Ignore malformed or unexpected payloads. */ }
    }
    window.addEventListener('message', event => {
      try {
        if (event.source !== window || event.origin !== location.origin ||
            event.data?.source !== 'xfc-content' || event.data.type !== 'ready') return;
        for (const [key, value] of cache) pending.set(key, value);
        sentParsed = -1; // Replay the total even when no users were found before ready.
        schedule();
      } catch { /* Ignore unrelated messages. */ }
    });

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      // Return the original promise and response; inspection uses a separate clone.
      const promise = Reflect.apply(originalFetch, this, args);
      try {
        promise.then(response => {
          try {
            const input = args[0];
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
            if (!relevant(response.url) && !relevant(url)) return;
            const copy = response.clone();
            copy.text().then(consume, () => {}).catch(() => {});
          } catch { /* Cloning may fail for an already consumed response. */ }
        }, () => {}).catch(() => {});
      } catch { /* Keep native fetch behavior even if instrumentation fails. */ }
      return promise;
    };

    const proto = XMLHttpRequest.prototype, originalOpen = proto.open;
    const urls = new WeakMap(), observed = new WeakSet();
    proto.open = function (...args) {
      const result = Reflect.apply(originalOpen, this, args);
      try {
        urls.set(this, typeof args[1] === 'string' ? args[1] : args[1] instanceof URL ? args[1].href : '');
        if (!observed.has(this)) {
          this.addEventListener('load', () => {
            try {
              if (!relevant(this.responseURL) && !relevant(urls.get(this))) return;
              if (this.responseType === 'json' && this.response !== null) consume(this.response, true);
              else if (!this.responseType || this.responseType === 'text') consume(this.responseText);
            } catch { /* Binary responses and inaccessible bodies are ignored. */ }
          });
          observed.add(this);
        }
      } catch { /* Preserve native open's result and errors. */ }
      return result;
    };
  } catch { /* Fail quietly if the page disallows wrapping a native method. */ }
})();
