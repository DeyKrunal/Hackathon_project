// Privacy Shield AI - Popup Script

let isMonitoring = false;
let siteList = [];

const toggleBtn = document.getElementById('toggleBtn');
const statusBadge = document.getElementById('statusBadge');
const siteInput = document.getElementById('siteInput');
const addBtn = document.getElementById('addBtn');
const siteListDiv = document.getElementById('siteList');

// Load initial state
async function loadState() {
  try {
    // Get monitoring status
    const response = await chrome.runtime.sendMessage({ type: 'GET_MONITORING_STATUS' });
    isMonitoring = response.isMonitoring || false;
    updateUI();

    // Get site list
    const result = await chrome.storage.local.get(['siteList']);
    siteList = result.siteList || [];
    renderSiteList();
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// Update UI based on monitoring status
function updateUI() {
  if (isMonitoring) {
    toggleBtn.textContent = 'Stop Monitoring';
    toggleBtn.className = 'toggle-btn stop';
    statusBadge.textContent = 'Active';
    statusBadge.className = 'status-badge active';
  } else {
    toggleBtn.textContent = 'Start Monitoring';
    toggleBtn.className = 'toggle-btn start';
    statusBadge.textContent = 'Inactive';
    statusBadge.className = 'status-badge inactive';
  }
}

// Toggle monitoring
async function toggleMonitoring() {
  try {
    if (isMonitoring) {
      // Stop monitoring
      await chrome.runtime.sendMessage({ type: 'STOP_MONITORING_REQUEST' });
      isMonitoring = false;
    } else {
      // Start monitoring
      await chrome.runtime.sendMessage({ type: 'START_MONITORING' });
      isMonitoring = true;
    }
    updateUI();
  } catch (error) {
    console.error('Error toggling monitoring:', error);
    alert('Failed to toggle monitoring. Please try again.');
  }
}

// Add site to list
async function addSite() {
  const site = siteInput.value.trim().toLowerCase();

  if (!site) {
    alert('Please enter a website domain.');
    return;
  }

  // Remove common prefixes
  const cleanSite = site.replace(/^(https?:\/\/)?(www\.)?/, '');

  if (siteList.includes(cleanSite)) {
    alert('This website is already in the list.');
    return;
  }

  siteList.push(cleanSite);
  await chrome.storage.local.set({ siteList });

  siteInput.value = '';
  renderSiteList();
}

// Remove site from list
async function removeSite(site) {
  siteList = siteList.filter(s => s !== site);
  await chrome.storage.local.set({ siteList });
  renderSiteList();
}

// Render site list
function renderSiteList() {
  if (siteList.length === 0) {
    siteListDiv.innerHTML = '<div class="empty-state">No protected websites yet.<br>Add domains to enable protection.</div>';
    return;
  }

  siteListDiv.innerHTML = siteList.map(site => `
    <div class="site-item">
      <span>${site}</span>
      <button class="remove-btn" data-site="${site}">Remove</button>
    </div>
  `).join('');

  // Add event listeners to remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const site = e.target.getAttribute('data-site');
      removeSite(site);
    });
  });
}

// Event listeners
toggleBtn.addEventListener('click', toggleMonitoring);
addBtn.addEventListener('click', addSite);
siteInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSite();
  }
});

// Initialize
loadState();