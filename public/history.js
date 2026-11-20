// Undo/redo as a stack of text snapshots (the serialized text is the canonical state).
export function createHistory(initial, limit = 200) {
  const stack = [initial];
  let i = 0;
  return {
    /** Record a new state; returns false if it equals the current one. Drops any redo branch. */
    push(text) {
      if (text === stack[i]) return false;
      stack.splice(i + 1);
      stack.push(text);
      if (stack.length > limit) stack.shift();
      i = stack.length - 1;
      return true;
    },
    /** Returns the previous state, or null when there is none. */
    undo() { return i > 0 ? stack[--i] : null; },
    redo() { return i < stack.length - 1 ? stack[++i] : null; },
    canUndo: () => i > 0,
    canRedo: () => i < stack.length - 1,
  };
}
