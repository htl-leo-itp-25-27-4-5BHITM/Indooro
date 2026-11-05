import { useEffect, useState } from "react";

/** true below the given viewport width (default 768 px). Used to pick map heights. */
export function useNarrow(maxWidth = 768): boolean {
  const get = () => (typeof window === "undefined" ? false : window.innerWidth < maxWidth);
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    const on = () => setNarrow(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWidth]);
  return narrow;
}
