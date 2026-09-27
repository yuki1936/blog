import { useEffect, useState } from "react";

export function useHydrated() {
  // Server-rendered controls must not accept input before their handlers exist.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
