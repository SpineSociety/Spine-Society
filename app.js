/**
 * Spine Society - Main Application JavaScript
 * Manages screen navigation, state, and interactions
 */

// Screen Management
const screens = {
  lounge: 'lounge-screen',
  library: 'library-screen',
  club: 'club-screen',
  spin: 'spin-screen',
  notes: 'notes-screen',
  profile: 'profile-screen'
};

let currentScreen = 'lounge';

/**
 * Initialize the app
 */
function init() {
  setupNavigation();
  showScreen('lounge');
}

/**
 * Setup navigation button event listeners
 */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const screen = button.getAttribute('data-screen');
      showScreen(screen);
    });
  });
}

/**
 * Switch to a different screen
 * @param {string} screenName - Name of the screen to show
 */
function showScreen(screenName) {
  if (currentScreen === screenName) return;
  
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => screen.classList.remove('active'));
  
  const targetScreen = document.getElementById(screenName);
  if (targetScreen) {
    targetScreen.classList.add('active');
    currentScreen = screenName;
  }
}

/**
 * Create a book card element
 * @param {Object} book - Book data
 * @returns {HTMLElement} Card element
 */
function createBookCard(book) {
  const card = document.createElement('div');
  card.className = 'book-item';
  card.innerHTML = `
    <div class="book-card-polished">
      ${book.coverUrl 
        ? `<img src="${book.coverUrl}" alt="${book.title}" class="book-mini-cover" />` 
        : `<div class="book-mini-placeholder">${book.title.charAt(0)}</div>`
      }
      <div class="book-info">
        <h3 class="item-title">${book.title}</h3>
        <p class="small">${book.author}</p>
        ${book.category ? `<span class="book-category">${book.category}</span>` : ''}
      </div>
    </div>
  `;
  return card;
}

/**
 * Handle comment reactions
 * @param {HTMLElement} commentElement - The comment card element
 */
function toggleReactionPicker(commentElement) {
  const picker = commentElement.querySelector('.reaction-picker');
  if (picker) {
    picker.classList.toggle('show');
  }
}

/**
 * Add a reaction to a comment
 * @param {HTMLElement} commentElement - The comment card element
 * @param {string} reaction - Reaction emoji or name
 */
function addReaction(commentElement, reaction) {
  const summary = commentElement.querySelector('.reaction-summary');
  if (summary) {
    summary.textContent = `Reactions: ${reaction}`;
  }
}

/**
 * Utility: Format date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Utility: Debounce function for event handlers
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export functions for use in other modules
export {
  showScreen,
  createBookCard,
  toggleReactionPicker,
  addReaction,
  formatDate,
  debounce
};
