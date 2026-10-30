// Container size from a ResizeObserver. A fixed size skips the observer (tests, print).
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type Size = { width: number; height: number };

export function useSize<T extends HTMLElement>(fixed?: Partial<Size>): [RefObject<T>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const fixedW = fixed?.width;
  const fixedH = fixed?.height;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, { width: fixedW ?? size.width, height: fixedH ?? size.height }];
}
