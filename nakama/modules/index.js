// Nakama server-side runtime module for profile metadata management.
//
// RPCs:
//   update_profile — merges validated fields into user metadata
//   get_profile    — returns user profile with metadata
//
// Metadata schema:
// {
//   bio: string          (max 200 chars)
//   favorite_song: string (max 100 chars)
//   links: Array<{ label: string, url: string }>  (max 3 entries)
//   background_url: string (max 500 chars)
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

var InitModule = function (ctx, logger, nk, initializer) {
  initializer.registerRpc('update_profile', updateProfileRpc);
  initializer.registerRpc('get_profile', getProfileRpc);
  logger.info('Profile module loaded: update_profile, get_profile RPCs registered');
};
