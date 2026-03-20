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

// ─── Direct Messaging ───────────────────────────────────────────────

var DM_MESSAGES_COLLECTION = 'dm_messages';
var DM_CONVERSATIONS_COLLECTION = 'dm_conversations';
var DM_MAX_SUBJECT = 100;
var DM_MAX_BODY = 2000;
var DM_RATE_LIMIT_WINDOW = 60;  // seconds
var DM_RATE_LIMIT_MAX = 10;     // messages per window
var DM_PAGE_SIZE = 50;
var DM_NOTIFICATION_CODE = 100;

/**
 * send_message RPC — send a DM to another user.
 * Writes two copies (sender + recipient), updates conversation indexes,
 * and sends a Nakama notification to the recipient.
 *
 * Input: { recipient_id, subject, body }
 * Output: { messageId, createdAt }
 */
var sendMessageRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  var recipientId = input.recipient_id;
  var subject = input.subject;
  var body = input.body;

  if (!recipientId || typeof recipientId !== 'string') throw 'recipient_id is required';
  if (!subject || typeof subject !== 'string') throw 'subject is required';
  if (!body || typeof body !== 'string') throw 'body is required';

  subject = subject.trim().substring(0, DM_MAX_SUBJECT);
  body = body.trim().substring(0, DM_MAX_BODY);

  if (!subject) throw 'subject cannot be empty';
  if (!body) throw 'body cannot be empty';

  // Prevent sending to self
  if (recipientId === ctx.userId) throw 'Cannot message yourself';

  // Rate limit
  if (!checkRateLimit(nk, logger, ctx.userId, 'dm_send', DM_RATE_LIMIT_WINDOW, DM_RATE_LIMIT_MAX)) {
    throw 'Too many messages. Please wait before sending more.';
  }

  // Verify recipient exists
  var recipientAccount;
  try {
    recipientAccount = nk.accountGetId(recipientId);
  } catch (e) {
    throw 'Recipient not found';
  }
  if (!recipientAccount || !recipientAccount.user) throw 'Recipient not found';

  var senderAccount = nk.accountGetId(ctx.userId);
  var senderUsername = (senderAccount.user && senderAccount.user.username) || 'Unknown';
  var recipientUsername = recipientAccount.user.username || 'Unknown';

  var messageId = nk.uuidv4();
  var now = Date.now();
  // Zero-padded timestamp for lexicographic sorting
  var tsKey = ('0000000000000' + now).slice(-13) + '_' + messageId;

  var messageValue = {
    messageId: messageId,
    senderId: ctx.userId,
    recipientId: recipientId,
    senderUsername: senderUsername,
    recipientUsername: recipientUsername,
    subject: subject,
    body: body,
    createdAt: now,
    read: false
  };

  // Write sender copy (read=true) and recipient copy (read=false)
  var senderCopy = {};
  for (var k in messageValue) {
    if (messageValue.hasOwnProperty(k)) senderCopy[k] = messageValue[k];
  }
  senderCopy.read = true;

  nk.storageWrite([
    {
      collection: DM_MESSAGES_COLLECTION,
      key: tsKey,
      userId: ctx.userId,
      value: senderCopy,
      permissionRead: 1,
      permissionWrite: 0
    },
    {
      collection: DM_MESSAGES_COLLECTION,
      key: tsKey,
      userId: recipientId,
      value: messageValue,
      permissionRead: 1,
      permissionWrite: 0
    }
  ]);

  // Update conversation indexes for both users
  var preview = body.substring(0, 80);

  // Sender's conversation index (with recipient)
  updateConversationIndex(nk, ctx.userId, recipientId, recipientUsername, preview, now, 0);
  // Recipient's conversation index (with sender) — increment unread
  updateConversationIndex(nk, recipientId, ctx.userId, senderUsername, preview, now, 1);

  // Send notification to recipient
  try {
    nk.notificationSend(
      recipientId,
      'New message from ' + senderUsername,
      DM_NOTIFICATION_CODE,
      {
        messageId: messageId,
        senderId: ctx.userId,
        senderUsername: senderUsername,
        subject: subject,
        preview: preview
      },
      ctx.userId,
      false
    );
  } catch (e) {
    logger.warn('Failed to send DM notification: %s', e);
  }

  logger.info('DM sent from %s to %s: %s', ctx.userId, recipientId, messageId);
  return JSON.stringify({ messageId: messageId, createdAt: now });
};

/**
 * Update or create a conversation index entry.
 * If incrementUnread > 0, adds to existing unreadCount.
 */
function updateConversationIndex(nk, userId, otherUserId, otherUsername, preview, timestamp, incrementUnread) {
  var existing = nk.storageRead([{
    collection: DM_CONVERSATIONS_COLLECTION,
    key: otherUserId,
    userId: userId
  }]);

  var unreadCount = incrementUnread;
  if (existing && existing.length > 0 && existing[0].value) {
    if (incrementUnread > 0) {
      unreadCount = (existing[0].value.unreadCount || 0) + incrementUnread;
    }
  }

  nk.storageWrite([{
    collection: DM_CONVERSATIONS_COLLECTION,
    key: otherUserId,
    userId: userId,
    value: {
      otherUserId: otherUserId,
      otherUsername: otherUsername,
      lastMessagePreview: preview,
      lastMessageAt: timestamp,
      unreadCount: unreadCount
    },
    permissionRead: 1,
    permissionWrite: 0
  }]);
}

