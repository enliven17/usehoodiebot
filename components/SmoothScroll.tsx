"use client";

// From the portfolio (components/SmoothScroll.tsx), driven by GSAP's ticker so ScrollTrigger reads the same frame.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

gsap.registerPlugin(ScrollTrigger);

// Low lerp = each wheel tick eases out slowly. Anchor links land below the 68px sticky nav.
const OPTIONS = { lerp: 0.07, wheelMultiplier: 0.9, autoRaf: false, anchors: { offset: -84, duration: 1.4 } } as const;

function Sync() {
  const lenis = useLenis(ScrollTrigger.update);
  const pathname = usePathname();
  useEffect(() => {
    if (!lenis) return;
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(raf);
  }, [lenis]);
  // Lenis keeps its target across client navigations: every route starts at the top.
  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true, force: true });
  }, [pathname, lenis]);
  return null;
}

/** Page-wide smooth scroll. Skipped for prefers-reduced-motion. Nested scrollers opt out with data-lenis-prevent. */
export function SmoothScroll() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return enabled ? (
    <ReactLenis root options={OPTIONS}>
      <Sync />
    </ReactLenis>
  ) : null;
}
