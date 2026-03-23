/**
 * OS5kApp — Shared module for OS5000k apps
 * Provides bridge setup, UI builders, utilities, and theming.
 */
var OS5kApp = (function () {
  'use strict';

  // ── Theme definitions ───────────────────────────────────────────────
  var themes = {
    default: {
      '--os5k-bg': '#fff',
      '--os5k-text': '#222',
      '--os5k-accent': '#44f',
      '--os5k-toolbar-bg': 'linear-gradient(#f0f0f0, #ddd)',
      '--os5k-toolbar-border': '#bbb',
      '--os5k-btn-bg': 'linear-gradient(#f8f8f8, #ddd)',
      '--os5k-btn-border': '#aaa',
      '--os5k-btn-hover-bg': 'linear-gradient(#fff, #e8e8ff)',
      '--os5k-btn-hover-border': '#88f',
      '--os5k-border': '#ddd',
      '--os5k-border-strong': '#ccc',
      '--os5k-muted': '#999',
      '--os5k-row-alt': '#fafafa',
      '--os5k-row-hover': '#e8e8f8',
      '--os5k-font': 'arial, sans-serif',
      '--os5k-font-size': '13px'
    },
    mutantbook: {
      '--os5k-bg': '#e9ebee',
      '--os5k-text': '#1c1e21',
      '--os5k-accent': '#3b5998',
      '--os5k-toolbar-bg': 'linear-gradient(180deg, #4267B2, #3b5998)',
      '--os5k-toolbar-border': '#29487d',
      '--os5k-toolbar-text': '#fff',
      '--os5k-btn-bg': '#5b74a8',
      '--os5k-btn-border': '#29447e',
      '--os5k-btn-text': '#fff',
      '--os5k-btn-hover-bg': '#6d8bc4',
      '--os5k-btn-hover-border': '#3b5998',
      '--os5k-border': '#dddfe2',
      '--os5k-border-strong': '#ccd0d5',
      '--os5k-muted': '#90949c',
      '--os5k-row-alt': '#f6f7f8',
      '--os5k-row-hover': '#e4e8f0',
      '--os5k-font': "'Lucida Grande', Tahoma, Verdana, Arial, sans-serif",
      '--os5k-font-size': '12px'
    },
    mutanttube: {
      '--os5k-bg': '#f2f2f2',
      '--os5k-text': '#333',
      '--os5k-accent': '#cd201f',
      '--os5k-toolbar-bg': 'linear-gradient(180deg, #fff, #e8e8e8)',
      '--os5k-toolbar-border': '#cd201f',
      '--os5k-toolbar-text': '#333',
      '--os5k-btn-bg': 'linear-gradient(#f8f8f8, #ddd)',
      '--os5k-btn-border': '#bbb',
      '--os5k-btn-text': '#333',
      '--os5k-btn-hover-bg': 'linear-gradient(#fff, #eee)',
      '--os5k-btn-hover-border': '#cd201f',
      '--os5k-border': '#ddd',
      '--os5k-border-strong': '#ccc',
      '--os5k-muted': '#666',
      '--os5k-row-alt': '#fff',
      '--os5k-row-hover': '#f9f0f0',
      '--os5k-font': 'Arial, sans-serif',
      '--os5k-font-size': '12px'
    }
  };

  // ── Bridge init ─────────────────────────────────────────────────────
  function init(themeName, callback) {
    var theme = themes[themeName] || themes['default'];
    applyTheme(theme);

    if (typeof OS5000k !== 'undefined') {
      callback(OS5000k);
    } else {
      var attempts = 0;
      var check = setInterval(function () {
        attempts++;
        if (typeof OS5000k !== 'undefined') {
          clearInterval(check);
          callback(OS5000k);
        } else if (attempts > 50) {
          clearInterval(check);
          callback(null);
        }
      }, 100);
    }
  }

  function applyTheme(vars) {
    var root = document.documentElement;
    for (var key in vars) {
      if (vars.hasOwnProperty(key)) {
        root.style.setProperty(key, vars[key]);
      }
    }
  }

  // ── UI Builders ─────────────────────────────────────────────────────

  /**
   * Create a toolbar element.
   * @param {string} title — toolbar title text
   * @param {string} [icon] — optional emoji/icon
   * @param {Array<{label:string, onclick:function, className?:string, id?:string, style?:string}>} [buttons]
   * @returns {HTMLElement}
   */
  function toolbar(title, icon, buttons) {
    var el = document.createElement('div');
    el.className = 'os5k-toolbar';
    var html = '<span class="os5k-toolbar-title">';
    if (icon) html += '<span class="os5k-toolbar-icon">' + icon + '</span> ';
    html += esc(title) + '</span>';
    html += '<div class="os5k-toolbar-spacer"></div>';
    if (buttons) {
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        html += '<button class="os5k-btn' + (b.className ? ' ' + b.className : '') + '"';
        if (b.id) html += ' id="' + b.id + '"';
        if (b.style) html += ' style="' + b.style + '"';
        html += '>' + b.label + '</button>';
      }
    }
    el.innerHTML = html;
    // Attach click handlers after innerHTML
    if (buttons) {
      var btnEls = el.querySelectorAll('.os5k-btn');
      for (var j = 0; j < buttons.length; j++) {
        if (buttons[j].onclick) {
          btnEls[j].addEventListener('click', buttons[j].onclick);
        }
      }
    }
    return el;
  }

  /**
   * Create tabbed navigation.
   * @param {Array<{label:string, id?:string, badge?:number}>} tabDefs
   * @param {function(index:number)} onSwitch
   * @returns {HTMLElement}
   */
  function tabs(tabDefs, onSwitch) {
    var el = document.createElement('div');
    el.className = 'os5k-tabs';
    var html = '';
    for (var i = 0; i < tabDefs.length; i++) {
      var t = tabDefs[i];
      html += '<button class="os5k-tab' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"';
      if (t.id) html += ' id="' + t.id + '"';
      html += '>' + esc(t.label);
      if (t.badge && t.badge > 0) {
        html += ' <span class="os5k-badge">' + t.badge + '</span>';
      }
      html += '</button>';
    }
    el.innerHTML = html;

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.os5k-tab');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-index'));
      var allTabs = el.querySelectorAll('.os5k-tab');
      for (var k = 0; k < allTabs.length; k++) {
        allTabs[k].className = 'os5k-tab' + (k === idx ? ' active' : '');
      }
      if (onSwitch) onSwitch(idx);
    });

    return el;
  }

  /**
   * Create a scrollable list.
   * @param {Array} items
   * @param {function(item, index):string} renderFn — returns HTML string per item
   * @returns {HTMLElement}
   */
  function list(items, renderFn) {
    var el = document.createElement('div');
    el.className = 'os5k-list';
    if (!items || items.length === 0) {
      el.innerHTML = '';
      return el;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += renderFn(items[i], i);
    }
    el.innerHTML = html;
    return el;
  }

  /**
   * Create a feed/timeline layout.
   * @param {Array} items
   * @param {function(item, index):string} renderFn — returns HTML string per item
   * @returns {HTMLElement}
   */
  function feed(items, renderFn) {
    var el = document.createElement('div');
    el.className = 'os5k-feed';
    if (!items || items.length === 0) {
      el.innerHTML = '';
      return el;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += renderFn(items[i], i);
    }
    el.innerHTML = html;
    return el;
  }

  /**
   * Create a "Load More" button.
   * @param {function} loadMoreFn
   * @returns {HTMLElement}
   */
  function pagination(loadMoreFn) {
    var el = document.createElement('div');
    el.className = 'os5k-pagination';
    el.innerHTML = '<button class="os5k-btn os5k-load-more">Load More</button>';
    el.querySelector('.os5k-load-more').addEventListener('click', function () {
      this.textContent = 'Loading...';
      this.disabled = true;
      loadMoreFn();
    });
    return el;
  }

  /**
   * Create a loading indicator.
   * @param {string} [message]
   * @returns {HTMLElement}
   */
  function loading(message) {
    var el = document.createElement('div');
    el.className = 'os5k-loading';
    el.textContent = message || 'Loading...';
    return el;
  }

  /**
   * Create an empty state message.
   * @param {string} message
   * @returns {HTMLElement}
   */
  function empty(message) {
    var el = document.createElement('div');
    el.className = 'os5k-empty';
    el.textContent = message;
    return el;
  }

  /**
   * Create an error message.
   * @param {string} message
   * @returns {HTMLElement}
   */
  function error(message) {
    var el = document.createElement('div');
    el.className = 'os5k-error';
    el.textContent = message;
    return el;
  }

  /**
   * Create a user avatar element.
   * @param {string} [avatarUrl]
   * @param {string} [username]
   * @param {number} [size] — px, default 32
   * @returns {HTMLElement}
   */
  function avatar(avatarUrl, username, size) {
    var s = size || 32;
    var el = document.createElement('div');
    el.className = 'os5k-avatar';
    el.style.width = s + 'px';
    el.style.height = s + 'px';
    el.style.fontSize = Math.floor(s * 0.45) + 'px';
    if (avatarUrl) {
      el.innerHTML = '<img src="' + esc(avatarUrl) + '" onerror="this.parentNode.textContent=\'' + (username ? username.charAt(0).toUpperCase() : '?') + '\'">';
    } else {
      el.textContent = username ? username.charAt(0).toUpperCase() : '?';
    }
    return el;
  }

  /**
   * Create a search bar with debounced input.
   * @param {string} placeholder
   * @param {function(query:string)} onSearch
   * @param {number} [delay] — debounce ms, default 300
   * @returns {HTMLElement}
   */
  function searchBar(placeholder, onSearch, delay) {
    var el = document.createElement('div');
    el.className = 'os5k-search-bar';
    el.innerHTML = '<input type="text" class="os5k-search-input" placeholder="' + esc(placeholder) + '">' +
      '<button class="os5k-btn os5k-search-btn">Search</button>';
    var input = el.querySelector('.os5k-search-input');
    var btn = el.querySelector('.os5k-search-btn');
    var debouncedSearch = debounce(function () {
      var q = input.value.trim();
      if (q) onSearch(q);
    }, delay || 300);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q) onSearch(q);
      }
    });
    input.addEventListener('input', debouncedSearch);
    btn.addEventListener('click', function () {
      var q = input.value.trim();
      if (q) onSearch(q);
    });
    return el;
  }

  // ── Utilities ───────────────────────────────────────────────────────

  /**
   * XSS-safe HTML escaping.
   * @param {string} str
   * @returns {string}
   */
  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * Debounce a function.
   * @param {function} fn
   * @param {number} ms
   * @returns {function}
   */
  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /**
   * Relative time formatting ("2h ago", "yesterday", "Mar 5").
   * @param {number|string} timestamp — epoch ms or ISO string
   * @returns {string}
   */
  function timeAgo(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 172800000) return 'yesterday';
    if (diff < 604800000) {
      var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[d.getDay()];
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Full date/time formatting.
   * @param {number|string} timestamp
   * @returns {string}
   */
  function formatTime(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /**
   * Format seconds to "m:ss" or "h:mm:ss".
   * @param {number|string} seconds — can be number or formatted string like "3:42"
   * @returns {string}
   */
  function formatDuration(seconds) {
    if (typeof seconds === 'string') return seconds;
    if (!seconds || isNaN(seconds)) return '0:00';
    var s = Math.floor(seconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) {
      return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  // ── Base CSS injection ──────────────────────────────────────────────
  function injectBaseStyles() {
    var style = document.createElement('style');
    style.textContent =
      '* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
      'body {\n' +
      '  background: var(--os5k-bg, #fff);\n' +
      '  color: var(--os5k-text, #222);\n' +
      '  font-family: var(--os5k-font, arial, sans-serif);\n' +
      '  font-size: var(--os5k-font-size, 13px);\n' +
      '  height: 100vh;\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  overflow: hidden;\n' +
      '}\n' +
      '.os5k-toolbar {\n' +
      '  display: flex; align-items: center; gap: 6px;\n' +
      '  padding: 5px 8px;\n' +
      '  background: var(--os5k-toolbar-bg);\n' +
      '  border-bottom: 1px solid var(--os5k-toolbar-border, #bbb);\n' +
      '  min-height: 30px;\n' +
      '  color: var(--os5k-toolbar-text, var(--os5k-text));\n' +
      '}\n' +
      '.os5k-toolbar-title { font-weight: bold; display: flex; align-items: center; gap: 4px; }\n' +
      '.os5k-toolbar-icon { font-size: 15px; }\n' +
      '.os5k-toolbar-spacer { flex: 1; }\n' +
      '.os5k-btn {\n' +
      '  background: var(--os5k-btn-bg);\n' +
      '  border: 1px solid var(--os5k-btn-border, #aaa);\n' +
      '  border-radius: 2px;\n' +
      '  color: var(--os5k-btn-text, #333);\n' +
      '  padding: 3px 10px;\n' +
      '  cursor: pointer;\n' +
      '  font-family: inherit;\n' +
      '  font-size: 11px;\n' +
      '  white-space: nowrap;\n' +
      '}\n' +
      '.os5k-btn:hover {\n' +
      '  background: var(--os5k-btn-hover-bg);\n' +
      '  border-color: var(--os5k-btn-hover-border, #88f);\n' +
      '}\n' +
      '.os5k-btn:active { opacity: 0.8; }\n' +
      '.os5k-btn:disabled { opacity: 0.5; cursor: default; }\n' +
      '.os5k-btn-link {\n' +
      '  background: none; border: none;\n' +
      '  color: var(--os5k-accent, #44f);\n' +
      '  cursor: pointer; font-family: inherit; font-size: 12px; padding: 2px 4px;\n' +
      '}\n' +
      '.os5k-btn-link:hover { text-decoration: underline; }\n' +
      '.os5k-tabs {\n' +
      '  display: flex; gap: 0;\n' +
      '  border-bottom: 1px solid var(--os5k-border-strong, #ccc);\n' +
      '  background: var(--os5k-row-alt, #f5f5f5);\n' +
      '  padding: 0 6px;\n' +
      '}\n' +
      '.os5k-tab {\n' +
      '  background: none; border: none;\n' +
      '  border-bottom: 2px solid transparent;\n' +
      '  color: var(--os5k-muted, #666);\n' +
      '  padding: 7px 12px;\n' +
      '  cursor: pointer; font-family: inherit; font-size: 12px;\n' +
      '}\n' +
      '.os5k-tab:hover { color: var(--os5k-text); }\n' +
      '.os5k-tab.active {\n' +
      '  color: var(--os5k-accent, #44f);\n' +
      '  border-bottom-color: var(--os5k-accent, #44f);\n' +
      '  font-weight: bold;\n' +
      '}\n' +
      '.os5k-badge {\n' +
      '  background: var(--os5k-accent, #44f); color: #fff;\n' +
      '  font-size: 10px; padding: 1px 5px; border-radius: 8px;\n' +
      '  margin-left: 4px; font-weight: bold;\n' +
      '}\n' +
      '.os5k-content {\n' +
      '  flex: 1; overflow-y: auto;\n' +
      '}\n' +
      '.os5k-list, .os5k-feed { flex: 1; overflow-y: auto; }\n' +
      '.os5k-loading {\n' +
      '  color: var(--os5k-muted, #999); font-style: italic; padding: 20px; text-align: center;\n' +
      '}\n' +
      '.os5k-empty {\n' +
      '  color: var(--os5k-muted, #999); font-style: italic;\n' +
      '  padding: 40px 20px; text-align: center; line-height: 1.6;\n' +
      '}\n' +
      '.os5k-error {\n' +
      '  color: #c00; padding: 12px;\n' +
      '}\n' +
      '.os5k-pagination {\n' +
      '  text-align: center; padding: 10px;\n' +
      '}\n' +
      '.os5k-avatar {\n' +
      '  border-radius: 2px; background: #ddd; flex-shrink: 0;\n' +
      '  display: flex; align-items: center; justify-content: center;\n' +
      '  color: #666; overflow: hidden;\n' +
      '}\n' +
      '.os5k-avatar img { width: 100%; height: 100%; object-fit: cover; }\n' +
      '.os5k-search-bar {\n' +
      '  display: flex; gap: 0; padding: 0;\n' +
      '}\n' +
      '.os5k-search-input {\n' +
      '  flex: 1; padding: 3px 6px;\n' +
      '  border: 1px solid var(--os5k-border-strong, #bbb);\n' +
      '  font-family: inherit; font-size: 12px;\n' +
      '  border-radius: 2px 0 0 2px; outline: none;\n' +
      '}\n' +
      '.os5k-search-input:focus { border-color: var(--os5k-accent, #44f); }\n' +
      '.os5k-search-btn {\n' +
      '  border-radius: 0 2px 2px 0 !important;\n' +
      '  border-left: 0 !important;\n' +
      '}\n' +
      '.os5k-auth-gate {\n' +
      '  color: var(--os5k-muted, #999); font-style: italic;\n' +
      '  padding: 20px; text-align: center;\n' +
      '  border: 1px dashed var(--os5k-border, #ddd);\n' +
      '  margin: 10px; border-radius: 4px;\n' +
      '}\n';
    document.head.appendChild(style);
  }

  // Inject base styles immediately
  injectBaseStyles();

  // ── Public API ──────────────────────────────────────────────────────
  return {
    init: init,
    toolbar: toolbar,
    tabs: tabs,
    list: list,
    feed: feed,
    pagination: pagination,
    loading: loading,
    empty: empty,
    error: error,
    avatar: avatar,
    searchBar: searchBar,
    esc: esc,
    debounce: debounce,
    timeAgo: timeAgo,
    formatTime: formatTime,
    formatDuration: formatDuration,
    themes: themes
  };
})();
