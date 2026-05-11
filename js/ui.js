export function showToast(toastWrap, msg, type = '', duration = 4000) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 200ms ease forwards';
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

export function initSidebar(sidebarEl, sidebarToggleEl, mobileQuery, map) {
  sidebarToggleEl.addEventListener('click', () => {
    const isOpen = sidebarEl.classList.toggle('open');
    sidebarToggleEl.setAttribute('aria-expanded', String(isOpen));
    setTimeout(() => map.invalidateSize(), 230);
  });

  sidebarEl.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') {
      map.invalidateSize();
    }
  });
}

export function initResizer(map, config) {
  const resizer = document.getElementById('resizer');
  if (!resizer) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  const minWidth = config.sidebarMin;
  const maxWidth = Math.min(window.innerWidth - 160, config.sidebarMax);

  function getSidebarWidth() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--sidebar').trim();
    return parseInt(val, 10) || config.sidebarDefault;
  }

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = getSidebarWidth();
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    let newWidth = Math.round(startWidth + dx);
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    document.documentElement.style.setProperty('--sidebar', newWidth + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('resizing');
    map.invalidateSize();
  });

  resizer.addEventListener('touchstart', (e) => {
    isResizing = true;
    startX = e.touches[0].clientX;
    startWidth = getSidebarWidth();
    document.body.classList.add('resizing');
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const dx = e.touches[0].clientX - startX;
    let newWidth = Math.round(startWidth + dx);
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    document.documentElement.style.setProperty('--sidebar', newWidth + 'px');
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('resizing');
    map.invalidateSize();
  });

  resizer.addEventListener('dblclick', () => {
    document.documentElement.style.setProperty('--sidebar', config.sidebarDefault + 'px');
    map.invalidateSize();
  });
}
