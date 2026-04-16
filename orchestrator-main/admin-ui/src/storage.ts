import { ApiSettings } from './api';

const STORAGE_KEY = 'orchestrator-admin-settings';

export function loadSettings(): ApiSettings {
  const fallback: ApiSettings = {
    apiBaseUrl: '/api/v1',
    adminApiKey: '',
    adminActor: 'admin',
  };

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return fallback;
  }

  try {
    return {
      ...fallback,
      ...(JSON.parse(saved) as Partial<ApiSettings>),
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: ApiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
