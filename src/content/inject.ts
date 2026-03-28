// 페이지 컨텍스트에 주입할 fetch interceptor 코드
// TypeScript를 사용할 수 없으므로 순수 JS 문자열로 작성
export const FETCH_INTERCEPTOR_CODE = `(function() {
  var MESSAGE_TYPES = {
    BADGE_DATA: 'BBR_BADGE_DATA',
    TOKEN_DATA: 'BBR_TOKEN_DATA',
    USER_ID: 'BBR_USER_ID',
    CSRF_TOKEN: 'BBR_CSRF_TOKEN',
    FOLLOW_DATA: 'BBR_FOLLOW_DATA'
  };

  var X_GRAPHQL_ENDPOINTS = ['/i/api/graphql/', '/i/api/2/'];

  var originalFetch = window.fetch;

  window.fetch = function patchedFetch(input, init) {
    var url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Bearer 토큰 추출
    var authHeader = extractHeader(init, 'authorization');
    if (authHeader) {
      window.postMessage({ type: MESSAGE_TYPES.TOKEN_DATA, token: authHeader.replace('Bearer ', '') }, '*');
    }

    // CSRF 토큰 추출
    var csrfHeader = extractHeader(init, 'x-csrf-token');
    if (csrfHeader) {
      window.postMessage({ type: MESSAGE_TYPES.CSRF_TOKEN, csrfToken: csrfHeader }, '*');
    }

    return originalFetch.call(window, input, init).then(function(response) {
      var isGraphQL = X_GRAPHQL_ENDPOINTS.some(function(ep) { return url.includes(ep); });
      if (isGraphQL) {
        try {
          var cloned = response.clone();
          cloned.json().then(function(data) {
            extractBadgeData(data);
            extractViewerUserId(data);
            var urlLower = url.toLowerCase();
            if (urlLower.includes('follow')) {
              extractFollowData(data);
            }
          }).catch(function() {});
        } catch(e) {}
      }
      return response;
    });
  };

  function extractHeader(init, headerName) {
    if (!init || !init.headers) return null;
    if (init.headers instanceof Headers) return init.headers.get(headerName);
    if (Array.isArray(init.headers)) {
      var entry = init.headers.find(function(h) { return h[0].toLowerCase() === headerName; });
      return entry ? entry[1] : null;
    }
    var lowerName = headerName.toLowerCase();
    var keys = Object.keys(init.headers);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === lowerName) return init.headers[keys[i]];
    }
    return null;
  }

  function extractBadgeData(data) {
    var users = [];
    findUserObjects(data, users);
    if (users.length > 0) {
      window.postMessage({ type: MESSAGE_TYPES.BADGE_DATA, users: users }, '*');
    }
  }

  function extractViewerUserId(data) {
    var viewerId = findViewerId(data);
    if (viewerId) {
      window.postMessage({ type: MESSAGE_TYPES.USER_ID, userId: viewerId }, '*');
    }
  }

  function extractFollowData(data) {
    var userIds = [];
    findFollowedUserIds(data, userIds);
    if (userIds.length > 0) {
      window.postMessage({ type: MESSAGE_TYPES.FOLLOW_DATA, userIds: userIds }, '*');
    }
  }

  function findViewerId(obj) {
    if (obj === null || typeof obj !== 'object') return null;
    if ('viewer' in obj) {
      var viewer = obj.viewer;
      if (viewer && typeof viewer.rest_id === 'string') return viewer.rest_id;
      var nested = findViewerId(viewer);
      if (nested) return nested;
    }
    if ('viewer_v2' in obj) {
      var n = findViewerId(obj.viewer_v2);
      if (n) return n;
    }
    var wrappers = ['data', 'result', 'user'];
    for (var i = 0; i < wrappers.length; i++) {
      if (wrappers[i] in obj && typeof obj[wrappers[i]] === 'object') {
        var r = findViewerId(obj[wrappers[i]]);
        if (r) return r;
      }
    }
    return null;
  }

  function findFollowedUserIds(obj, result) {
    if (obj === null || typeof obj !== 'object') return;
    if ('user_results' in obj) {
      var ur = obj.user_results;
      if (ur && ur.result && typeof ur.result.rest_id === 'string') {
        result.push(ur.result.rest_id);
      }
    }
    var values = Object.values(obj);
    for (var i = 0; i < values.length; i++) {
      if (Array.isArray(values[i])) {
        values[i].forEach(function(item) { findFollowedUserIds(item, result); });
      } else if (typeof values[i] === 'object') {
        findFollowedUserIds(values[i], result);
      }
    }
  }

  function findUserObjects(obj, result) {
    if (obj === null || typeof obj !== 'object') return;
    if ('rest_id' in obj && 'is_blue_verified' in obj) {
      result.push({
        rest_id: obj.rest_id,
        is_blue_verified: obj.is_blue_verified,
        verified_type: obj.verified_type,
        legacy: obj.legacy
      });
    }
    var values = Object.values(obj);
    for (var i = 0; i < values.length; i++) {
      if (Array.isArray(values[i])) {
        values[i].forEach(function(item) { findUserObjects(item, result); });
      } else if (typeof values[i] === 'object') {
        findUserObjects(values[i], result);
      }
    }
  }
})();`;
