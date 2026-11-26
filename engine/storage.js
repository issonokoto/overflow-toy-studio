// Persistent local storage & JSON import/export for custom user boards.

const STORAGE_KEY = 'overflow_toy_custom_boards_v1';

export class BoardStorage {
  static list() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  static save(name, design) {
    const list = BoardStorage.list();
    const id = design.id && String(design.id).startsWith('custom_')
      ? design.id
      : `custom_${Date.now()}`;
    const entry = {
      id,
      name: (name || 'My Board').trim() || 'My Board',
      updatedAt: Date.now(),
      design: { ...design, id, name: (name || 'My Board').trim() || 'My Board' },
    };

    const existingIdx = list.findIndex((item) => item.id === id || item.name === entry.name);
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.unshift(entry);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return entry;
  }

  static remove(id) {
    const list = BoardStorage.list().filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return list;
  }

  static exportJsonFile(design) {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const safeName = (design.name || 'custom_board').replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u4e00-\u9faf]+/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.overflow.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  static async importJsonFile(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.polylines) || !Array.isArray(parsed.pins)) {
      throw new Error('盤面JSONの形式が正しくありません');
    }
    return parsed;
  }
}
