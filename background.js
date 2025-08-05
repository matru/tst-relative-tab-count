'use strict';

const TST_ID = 'treestyletab@piro.sakura.ne.jp';

// CSS for badges, injected via register-self
const BADGE_STYLE = `
  ::part(%EXTRA_CONTENTS_PART% tab-counter) {
    background: purple;
    color: white;
    font-size: x-small;
    font-family: monospace;
    position: absolute;
    bottom: .1em;
    right: .1em;
    padding: .1em;
    pointer-events: none;
    z-index: 100;
  }
`;

// Build badge HTML
function makeBadge(num) {
  return `<small id="tab-counter" part="tab-counter">${num}</small>`;
}

// Remove badge from one tab by setting empty contents
async function clearBadge(tabId) {
  await browser.runtime.sendMessage(TST_ID, {
    type: 'set-extra-contents',
    place: 'tab-front',
    part: 'tab-counter',
    tab: tabId,
    contents: ''
  });
}

// Insert or update badge on one tab
async function setBadge(tabId, num) {
  await browser.runtime.sendMessage(TST_ID, {
    type: 'set-extra-contents',
    place: 'tab-front',
    part: 'tab-counter',
    tab: tabId,
    contents: makeBadge(num)
  });
}

let lastLabels = new Map();

// Core refresh logic: async
async function refreshBadges() {
  try {
    // Identify active tab and clear its badge first
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!active) return;
    await clearBadge(active.id);

    // Get flat list of tabs
    const treeTabs = await browser.runtime.sendMessage(TST_ID, {
      type: 'get-light-tree',
      tabs: '*'
    });

    // Find index of active
    const idx = treeTabs.findIndex(t => t.id === active.id);
    if (idx < 0) return;

    // Compute prev and next 50
    const prev = treeTabs.slice(Math.max(0, idx - 50), idx).reverse();
    const next = treeTabs.slice(idx + 1, idx + 51);

    // Build new labels map (excluding active)
    const newLabels = new Map();
    prev.forEach((t, i) => newLabels.set(t.id, i + 1));
    next.forEach((t, i) => newLabels.set(t.id, i + 1));

    // Remove badges for tabs no longer in newLabels
    for (const [tabId] of lastLabels) {
      if (!newLabels.has(tabId)) {
        await clearBadge(tabId);
      }
    }

    // Set or update badges for newLabels
    for (const [tabId, num] of newLabels) {
      if (lastLabels.get(tabId) !== num) {
        await setBadge(tabId, num);
      }
    }

    // Update lastLabels
    lastLabels = newLabels;
  } catch (e) {
    console.error('Relative Tab Labeler error:', e);
  }
}

// Queue refresh calls to serialize
let lastRefreshPromise = Promise.resolve();
function scheduleRefresh() {
  lastRefreshPromise = lastRefreshPromise.then(refreshBadges, refreshBadges);
}

// Register to TST and set up listeners
async function register() {
  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: 'register-self',
      name: browser.runtime.getManifest().name,
      icons: browser.runtime.getManifest().icons,
      listeningTypes: [
        'ready',
        'sidebar-show',
        'tabs-rendered',
        'tree-attached',
        'tree-detached',
        'tab-attached',
        'tab-detached',
        'tab-moved'
      ],
      allowBulkMessaging: true,
      lightTree: true,
      style: BADGE_STYLE
    });
    // Initial run
    scheduleRefresh();
  } catch (e) {
    console.warn('Relative Tab Labeler registration failed:', e);
  }
}

// Listen for TST external messages
browser.runtime.onMessageExternal.addListener((msg, sender) => {
  if (sender.id === TST_ID &&
      ['ready','sidebar-show','tabs-rendered','tree-attached','tree-detached',
       'tab-attached','tab-detached','tab-moved'].includes(msg.type)) {
    scheduleRefresh();
  }
});

// Refresh on native tab activation
browser.tabs.onActivated.addListener(() => scheduleRefresh());

// Initialize
register();