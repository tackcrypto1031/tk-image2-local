
import { useState, useCallback, useRef } from 'react';

export type SetStateOptions = {
  addToHistory?: boolean;
};

export interface HistorySnapshot<T> {
  history: T[];
  currentIndex: number;
}

export const createHistorySnapshot = <T>(initialState: T): HistorySnapshot<T> => ({
  history: [initialState],
  currentIndex: 0,
});

export const normalizeHistorySnapshot = <T>(
  snapshot: HistorySnapshot<T>,
  fallbackState: T
): HistorySnapshot<T> => {
  if (snapshot.history.length === 0) {
    return createHistorySnapshot(fallbackState);
  }

  const lastIndex = snapshot.history.length - 1;
  const currentIndex = Math.min(Math.max(snapshot.currentIndex, 0), lastIndex);
  if (currentIndex === snapshot.currentIndex) {
    return snapshot;
  }

  return {
    history: snapshot.history,
    currentIndex,
  };
};

export const getHistoryCurrentState = <T>(
  snapshot: HistorySnapshot<T>,
  fallbackState: T
): T => {
  const normalizedSnapshot = normalizeHistorySnapshot(snapshot, fallbackState);
  return normalizedSnapshot.history[normalizedSnapshot.currentIndex];
};

export const applyHistorySet = <T>(
  snapshot: HistorySnapshot<T>,
  action: T | ((prevState: T) => T),
  options: SetStateOptions = { addToHistory: true },
  fallbackState: T
): HistorySnapshot<T> => {
  const normalizedSnapshot = normalizeHistorySnapshot(snapshot, fallbackState);
  const currentState = getHistoryCurrentState(normalizedSnapshot, fallbackState);
  const resolvedState = typeof action === 'function'
    ? (action as (prevState: T) => T)(currentState)
    : action;

  if (options.addToHistory) {
    const history = normalizedSnapshot.history.slice(0, normalizedSnapshot.currentIndex + 1);
    history.push(resolvedState);
    return {
      history,
      currentIndex: history.length - 1,
    };
  }

  const history = [...normalizedSnapshot.history];
  history[normalizedSnapshot.currentIndex] = resolvedState;
  return {
    history,
    currentIndex: normalizedSnapshot.currentIndex,
  };
};

export const applyHistoryUndo = <T>(
  snapshot: HistorySnapshot<T>,
  fallbackState: T
): HistorySnapshot<T> => {
  const normalizedSnapshot = normalizeHistorySnapshot(snapshot, fallbackState);
  if (normalizedSnapshot.currentIndex === 0) {
    return normalizedSnapshot;
  }

  return {
    history: normalizedSnapshot.history,
    currentIndex: normalizedSnapshot.currentIndex - 1,
  };
};

export const applyHistoryRedo = <T>(
  snapshot: HistorySnapshot<T>,
  fallbackState: T
): HistorySnapshot<T> => {
  const normalizedSnapshot = normalizeHistorySnapshot(snapshot, fallbackState);
  if (normalizedSnapshot.currentIndex >= normalizedSnapshot.history.length - 1) {
    return normalizedSnapshot;
  }

  return {
    history: normalizedSnapshot.history,
    currentIndex: normalizedSnapshot.currentIndex + 1,
  };
};

export const useHistoryState = <T>(initialState: T) => {
  const fallbackStateRef = useRef(initialState);
  const initialSnapshotRef = useRef(createHistorySnapshot(initialState));
  const [snapshot, setSnapshot] = useState<HistorySnapshot<T>>(initialSnapshotRef.current);
  const snapshotRef = useRef(snapshot);

  const normalizedSnapshot = normalizeHistorySnapshot(snapshot, fallbackStateRef.current);

  const state = getHistoryCurrentState(normalizedSnapshot, fallbackStateRef.current);
  const canUndo = normalizedSnapshot.currentIndex > 0;
  const canRedo = normalizedSnapshot.currentIndex < normalizedSnapshot.history.length - 1;

  const commitSnapshot = useCallback((nextSnapshot: HistorySnapshot<T>) => {
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }, []);

  const setState = useCallback((
    action: T | ((prevState: T) => T),
    options: SetStateOptions = { addToHistory: true }
  ) => {
    commitSnapshot(applyHistorySet(
      snapshotRef.current,
      action,
      options,
      fallbackStateRef.current
    ));
  }, [commitSnapshot]);

  const undo = useCallback(() => {
    commitSnapshot(applyHistoryUndo(snapshotRef.current, fallbackStateRef.current));
  }, [commitSnapshot]);

  const redo = useCallback(() => {
    commitSnapshot(applyHistoryRedo(snapshotRef.current, fallbackStateRef.current));
  }, [commitSnapshot]);
  
  return { state, setState, undo, redo, canUndo, canRedo };
};
