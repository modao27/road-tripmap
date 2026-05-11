export function loadUserPins() {
  return JSON.parse(localStorage.getItem('userPins') || '[]');
}

export function saveUserPins(pins) {
  localStorage.setItem('userPins', JSON.stringify(pins));
}

export function loadOverrides() {
  return JSON.parse(localStorage.getItem('placeOverrides') || '{}');
}

export function saveOverrides(overrides) {
  localStorage.setItem('placeOverrides', JSON.stringify(overrides));
}
