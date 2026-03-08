// Nakama server-side runtime module for profile metadata and playlist persistence.
//
// RPCs:
//   update_profile  — merges validated fields into user metadata
//   get_profile     — returns user profile with metadata
//   list_playlists  — paginated list of user's playlists (cursor-based)
//   save_playlist   — create or update a playlist
//   delete_playlist — delete a playlist by ID
//
// Metadata schema:
// {
//   bio: string          (max 200 chars)
//   favorite_song: string (max 100 chars)
//   links: Array<{ label: string, url: string }>  (max 3 entries)
//   background_url: string (max 500 chars)
// }
//
// Playlist storage (collection: 'playlists', key: playlist UUID):
// {
//   name: string           (max 60 chars)
//   items: PlaylistTrack[] (max 100 items)
//   createdAt: number      (epoch ms)
//   updatedAt: number      (epoch ms)
// }

var MAX_BIO = 200;
var MAX_SONG = 100;
var MAX_LINKS = 3;
var MAX_LABEL = 30;
var MAX_URL = 500;

function validateProfileInput(input) {
  var result = {};

  if (input.bio !== undefined) {
    if (typeof input.bio !== 'string') throw 'bio must be a string';
    result.bio = input.bio.trim().substring(0, MAX_BIO);
  }

  if (input.favorite_song !== undefined) {
    if (typeof input.favorite_song !== 'string') throw 'favorite_song must be a string';
    result.favorite_song = input.favorite_song.trim().substring(0, MAX_SONG);
  }

  if (input.links !== undefined) {
    if (!Array.isArray(input.links)) throw 'links must be an array';
    result.links = input.links.slice(0, MAX_LINKS).map(function (link) {
      if (!link.label || !link.url) throw 'each link must have label and url';
      return {
        label: String(link.label).trim().substring(0, MAX_LABEL),
        url: String(link.url).trim().substring(0, MAX_URL),
      };
    });
  }

  if (input.background_url !== undefined) {
    if (typeof input.background_url !== 'string') throw 'background_url must be a string';
    result.background_url = input.background_url.trim().substring(0, MAX_URL);
  }

  return result;
}

var updateProfileRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  var validated = validateProfileInput(input);

  var account = nk.accountGetId(ctx.userId);
  var current = {};
  if (account.user && account.user.metadata) {
    current = account.user.metadata;
  }

  // Merge: validated fields overwrite, rest preserved
  var merged = {};
  for (var k in current) {
    if (current.hasOwnProperty(k)) merged[k] = current[k];
  }
  for (var k in validated) {
    if (validated.hasOwnProperty(k)) merged[k] = validated[k];
  }

  // accountUpdateId(userId, username, displayName, timezone, location, langTag, avatarUrl, metadata)
  nk.accountUpdateId(ctx.userId, null, null, null, null, null, null, merged);

  logger.info('Profile metadata updated for user %s', ctx.userId);
  return JSON.stringify({ success: true, metadata: merged });
};

var getProfileRpc = function (ctx, logger, nk, payload) {
  var input = {};
  if (payload) {
    try {
      input = JSON.parse(payload);
    } catch (e) {
      throw 'Invalid JSON payload';
    }
  }

  var targetUserId = input.user_id || ctx.userId;

  var account = nk.accountGetId(targetUserId);
  if (!account || !account.user) {
    throw 'User not found';
  }

  return JSON.stringify({
    user_id: account.user.id,
    username: account.user.username,
    display_name: account.user.displayName || '',
    avatar_url: account.user.avatarUrl || '',
    metadata: account.user.metadata || {},
  });
};

// ─── Rate Limiting ──────────────────────────────────────────────────

var RATE_LIMIT_COLLECTION = 'rate_limits';
var SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
var REG_LIMIT_WINDOW_SEC = 3600;   // 1 hour window
var REG_LIMIT_MAX = 5;             // 5 registrations per IP per hour
var LOGIN_LIMIT_WINDOW_SEC = 300;  // 5 minute window
var LOGIN_LIMIT_MAX = 10;          // 10 login attempts per IP per 5 min

function checkRateLimit(nk, logger, ip, limitType, windowSec, maxAttempts) {
  var key = limitType + '_' + ip.replace(/[^a-zA-Z0-9]/g, '_');
  var now = Math.floor(Date.now() / 1000);

  var objects = nk.storageRead([{
    collection: RATE_LIMIT_COLLECTION,
    key: key,
    userId: SYSTEM_USER_ID
  }]);

  var record = null;
  if (objects && objects.length > 0 && objects[0].value) {
    record = objects[0].value;
  }

  if (record && (now - record.windowStart) < windowSec) {
    if (record.count >= maxAttempts) {
      logger.warn('Rate limit exceeded: %s ip=%s count=%d', limitType, ip, record.count);
      return false;
    }
    record.count = record.count + 1;
  } else {
    record = { windowStart: now, count: 1 };
  }

  nk.storageWrite([{
    collection: RATE_LIMIT_COLLECTION,
    key: key,
    userId: SYSTEM_USER_ID,
    value: record,
    permissionRead: 0,
    permissionWrite: 0
  }]);

  return true;
}

var beforeAuthenticateEmail = function (ctx, logger, nk, data) {
  var ip = ctx.clientIp || 'unknown';

  if (data.create) {
    if (!checkRateLimit(nk, logger, ip, 'register', REG_LIMIT_WINDOW_SEC, REG_LIMIT_MAX)) {
      throw 'Too many registration attempts. Please try again later.';
    }
  } else {
    if (!checkRateLimit(nk, logger, ip, 'login', LOGIN_LIMIT_WINDOW_SEC, LOGIN_LIMIT_MAX)) {
      throw 'Too many login attempts. Please try again later.';
    }
  }

  return data;
};