/**
 * list_conversations RPC — list conversation partners with last message info.
 *
 * Input: { cursor? }
 * Output: { conversations: ConversationSummary[], cursor? }
 */
var listConversationsRpc = function (ctx, logger, nk, payload) {
  var input = {};
  if (payload) {
    try {
      input = JSON.parse(payload);
    } catch (e) {
      throw 'Invalid JSON payload';
    }
  }

  var cursor = input.cursor || '';
  var result = nk.storageList(ctx.userId, DM_CONVERSATIONS_COLLECTION, DM_PAGE_SIZE, cursor);
  var objects = result.objects || result || [];

  var conversations = [];
  if (Array.isArray(objects)) {
    for (var i = 0; i < objects.length; i++) {
      var val = objects[i].value || {};
      conversations.push({
        otherUserId: val.otherUserId || objects[i].key || '',
        otherUsername: val.otherUsername || '',
        lastMessagePreview: val.lastMessagePreview || '',
        lastMessageAt: val.lastMessageAt || 0,
        unreadCount: val.unreadCount || 0
      });
    }
  }

  // Sort by most recent first
  conversations.sort(function (a, b) { return b.lastMessageAt - a.lastMessageAt; });

  return JSON.stringify({
    conversations: conversations,
    cursor: result.cursor || null
  });
};

/**
 * get_messages RPC — get messages for a conversation with a specific user.
 * Uses key prefix scanning since keys are "{timestamp}_{messageId}".
 *
 * Input: { other_user_id, cursor? }
 * Output: { messages: MailMessage[], cursor? }
 */
var getMessagesRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  var otherUserId = input.other_user_id;
  if (!otherUserId) throw 'other_user_id is required';

  var cursor = input.cursor || '';
  var allMessages = [];
  var nextCursor = cursor;

  // Scan through messages and filter by conversation partner
  // We may need multiple pages since not all messages are with this partner
  var scanned = 0;
  var maxScans = 5; // Prevent runaway scanning

  while (scanned < maxScans) {
    var result = nk.storageList(ctx.userId, DM_MESSAGES_COLLECTION, DM_PAGE_SIZE, nextCursor);
    var objects = result.objects || result || [];

    if (!Array.isArray(objects) || objects.length === 0) {
      nextCursor = '';
      break;
    }

    for (var i = 0; i < objects.length; i++) {
      var msg = objects[i].value || {};
      // Match if the other user is either sender or recipient
      var isMatch = (msg.senderId === otherUserId || msg.recipientId === otherUserId);
      if (isMatch) {
        allMessages.push(msg);
      }
    }

    nextCursor = result.cursor || '';
    scanned++;

    // Stop if we have enough messages or no more pages
    if (allMessages.length >= DM_PAGE_SIZE || !nextCursor) break;
  }

  // Messages are already in chronological order (keys are timestamp-based)
  // Reverse so newest first
  allMessages.reverse();

  // Trim to page size
  if (allMessages.length > DM_PAGE_SIZE) {
    allMessages = allMessages.slice(0, DM_PAGE_SIZE);
  }

  return JSON.stringify({
    messages: allMessages,
    cursor: nextCursor || null
  });
};

/**
 * mark_read RPC — mark a conversation as read.
 * Resets unread count on the conversation index.
 *
 * Input: { other_user_id }
 * Output: { success: true }
 */
var markReadRpc = function (ctx, logger, nk, payload) {
  var input;
  try {
    input = JSON.parse(payload);
  } catch (e) {
    throw 'Invalid JSON payload';
  }

  var otherUserId = input.other_user_id;
  if (!otherUserId) throw 'other_user_id is required';

  // Read existing conversation index
  var existing = nk.storageRead([{
    collection: DM_CONVERSATIONS_COLLECTION,
    key: otherUserId,
    userId: ctx.userId
  }]);

  if (existing && existing.length > 0 && existing[0].value) {
    var val = existing[0].value;
    val.unreadCount = 0;

    nk.storageWrite([{
      collection: DM_CONVERSATIONS_COLLECTION,
      key: otherUserId,
      userId: ctx.userId,
      value: val,
      permissionRead: 1,
      permissionWrite: 0
    }]);
  }

  return JSON.stringify({ success: true });
};

// ─── InitModule ─────────────────────────────────────────────────────

var InitModule = function (ctx, logger, nk, initializer) {
  initializer.registerRpc('update_profile', updateProfileRpc);
  initializer.registerRpc('get_profile', getProfileRpc);
  initializer.registerRpc('list_playlists', listPlaylistsRpc);
  initializer.registerRpc('save_playlist', savePlaylistRpc);
  initializer.registerRpc('delete_playlist', deletePlaylistRpc);
  initializer.registerRpc('send_message', sendMessageRpc);
  initializer.registerRpc('list_conversations', listConversationsRpc);
  initializer.registerRpc('get_messages', getMessagesRpc);
  initializer.registerRpc('mark_read', markReadRpc);
  initializer.registerBeforeAuthenticateEmail(beforeAuthenticateEmail);
  logger.info('Modules loaded: RPCs (update_profile, get_profile, list_playlists, save_playlist, delete_playlist, send_message, list_conversations, get_messages, mark_read), hooks (beforeAuthenticateEmail)');
};
