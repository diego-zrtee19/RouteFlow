"use client";
import { useEffect, useState, type SetStateAction } from "react";
import { clearSessionDraft, readSessionDraft, saveSessionDraft } from "@/lib/sessionDraft";

export function useSessionDraft<T>(
  key: string | null,
  initial: T,
  parse: (value: unknown) => T | null,
) {
  const [state, setState] = useState<{ key: string | null; value: T }>({
    key: null,
    value: initial,
  });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setState({ key, value: key ? (readSessionDraft(key, parse) ?? initial) : initial });
    // Initial values and parser are module constants; draft identity selects the form.
  }, [key, initial, parse]);
  useEffect(() => {
    if (key && state.key === key) setSaved(saveSessionDraft(key, state.value));
  }, [key, state]);
  const value = state.key === key ? state.value : initial;
  function setValue(update: SetStateAction<T>) {
    setState((previous) => ({
      key,
      value:
        typeof update === "function"
          ? (update as (value: T) => T)(previous.key === key ? previous.value : initial)
          : update,
    }));
  }
  return {
    value,
    setValue,
    saved,
    ready: state.key === key,
    clear: () => {
      if (key) clearSessionDraft(key);
    },
    discard: () => {
      if (key) clearSessionDraft(key);
      setState({ key, value: initial });
    },
  };
}