// ─── Playlist Persistence ───────────────────────────────────────────

var PLAYLIST_COLLECTION = 'playlists';
var MAX_PLAYLISTS = 50;
var MAX_TRACKS_PER_PLAYLIST = 100;
var MAX_PLAYLIST_NAME = 60;
var PLAYLIST_PAGE_SIZE = 20;
var MAX_TRACK_TITLE = 200;
var MAX_TRACK_LINK = 500;

function validatePlaylistItems(items) {
  if (!Array.isArray(items)) throw 'items must be an array';
  var validated = items.slice(0, MAX_TRACKS_PER_PLAYLIST);
  return validated.map(function (item, idx) {
    if (!item || typeof item !== 'object') throw 'item at index ' + idx + ' is invalid';
    if (typeof item.id !== 'string' || !item.id) throw 'item.id is required at index ' + idx;
    if (typeof item.title !== 'string') throw 'item.title must be a string at index ' + idx;
    if (typeof item.link !== 'string') throw 'item.link must be a string at index ' + idx;
    var duration = typeof item.duration === 'number' ? item.duration : 0;
    return {
      id: item.id,
      title: item.title.substring(0, MAX_TRACK_TITLE),
      link: item.link.substring(0, MAX_TRACK_LINK),
      duration: duration
    };
  });
}

function countUserPlaylists(nk, userId) {
  var count = 0;
  var cursor = '';
  do {
    var result = nk.storageList(userId, PLAYLIST_COLLECTION, PLAYLIST_PAGE_SIZE, cursor);
    var objects = result.objects || result || [];
    if (Array.isArray(objects)) {
      count += objects.length;
    }
    cursor = result.cursor || '';
  } while (cursor);
  return count;
}

var listPlaylistsRpc = function (ctx, logger, nk, payload) {
  var input = {};
  if (payload) {
    try {
      input = JSON.parse(payload);
    } catch (e) {
      throw 'Invalid JSON payload';
    }
  }

  var cursor = input.cursor || '';
  var result = nk.storageList(ctx.userId, PLAYLIST_COLLECTION, PLAYLIST_PAGE_SIZE, cursor);
  var objects = result.objects || result || [];

  var playlists = [];
  if (Array.isArray(objects)) {
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var val = obj.value || {};
      playlists.push({
        id: obj.key,
        name: val.name || '',
        items: val.items || [],
        createdAt: val.createdAt || 0,
        updatedAt: val.updatedAt || 0
      });
    }
  }

  var nextCursor = result.cursor || null;

  return JSON.stringify({
    playlists: playlists,
    cursor: nextCursor
  });
};

var savePlaylistRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  if (typeof input.id !== 'string' || !input.id) throw 'id is required';
  if (typeof input.name !== 'string' || !input.name.trim()) throw 'name is required';

  var name = input.name.trim().substring(0, MAX_PLAYLIST_NAME);
  var items = validatePlaylistItems(input.items || []);

  // Check if this is an existing playlist or new
  var existing = nk.storageRead([{
    collection: PLAYLIST_COLLECTION,
    key: input.id,
    userId: ctx.userId
  }]);

  var now = Date.now();
  var createdAt = now;

  if (existing && existing.length > 0 && existing[0].value) {
    createdAt = existing[0].value.createdAt || now;
  } else {
    // New playlist — enforce limit
    var count = countUserPlaylists(nk, ctx.userId);
    if (count >= MAX_PLAYLISTS) {
      throw 'Playlist limit reached (max ' + MAX_PLAYLISTS + ')';
    }
  }

  var value = {
    name: name,
    items: items,
    createdAt: createdAt,
    updatedAt: now
  };

  nk.storageWrite([{
    collection: PLAYLIST_COLLECTION,
    key: input.id,
    userId: ctx.userId,
    value: value,
    permissionRead: 1,
    permissionWrite: 1
  }]);

  logger.info('Playlist saved for user %s: %s (%d tracks)', ctx.userId, input.id, items.length);
  return JSON.stringify({
    success: true,
    playlist: {
      id: input.id,
      name: name,
      items: items,
      createdAt: createdAt,
      updatedAt: now
    }
  });
};

var deletePlaylistRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  if (typeof input.id !== 'string' || !input.id) throw 'id is required';

  nk.storageDelete([{
    collection: PLAYLIST_COLLECTION,
    key: input.id,
    userId: ctx.userId
  }]);

  logger.info('Playlist deleted for user %s: %s', ctx.userId, input.id);
  return JSON.stringify({ success: true });
};

// ─── InitModule ─────────────────────────────────────────────────────

var InitModule = function (ctx, logger, nk, initializer) {
  initializer.registerRpc('update_profile', updateProfileRpc);
  initializer.registerRpc('get_profile', getProfileRpc);
  initializer.registerRpc('list_playlists', listPlaylistsRpc);
  initializer.registerRpc('save_playlist', savePlaylistRpc);
  initializer.registerRpc('delete_playlist', deletePlaylistRpc);
  initializer.registerBeforeAuthenticateEmail(beforeAuthenticateEmail);
  logger.info('Modules loaded: RPCs (update_profile, get_profile, list_playlists, save_playlist, delete_playlist), hooks (beforeAuthenticateEmail)');
};
